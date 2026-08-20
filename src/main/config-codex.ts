import { Data, Effect, FileSystem, Schema } from 'effect'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { parse } from 'smol-toml'
import { CONFIG_CATALOGS, type ConfigPayload, type ProviderValues } from '../shared/config'
import { configDraftSchema } from './config-draft'
import { orElseNotFound } from './runtime'
import { TomlDoc } from './toml-doc'

export const CODEX_FILE = join(homedir(), '.codex', 'config.toml')

const FEATURES_TABLE = 'features'
const PROVIDER_TABLE = 'model_providers.revolt'

const catalog = CONFIG_CATALOGS.codex
const draftSchema = configDraftSchema(catalog.defaultFields, catalog.featureFields)
const decodeDraft = Schema.decodeUnknownEffect(draftSchema)

export type CodexConfig = (typeof draftSchema)['Type']

class CodexConfigError extends Data.TaggedError('CodexConfigError')<{
  readonly message: string
}> {}

// Parses the untrusted IPC draft against the catalog schema, then writes
// changed entries in one pass; fails before touching disk.
export const saveCodexConfig = Effect.fn('saveCodexConfig')(function* (input: ConfigPayload) {
  const next = yield* decodeDraft(input)
  const fs = yield* FileSystem.FileSystem
  const doc = yield* loadDocument()
  const current = toConfig(doc)
  let changed = false
  for (const field of catalog.defaultFields) {
    const value = next.defaults[field.key]
    if (value === null || value === current.defaults[field.key]) continue
    doc.set(null, field.key, value)
    changed = true
  }
  for (const field of catalog.featureFields) {
    const enabled = next.features[field.key]
    if (enabled === current.features[field.key]) continue
    doc.set(FEATURES_TABLE, field.key, enabled)
    changed = true
  }
  const provider = next.provider
  if (
    provider.enabled !== current.provider.enabled ||
    provider.baseUrl !== current.provider.baseUrl ||
    provider.apiKey !== current.provider.apiKey
  ) {
    rewriteProvider(doc, provider)
    // Codex compresses request bodies by default, which third-party endpoints
    // rarely accept; force it off while the custom provider is active and
    // restore the default (on) by dropping the override otherwise.
    if (provider.enabled) doc.set(FEATURES_TABLE, 'enable_request_compression', false)
    else doc.delete(FEATURES_TABLE, 'enable_request_compression')
    changed = true
  }
  if (!changed) return
  const text = doc.toString()
  // abort before touching disk if the edit produced invalid TOML
  yield* Effect.try({
    try: () => parse(text),
    catch: (cause) => new CodexConfigError({ message: `Edit produced invalid TOML: ${cause}` })
  })
  yield* fs.makeDirectory(dirname(CODEX_FILE), { recursive: true })
  yield* fs.writeFileString(CODEX_FILE, text)
})

const loadDocument = Effect.fn('loadCodexDocument')(function* () {
  const fs = yield* FileSystem.FileSystem
  return new TomlDoc(yield* fs.readFileString(CODEX_FILE).pipe(orElseNotFound('')))
})

export const loadCodexConfig = Effect.map(loadDocument(), toConfig)

function toConfig(doc: TomlDoc): CodexConfig {
  // SAFETY: fromEntries over the complete field lists yields every key.
  return {
    defaults: Object.fromEntries(
      catalog.defaultFields.map((field) => {
        const value = doc.get(null, field.key)
        if (value === undefined) return [field.key, field.default]
        return [field.key, field.options.some((option) => option.value === value) ? value : null]
      })
    ) as CodexConfig['defaults'],
    features: Object.fromEntries(
      catalog.featureFields.map((field) => [
        field.key,
        doc.getBool(FEATURES_TABLE, field.key) ?? field.default
      ])
    ) as CodexConfig['features'],
    provider: {
      enabled: doc.get(null, 'model_provider') === 'revolt',
      baseUrl: doc.get(PROVIDER_TABLE, 'base_url') ?? '',
      apiKey: doc.get(PROVIDER_TABLE, 'experimental_bearer_token') ?? ''
    }
  }
}

// The provider table is owned by this app, so a change drops the old table and
// rebuilds a fresh one instead of patching entries in place. The enabled flag
// only controls the top-level model_provider selector; the table itself stays
// as long as it has any content.
function rewriteProvider(doc: TomlDoc, provider: ProviderValues): void {
  doc.deleteTable(PROVIDER_TABLE)
  if (provider.enabled) doc.set(null, 'model_provider', 'revolt')
  else if (doc.get(null, 'model_provider') === 'revolt') doc.delete(null, 'model_provider')
  if (provider.baseUrl === '' && provider.apiKey === '') return
  doc.set(PROVIDER_TABLE, 'name', 'OpenAI')
  if (provider.baseUrl !== '') doc.set(PROVIDER_TABLE, 'base_url', provider.baseUrl)
  doc.set(PROVIDER_TABLE, 'wire_api', 'responses')
  if (provider.apiKey !== '') doc.set(PROVIDER_TABLE, 'experimental_bearer_token', provider.apiKey)
}
