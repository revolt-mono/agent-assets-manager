import { toast } from '@renderer/components/ui/toast'
import { createStore, useStore, type Store } from '@renderer/lib/store'
import type { AgentId } from '@shared/agent'
import type { AgentConfigValues } from '@shared/config'

type ConfigStore = {
  store: Store<AgentConfigValues | undefined>
  onChanged: () => void
  save: (values: AgentConfigValues) => Promise<void>
}

function createConfigStore(agent: AgentId): ConfigStore {
  let generation = 0
  const store = createStore<AgentConfigValues | undefined>(undefined, () => revalidate())

  function revalidate(): void {
    const id = ++generation
    window.api.config.get(agent).then(
      (values) => {
        if (id !== generation) return
        // The save echo and unmanaged-key file churn arrive as deep-equal
        // snapshots; keep the old reference so the page's identity-keyed
        // draft only resets when the managed content really changed.
        if (JSON.stringify(values) !== JSON.stringify(store.get())) store.set(values)
      },
      () => {
        if (id === generation) toast.add({ title: 'Could not load config', type: 'error' })
      }
    )
  }

  return {
    store,
    // An unwatched store skips the re-read; the next subscriber revalidates.
    onChanged: () => {
      if (store.watched()) revalidate()
    },
    // Publishes the draft as the new saved value once main has written it, so
    // the UI settles immediately instead of waiting for the file watcher's
    // echo. On failure it re-reads the file to show what actually stuck.
    async save(values: AgentConfigValues): Promise<void> {
      try {
        await window.api.config.save(agent, values)
      } catch (error) {
        revalidate()
        throw error
      }
      generation++
      store.set(values)
    }
  }
}

const stores = {
  claude: createConfigStore('claude'),
  codex: createConfigStore('codex')
} satisfies Record<AgentId, ConfigStore>

window.api.config.onChanged((agent) => stores[agent].onChanged())

export function useSavedConfig(agent: AgentId): AgentConfigValues | undefined {
  return useStore(stores[agent].store)
}

export function saveConfig(agent: AgentId, values: AgentConfigValues): Promise<void> {
  return stores[agent].save(values)
}
