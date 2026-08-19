import { appendFile, mkdir, mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, expect, test } from 'vitest'
import type { UsageBucket } from '../shared/usage'
import { invokeIpc } from './electron-stub'

function claudeLine(
  id: string,
  model: string,
  timestamp: string,
  tokens: { input?: number; output?: number; cacheRead?: number }
): string {
  return JSON.stringify({
    type: 'assistant',
    requestId: `req_${id}`,
    timestamp,
    message: {
      id: `msg_${id}`,
      model,
      usage: {
        input_tokens: tokens.input ?? 0,
        output_tokens: tokens.output ?? 0,
        cache_read_input_tokens: tokens.cacheRead ?? 0,
        cache_creation_input_tokens: 0
      }
    }
  })
}

let claudeLog: string

beforeAll(async () => {
  const home = await mkdtemp(join(tmpdir(), 'usage-home-'))
  process.env.HOME = home
  // LOG_SOURCES resolve homedir() at import time, so load the module only
  // after HOME points at the fixture directory.
  const { registerUsage } = await import('./usage')
  registerUsage()

  const projects = join(home, '.claude', 'projects', 'proj')
  await mkdir(projects, { recursive: true })
  claudeLog = join(projects, 'one.jsonl')
  const first = claudeLine('a', 'opus', '2026-01-02T03:10:00Z', { input: 1_000_000 })
  await writeFile(
    claudeLog,
    [
      first,
      claudeLine('b', 'claude-opus-5', '2026-01-02T03:40:00Z', { output: 1_000_000 }),
      claudeLine('c', 'mystery-9000', '2026-01-02T03:50:00Z', { input: 1 })
    ].join('\n') + '\n'
  )
  // a resumed session copies history into a second file: same request twice
  await writeFile(join(projects, 'two.jsonl'), first + '\n')

  const sessions = join(home, '.codex', 'sessions')
  await mkdir(sessions, { recursive: true })
  const usage = { input_tokens: 1_000_000, cached_input_tokens: 0, output_tokens: 0 }
  await writeFile(
    join(sessions, 'rollout-a.jsonl'),
    [
      JSON.stringify({ type: 'session_meta', payload: { type: 'session_meta', model: 'gpt-5.5' } }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-01-02T03:20:00Z',
        payload: {
          type: 'token_count',
          info: { total_token_usage: usage, last_token_usage: usage }
        }
      })
    ].join('\n') + '\n'
  )
})

const HOUR = Date.parse('2026-01-02T03:00:00Z')

test('report dedupes resumed sessions, resolves aliases, prices per hour bucket', async () => {
  const buckets: UsageBucket[] = await invokeIpc('usage:get', false)
  expect(buckets).toHaveLength(2) // unknown model excluded, duplicate request collapsed

  const claude = buckets.find((bucket) => bucket.agent === 'claude')!
  expect(claude).toMatchObject({ hour: HOUR, model: 'claude-opus-5' })
  expect(claude.tokens).toEqual({
    input: 1_000_000,
    output: 1_000_000,
    cacheRead: 0,
    cacheWrite: 0
  })
  expect(claude.cost).toBeCloseTo(5 + 25) // $5/M input + $25/M output

  const codex = buckets.find((bucket) => bucket.agent === 'codex')!
  expect(codex).toMatchObject({ hour: HOUR, model: 'gpt-5.5' })
  expect(codex.cost).toBeCloseTo(5)
})

test('a grown log file is re-read on the next sweep', async () => {
  await appendFile(
    claudeLog,
    claudeLine('d', 'claude-opus-5', '2026-01-02T05:00:00Z', { cacheRead: 1_000_000 }) + '\n'
  )
  const buckets: UsageBucket[] = await invokeIpc('usage:get', false)
  expect(buckets).toHaveLength(3)
  // report stays sorted by hour, so the new bucket lands last
  expect(buckets[2]).toMatchObject({ hour: Date.parse('2026-01-02T05:00:00Z'), agent: 'claude' })
  expect(buckets[2].cost).toBeCloseTo(0.5) // cache reads at $0.5/M
})
