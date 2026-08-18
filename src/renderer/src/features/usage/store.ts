import { toast } from '@renderer/components/ui/toast'
import { createStore, useStore } from '@renderer/lib/store'
import type { UsageBucket } from '@shared/usage'

// Main caches parsed logs per file, so reloading whenever the page becomes
// visible is cheap and keeps the chart window and totals current.
const store = createStore<UsageBucket[] | undefined>(undefined, () => load(false))
let generation = 0

function load(fresh: boolean): Promise<void> {
  const id = ++generation
  return window.api.usage.get(fresh).then(
    (buckets) => {
      if (id !== generation) return
      // identical payloads keep the old snapshot so the chart skips a re-render
      if (JSON.stringify(buckets) !== JSON.stringify(store.get())) store.set(buckets)
    },
    () => {
      if (id !== generation) return
      toast.add({ title: 'Could not load usage', type: 'error' })
      // keep data from an earlier load; only settle the initial spinner
      if (store.get() === undefined) store.set([])
    }
  )
}

export function useUsage(): UsageBucket[] | undefined {
  return useStore(store)
}

/** Discards the main-process parse cache and re-reads every log. */
export function refreshUsage(): Promise<void> {
  return load(true)
}
