import { watch, type FSWatcher } from 'fs'
import { readdir, readFile, rm, stat } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { ipcMain, shell } from 'electron'
import { AGENT_IDS, AGENTS, parseAgent, type AgentId } from '../shared/agent'
import type { Skill, SkillBody } from '../shared/skill'
import { debouncedBroadcast } from './broadcast'

const SKILL_FILE = 'SKILL.md'
const ID_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/

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
    return listSkills(parsed)
  })
  ipcMain.handle(
    'skills:get',
    async (_event, agent, id) => (await requireSkill(parseAgent(agent), id)).body
  )
  ipcMain.handle('skills:uninstall', async (_event, agent, id) => {
    await rm((await requireSkill(parseAgent(agent), id)).dir, { recursive: true })
  })
  ipcMain.handle('skills:open', async (_event, agent, id) => {
    const error = await shell.openPath((await requireSkill(parseAgent(agent), id)).skillFile)
    if (error) throw new Error(error)
  })
  ipcMain.handle('skills:reveal', async (_event, agent, id) => {
    shell.showItemInFolder((await requireSkill(parseAgent(agent), id)).skillFile)
  })

  for (const agent of AGENT_IDS) watchAgent(agent)

  return () => {
    changed.stop()
    for (const watcher of watched.values()) watcher.close()
  }
}

function skillsRoot(agent: AgentId): string {
  return join(homedir(), ...AGENTS[agent].skillsDir)
}

async function listSkills(agent: AgentId): Promise<Skill[]> {
  const entries = await readdir(skillsRoot(agent), { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const ids = entries
    .filter((entry) => entry.isDirectory() && ID_PATTERN.test(entry.name))
    .map((entry) => entry.name)
  const loaded = await Promise.all(ids.map((id) => readSkill(agent, id)))
  return loaded
    .filter((item) => item !== null)
    .map((item) => item.skill)
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function requireSkill(agent: AgentId, id: string): Promise<LoadedSkill> {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid skill id: ${id}`)
  const loaded = await readSkill(agent, id)
  if (!loaded) throw new Error(`Skill not found: ${id}`)
  return loaded
}

async function readSkill(agent: AgentId, id: string): Promise<LoadedSkill | null> {
  const dir = join(skillsRoot(agent), id)
  const skillFile = join(dir, SKILL_FILE)
  const raw = await readFile(skillFile, 'utf8').catch(() => null)
  if (raw === null) return null
  const { mtimeMs } = await stat(skillFile)
  const parsed = parseFrontmatter(raw)
  return {
    skill: {
      agent,
      id,
      name: displayName(parsed.name || id),
      description: parsed.description ?? '',
      updatedAt: mtimeMs
    },
    dir,
    skillFile,
    body: { markdown: parsed.body, raw }
  }
}

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
