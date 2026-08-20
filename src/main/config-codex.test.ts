import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, expect, test } from 'vitest'
import type { CodexConfig } from './config-codex'
import { runtime } from './runtime'

let api: typeof import('./config-codex')
let file: string
const load = (): Promise<CodexConfig> => runtime.runPromise(api.loadCodexConfig)
const save = (values: CodexConfig): Promise<void> => runtime.runPromise(api.saveCodexConfig(values))

beforeAll(async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-home-'))
  process.env.HOME = home
  // CODEX_FILE resolves homedir() at import time, so load the module only
  // after HOME points at the fixture directory.
  api = await import('./config-codex')
  file = join(home, '.codex', 'config.toml')
  await mkdir(join(home, '.codex'), { recursive: true })
})

test('a missing config file loads pure defaults', async () => {
  const config = await load()
  expect(config.defaults.model_reasoning_effort).toBe('medium')
  expect(config.defaults.sandbox_mode).toBe('workspace-write')
  expect(config.toggles).toEqual({
    apps: true,
    memories: false,
    guardian_approval: true,
    mentions_v2: true,
    include_permissions_instructions: true,
    include_apps_instructions: true,
    include_collaboration_mode_instructions: true
  })
  expect(config.provider).toEqual({ enabled: false, baseUrl: '', apiKey: '' })
})

test('save rewrites only changed entries; hand edits and comments survive', async () => {
  await writeFile(
    file,
    [
      '# personal config',
      'model = "gpt-5.5"',
      'model_reasoning_effort = "low"   # keep me',
      '',
      '[features]',
      'apps = false',
      ''
    ].join('\n')
  )
  const config = await load()
  expect(config.defaults.model_reasoning_effort).toBe('low')
  expect(config.toggles.apps).toBe(false)

  await save({
    ...config,
    defaults: { ...config.defaults, model_reasoning_effort: 'high' },
    toggles: { ...config.toggles, memories: true }
  })
  expect(await readFile(file, 'utf8')).toBe(
    [
      '# personal config',
      'model = "gpt-5.5"',
      'model_reasoning_effort = "high" # keep me',
      '',
      '[features]',
      'apps = false',
      'memories = true',
      ''
    ].join('\n')
  )
})

test('prompt instruction controls use top-level overrides and drop their on-default', async () => {
  await writeFile(
    file,
    [
      'foreign = "keep"',
      'include_permissions_instructions = false # keep me',
      'include_apps_instructions = true',
      '',
      '[features]',
      'apps = false',
      ''
    ].join('\n')
  )
  const config = await load()
  expect(config.toggles.include_permissions_instructions).toBe(false)
  expect(config.toggles.include_apps_instructions).toBe(true)
  expect(config.toggles.include_collaboration_mode_instructions).toBe(true)

  await save({
    ...config,
    toggles: {
      ...config.toggles,
      include_permissions_instructions: true,
      include_apps_instructions: false,
      include_collaboration_mode_instructions: false
    }
  })
  expect(await readFile(file, 'utf8')).toBe(
    [
      'foreign = "keep"',
      'include_apps_instructions = false',
      'include_collaboration_mode_instructions = false',
      '',
      '[features]',
      'apps = false',
      ''
    ].join('\n')
  )

  const updated = await load()
  await save({
    ...updated,
    toggles: {
      ...updated.toggles,
      include_apps_instructions: true,
      include_collaboration_mode_instructions: true
    }
  })
  expect(await readFile(file, 'utf8')).toBe(
    ['foreign = "keep"', '', '[features]', 'apps = false', ''].join('\n')
  )
})

test('an out-of-catalog draft value throws before touching disk', async () => {
  const before = await readFile(file, 'utf8')
  const config = await load()
  await expect(
    save({ ...config, defaults: { ...config.defaults, model_reasoning_effort: 'turbo' } })
  ).rejects.toThrow('Unsupported model_reasoning_effort value: turbo')
  expect(await readFile(file, 'utf8')).toBe(before)
})

test('an unrecognized hand-set value loads as null and survives saves', async () => {
  await writeFile(file, 'model_reasoning_effort = "turbo"\n')
  const config = await load()
  expect(config.defaults.model_reasoning_effort).toBeNull()
  // null means "leave the file value alone"
  await save({ ...config, toggles: { ...config.toggles, memories: true } })
  expect(await readFile(file, 'utf8')).toContain('model_reasoning_effort = "turbo"')
})

test('enabling the provider writes the selector, table, and compression override', async () => {
  const config = await load()
  const provider = { enabled: true, baseUrl: 'https://proxy.test/v1', apiKey: 'sk-test' }
  await save({ ...config, provider })
  const text = await readFile(file, 'utf8')
  expect(text).toContain('model_provider = "revolt"')
  expect(text).toContain('[model_providers.revolt]')
  expect(text).toContain('base_url = "https://proxy.test/v1"')
  expect(text).toContain('wire_api = "responses"')
  expect(text).toContain('experimental_bearer_token = "sk-test"')
  expect(text).toContain('enable_request_compression = false')
  expect((await load()).provider).toEqual(provider)
})

test('disabling the provider keeps credentials but drops selector and override', async () => {
  const config = await load()
  await save({ ...config, provider: { ...config.provider, enabled: false } })
  const text = await readFile(file, 'utf8')
  expect(text).not.toContain('model_provider = "revolt"')
  expect(text).not.toContain('enable_request_compression')
  expect(text).toContain('[model_providers.revolt]')
  const reloaded = await load()
  expect(reloaded.provider).toEqual({
    enabled: false,
    baseUrl: 'https://proxy.test/v1',
    apiKey: 'sk-test'
  })
})

test('provider validation rejects incomplete or unquotable values', async () => {
  const before = await readFile(file, 'utf8')
  const config = await load()
  await expect(
    save({ ...config, provider: { enabled: true, baseUrl: '', apiKey: 'sk' } })
  ).rejects.toThrow('Enabled provider needs a base URL and an API key')
  await expect(
    save({
      ...config,
      provider: { enabled: true, baseUrl: 'https://x.test/"v1', apiKey: 'sk' }
    })
  ).rejects.toThrow('Edit produced invalid TOML')
  expect(await readFile(file, 'utf8')).toBe(before)
})
