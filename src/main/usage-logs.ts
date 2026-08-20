import { readFile } from 'fs/promises'
import { z } from 'zod'
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

const isCodexLog = (name: string): boolean => name.startsWith('rollout-') && name.endsWith('.jsonl')

// Roots are segments under the home directory, resolved per sweep so nothing
// freezes homedir() at import time.
export const LOG_SOURCES = [
  {
    root: ['.claude', 'projects'],
    match: (name: string) => name.endsWith('.jsonl'),
    parse: parseClaudeLog
  },
  { root: ['.codex', 'sessions'], match: isCodexLog, parse: parseCodexLog },
  { root: ['.codex', 'archived_sessions'], match: isCodexLog, parse: parseCodexLog }
]

// Scans bytes so irrelevant log lines never become JS strings. Parsed JSON
// stays unknown until a source parser validates and constructs a usage event.
function* jsonLines(data: Buffer, needles: readonly Buffer[]): Generator<unknown> {
  let start = 0
  while (start < data.length) {
    const newline = data.indexOf(10, start)
    const end = newline === -1 ? data.length : newline
    const line = data.subarray(start, end)
    start = end + 1
    if (!needles.some((needle) => line.includes(needle))) continue
    try {
      const parsed: unknown = JSON.parse(line.toString('utf8'))
      yield parsed
    } catch {
      // skip malformed lines
    }
  }
}

const CLAUDE_NEEDLES = [Buffer.from('"assistant"')]
const CODEX_NEEDLES = ['session_meta', 'turn_context', 'token_count'].map((value) =>
  Buffer.from(value)
)

const tokenCount = z.number().int().nonnegative().safe()

const claudeLine = z.object({
  type: z.literal('assistant'),
  requestId: z.string(),
  timestamp: z.string(),
  message: z.object({
    id: z.string(),
    model: z.string(),
    usage: z.object({
      input_tokens: tokenCount,
      output_tokens: tokenCount,
      cache_read_input_tokens: tokenCount,
      cache_creation_input_tokens: tokenCount,
      cache_creation: z
        .object({
          ephemeral_5m_input_tokens: tokenCount,
          ephemeral_1h_input_tokens: tokenCount
        })
        .nullish()
    })
  })
})

const codexTokenUsage = z.object({
  input_tokens: tokenCount,
  cached_input_tokens: tokenCount,
  cache_write_input_tokens: tokenCount.default(0),
  output_tokens: tokenCount
})

const codexRecord = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session_meta'),
    payload: z.object({ model: z.string().nullish() })
  }),
  z.object({
    type: z.literal('turn_context'),
    payload: z.object({ model: z.string().nullish() })
  }),
  z.object({
    type: z.literal('event_msg'),
    timestamp: z.string(),
    payload: z.object({
      type: z.literal('token_count'),
      info: z.object({
        total_token_usage: codexTokenUsage,
        last_token_usage: codexTokenUsage
      })
    })
  })
])

async function parseClaudeLog(file: string): Promise<UsageEvent[]> {
  const events: UsageEvent[] = []
  for (const raw of jsonLines(await readFile(file), CLAUDE_NEEDLES)) {
    const parsed = claudeLine.safeParse(raw)
    if (!parsed.success) continue
    const entry = parsed.data
    const message = entry.message
    if (message.model === '<synthetic>') continue
    const usage = message.usage
    const timestamp = Date.parse(entry.timestamp)
    if (Number.isNaN(timestamp)) continue
    const split = usage.cache_creation
    events.push({
      agent: 'claude',
      timestamp,
      model: message.model,
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite5m: split?.ephemeral_5m_input_tokens ?? 0,
      cacheWrite1h: split?.ephemeral_1h_input_tokens ?? usage.cache_creation_input_tokens,
      dedupe: `${message.id}\n${entry.requestId}`
    })
  }
  return events
}

async function parseCodexLog(file: string): Promise<UsageEvent[]> {
  const events: UsageEvent[] = []
  let model: string | null = null
  let previousTotal: string | null = null
  for (const raw of jsonLines(await readFile(file), CODEX_NEEDLES)) {
    const parsed = codexRecord.safeParse(raw)
    if (!parsed.success) continue
    const record = parsed.data
    if (record.type === 'session_meta' || record.type === 'turn_context') {
      if (record.payload.model != null) model = record.payload.model
      continue
    }
    const total = record.payload.info.total_token_usage
    const last = record.payload.info.last_token_usage
    // Codex re-emits token_count with unchanged cumulative totals (e.g. on
    // idle refreshes); an exact repeat carries no new usage.
    const key = [
      total.input_tokens,
      total.cached_input_tokens,
      total.cache_write_input_tokens,
      total.output_tokens
    ].join('|')
    if (key === previousTotal) continue
    if (model === null) continue
    const timestamp = Date.parse(record.timestamp)
    if (Number.isNaN(timestamp) || last.input_tokens < last.cached_input_tokens) continue
    previousTotal = key
    events.push({
      agent: 'codex',
      timestamp,
      model,
      input: last.input_tokens - last.cached_input_tokens,
      output: last.output_tokens,
      cacheRead: last.cached_input_tokens,
      cacheWrite5m: last.cache_write_input_tokens,
      cacheWrite1h: 0,
      dedupe: null
    })
  }
  return events
}
