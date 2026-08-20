import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, expect, test } from 'vitest'
import { applyDefaultChange, CONFIG_CATALOGS, disabledDefaultKeys } from '../shared/config'
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
  expect(config.toggles.promptSuggestionEnabled).toBe(true)
  expect(config.toggles.artifacts).toBe(true)
  expect(config.toggles.autoMemory).toBe(true)
  expect(config.toggles.noFlicker).toBe(false)
  expect(config.defaults.outputStyle).toBe(null)
  expect(config.defaults.model).toBe(null)
  expect(config.defaults.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(null)
})

test('haiku disables effort through the shared default rule', () => {
  const defaults: ClaudeConfig['defaults'] = {
    outputStyle: null,
    model: 'haiku',
    effortLevel: 'max',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: null
  }
  expect(disabledDefaultKeys(CONFIG_CATALOGS.claude, defaults).has('effortLevel')).toBe(true)
  expect(
    disabledDefaultKeys(CONFIG_CATALOGS.claude, { ...defaults, model: 'opus' }).has('effortLevel')
  ).toBe(false)
  expect(
    applyDefaultChange({
      catalog: CONFIG_CATALOGS.claude,
      saved: defaults,
      current: { ...defaults, model: 'opus', effortLevel: 'low' },
      key: 'model',
      value: 'haiku'
    }).effortLevel
  ).toBe('max')
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
  expect(config.toggles.promptSuggestionEnabled).toBe(false)
  expect(config.toggles.noFlicker).toBe(true) // "true" counts as on, not just "1"

  await save({
    provider: config.provider,
    defaults: {
      ...config.defaults,
      outputStyle: 'default',
      model: 'opus',
      effortLevel: 'max',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-5'
    },
    toggles: {
      ...config.toggles,
      promptSuggestionEnabled: true, // back to default: key must disappear
      noFlicker: false,
      autoMemory: false
    }
  })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
    permissions: { allow: ['Bash(ls:*)'] },
    outputStyle: 'default',
    model: 'opus',
    effortLevel: 'max',
    autoMemoryEnabled: false,
    env: {
      MY_VAR: 'keep',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-5'
    }
  })

  const roundTrip = await load()
  expect(roundTrip.toggles.promptSuggestionEnabled).toBe(true)
  expect(roundTrip.toggles.noFlicker).toBe(false)
  expect(roundTrip.toggles.autoMemory).toBe(false)
  expect(roundTrip.defaults.outputStyle).toBe('default')
  expect(roundTrip.defaults.model).toBe('opus')
  expect(roundTrip.defaults.effortLevel).toBe('max')
  expect(roundTrip.defaults.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-sonnet-5')
})

test('off-values and unmanaged hand edits load as unset; unlisted values survive saves', async () => {
  await writeFile(
    file,
    JSON.stringify({
      disableArtifact: 'yes', // non-boolean hand edit counts as unset
      outputStyle: 'My custom style', // custom styles stay untouched until a built-in is selected
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
  expect(config.toggles.artifacts).toBe(true)
  expect(config.toggles.noFlicker).toBe(false)
  expect(config.toggles.simpleSystemPrompt).toBe(true)
  expect(config.toggles.autoMemory).toBe(true)
  expect(config.toggles.gitInstructions).toBe(true)
  expect(config.defaults.outputStyle).toBe(null)
  expect(config.defaults.model).toBe(null)
  expect(config.defaults.effortLevel).toBe(null)

  await save({ ...config, toggles: { ...config.toggles, artifacts: false } })
  expect(JSON.parse(await readFile(file, 'utf8')).outputStyle).toBe('My custom style')
  expect(JSON.parse(await readFile(file, 'utf8')).model).toBe('claude-opus-4-1')
})

test('an out-of-catalog agent draft value throws before touching disk', async () => {
  const before = await readFile(file, 'utf8')
  const config = await load()
  await expect(
    save({ ...config, defaults: { ...config.defaults, model: 'gpt-5' } })
  ).rejects.toThrow('Unsupported model value: gpt-5')
  expect(await readFile(file, 'utf8')).toBe(before)
})

test('an empty env object is dropped from the file', async () => {
  await writeFile(file, JSON.stringify({ env: { CLAUDE_CODE_NO_FLICKER: '1' } }))
  const config = await load()
  await save({
    ...config,
    toggles: { ...config.toggles, noFlicker: false }
  })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({})
})

test('auto memory reads off from either control and writes both in sync', async () => {
  await writeFile(file, JSON.stringify({ env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } }))
  expect((await load()).toggles.autoMemory).toBe(false)

  await writeFile(file, JSON.stringify({ autoMemoryEnabled: false }))
  const disabled = await load()
  expect(disabled.toggles.autoMemory).toBe(false)

  await save({
    ...disabled,
    toggles: { ...disabled.toggles, autoMemory: true }
  })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({})

  const enabled = await load()
  await save({
    ...enabled,
    toggles: { ...enabled.toggles, autoMemory: false }
  })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
    autoMemoryEnabled: false,
    env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }
  })
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
    save({ ...config, toggles: { ...config.toggles, artifacts: false } })
  ).rejects.toThrow()
  expect(await readFile(file, 'utf8')).toBe('[]')

  await writeFile(file, JSON.stringify({ env: [] }))
  await expect(load()).rejects.toThrow('Unsupported settings.json env shape')
})
