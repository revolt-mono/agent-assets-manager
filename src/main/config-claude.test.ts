import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, expect, test } from 'vitest'
import type { ClaudeConfig } from './config-claude'
import { runtime } from './runtime'

let api: typeof import('./config-claude')
let file: string
const load = (): Promise<ClaudeConfig> => runtime.runPromise(api.loadClaudeConfig)
const save = (values: ClaudeConfig): Promise<void> =>
  runtime.runPromise(api.saveClaudeConfig(values))

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
  const config = await load()
  expect(config.features.promptSuggestionEnabled).toBe(true)
  expect(config.features.disableArtifact).toBe(false)
  expect(config.features.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe(false)
  expect(config.agent.model).toBe(null)
  expect(config.agent.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(null)
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
  const config = await load()
  expect(config.features.promptSuggestionEnabled).toBe(false)
  expect(config.features.CLAUDE_CODE_NO_FLICKER).toBe(true) // "true" counts as on, not just "1"

  await save({
    provider: config.provider,
    agent: {
      ...config.agent,
      model: 'opus',
      effortLevel: 'max',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-5'
    },
    features: {
      ...config.features,
      promptSuggestionEnabled: true, // back to default: key must disappear
      CLAUDE_CODE_NO_FLICKER: false,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: true
    }
  })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
    permissions: { allow: ['Bash(ls:*)'] },
    model: 'opus',
    effortLevel: 'max',
    env: {
      MY_VAR: 'keep',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-5'
    }
  })

  const roundTrip = await load()
  expect(roundTrip.features.promptSuggestionEnabled).toBe(true)
  expect(roundTrip.features.CLAUDE_CODE_NO_FLICKER).toBe(false)
  expect(roundTrip.features.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe(true)
  expect(roundTrip.agent.model).toBe('opus')
  expect(roundTrip.agent.effortLevel).toBe('max')
  expect(roundTrip.agent.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-sonnet-5')
})

test('off-values and unmanaged hand edits load as unset; unlisted values survive saves', async () => {
  await writeFile(
    file,
    JSON.stringify({
      disableArtifact: 'yes', // non-boolean hand edit counts as unset
      model: 'claude-opus-4-1', // unlisted value shows as unset but survives saves
      effortLevel: 42, // non-string hand edit counts as unset
      env: {
        CLAUDE_CODE_NO_FLICKER: '0',
        CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: 1, // non-string reads via its string form
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: 'false',
        CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS: ' '
      }
    })
  )
  const config = await load()
  expect(config.features.disableArtifact).toBe(false)
  expect(config.features.CLAUDE_CODE_NO_FLICKER).toBe(false)
  expect(config.features.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT).toBe(true)
  expect(config.features.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe(false)
  expect(config.features.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS).toBe(false)
  expect(config.agent.model).toBe(null)
  expect(config.agent.effortLevel).toBe(null)

  await save({ ...config, features: { ...config.features, disableArtifact: true } })
  expect(JSON.parse(await readFile(file, 'utf8')).model).toBe('claude-opus-4-1')
})

test('an out-of-catalog agent draft value throws before touching disk', async () => {
  const before = await readFile(file, 'utf8')
  const config = await load()
  await expect(save({ ...config, agent: { ...config.agent, model: 'gpt-5' } })).rejects.toThrow(
    'Unsupported model value: gpt-5'
  )
  expect(await readFile(file, 'utf8')).toBe(before)
})

test('an empty env object is dropped from the file', async () => {
  await writeFile(file, JSON.stringify({ env: { CLAUDE_CODE_NO_FLICKER: '1' } }))
  const config = await load()
  await save({
    ...config,
    features: { ...config.features, CLAUDE_CODE_NO_FLICKER: false }
  })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({})
})

test('provider env keys round-trip and disabling deletes them', async () => {
  await writeFile(file, JSON.stringify({ env: { MY_VAR: 'keep' } }))
  const config = await load()
  expect(config.provider).toEqual({ enabled: false, baseUrl: '', apiKey: '' })

  await expect(
    save({
      ...config,
      provider: { enabled: true, baseUrl: 'https://proxy.example.com', apiKey: '' }
    })
  ).rejects.toThrow('Enabled provider needs a base URL and an API key')

  await save({
    ...config,
    provider: { enabled: true, baseUrl: 'https://proxy.example.com', apiKey: 'sk-test' }
  })
  expect(JSON.parse(await readFile(file, 'utf8')).env).toEqual({
    MY_VAR: 'keep',
    ANTHROPIC_BASE_URL: 'https://proxy.example.com',
    ANTHROPIC_AUTH_TOKEN: 'sk-test'
  })
  const enabled = await load()
  expect(enabled.provider).toEqual({
    enabled: true,
    baseUrl: 'https://proxy.example.com',
    apiKey: 'sk-test'
  })

  await save({ ...enabled, provider: { ...enabled.provider, enabled: false } })
  expect(JSON.parse(await readFile(file, 'utf8')).env).toEqual({ MY_VAR: 'keep' })
})

test('a mis-shaped file rejects load and save before any write', async () => {
  const config = await load() // defaults from the {} file above
  await writeFile(file, '[]')
  await expect(load()).rejects.toThrow('Unsupported settings.json shape')
  await expect(
    save({ ...config, features: { ...config.features, disableArtifact: true } })
  ).rejects.toThrow()
  expect(await readFile(file, 'utf8')).toBe('[]')

  await writeFile(file, JSON.stringify({ env: [] }))
  await expect(load()).rejects.toThrow('Unsupported settings.json env shape')
})
