import { watch, type FSWatcher } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import { parse } from 'smol-toml'
import {
  AGENT_FIELDS,
  FEATURE_FIELDS,
  type AgentFieldKey,
  type ConfigValues,
  type FeatureKey
} from '../shared/config'

const CONFIG_FILE = join(homedir(), '.codex', 'config.toml')

export function registerConfig(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const notify = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('config:changed')
      }
    }, 150)
  }

  let watcher: FSWatcher | undefined
  const ensureWatch = (): void => {
    if (watcher) return
    try {
      const armed = watch(dirname(CONFIG_FILE), (_event, filename) => {
        if (!filename || filename === 'config.toml') notify()
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
    const values = await serialize(readValues)
    ensureWatch()
    return values
  })
  ipcMain.handle('config:save', async (_event, values: ConfigValues) => {
    await serialize(() => writeValues(values))
    ensureWatch()
  })

  ensureWatch()

  return () => {
    clearTimeout(timer)
    watcher?.close()
  }
}

type AgentField = (typeof AGENT_FIELDS)[number]
type FeatureField = (typeof FEATURE_FIELDS)[number]

async function readValues(): Promise<ConfigValues> {
  return valuesFromLines(await readLines())
}

function valuesFromLines(lines: string[]): ConfigValues {
  // SAFETY: fromEntries over the complete field lists yields every key.
  return {
    agent: Object.fromEntries(
      AGENT_FIELDS.map((field) => [field.key, readAgentValue(lines, field)])
    ),
    features: Object.fromEntries(
      FEATURE_FIELDS.map((field) => [field.key, readFeatureValue(lines, field)])
    )
  } as ConfigValues
}

function readAgentValue(lines: string[], field: AgentField): string | null {
  const line = topLevelLines(lines).find((item) => matchesKey(item, field.key))
  if (!line) return field.default
  const value = unquote(lineValue(line))
  return field.options.some((option) => option.value === value) ? value : null
}

function readFeatureValue(lines: string[], field: FeatureField): boolean {
  const line = featureLine(lines, field.key)
  if (!line) return field.default
  return lineValue(line).split('#')[0].trim() === 'true'
}

// Validates the untrusted IPC payload while diffing against the file, then
// writes changed entries in one pass; throws before touching disk.
async function writeValues(next: ConfigValues): Promise<void> {
  const lines = await readLines()
  const current = valuesFromLines(lines)
  let changed = false
  for (const field of AGENT_FIELDS) {
    const value = next.agent[field.key]
    if (value === null || value === current.agent[field.key]) continue
    if (!field.options.some((option) => option.value === value)) {
      throw new Error(`Unsupported ${field.key} value: ${value}`)
    }
    upsertTopLevelLine(lines, field.key, value)
    changed = true
  }
  for (const field of FEATURE_FIELDS) {
    const enabled = next.features[field.key]
    if (enabled !== true && enabled !== false) {
      throw new Error(`Unsupported ${field.key} value: ${enabled}`)
    }
    if (enabled === current.features[field.key]) continue
    upsertFeatureLine(lines, field.key, enabled)
    changed = true
  }
  if (changed) await writeLines(lines)
}

async function readLines(): Promise<string[]> {
  const raw = await readFile(CONFIG_FILE, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  const lines = raw.split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

async function writeLines(lines: string[]): Promise<void> {
  const text = lines.join('\n') + '\n'
  // abort before touching disk if the edit produced invalid TOML
  parse(text)
  await mkdir(dirname(CONFIG_FILE), { recursive: true })
  await writeFile(CONFIG_FILE, text)
}

function upsertTopLevelLine(lines: string[], key: AgentFieldKey, value: string): void {
  const top = topLevelLines(lines)
  const entry = `${key} = "${value}"`
  const index = top.findIndex((line) => matchesKey(line, key))
  if (index !== -1) lines[index] = replaceEntryLine(lines[index], entry)
  else lines.splice(top.length, 0, entry)
}

function upsertFeatureLine(lines: string[], key: FeatureKey, enabled: boolean): void {
  let section = featuresSection(lines)
  if (!section) {
    if (lines.length > 0) lines.push('')
    lines.push('[features]')
    section = { start: lines.length, end: lines.length }
  }
  const entry = `${key} = ${enabled}`
  const index = lines.slice(section.start, section.end).findIndex((line) => matchesKey(line, key))
  if (index !== -1) {
    lines[section.start + index] = replaceEntryLine(lines[section.start + index], entry)
  } else {
    let at = section.end
    while (at > section.start && lines[at - 1].trim() === '') at--
    lines.splice(at, 0, entry)
  }
}

function replaceEntryLine(line: string, entry: string): string {
  const indent = line.match(/^\s*/)?.[0] ?? ''
  const comment = lineValue(line).match(/^(?:"[^"]*"|'[^']*'|[^#]*?)\s*(#.*)$/)?.[1]
  return indent + entry + (comment ? ` ${comment}` : '')
}

function topLevelLines(lines: string[]): string[] {
  const tableStart = lines.findIndex((line) => /^\s*\[/.test(line))
  return tableStart === -1 ? lines : lines.slice(0, tableStart)
}

function featuresSection(lines: string[]): { start: number; end: number } | null {
  const header = lines.findIndex((line) => /^\s*\[\s*features\s*\]\s*(#.*)?$/.test(line))
  if (header === -1) return null
  let end = lines.length
  for (let i = header + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) {
      end = i
      break
    }
  }
  return { start: header + 1, end }
}

function featureLine(lines: string[], key: FeatureKey): string | undefined {
  const section = featuresSection(lines)
  if (!section) return undefined
  return lines.slice(section.start, section.end).find((line) => matchesKey(line, key))
}

function matchesKey(line: string, key: string): boolean {
  return new RegExp(`^\\s*${key}\\s*=`).test(line)
}

function lineValue(line: string): string {
  return line.slice(line.indexOf('=') + 1).trim()
}

function unquote(value: string): string {
  const match = value.match(/^"([^"]*)"|^'([^']*)'/)
  if (match) return match[1] ?? match[2]
  return value.split('#')[0].trim()
}
