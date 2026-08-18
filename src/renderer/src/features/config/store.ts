import { toast } from '@renderer/components/ui/toast'
import { createStore, useStore } from '@renderer/lib/store'
import type { ConfigValues } from '@shared/config'

let generation = 0
const store = createStore<ConfigValues | undefined>(undefined, () => revalidate())

function revalidate(): void {
  const id = ++generation
  window.api.config.get().then(
    (values) => {
      if (id === generation) store.set(values)
    },
    () => {
      if (id === generation) toast.add({ title: 'Could not load config', type: 'error' })
    }
  )
}

// An unwatched store skips the re-read; the next subscriber revalidates.
window.api.config.onChanged(() => {
  if (store.watched()) revalidate()
})

export function useSavedConfig(): ConfigValues | undefined {
  return useStore(store)
}

// Publishes the draft as the new saved value once main has written it, so the
// UI settles immediately instead of waiting for the file watcher's echo. On
// failure it re-reads the file to show what actually stuck.
export async function saveConfig(values: ConfigValues): Promise<void> {
  try {
    await window.api.config.save(values)
  } catch (error) {
    revalidate()
    throw error
  }
  generation++
  store.set(values)
}
