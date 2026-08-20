import { Data, Effect, FileSystem, Option } from 'effect'
import { watch, type FSWatcher } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { ipcMain, shell } from 'electron'
import { AGENT_IDS, AGENTS, parseAgent, type AgentId } from '../shared/agent'
import type { Skill, SkillBody } from '../shared/skill'
import { debouncedBroadcast } from './broadcast'
import { orElseNotFound, runtime } from './runtime'

const SKILL_FILE = 'SKILL.md'
const ID_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/

class SkillError extends Data.TaggedError('SkillError')<{
  readonly message: string
}> {}

// One skill folder read off disk: the listing entry plus everything the
// per-skill IPC handlers need (paths and the parsed body).
type LoadedSkill = {
  skill: Skill
  dir: string
  skillFile: string
  body: SkillBody
}

export function registerSkills(): () => void {
  const changed = debouncedBroadcast('skills:changed')

  const watched = new Map<string, FSWatcher>()
  const tryWatch = (dir: string, options?: { recursive: boolean }): void => {
    if (watched.has(dir)) return
    try {
      const armed = watch(dir, options, changed.notify)
      // A watcher whose directory disappears dies silently; evict it so the
      // next list re-arms through this same path.
      armed.on('error', () => {
        armed.close()
        if (watched.get(dir) === armed) watched.delete(dir)
      })
      watched.set(dir, armed)
    } catch {
      // directory does not exist yet; retried on the next list
    }
  }
  const watchAgent = (agent: AgentId): void => {
    const root = skillsRoot(agent)
    tryWatch(dirname(root))
    tryWatch(root, { recursive: true })
  }

  ipcMain.handle('skills:list', (_event, agent) => {
    const parsed = parseAgent(agent)
    watchAgent(parsed)
    return runtime.runPromise(listSkills(parsed))
  })
  ipcMain.handle('skills:get', (_event, agent, id) =>
    runtime.runPromise(Effect.map(requireSkill(parseAgent(agent), id), (loaded) => loaded.body))
  )
  ipcMain.handle('skills:uninstall', (_event, agent, id) =>
    runtime.runPromise(uninstallSkill(parseAgent(agent), id))
  )
  ipcMain.handle('skills:open', (_event, agent, id) =>
    runtime.runPromise(openSkill(parseAgent(agent), id))
  )
  ipcMain.handle('skills:reveal', (_event, agent, id) =>
    runtime.runPromise(revealSkill(parseAgent(agent), id))
  )

  for (const agent of AGENT_IDS) watchAgent(agent)

  return () => {
    changed.stop()
    for (const watcher of watched.values()) watcher.close()
  }
}

function skillsRoot(agent: AgentId): string {
  return join(homedir(), ...AGENTS[agent].skillsDir)
}

const listSkills = Effect.fn('listSkills')(function* (agent: AgentId) {
  const fs = yield* FileSystem.FileSystem
  const entries = yield* fs.readDirectory(skillsRoot(agent)).pipe(orElseNotFound([]))
  // A valid-looking name that is not a skill folder simply fails its read
  // and drops out as null below.
  const ids = entries.filter((name) => ID_PATTERN.test(name))
  const loaded = yield* Effect.forEach(ids, (id) => readSkill(agent, id), {
    concurrency: 'unbounded'
  })
  return loaded
    .filter((item) => item !== null)
    .map((item) => item.skill)
    .sort((a, b) => a.name.localeCompare(b.name))
})

const uninstallSkill = Effect.fn('uninstallSkill')(function* (agent: AgentId, id: string) {
  const fs = yield* FileSystem.FileSystem
  const loaded = yield* requireSkill(agent, id)
  yield* fs.remove(loaded.dir, { recursive: true })
})

const revealSkill = Effect.fn('revealSkill')(function* (agent: AgentId, id: string) {
  const loaded = yield* requireSkill(agent, id)
  shell.showItemInFolder(loaded.skillFile)
})

const openSkill = Effect.fn('openSkill')(function* (agent: AgentId, id: string) {
  const loaded = yield* requireSkill(agent, id)
  // openPath resolves with an error string on failure, but wrap the promise
  // anyway so an undocumented rejection fails as a SkillError, not a defect
  const error = yield* Effect.tryPromise({
    try: () => shell.openPath(loaded.skillFile),
    catch: (cause) => new SkillError({ message: String(cause) })
  })
  if (error) return yield* new SkillError({ message: error })
})

const requireSkill = Effect.fnUntraced(function* (agent: AgentId, id: string) {
  if (!ID_PATTERN.test(id)) return yield* new SkillError({ message: `Invalid skill id: ${id}` })
  const loaded = yield* readSkill(agent, id)
  if (!loaded) return yield* new SkillError({ message: `Skill not found: ${id}` })
  return loaded
})

const readSkill = Effect.fnUntraced(
  function* (agent: AgentId, id: string) {
    const fs = yield* FileSystem.FileSystem
    const dir = join(skillsRoot(agent), id)
    const skillFile = join(dir, SKILL_FILE)
    const raw = yield* fs.readFileString(skillFile)
    const info = yield* fs.stat(skillFile)
    const parsed = parseFrontmatter(raw)
    const loaded: LoadedSkill = {
      skill: {
        agent,
        id,
        name: displayName(parsed.name || id),
        description: parsed.description ?? '',
        updatedAt: Option.getOrElse(info.mtime, () => new Date(0)).getTime()
      },
      dir,
      skillFile,
      body: { markdown: parsed.body, raw }
    }
    return loaded
  },
  // anything unreadable (missing folder, no SKILL.md, races) is not a skill
  Effect.orElseSucceed(() => null)
)

type Frontmatter = {
  name?: string
  description?: string
  body: string
}

function parseFrontmatter(raw: string): Frontmatter {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { body: raw }
  const frontmatter = match[1]
  return {
    name: scalar(frontmatter, 'name'),
    description: scalar(frontmatter, 'description'),
    body: match[2]
  }
}

function scalar(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  if (!match) return undefined
  const value = match[1].trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value || undefined
}

const SMALL_WORDS = new Set(['to', 'of', 'in', 'or', 'and', 'for'])

function displayName(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2 && !SMALL_WORDS.has(word.toLowerCase())) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}
