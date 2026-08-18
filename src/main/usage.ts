import { readdir, readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { ipcMain } from 'electron'
import type { AgentId } from '../shared/skill'
import type { UsageBucket } from '../shared/usage'

// Built-in price table, USD per million tokens.
type Rates = {
  input: number
  cacheWrite5m: number
  cacheWrite1h: number
  cacheRead: number
  output: number
}

const anthropic = (input: number, output: number): Rates => ({
  input,
  cacheWrite5m: input * 1.25,
  cacheWrite1h: input * 2,
  cacheRead: input * 0.1,
  output
})

const flatWrite = (
  input: number,
  cacheWrite: number,
  cacheRead: number,
  output: number
): Rates => ({
  input,
  cacheWrite5m: cacheWrite,
  cacheWrite1h: cacheWrite,
  cacheRead,
  output
})

const CATALOG = new Map<string, Rates>([
  ['claude-fable-5', anthropic(10, 50)],
  ['claude-opus-5', anthropic(5, 25)],
  ['claude-opus-4-8', anthropic(5, 25)],
  ['claude-opus-4-7', anthropic(5, 25)],
  ['claude-opus-4-6', anthropic(5, 25)],
  ['claude-opus-4-5', anthropic(5, 25)],
  ['claude-sonnet-5', anthropic(2, 10)],
  ['claude-sonnet-4-6', anthropic(3, 15)],
  ['claude-sonnet-4-5', anthropic(3, 15)],
  ['claude-haiku-4-5', anthropic(1, 5)],
  ['gpt-5.6-sol', flatWrite(5, 6.25, 0.5, 30)],
  ['gpt-daybreak-blue-latest', flatWrite(5, 6.25, 0.5, 30)],
  ['gpt-5.6-terra', flatWrite(2, 2.5, 0.2, 12)],
  ['gpt-5.6-luna', flatWrite(0.2, 0.25, 0.02, 1.2)],
  ['gpt-5.5', flatWrite(5, 5, 0.5, 30)],
  ['gpt-5.4', flatWrite(2.5, 2.5, 0.25, 15)]
])

// Real Claude Code logs occasionally record the bare family name; everything
// else in both agents' logs already uses full catalog ids.
const ALIASES = new Map<string, string>([
  ['opus', 'claude-opus-5'],
  ['sonnet', 'claude-sonnet-5'],
  ['fable', 'claude-fable-5']
])

type UsageEvent = {
  agent: AgentId
  timestamp: number
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
}

// Logs are machine-written but still untrusted: a leaf that fails this check
// (missing, NaN, or a lying type) drops the line, mirroring the CLI parser.
const count = (value: number | undefined): number | null =>
  value !== undefined && Number.isFinite(value) && value >= 0 ? value : null

async function filesUnder(root: string, match: (name: string) => boolean): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true, recursive: true })
    return entries
      .filter((entry) => entry.isFile() && match(entry.name))
      .map((entry) => join(entry.parentPath, entry.name))
  } catch {
    return [] // directory does not exist
  }
}

// Reads one jsonl file, keeping only lines that mention a needle and parse as
// JSON. T declares the expected line shape; every leaf is still checked before
// use because the log is untrusted.
async function jsonLines<T>(file: string, needles: string[]): Promise<T[]> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return []
  }
  const parsed: T[] = []
  for (const line of text.split('\n')) {
    if (!needles.some((needle) => line.includes(needle))) continue
    try {
      parsed.push(JSON.parse(line))
    } catch {
      // skip malformed lines
    }
  }
  return parsed
}

type ClaudeLine = {
  type?: string
  requestId?: string
  timestamp?: string
  message?: {
    id?: string
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
      cache_creation?: {
        ephemeral_5m_input_tokens?: number
        ephemeral_1h_input_tokens?: number
      } | null
    }
  }
}

