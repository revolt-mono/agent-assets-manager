import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, expect, test } from 'vitest'
import { LOG_SOURCES } from './usage-logs'

const claudeSource = LOG_SOURCES.find((source) => source.root.includes('.claude'))!
const codexSource = LOG_SOURCES.find((source) => source.root.includes('.codex'))!

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'usage-logs-'))
})

async function writeLog(name: string, lines: string[]): Promise<string> {
  const file = join(dir, name)
  await writeFile(file, lines.join('\n') + '\n')
  return file
}

function claudeLine(overrides: {
  requestId?: string | number | undefined
  model?: string
  timestamp?: string
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
    cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number }
  }
}): string {
  return JSON.stringify({
    type: 'assistant',
    requestId: 'requestId' in overrides ? overrides.requestId : 'req_1',
    timestamp: overrides.timestamp ?? '2026-08-19T10:00:00Z',
    message: {
      id: 'msg_1',
      model: overrides.model ?? 'claude-opus-5',
      usage: overrides.usage ?? {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 300
      }
    }
  })
}

test('claude log: valid assistant lines become events, split cache is honored', async () => {
  const file = await writeLog('session.jsonl', [
    claudeLine({
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 300,
        cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 100 }
      }
    }),
    claudeLine({}) // no cache_creation split
  ])
  const events = claudeSource.parse(await readFile(file))
  expect(events).toHaveLength(2)
  expect(events[0]).toMatchObject({
    agent: 'claude',
    timestamp: Date.parse('2026-08-19T10:00:00Z'),
    model: 'claude-opus-5',
    input: 100,
    output: 50,
    cacheRead: 1000,
    cacheWrite5m: 200,
    cacheWrite1h: 100,
    dedupe: 'msg_1\nreq_1'
  })
  // without a split, the whole cache_creation total bills at the 1h rate
  expect(events[1]).toMatchObject({ cacheWrite5m: 0, cacheWrite1h: 300 })
})

test('claude log: malformed or incomplete lines are dropped, not fatal', async () => {
  const file = await writeLog('broken.jsonl', [
    '{"type":"assistant","requestId":', // truncated json
    JSON.stringify({ type: 'user', message: { content: 'ask the assistant' } }),
    claudeLine({ model: '<synthetic>' }),
    claudeLine({ requestId: undefined }),
    claudeLine({ requestId: 123 }),
    claudeLine({ timestamp: 'not-a-date' }),
    claudeLine({
      usage: {
        input_tokens: 1.5,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0
      }
    }),
    claudeLine({
      usage: {
        input_tokens: 100,
        output_tokens: -5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0
      }
    }),
    claudeLine({})
  ])
  const events = claudeSource.parse(await readFile(file))
  expect(events).toHaveLength(1)
  expect(events[0].input).toBe(100)
})

test('claude log: parses a final line without a newline', async () => {
  const file = join(dir, 'unterminated.jsonl')
  await writeFile(file, claudeLine({}))

  const events = claudeSource.parse(await readFile(file))

  expect(events).toHaveLength(1)
  expect(events[0].input).toBe(100)
})

type CodexUsage = { input: number; cached: number; output: number; write?: number }

function tokenCount(timestamp: string, total: CodexUsage, last: CodexUsage): string {
  const usage = (u: CodexUsage) => ({
    input_tokens: u.input,
    cached_input_tokens: u.cached,
    cache_write_input_tokens: u.write ?? 0,
    output_tokens: u.output
  })
  return JSON.stringify({
    type: 'event_msg',
    timestamp,
    payload: {
      type: 'token_count',
      info: { total_token_usage: usage(total), last_token_usage: usage(last) }
    }
  })
}

test('codex log: model comes from session meta, repeats of the same total are dropped', async () => {
  const file = await writeLog('rollout-1.jsonl', [
    JSON.stringify({ type: 'session_meta', payload: { type: 'session_meta', model: 'gpt-5.5' } }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-08-19T09:59:00Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {},
          last_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 80,
            output_tokens: 2
          }
        }
      }
    }),
    tokenCount(
      '2026-08-19T10:00:00Z',
      { input: 1000, cached: 800, output: 20, write: 40 },
      { input: 1000, cached: 800, output: 20, write: 40 }
    ),
    // idle refresh: identical cumulative totals carry no new usage
    tokenCount(
      '2026-08-19T10:00:05Z',
      { input: 1000, cached: 800, output: 20, write: 40 },
      { input: 1000, cached: 800, output: 20, write: 40 }
    ),
    JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.4' } }),
    tokenCount(
      '2026-08-19T10:01:00Z',
      { input: 1500, cached: 1200, output: 30 },
      { input: 500, cached: 400, output: 10 }
    ),
    // last claims more cache reads than input: inconsistent, dropped
    tokenCount(
      '2026-08-19T10:02:00Z',
      { input: 1600, cached: 1300, output: 40 },
      { input: 100, cached: 400, output: 10 }
    )
  ])
  const events = codexSource.parse(await readFile(file))
  expect(events).toHaveLength(2)
  expect(events[0]).toMatchObject({
    agent: 'codex',
    model: 'gpt-5.5',
    input: 200, // uncached slice of the 1000 input tokens
    cacheRead: 800,
    output: 20,
    cacheWrite5m: 40,
    cacheWrite1h: 0,
    dedupe: null
  })
  expect(events[1]).toMatchObject({ model: 'gpt-5.4', input: 100, cacheRead: 400 })
})

test('codex log: token counts before any model line are dropped', async () => {
  const file = await writeLog('rollout-2.jsonl', [
    tokenCount(
      '2026-08-19T10:00:00Z',
      { input: 100, cached: 0, output: 5 },
      { input: 100, cached: 0, output: 5 }
    )
  ])
  expect(codexSource.parse(await readFile(file))).toEqual([])
})
