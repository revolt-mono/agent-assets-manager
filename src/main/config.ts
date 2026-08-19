import { watch, type FSWatcher } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { basename, dirname, join } from 'path'
import { ipcMain } from 'electron'
import { parse } from 'smol-toml'
import { AGENT_IDS, parseAgent, type AgentId } from '../shared/agent'
import {
  CLAUDE_ENV_FIELDS,
  CODEX_AGENT_FIELDS,
  CODEX_FEATURE_FIELDS,
  type ClaudeConfig,
  type CodexConfig,
  type ProviderValues
} from '../shared/config'
import { debouncedBroadcast } from './broadcast'

const CODEX_FILE = join(homedir(), '.codex', 'config.toml')
const CLAUDE_FILE = join(homedir(), '.claude', 'settings.json')
const CONFIG_FILES = { claude: CLAUDE_FILE, codex: CODEX_FILE } satisfies Record<AgentId, string>

export function registerConfig(): () => void {
  // Per-agent broadcasts so a change to one agent's file only revalidates
  // that agent's store; a shared notify would discard the other tab's draft.
  const changed = {
    claude: debouncedBroadcast('config:changed', 'claude'),
    codex: debouncedBroadcast('config:changed', 'codex')
  }

  const watchers = new Map<AgentId, FSWatcher>()
  const ensureWatch = (): void => {
    for (const agent of AGENT_IDS) {
      if (watchers.has(agent)) continue
      const file = CONFIG_FILES[agent]
      try {
        const armed = watch(dirname(file), (_event, filename) => {
          if (!filename || filename === basename(file)) changed[agent].notify()
        })
        armed.on('error', () => {
          armed.close()
          if (watchers.get(agent) === armed) watchers.delete(agent)
        })
        watchers.set(agent, armed)
      } catch {
        // directory does not exist yet; re-armed after the next get or set
      }
    }
  }

  // File edits are read-modify-write; run them one at a time so rapid
  // updates cannot overwrite each other.
  let queue: Promise<unknown> = Promise.resolve()
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  ipcMain.handle('config:get', async (_event, agent: string) => {
    const values = await serialize(async () =>
      parseAgent(agent) === 'claude'
        ? claudeConfigFromSettings(await loadClaudeSettings())
        : codexConfigFromDoc(await loadCodexDoc())
    )
    ensureWatch()
    return values
  })
  ipcMain.handle(
    'config:save',
    async (_event, agent: string, values: ClaudeConfig | CodexConfig) => {
      // SAFETY: the payload is untrusted, but each writer re-validates every
      // field before touching disk; the cast only selects the expected shape.
      await serialize(() =>
        parseAgent(agent) === 'claude'
          ? writeClaudeConfig(values as ClaudeConfig)
          : writeCodexConfig(values as CodexConfig)
      )
      ensureWatch()
    }
  )

  ensureWatch()

  return () => {
    for (const agent of AGENT_IDS) changed[agent].stop()
    for (const watcher of watchers.values()) watcher.close()
  }
}

const FEATURES_TABLE = 'features'
const PROVIDER_TABLE = 'model_providers.revolt'