async function claudeEvents(): Promise<UsageEvent[]> {
  const files = await filesUnder(join(homedir(), '.claude', 'projects'), (name) =>
    name.endsWith('.jsonl')
  )
  const seen = new Set<string>()
  const events: UsageEvent[] = []
  for (const file of files) {
    for (const entry of await jsonLines<ClaudeLine>(file, ['"assistant"'])) {
      if (entry?.type !== 'assistant') continue
      const message = entry.message
      const usage = message?.usage
      const model = message?.model
      if (entry.requestId == null || message?.id == null || usage == null) continue
      if (model == null || model === '<synthetic>') continue
      const timestamp = Date.parse(`${entry.timestamp}`)
      const input = count(usage.input_tokens)
      const output = count(usage.output_tokens)
      const cacheRead = count(usage.cache_read_input_tokens)
      const cacheCreation = count(usage.cache_creation_input_tokens)
      if (Number.isNaN(timestamp) || input === null || output === null) continue
      if (cacheRead === null || cacheCreation === null) continue
      const key = `${message.id}\n${entry.requestId}`
      if (seen.has(key)) continue
      seen.add(key)
      const split = usage.cache_creation
      events.push({
        agent: 'claude',
        timestamp,
        model,
        input,
        output,
        cacheRead,
        cacheWrite5m: split ? (count(split.ephemeral_5m_input_tokens) ?? 0) : 0,
        cacheWrite1h: split ? (count(split.ephemeral_1h_input_tokens) ?? 0) : cacheCreation
      })
    }
  }
  return events
}

type CodexTokenUsage = {
  input_tokens?: number
  cached_input_tokens?: number
  cache_write_input_tokens?: number
  output_tokens?: number
}

type CodexLine = {
  type?: string
  timestamp?: string
  payload?: {
    type?: string
    model?: string | null
    info?: {
      total_token_usage?: CodexTokenUsage
      last_token_usage?: CodexTokenUsage
    } | null
  } | null
}

const totalKey = (total: CodexTokenUsage): string =>
  [
    total.input_tokens,
    total.cached_input_tokens,
    total.cache_write_input_tokens ?? 0,
    total.output_tokens
  ].join('|')

async function codexEvents(): Promise<UsageEvent[]> {
  const events: UsageEvent[] = []
  for (const root of ['sessions', 'archived_sessions']) {
    const files = await filesUnder(
      join(homedir(), '.codex', root),
      (name) => name.startsWith('rollout-') && name.endsWith('.jsonl')
    )
    for (const file of files) {
      let model: string | null = null
      let previousTotal: string | null = null
      const records = await jsonLines<CodexLine>(file, [
        'session_meta',
        'turn_context',
        'token_count'
      ])
      for (const record of records) {
        if (record?.type === 'session_meta' || record?.type === 'turn_context') {
          if (record.payload?.model != null) model = record.payload.model
          continue
        }
        if (record?.type !== 'event_msg' || record.payload?.type !== 'token_count') continue
        const info = record.payload.info
        const total = info?.total_token_usage
        const last = info?.last_token_usage
        if (total == null || last == null) continue
        if (totalKey(total) === previousTotal) continue
        if (model === null) continue
        const timestamp = Date.parse(`${record.timestamp}`)
        const inputTokens = count(last.input_tokens)
        const cacheRead = count(last.cached_input_tokens)
        const output = count(last.output_tokens)
        if (Number.isNaN(timestamp) || inputTokens === null || cacheRead === null) continue
        if (output === null || inputTokens < cacheRead) continue
        previousTotal = totalKey(total)
        events.push({
          agent: 'codex',
          timestamp,
          model,
          input: inputTokens - cacheRead,
          output,
          cacheRead,
          cacheWrite5m: count(last.cache_write_input_tokens) ?? 0,
          cacheWrite1h: 0
        })
      }
    }
  }
  return events
}

function report(events: UsageEvent[]): UsageBucket[] {
  const buckets = new Map<string, UsageBucket>()
  for (const event of events) {
    const model = ALIASES.get(event.model) ?? event.model
    const rates = CATALOG.get(model)
    if (!rates) continue
    const cost =
      (event.input * rates.input +
        event.cacheWrite5m * rates.cacheWrite5m +
        event.cacheWrite1h * rates.cacheWrite1h +
        event.cacheRead * rates.cacheRead +
        event.output * rates.output) /
      1_000_000
    const hour = Math.floor(event.timestamp / 3_600_000) * 3_600_000
    const key = `${hour}|${event.agent}|${model}`
    const bucket = buckets.get(key) ?? {
      hour,
      agent: event.agent,
      model,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0
    }
    bucket.tokens.input += event.input
    bucket.tokens.output += event.output
    bucket.tokens.cacheRead += event.cacheRead
    bucket.tokens.cacheWrite += event.cacheWrite5m + event.cacheWrite1h
    bucket.cost += cost
    buckets.set(key, bucket)
  }
  return [...buckets.values()].sort((a, b) => a.hour - b.hour)
}

export function registerUsage(): void {
  ipcMain.handle('usage:get', async () => {
    const [claude, codex] = await Promise.all([claudeEvents(), codexEvents()])
    return report([...claude, ...codex])
  })
}
