import { Effect, Fiber } from 'effect'
import { toast } from '@renderer/components/ui/toast'
import { createStore, latestWins, useStore } from '@renderer/lib/store'
import type { UsageBucket } from '@shared/usage'

// Buckets are stamped with their load hour: the page's range windows end at
// the stamp, so every reload (page becoming visible, manual refresh)
// advances the chart window with it.
export type UsageData = { at: number; buckets: UsageBucket[] }

// Main caches parsed logs per file, so reloading whenever the page becomes
// visible is cheap. undefined: first load pending; 'error': it failed.
const store = createStore<UsageData | 'error' | undefined>(undefined, () =>
  inflight.fork(load(false))
)
// A newer load interrupts the in-flight one, so a stale snapshot (or its
// error handling) can never land after a fresher one.
const inflight = latestWins()

const load = Effect.fn('loadUsage')(
  function* (fresh: boolean) {
    const buckets = yield* Effect.tryPromise(() => window.api.usage.get(fresh))
    // The windows derive from `at` at hour granularity, so flooring the
    // stamp lets deep-equal reloads keep the old reference and the chart
    // skip a re-render until the data or the hour actually changes.
    const next = { at: Math.floor(Date.now() / 3_600_000) * 3_600_000, buckets }
    if (JSON.stringify(next) !== JSON.stringify(store.get())) store.set(next)
  },
  Effect.catch(() =>
    Effect.sync(() => {
      const current = store.get()
      // keep buckets from an earlier load; the toast covers a failed refresh
      if (current === undefined || current === 'error') store.set('error')
      else toast.add({ title: 'Could not load usage', type: 'error' })
    })
  )
)

export function useUsage(): UsageData | 'error' | undefined {
  return useStore(store)
}

/**
 * Discards the main-process parse cache and re-reads every log. Settles when
 * the reload lands; interrupts the caller if a newer load supersedes it.
 */
export const refreshUsage: Effect.Effect<void> = Effect.suspend(() =>
  Fiber.join(inflight.fork(load(true)))
)
