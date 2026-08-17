import { watch, type FSWatcher } from 'fs'
import { homedir } from 'os'
import { join, normalize, relative, resolve, sep } from 'path'
import { readdir, readFile, rm, writeFile } from 'fs/promises'
import { shell } from 'electron'
import type { Skill, SkillBody } from '../shared/skill'
import { applySkillEnabled, disabledSkillPaths } from './skills-config'

const SKILL_FILE = 'SKILL.md'
const ID_PATTERN = /^[A-Za-z0-9._-]+$/

type LocatedSkill = Skill & {
  dir: string
  skillFile: string
  raw: string
  markdown: string
}

export async function listSkills(): Promise<Skill[]> {
  const root = skillsRoot()
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (isNotFound(error)) return []
    throw error
  })
  const disabled = await readDisabledPaths()
  const skills: Skill[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (!ID_PATTERN.test(entry.name)) continue
    const skill = await readLocated(entry.name, disabled)
    if (skill) skills.push(toSkill(skill))
  }
  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}

export async function getSkill(id: string): Promise<SkillBody> {
  const located = await requireLocated(id)
  return { ...toSkill(located), raw: located.raw, markdown: located.markdown }
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<Skill> {
  const located = await requireLocated(id)
  const file = configPath()
  const text = await readFile(file, 'utf8').catch((error) => {
    if (isNotFound(error)) return ''
    throw error
  })
  const next = applySkillEnabled(text, located.skillFile, enabled)
  if (next !== text) await writeFile(file, next, 'utf8')
  return { ...toSkill(located), enabled }
}

export async function uninstallSkill(id: string): Promise<void> {
  await rm((await requireLocated(id)).dir, { recursive: true, force: false })
}

export async function openSkill(id: string): Promise<void> {
  const error = await shell.openPath((await requireLocated(id)).skillFile)
  if (error) throw new Error(error)
}

export async function revealSkill(id: string): Promise<void> {
  shell.showItemInFolder((await requireLocated(id)).skillFile)
}

export function watchCodexSkills(onChange: () => void): () => void {
  const watchers: FSWatcher[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const fire = (): void => {
    clearTimeout(timer)
    timer = setTimeout(onChange, 150)
  }

  for (const target of [skillsRoot(), configPath()]) {
    try {
      watchers.push(watch(target, fire))
    } catch {
      // directory or config may not exist yet
    }
  }

  return () => {
    clearTimeout(timer)
    for (const watcher of watchers) watcher.close()
  }
}

function skillsRoot(): string {
  return join(homedir(), '.codex', 'skills')
}

function configPath(): string {
  return join(homedir(), '.codex', 'config.toml')
}

async function requireLocated(id: string): Promise<LocatedSkill> {
  const skill = await readLocated(parseSkillId(id), await readDisabledPaths())
  if (!skill) throw new Error(`Skill not found: ${id}`)
  return skill
}

async function readLocated(id: string, disabled: Set<string>): Promise<LocatedSkill | null> {
  const dir = resolveSkillDir(parseSkillId(id))
  const skillFile = join(dir, SKILL_FILE)
  const raw = await readFile(skillFile, 'utf8').catch(() => null)
  if (raw === null) return null
  const parsed = parseFrontmatter(raw)
  return {
    agent: 'codex',
    id,
    name: displayName(parsed.name || id),
    description: parsed.description ?? '',
    enabled: !disabled.has(normalize(skillFile)),
    dir,
    skillFile,
    raw,
    markdown: parsed.body
  }
}

function toSkill(located: LocatedSkill): Skill {
  return {
    agent: located.agent,
    id: located.id,
    name: located.name,
    description: located.description,
    enabled: located.enabled
  }
}

function parseSkillId(value: unknown): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new Error(`Invalid skill id: ${String(value)}`)
  }
  const root = resolve(skillsRoot())
  const dir = resolve(root, value)
  const rel = relative(root, dir)
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || rel === '') {
    throw new Error(`Invalid skill path: ${String(value)}`)
  }
  return value
}

function resolveSkillDir(id: string): string {
  return resolve(skillsRoot(), id)
}

async function readDisabledPaths(): Promise<Set<string>> {
  const text = await readFile(configPath(), 'utf8').catch((error) => {
    if (isNotFound(error)) return ''
    throw error
  })
  return new Set(disabledSkillPaths(text))
}

function parseFrontmatter(raw: string): { name?: string; description?: string; body: string } {
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

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}
