import { watch, type FSWatcher } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { ipcMain } from 'electron'
import { parse } from 'smol-toml'
import {
  AGENT_FIELDS,
  FEATURE_FIELDS,
  type ConfigValues,
  type ProviderValues
} from '../shared/config'
import { debouncedBroadcast } from './broadcast'

const CONFIG_FILE = join(homedir(), '.codex', 'config.toml')

export function registerConfig(): () => void {
  const changed = debouncedBroadcast('config:changed')

  let watcher: FSWatcher | undefined
  const ensureWatch = (): void => {
    if (watcher) return
    try {
      const armed = watch(dirname(CONFIG_FILE), (_event, filename) => {
        if (!filename || filename === 'config.toml') changed.notify()
      })
      armed.on('error', () => {
        armed.close()
        if (watcher === armed) watcher = undefined
      })
      watcher = armed
    } catch {
      // directory does not exist yet; re-armed after the next get or set
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

  ipcMain.handle('config:get', async () => {
    const values = await serialize(async () => valuesFromDoc(await loadDoc()))
    ensureWatch()
    return values
  })
  ipcMain.handle('config:save', async (_event, values: ConfigValues) => {
    await serialize(() => writeValues(values))
    ensureWatch()
  })

  ensureWatch()

  return () => {
    changed.stop()
    watcher?.close()
  }
}

const FEATURES_TABLE = 'features'
const PROVIDER_TABLE = 'model_providers.revolt'

async function loadDoc(): Promise<TomlDoc> {
  const raw = await readFile(CONFIG_FILE, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  return new TomlDoc(raw)
}

function valuesFromDoc(doc: TomlDoc): ConfigValues {
  // SAFETY: fromEntries over the complete field lists yields every key.
  return {
    agent: Object.fromEntries(
      AGENT_FIELDS.map((field) => {
        const value = doc.get(null, field.key)
        if (value === undefined) return [field.key, field.default]
        return [field.key, field.options.some((option) => option.value === value) ? value : null]
      })
    ),
    features: Object.fromEntries(
      FEATURE_FIELDS.map((field) => [
        field.key,
        doc.getBool(FEATURES_TABLE, field.key) ?? field.default
      ])
    ),
    provider: {
      enabled: doc.get(null, 'model_provider') === 'revolt',
      baseUrl: doc.get(PROVIDER_TABLE, 'base_url') ?? '',
      apiKey: doc.get(PROVIDER_TABLE, 'experimental_bearer_token') ?? ''
    }
  } as ConfigValues
}

// Validates the untrusted IPC payload while diffing against the file, then
// writes changed entries in one pass; throws before touching disk.
async function writeValues(next: ConfigValues): Promise<void> {
  const doc = await loadDoc()
  const current = valuesFromDoc(doc)
  let changed = false
  for (const field of AGENT_FIELDS) {
    const value = next.agent[field.key]
    if (value === null || value === current.agent[field.key]) continue
    if (!field.options.some((option) => option.value === value)) {
      throw new Error(`Unsupported ${field.key} value: ${value}`)
    }
    doc.set(null, field.key, value)
    changed = true
  }
  for (const field of FEATURE_FIELDS) {
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
  await mkdir(dirname(CONFIG_FILE), { recursive: true })
  await writeFile(CONFIG_FILE, text)
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
