import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, expect, test } from 'vitest'

let api: typeof import('./config-claude')
let file: string

beforeAll(async () => {
  const home = await mkdtemp(join(tmpdir(), 'claude-home-'))
  process.env.HOME = home
  // CLAUDE_FILE resolves homedir() at import time, so load the module only
  // after HOME points at the fixture directory.
  api = await import('./config-claude')
  file = join(home, '.claude', 'settings.json')
  await mkdir(join(home, '.claude'), { recursive: true })
})

test('a missing settings file loads pure defaults', async () => {
  const config = await api.loadClaudeConfig()
  expect(config.promptSuggestionEnabled).toBe(true)
  expect(config.disableArtifact).toBe(false)
  expect(config.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe(false)
})

test('save touches only managed entries; foreign keys and env vars survive', async () => {
  await writeFile(
    file,
    JSON.stringify({
      permissions: { allow: ['Bash(ls:*)'] },
      promptSuggestionEnabled: false,
      env: { MY_VAR: 'keep', CLAUDE_CODE_NO_FLICKER: 'true' }
    })
  )
  const config = await api.loadClaudeConfig()
  expect(config.promptSuggestionEnabled).toBe(false)
  expect(config.CLAUDE_CODE_NO_FLICKER).toBe(true) // "true" counts as on, not just "1"

  await api.saveClaudeConfig({
    ...config,
    promptSuggestionEnabled: true, // back to default: key must disappear
    CLAUDE_CODE_NO_FLICKER: false,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: true
  })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
    permissions: { allow: ['Bash(ls:*)'] },
    env: { MY_VAR: 'keep', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }
  })

  const roundTrip = await api.loadClaudeConfig()
  expect(roundTrip.promptSuggestionEnabled).toBe(true)
  expect(roundTrip.CLAUDE_CODE_NO_FLICKER).toBe(false)
  expect(roundTrip.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe(true)
})

test('off-values and non-boolean hand edits load as their defaults', async () => {
  await writeFile(
    file,
    JSON.stringify({
      disableArtifact: 'yes', // non-boolean hand edit counts as unset
      env: {
        CLAUDE_CODE_NO_FLICKER: '0',
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: 'false',
        CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS: ' '
      }
    })
  )
  const config = await api.loadClaudeConfig()
  expect(config.disableArtifact).toBe(false)
  expect(config.CLAUDE_CODE_NO_FLICKER).toBe(false)
  expect(config.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe(false)
  expect(config.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS).toBe(false)
})

test('an empty env object is dropped from the file', async () => {
  await writeFile(file, JSON.stringify({ env: { CLAUDE_CODE_NO_FLICKER: '1' } }))
  const config = await api.loadClaudeConfig()
  await api.saveClaudeConfig({ ...config, CLAUDE_CODE_NO_FLICKER: false })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({})
})

test('a mis-shaped file rejects load and save before any write', async () => {
  const config = await api.loadClaudeConfig() // defaults from the {} file above
  await writeFile(file, '[]')
  await expect(api.loadClaudeConfig()).rejects.toThrow('Unsupported settings.json shape')
  await expect(api.saveClaudeConfig({ ...config, disableArtifact: true })).rejects.toThrow()
  expect(await readFile(file, 'utf8')).toBe('[]')

  await writeFile(file, JSON.stringify({ env: [] }))
  await expect(api.loadClaudeConfig()).rejects.toThrow('Unsupported settings.json env shape')
})
