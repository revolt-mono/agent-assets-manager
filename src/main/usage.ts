import { readdir, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { ipcMain } from 'electron'
import { MAX_RANGE_DAYS, type UsageBucket } from '../shared/usage'
import { LOG_SOURCES, type UsageEvent } from './usage-logs'

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

type CachedFile = { mtimeMs: number; size: number; events: UsageEvent[] }

// One sweep over every log source: unchanged files come from the cache, the
// rest are re-parsed. Returns the fresh cache so deleted files fall out.
async function sweepLogs(
  cache: ReadonlyMap<string, CachedFile>
): Promise<{ events: UsageEvent[]; cache: Map<string, CachedFile> }> {
  const next = new Map<string, CachedFile>()
  // One extra day past the widest UI range covers timezone and daylight-saving
  // boundaries before the renderer filters timestamps.
  const oldestFileMtime = Date.now() - (MAX_RANGE_DAYS + 1) * 24 * 60 * 60 * 1000
  const lists = await Promise.all(
    LOG_SOURCES.map(async (source) => {
      const files = await filesUnder(join(homedir(), ...source.root), source.match)
      const events: UsageEvent[] = []
      // Chunked so a large log history cannot exhaust file descriptors.
      for (let start = 0; start < files.length; start += 32) {
        const entries = await Promise.all(
          files.slice(start, start + 32).map(async (file): Promise<[string, CachedFile] | null> => {
            const info = await stat(file).catch(() => null)
            if (!info) return null
            if (info.mtimeMs < oldestFileMtime) return null
            const hit = cache.get(file)
            if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return [file, hit]
            try {
              return [
                file,
                { mtimeMs: info.mtimeMs, size: info.size, events: await source.parse(file) }
              ]
            } catch {
              return null // transient read failure: retry next sweep
            }
          })
        )
        for (const item of entries) {
          if (!item) continue
          const [file, entry] = item
          next.set(file, entry)
          for (const event of entry.events) events.push(event)
        }
      }
      return events
    })
  )
  return { events: lists.flat(), cache: next }
}

function report(events: UsageEvent[]): UsageBucket[] {
  const buckets = new Map<string, UsageBucket>()
  const seen = new Set<string>()
  for (const event of events) {
    if (event.dedupe !== null) {
      if (seen.has(event.dedupe)) continue
      seen.add(event.dedupe)
    }
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
  // Session logs are immutable once written and only the live session's file
  // grows, so parsed events are cached per file and re-read only when mtime
  // or size changes.
  let cache = new Map<string, CachedFile>()
  ipcMain.handle('usage:get', async (_event, fresh: boolean) => {
    if (fresh === true) cache = new Map()
    const swept = await sweepLogs(cache)
    cache = swept.cache
    return report(swept.events)
  })
}
