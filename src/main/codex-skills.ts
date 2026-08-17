import { watch, type FSWatcher } from 'fs'
import { homedir } from 'os'
import { join, relative, resolve, sep } from 'path'
import { readdir, readFile, rm } from 'fs/promises'
import { shell } from 'electron'
import type { Skill, SkillBody } from '../shared/skill'

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
  const names = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => ID_PATTERN.test(name))
  const located = await Promise.all(names.map(readLocated))
  return located
    .filter((skill) => skill !== null)
    .map(toSkill)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getSkill(id: string): Promise<SkillBody> {
  const located = await requireLocated(id)
  return { ...toSkill(located), raw: located.raw, markdown: located.markdown }
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
  let timer: ReturnType<typeof setTimeout> | undefined
  const fire = (): void => {
    clearTimeout(timer)
    timer = setTimeout(onChange, 150)
  }

  let watcher: FSWatcher | undefined
  try {
    watcher = watch(skillsRoot(), fire)
  } catch {
    // directory may not exist yet
  }

  return () => {
    clearTimeout(timer)
    watcher?.close()
  }
}

function skillsRoot(): string {
  return join(homedir(), '.codex', 'skills')
}

async function requireLocated(id: string): Promise<LocatedSkill> {
  const skill = await readLocated(id)
  if (!skill) throw new Error(`Skill not found: ${id}`)
  return skill
}

async function readLocated(id: string): Promise<LocatedSkill | null> {
  const dir = resolve(skillsRoot(), parseSkillId(id))
  const skillFile = join(dir, SKILL_FILE)
  const raw = await readFile(skillFile, 'utf8').catch(() => null)
  if (raw === null) return null
  const parsed = parseFrontmatter(raw)
  return {
    agent: 'codex',
    id,
    name: displayName(parsed.name || id),
    description: parsed.description ?? '',
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
    description: located.description
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
