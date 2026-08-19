import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { AgentId } from '../shared/agent'

// One request's token usage recovered from an agent's session log; pricing
// happens later against the model catalog.
export type UsageEvent = {
  agent: AgentId
  timestamp: number
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
  // Claude resumed sessions copy history into new files, so the same request
  // appears in several logs; the report keeps the first event per key.
  dedupe: string | null
}

export type LogSource = {
  root: string
  match: (name: string) => boolean
  parse: (file: string) => Promise<UsageEvent[]>
}

const isCodexLog = (name: string): boolean => name.startsWith('rollout-') && name.endsWith('.jsonl')

export const LOG_SOURCES: LogSource[] = [
  {
    root: join(homedir(), '.claude', 'projects'),
    match: (name) => name.endsWith('.jsonl'),
    parse: parseClaudeLog
  },
  { root: join(homedir(), '.codex', 'sessions'), match: isCodexLog, parse: parseCodexLog },
  { root: join(homedir(), '.codex', 'archived_sessions'), match: isCodexLog, parse: parseCodexLog }
]

// Logs are machine-written but still untrusted: a leaf that fails this check
// (missing, NaN, or a lying type) drops the line, mirroring the CLI parser.
const count = (value: number | undefined): number | null =>
  value !== undefined && Number.isFinite(value) && value >= 0 ? value : null

// Reads one jsonl file, keeping only lines that mention a needle and parse as
// JSON. T declares the expected line shape; every leaf is still checked before
// use because the log is untrusted. Read failures propagate so a transient
// error is never mistaken for an empty file.
async function jsonLines<T>(file: string, needles: string[]): Promise<T[]> {
  const text = await readFile(file, 'utf8')
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

async function parseClaudeLog(file: string): Promise<UsageEvent[]> {
  const events: UsageEvent[] = []
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
    const split = usage.cache_creation
    events.push({
      agent: 'claude',
      timestamp,
      model,
      input,
      output,
      cacheRead,
      cacheWrite5m: split ? (count(split.ephemeral_5m_input_tokens) ?? 0) : 0,
      cacheWrite1h: split ? (count(split.ephemeral_1h_input_tokens) ?? 0) : cacheCreation,
      dedupe: `${message.id}\n${entry.requestId}`
    })
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

async function parseCodexLog(file: string): Promise<UsageEvent[]> {
  const events: UsageEvent[] = []
  let model: string | null = null
  let previousTotal: string | null = null
  const records = await jsonLines<CodexLine>(file, ['session_meta', 'turn_context', 'token_count'])
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
    // Codex re-emits token_count with unchanged cumulative totals (e.g. on
    // idle refreshes); an exact repeat carries no new usage.
    const key = [
      total.input_tokens,
      total.cached_input_tokens,
      total.cache_write_input_tokens ?? 0,
      total.output_tokens
    ].join('|')
    if (key === previousTotal) continue
    if (model === null) continue
    const timestamp = Date.parse(`${record.timestamp}`)
    const inputTokens = count(last.input_tokens)
    const cacheRead = count(last.cached_input_tokens)
    const output = count(last.output_tokens)
    if (Number.isNaN(timestamp) || inputTokens === null || cacheRead === null) continue
    if (output === null || inputTokens < cacheRead) continue
    previousTotal = key
    events.push({
      agent: 'codex',
      timestamp,
      model,
      input: inputTokens - cacheRead,
      output,
      cacheRead,
      cacheWrite5m: count(last.cache_write_input_tokens) ?? 0,
      cacheWrite1h: 0,
      dedupe: null
    })
  }
  return events
}