async function loadCodexDoc(): Promise<TomlDoc> {
  const raw = await readFile(CODEX_FILE, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  return new TomlDoc(raw)
}

function codexConfigFromDoc(doc: TomlDoc): CodexConfig {
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

// Validates the untrusted IPC payload while diffing against the file, then
// writes changed entries in one pass; throws before touching disk.
async function writeCodexConfig(next: CodexConfig): Promise<void> {
  const doc = await loadCodexDoc()
  const current = codexConfigFromDoc(doc)
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
    if (provider.enabled !== true && provider.enabled !== false) {
      throw new Error(`Unsupported provider enabled value: ${provider.enabled}`)
    }
    if (/[\r\n"\\]/.test(provider.baseUrl + provider.apiKey)) {
      throw new Error('Unsupported characters in provider values')
    }
    if (provider.enabled && (provider.baseUrl === '' || provider.apiKey === '')) {
      throw new Error('Enabled provider needs a base URL and an API key')
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

// ~/.claude/settings.json holds much more than the env toggles (permissions,
// hooks, user-set env vars). The declared type covers only the managed slice;
// the parsed object round-trips through JSON.stringify, so every other key
// survives byte-for-byte in value terms, reformatted to two-space indent.
type ClaudeSettings = { env?: Record<string, string> }

async function loadClaudeSettings(): Promise<ClaudeSettings> {
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
  return settings
}

function claudeConfigFromSettings(settings: ClaudeSettings): ClaudeConfig {
  // Claude Code accepts values like "true" beside "1" (and reads some flags
  // by mere presence), so anything but an explicit off value counts as on.
  const enabled = (value: string | undefined): boolean => {
    const normalized = value?.trim().toLowerCase() ?? ''
    return normalized !== '' && normalized !== '0' && normalized !== 'false'
  }
  // SAFETY: fromEntries over the complete field list yields every key.
  return Object.fromEntries(
    CLAUDE_ENV_FIELDS.map((field) => [field.key, enabled(settings.env?.[field.key])])
  ) as ClaudeConfig
}

async function writeClaudeConfig(next: ClaudeConfig): Promise<void> {
  const settings = await loadClaudeSettings()
  const current = claudeConfigFromSettings(settings)
  const env = { ...settings.env }
  let changed = false
  for (const field of CLAUDE_ENV_FIELDS) {
    const enabled = next[field.key]
    if (enabled !== true && enabled !== false) {
      throw new Error(`Unsupported ${field.key} value: ${enabled}`)
    }
    if (enabled === current[field.key]) continue
    if (enabled) env[field.key] = '1'
    else delete env[field.key]
    changed = true
  }
  if (!changed) return
  if (Object.keys(env).length > 0) settings.env = env
  else delete settings.env
  await mkdir(dirname(CLAUDE_FILE), { recursive: true })
  await writeFile(CLAUDE_FILE, JSON.stringify(settings, null, 2) + '\n')
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

type Section = { start: number; end: number }

// Comment-preserving TOML line editor. The config file is shared with the
// user's hand edits, so mutations rewrite only the addressed entry and keep
// every other line (comments, spacing, unknown keys) byte-for-byte. `table`
// addresses entries under a `[table]` header; null addresses top-level entries
// before the first table.
class TomlDoc {
  private lines: string[]

  constructor(raw: string) {
    this.lines = raw.split('\n')
    while (this.lines.length > 0 && this.lines[this.lines.length - 1] === '') this.lines.pop()
  }

  toString(): string {
    return this.lines.join('\n') + '\n'
  }

  get(table: string | null, key: string): string | undefined {
    const index = this.indexOf(table, key)
    return index === -1 ? undefined : unquote(valueOf(this.lines[index]))
  }

  // Booleans compare against the raw text so a quoted string like "true"
  // stays falsy, matching how Codex rejects non-boolean values.
  getBool(table: string, key: string): boolean | undefined {
    const index = this.indexOf(table, key)
    if (index === -1) return undefined
    return valueOf(this.lines[index]).split('#')[0].trim() === 'true'
  }

  set(table: string | null, key: string, value: string | boolean): void {
    const entry = value === true || value === false ? `${key} = ${value}` : `${key} = "${value}"`
    const index = this.indexOf(table, key)
    if (index !== -1) {
      const line = this.lines[index]
      const indent = line.match(/^\s*/)?.[0] ?? ''
      const comment = valueOf(line).match(/^(?:"[^"]*"|'[^']*'|[^#]*?)\s*(#.*)$/)?.[1]
      this.lines[index] = indent + entry + (comment ? ` ${comment}` : '')
      return
    }
    const section =
      table === null
        ? this.topLevelSection()
        : (this.tableSection(table) ?? this.createTable(table))
    // insert after the last non-blank line so entries stay clustered
    let at = section.end
    while (at > section.start && this.lines[at - 1].trim() === '') at--
    this.lines.splice(at, 0, entry)
  }

  delete(table: string | null, key: string): void {
    const index = this.indexOf(table, key)
    if (index !== -1) this.lines.splice(index, 1)
  }

  deleteTable(table: string): void {
    const section = this.tableSection(table)
    if (!section) return
    let start = section.start - 1 // the [table] header line
    while (start > 0 && this.lines[start - 1].trim() === '') start--
    this.lines.splice(start, section.end - start)
  }

  private createTable(table: string): Section {
    // one blank line separates a new table from whatever sits above
    const last = this.lines[this.lines.length - 1]
    if (last !== undefined && last.trim() !== '') this.lines.push('')
    this.lines.push(`[${table}]`)
    return { start: this.lines.length, end: this.lines.length }
  }

  private indexOf(table: string | null, key: string): number {
    const section = table === null ? this.topLevelSection() : this.tableSection(table)
    if (!section) return -1
    const pattern = new RegExp(`^\\s*${key}\\s*=`)
    for (let index = section.start; index < section.end; index++) {
      if (pattern.test(this.lines[index])) return index
    }
    return -1
  }

  private topLevelSection(): Section {
    const end = this.lines.findIndex((line) => HEADER.test(line))
    return { start: 0, end: end === -1 ? this.lines.length : end }
  }

  private tableSection(table: string): Section | null {
    const header = this.lines.findIndex(
      (line) => line.match(/^\s*\[\s*([^\]]+?)\s*\]\s*(#.*)?$/)?.[1] === table
    )
    if (header === -1) return null
    const next = this.lines.findIndex((line, index) => index > header && HEADER.test(line))
    return { start: header + 1, end: next === -1 ? this.lines.length : next }
  }
}

const HEADER = /^\s*\[/

function valueOf(line: string): string {
  return line.slice(line.indexOf('=') + 1).trim()
}

function unquote(value: string): string {
  const match = value.match(/^"([^"]*)"|^'([^']*)'/)
  if (match) return match[1] ?? match[2]
  return value.split('#')[0].trim()
}
