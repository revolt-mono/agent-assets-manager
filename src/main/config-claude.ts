import { Data, Effect, FileSystem, Option, Schema } from 'effect'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { CLAUDE_AGENT_FIELDS, CLAUDE_FEATURE_FIELDS } from '../shared/config'
import { configDraftSchema } from './config-draft'
import { orElseNotFound } from './runtime'

export const CLAUDE_FILE = join(homedir(), '.claude', 'settings.json')

const claudeDraft = configDraftSchema(CLAUDE_AGENT_FIELDS, CLAUDE_FEATURE_FIELDS)
const decodeDraft = Schema.decodeUnknownEffect(claudeDraft)

export type ClaudeConfig = (typeof claudeDraft)['Type']

class ClaudeSettingsError extends Data.TaggedError('ClaudeSettingsError')<{
  readonly message: string
}> {}

// ~/.claude/settings.json holds much more than the managed toggles
// (permissions, hooks, user-set env vars). The parsed object round-trips
// through JSON.stringify, so every other key survives byte-for-byte in value
// terms, reformatted to two-space indent.
// Agent keys are parsed only down to their string representation: toConfig
// decides listed-versus-unset, so an unlisted hand edit loads as unset yet
// survives saves untouched.
const objectSchema = Schema.Record(Schema.String, Schema.mutableKey(Schema.Unknown))
type JsonObject = typeof objectSchema.Type
type ClaudeSettings = { values: JsonObject; env: JsonObject }
const decodeObject = Schema.decodeUnknownEffect(objectSchema)
const decodeString = Schema.decodeUnknownOption(Schema.String)
const decodeBoolean = Schema.decodeUnknownOption(Schema.Boolean)

// Parses the untrusted IPC draft against the catalog schema, then writes
// changed entries in one pass; fails before touching disk.
export const saveClaudeConfig = Effect.fn('saveClaudeConfig')(function* (values: ClaudeConfig) {
  const next = yield* decodeDraft(values)
  const fs = yield* FileSystem.FileSystem
  const settings = yield* loadSettings
  const current = toConfig(settings)
  const env = { ...settings.env }
  let changed = false
  for (const field of CLAUDE_AGENT_FIELDS) {
    const value = next.agent[field.key]
    if (value === null || value === current.agent[field.key]) continue
    if (field.storage === 'env') env[field.key] = value
    else settings.values[field.key] = value
    changed = true
  }
  for (const field of CLAUDE_FEATURE_FIELDS) {
    const enabled = next.features[field.key]
    if (enabled === current.features[field.key]) continue
    if (field.storage === 'env') {
      if (enabled) env[field.key] = '1'
      else delete env[field.key]
    } else if (enabled === field.default) delete settings.values[field.key]
    else settings.values[field.key] = enabled
    changed = true
  }
  // These env entries are Claude Code's whole provider switch, so enabling
  // writes both and disabling deletes both.
  const provider = next.provider
  if (JSON.stringify(provider) !== JSON.stringify(current.provider)) {
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
  const output = { ...settings.values }
  if (Object.keys(env).length > 0) output.env = env
  yield* fs.makeDirectory(dirname(CLAUDE_FILE), { recursive: true })
  yield* fs.writeFileString(CLAUDE_FILE, JSON.stringify(output, null, 2) + '\n')
})

const loadSettings = Effect.gen(function* () {
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
  const env =
    root.env === undefined
      ? {}
      : yield* decodeObject(root.env).pipe(
          Effect.mapError(
            () => new ClaudeSettingsError({ message: 'Unsupported settings.json env shape' })
          )
        )
  delete root.env
  // Managed env entries instead coerce to their string form (a bare 1 reads
  // as '1'): env semantics count presence as on, so scrubbing would flip a
  // hand-set flag off on the next save.
  for (const field of [...CLAUDE_AGENT_FIELDS, ...CLAUDE_FEATURE_FIELDS]) {
    if (field.storage !== 'env' || env[field.key] === undefined) continue
    env[field.key] = String(env[field.key])
  }
  for (const key of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'] as const) {
    if (env[key] !== undefined) env[key] = String(env[key])
  }
  return { values: root, env }
})

export const loadClaudeConfig = Effect.map(loadSettings, toConfig)

function toConfig(settings: ClaudeSettings): ClaudeConfig {
  // Claude Code reads the provider entries like `process.env.X || fallback`,
  // so an empty-string value behaves as unset.
  const baseUrl = Option.getOrElse(decodeString(settings.env.ANTHROPIC_BASE_URL), () => '')
  const apiKey = Option.getOrElse(decodeString(settings.env.ANTHROPIC_AUTH_TOKEN), () => '')
  // Claude Code accepts values like "true" beside "1" (and reads some flags
  // by mere presence), so anything but an explicit off value counts as on.
  const enabled = (value: string | undefined): boolean => {
    const normalized = value?.trim().toLowerCase() ?? ''
    return normalized !== '' && normalized !== '0' && normalized !== 'false'
  }
  // SAFETY: fromEntries over the complete field lists yields every key.
  return {
    agent: Object.fromEntries(
      CLAUDE_AGENT_FIELDS.map((field) => {
        const raw = field.storage === 'env' ? settings.env[field.key] : settings.values[field.key]
        const decoded = decodeString(raw)
        if (field.storage === 'settings' && Option.isNone(decoded)) {
          delete settings.values[field.key]
        }
        const value = Option.getOrUndefined(decoded)
        return [field.key, field.options.some((option) => option.value === value) ? value : null]
      })
    ) as ClaudeConfig['agent'],
    features: Object.fromEntries(
      CLAUDE_FEATURE_FIELDS.map((field) => {
        const raw = field.storage === 'env' ? settings.env[field.key] : settings.values[field.key]
        if (field.storage === 'env') {
          return [field.key, enabled(Option.getOrUndefined(decodeString(raw)))]
        }
        const decoded = decodeBoolean(raw)
        if (Option.isNone(decoded)) delete settings.values[field.key]
        return [field.key, Option.getOrElse(decoded, () => field.default)]
      })
    ) as ClaudeConfig['features'],
    provider: { enabled: baseUrl !== '' && apiKey !== '', baseUrl, apiKey }
  }
}
