import { mkdir, readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { parse } from 'smol-toml'
import {
  assertProviderDraft,
  CODEX_AGENT_FIELDS,
  CODEX_FEATURE_FIELDS,
  type CodexConfig,
  type ProviderValues
} from '../shared/config'
import { TomlDoc } from './toml-doc'

export const CODEX_FILE = join(homedir(), '.codex', 'config.toml')

const FEATURES_TABLE = 'features'
const PROVIDER_TABLE = 'model_providers.revolt'

export async function loadCodexConfig(): Promise<CodexConfig> {
  return toConfig(await loadDoc())
}

// Validates the untrusted IPC draft while diffing against the file, then
// writes changed entries in one pass; throws before touching disk.
export async function saveCodexConfig(next: CodexConfig): Promise<void> {
  const doc = await loadDoc()
  const current = toConfig(doc)
  let changed = false
  for (const field of CODEX_AGENT_FIELDS) {
    const value = next.agent[field.key]
    if (value === null || value === current.agent[field.key]) continue
    if (!field.options.some((option) => option.value === value)) {
      throw new Error(`Unsupported ${field.key} value: ${value}`)
    }
    doc.set(null, field.key, value)
    changed = true
  }
  for (const field of CODEX_FEATURE_FIELDS) {
    const enabled = next.features[field.key]
    if (enabled !== true && enabled !== false) {
      throw new Error(`Unsupported ${field.key} value: ${enabled}`)
    }
    if (enabled === current.features[field.key]) continue
    doc.set(FEATURES_TABLE, field.key, enabled)
    changed = true
  }
  const provider = next.provider
  if (JSON.stringify(provider) !== JSON.stringify(current.provider)) {
    assertProviderDraft(provider)
    if (/[\r\n"\\]/.test(provider.baseUrl + provider.apiKey)) {
      throw new Error('Unsupported characters in provider values')
    }
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
  parse(text)
  await mkdir(dirname(CODEX_FILE), { recursive: true })
  await writeFile(CODEX_FILE, text)
}

async function loadDoc(): Promise<TomlDoc> {
  const raw = await readFile(CODEX_FILE, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  return new TomlDoc(raw)
}

function toConfig(doc: TomlDoc): CodexConfig {
  // SAFETY: fromEntries over the complete field lists yields every key.
  return {
    agent: Object.fromEntries(
      CODEX_AGENT_FIELDS.map((field) => {
        const value = doc.get(null, field.key)
        if (value === undefined) return [field.key, field.default]
        return [field.key, field.options.some((option) => option.value === value) ? value : null]
      })
    ),
    features: Object.fromEntries(
      CODEX_FEATURE_FIELDS.map((field) => [
        field.key,
        doc.getBool(FEATURES_TABLE, field.key) ?? field.default
      ])
    ),
    provider: {
      enabled: doc.get(null, 'model_provider') === 'revolt',
      baseUrl: doc.get(PROVIDER_TABLE, 'base_url') ?? '',
      apiKey: doc.get(PROVIDER_TABLE, 'experimental_bearer_token') ?? ''
    }
  } as CodexConfig
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
