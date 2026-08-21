import { Data, Effect, FileSystem, Option, Schema } from 'effect'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { CONFIG_CATALOGS, type ConfigValues } from '../shared/config'
import { orElseNotFound } from './runtime'

export const CLAUDE_FILE = join(homedir(), '.claude', 'settings.json')

const catalog = CONFIG_CATALOGS.claude

export type ClaudeConfig = ConfigValues<'claude'>

class ClaudeSettingsError extends Data.TaggedError('ClaudeSettingsError')<{
  readonly message: string
}> {}

// ~/.claude/settings.json holds much more than the managed toggles
// (permissions, hooks, user-set env vars). The parsed object round-trips
// through JSON.stringify, so every other key survives byte-for-byte in value
// terms, reformatted to two-space indent.
// Default keys are parsed only down to their string representation: toConfig
// decides listed-versus-unset, so an unlisted hand edit loads as unset yet
// survives saves untouched.
const objectSchema = Schema.Record(Schema.String, Schema.mutableKey(Schema.Json))
type JsonObject = typeof objectSchema.Type
type ClaudeSettings = { values: JsonObject; env: JsonObject }
const decodeObject = Schema.decodeUnknownEffect(objectSchema)
const decodeString = Schema.decodeUnknownOption(Schema.String)
const decodeBoolean = Schema.decodeUnknownOption(Schema.Boolean)

// Writes changed entries in one pass after the IPC boundary has decoded the draft.
export const saveClaudeConfig = Effect.fn('saveClaudeConfig')(function* (input: ClaudeConfig) {
  const fs = yield* FileSystem.FileSystem
  const settings = yield* loadSettings()
  const current = toConfig(settings)
  const values = { ...settings.values }
  const env = { ...settings.env }
  let changed = false
  for (const field of catalog.defaultFields) {
    const value = input.defaults[field.key]
    if (value === null || value === current.defaults[field.key]) continue
    if (field.storage === 'env') env[field.key] = value
    else values[field.key] = value
    changed = true
  }
  for (const field of catalog.toggleFields) {
    const enabled = input.toggles[field.key]
    if (enabled === current.toggles[field.key]) continue
    writeToggle(field, enabled, values, env)
    changed = true
  }
  // These env entries are Claude Code's whole provider switch, so enabling
  // writes both and disabling deletes both.
  const provider = input.provider
  if (
    provider.enabled !== current.provider.enabled ||
    provider.baseUrl !== current.provider.baseUrl ||
    provider.apiKey !== current.provider.apiKey
  ) {
    if (provider.enabled) {
      env.ANTHROPIC_BASE_URL = provider.baseUrl
      env.ANTHROPIC_AUTH_TOKEN = provider.apiKey
    } else {
      delete env.ANTHROPIC_BASE_URL
      delete env.ANTHROPIC_AUTH_TOKEN
    }
    changed = true
  }
  if (!changed) return
  const document = Object.keys(env).length === 0 ? values : { ...values, env }
  yield* fs.makeDirectory(dirname(CLAUDE_FILE), { recursive: true })
  yield* fs.writeFileString(CLAUDE_FILE, JSON.stringify(document, null, 2) + '\n')
})

const loadSettings = Effect.fn('loadClaudeSettings')(function* () {
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs.readFileString(CLAUDE_FILE).pipe(orElseNotFound(''))
  if (raw.trim() === '') return { values: {}, env: {} }
  const parsed: unknown = yield* Effect.try({
    try: () => JSON.parse(raw),
    catch: (cause) => new ClaudeSettingsError({ message: `Malformed settings.json: ${cause}` })
  })
  const root = yield* decodeObject(parsed).pipe(
    Effect.mapError(() => new ClaudeSettingsError({ message: 'Unsupported settings.json shape' }))
  )
  const { env: rawEnv, ...values } = root
  const env =
    rawEnv === undefined
      ? {}
      : yield* decodeObject(rawEnv).pipe(
          Effect.mapError(
            () => new ClaudeSettingsError({ message: 'Unsupported settings.json env shape' })
          )
        )
  return { values, env }
})

export const loadClaudeConfig = Effect.map(loadSettings(), toConfig)

function toConfig(settings: ClaudeSettings): ClaudeConfig {
  // Claude Code reads the provider entries like `process.env.X || fallback`,
  // so an empty-string value behaves as unset.
  const baseUrl = envString(settings.env.ANTHROPIC_BASE_URL) ?? ''
  const apiKey = envString(settings.env.ANTHROPIC_AUTH_TOKEN) ?? ''
  // SAFETY: fromEntries over the complete field lists yields every key.
  return {
    defaults: Object.fromEntries(
      catalog.defaultFields.map((field) => {
        const raw = field.storage === 'env' ? settings.env[field.key] : settings.values[field.key]
        const value =
          field.storage === 'env' ? envString(raw) : Option.getOrUndefined(decodeString(raw))
        return [field.key, field.options.some((option) => option.value === value) ? value : null]
      })
    ) as ClaudeConfig['defaults'],
    toggles: Object.fromEntries(
      catalog.toggleFields.map((field) => [field.key, readToggle(field, settings)])
    ) as ClaudeConfig['toggles'],
    provider: { enabled: baseUrl !== '' && apiKey !== '', baseUrl, apiKey }
  }
}

function readToggle(
  field: (typeof catalog.toggleFields)[number],
  settings: ClaudeSettings
): boolean {
  return field.bindings.every((binding) => {
    const stored =
      binding.kind === 'env'
        ? envFlag(settings.env[binding.key])
        : Option.getOrElse(decodeBoolean(settings.values[binding.key]), () => binding.defaultValue)
    return stored === binding.enabledValue
  })
}

function writeToggle(
  field: (typeof catalog.toggleFields)[number],
  enabled: boolean,
  values: JsonObject,
  env: JsonObject
): void {
  for (const binding of field.bindings) {
    const stored = enabled ? binding.enabledValue : !binding.enabledValue
    if (binding.kind === 'env') {
      if (stored) env[binding.key] = '1'
      else delete env[binding.key]
    } else if (stored === binding.defaultValue) delete values[binding.key]
    else values[binding.key] = stored
  }
}

function envString(value: Schema.Json | undefined): string | undefined {
  return value === undefined ? undefined : String(value)
}

function envFlag(value: Schema.Json | undefined): boolean {
  const normalized = envString(value)?.trim().toLowerCase() ?? ''
  return normalized !== '' && normalized !== '0' && normalized !== 'false'
}
