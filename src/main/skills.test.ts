import { mkdir, mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { Skill, SkillBody } from '../shared/skill'
import { invokeIpc } from './electron-stub'

const COMMIT_RAW = [
  '---',
  'name: commit helper',
  'description: "Commit: fast, safe"',
  '---',
  '',
  '# Commit',
  '',
  'body text',
  ''
].join('\n')

let stopWatchers: () => void

beforeAll(async () => {
  const home = await mkdtemp(join(tmpdir(), 'skills-home-'))
  process.env.HOME = home
  const root = join(home, '.claude', 'skills')
  await mkdir(join(root, 'commit'), { recursive: true })
  await writeFile(join(root, 'commit', 'SKILL.md'), COMMIT_RAW)
  await mkdir(join(root, 'db-tools'))
  await writeFile(join(root, 'db-tools', 'SKILL.md'), '# DB tools docs\n')
  await mkdir(join(root, '.hidden'))
  await writeFile(join(root, '.hidden', 'SKILL.md'), 'invisible\n')
  await mkdir(join(root, 'no-skill-file'))
  await writeFile(join(root, 'stray.md'), 'not a skill dir\n')
  // the skills root resolves homedir() per call, but register after HOME is
  // set so the initial watchers land on the fixture directory
  const { registerSkills } = await import('./skills')
  stopWatchers = registerSkills()
})

afterAll(() => stopWatchers())

test('list parses frontmatter and skips anything that is not a skill folder', async () => {
  const skills: Skill[] = await invokeIpc('skills:list', 'claude')
  expect(skills.map((skill) => [skill.id, skill.name, skill.description])).toEqual([
    ['commit', 'Commit helper', 'Commit: fast, safe'],
    ['db-tools', 'DB Tools', '']
  ])
})

test('get returns the body without frontmatter and the raw file with it', async () => {
  const [skill] = await invokeIpc('skills:list', 'claude')
  const body: SkillBody = await invokeIpc('skills:get', 'claude', skill.id)
  expect(body.markdown).toBe('\n# Commit\n\nbody text\n')
  expect(body.raw).toBe(COMMIT_RAW)
})

test('an agent without a skills directory lists as empty', async () => {
  await expect(invokeIpc('skills:list', 'codex')).resolves.toEqual([])
})

test('ids that could escape the skills root are rejected', async () => {
  await expect(invokeIpc('skills:uninstall', 'claude', '../../evil')).rejects.toThrow()
  await expect(invokeIpc('skills:get', 'claude', 'ghost')).rejects.toThrow('Skill not found')
  await expect(invokeIpc('skills:list', 'gemini')).rejects.toThrow()
})

test('uninstall removes the skill folder', async () => {
  await invokeIpc('skills:uninstall', 'claude', 'db-tools')
  const skills: Skill[] = await invokeIpc('skills:list', 'claude')
  expect(skills.map((skill) => skill.id)).toEqual(['commit'])
})
