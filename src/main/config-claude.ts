import { mkdir, readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import {
  CLAUDE_AGENT_FIELDS,
  CLAUDE_FEATURE_FIELDS,
  type ClaudeAgentSettingKey,
  type ClaudeConfig,
  type ClaudeFeatureSettingKey
} from '../shared/config'

export const CLAUDE_FILE = join(homedir(), '.claude', 'settings.json')

// ~/.claude/settings.json holds much more than the managed toggles
// (permissions, hooks, user-set env vars). The declared type covers only the
// managed slice; the parsed object round-trips through JSON.stringify, so
// every other key survives byte-for-byte in value terms, reformatted to
// two-space indent.
// Agent keys are parsed only down to their string representation: toConfig
// decides listed-versus-unset, so an unlisted hand edit loads as unset yet
// survives saves untouched.
type ClaudeSettings = { env?: Record<string, string> } & {
  [K in ClaudeAgentSettingKey]?: string
} & {
  [K in ClaudeFeatureSettingKey]?: boolean
}

export async function loadClaudeConfig(): Promise<ClaudeConfig> {
  return toConfig(await loadSettings())
}

// Validates the untrusted IPC draft while diffing against the file, then
// writes changed entries in one pass; throws before touching disk.
export async function saveClaudeConfig(next: ClaudeConfig): Promise<void> {
  const settings = await loadSettings()
  const current = toConfig(settings)
  const env = { ...settings.env }
  let changed = false
  for (const field of CLAUDE_AGENT_FIELDS) {
    const value = next.agent[field.key]
    if (value === null || value === current.agent[field.key]) continue
    if (!field.options.some((option) => option.value === value)) {
      throw new Error(`Unsupported ${field.key} value: ${value}`)
    }
    if (field.storage === 'env') env[field.key] = value
    else settings[field.key] = value
    changed = true
  }
  for (const field of CLAUDE_FEATURE_FIELDS) {
    const enabled = next.features[field.key]
    if (enabled !== true && enabled !== false) {
      throw new Error(`Unsupported ${field.key} value: ${enabled}`)
    }
    if (enabled === current.features[field.key]) continue
    if (field.storage === 'env') {
      if (enabled) env[field.key] = '1'
      else delete env[field.key]
    } else if (enabled === field.default) delete settings[field.key]
    else settings[field.key] = enabled
    changed = true
  }
  if (!changed) return
  if (Object.keys(env).length > 0) settings.env = env
  else delete settings.env
  await mkdir(dirname(CLAUDE_FILE), { recursive: true })
  await writeFile(CLAUDE_FILE, JSON.stringify(settings, null, 2) + '\n')
}

async function loadSettings(): Promise<ClaudeSettings> {
  const raw = await readFile(CLAUDE_FILE, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  if (raw.trim() === '') return {}
  // Reject a mis-shaped file here so a later save can never rewrite it from
  // scratch or corrupt it by spreading a non-object env. Object() returns its
  // argument only for objects, rejecting every JSON primitive.
  const parsed: unknown = JSON.parse(raw)
  if (Object(parsed) !== parsed || Array.isArray(parsed)) {
    throw new Error('Unsupported settings.json shape')
  }
  // SAFETY: the root is a plain object per the check above and env is checked
  // next; the declared type covers only the managed slice of the file.
  const settings = parsed as ClaudeSettings
  if (
    settings.env !== undefined &&
    (Object(settings.env) !== settings.env || Array.isArray(settings.env))
  ) {
    throw new Error('Unsupported settings.json env shape')
  }
  // Parse the managed keys here so the rest of the module can trust the
  // declared types; a wrong-representation hand edit counts as unset.
  for (const field of CLAUDE_FEATURE_FIELDS) {
    if (field.storage !== 'settings') continue
    if (settings[field.key] !== true && settings[field.key] !== false) delete settings[field.key]
  }
  for (const field of CLAUDE_AGENT_FIELDS) {
    if (field.storage !== 'settings') continue
    const value = settings[field.key]
    if (value !== undefined && String(value) !== value) delete settings[field.key]
  }
  // Managed env entries instead coerce to their string form (a bare 1 reads
  // as '1'): env semantics count presence as on, so scrubbing would flip a
  // hand-set flag off on the next save.
  const env = settings.env
  if (env) {
    for (const field of [...CLAUDE_AGENT_FIELDS, ...CLAUDE_FEATURE_FIELDS]) {
      if (field.storage !== 'env' || env[field.key] === undefined) continue
      env[field.key] = String(env[field.key])
    }
  }
  return settings
}

function toConfig(settings: ClaudeSettings): ClaudeConfig {
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
        const value = field.storage === 'env' ? settings.env?.[field.key] : settings[field.key]
        return [field.key, field.options.some((option) => option.value === value) ? value : null]
      })
    ) as ClaudeConfig['agent'],
    features: Object.fromEntries(
      CLAUDE_FEATURE_FIELDS.map((field) => [
        field.key,
        field.storage === 'env'
          ? enabled(settings.env?.[field.key])
          : (settings[field.key] ?? field.default)
      ])
    ) as ClaudeConfig['features']
  }
}
