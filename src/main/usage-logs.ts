import { Effect, Option, Schema } from 'effect'
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
// freezes homedir() at import time. Parsers are pure so the sweep owns all io.
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
// stays unknown until a source schema validates it.
function* jsonLines(data: Uint8Array, needles: readonly Buffer[]): Generator<unknown> {
  const bytes = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  let start = 0
  while (start < bytes.length) {
    const newline = bytes.indexOf(10, start)
    const end = newline === -1 ? bytes.length : newline
    const line = bytes.subarray(start, end)
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

const tokenCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const modelField = Schema.optional(Schema.NullOr(Schema.String))

const claudeLine = Schema.Struct({
  type: Schema.Literal('assistant'),
  requestId: Schema.String,
  timestamp: Schema.String,
  message: Schema.Struct({
    id: Schema.String,
    model: Schema.String,
    usage: Schema.Struct({
      input_tokens: tokenCount,
      output_tokens: tokenCount,
      cache_read_input_tokens: tokenCount,
      cache_creation_input_tokens: tokenCount,
      cache_creation: Schema.optional(
        Schema.NullOr(
          Schema.Struct({
            ephemeral_5m_input_tokens: tokenCount,
            ephemeral_1h_input_tokens: tokenCount
          })
        )
      )
    })
  })
})

const codexTokenUsage = Schema.Struct({
  input_tokens: tokenCount,
  cached_input_tokens: tokenCount,
  cache_write_input_tokens: tokenCount.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  output_tokens: tokenCount
})

const codexRecord = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('session_meta'),
    payload: Schema.Struct({ model: modelField })
  }),
  Schema.Struct({
    type: Schema.Literal('turn_context'),
    payload: Schema.Struct({ model: modelField })
  }),
  Schema.Struct({
    type: Schema.Literal('event_msg'),
    timestamp: Schema.String,
    payload: Schema.Struct({
      type: Schema.Literal('token_count'),
      info: Schema.Struct({
        total_token_usage: codexTokenUsage,
        last_token_usage: codexTokenUsage
      })
    })
  })
])

const decodeClaudeLine = Schema.decodeUnknownOption(claudeLine)
const decodeCodexRecord = Schema.decodeUnknownOption(codexRecord)

function parseClaudeLog(data: Uint8Array): UsageEvent[] {
  const events: UsageEvent[] = []
  for (const raw of jsonLines(data, CLAUDE_NEEDLES)) {
    const parsed = decodeClaudeLine(raw)
    if (Option.isNone(parsed)) continue
    const entry = parsed.value
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

function parseCodexLog(data: Uint8Array): UsageEvent[] {
  const events: UsageEvent[] = []
  let model: string | null = null
  let previousTotal: string | null = null
  for (const raw of jsonLines(data, CODEX_NEEDLES)) {
    const parsed = decodeCodexRecord(raw)
    if (Option.isNone(parsed)) continue
    const record = parsed.value
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
