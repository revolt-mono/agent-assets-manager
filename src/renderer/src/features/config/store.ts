import { toast } from '@renderer/components/ui/toast'
import { createStore, useStore, type Store } from '@renderer/lib/store'
import type { AgentId } from '@shared/agent'
import type { AgentConfig } from '@shared/config'

type ConfigStore<A extends AgentId> = {
  store: Store<AgentConfig[A] | undefined>
  onChanged: () => void
  save: (values: AgentConfig[A]) => Promise<void>
}

function createConfigStore<A extends AgentId>(agent: A): ConfigStore<A> {
  let generation = 0
  const store = createStore<AgentConfig[A] | undefined>(undefined, () => revalidate())

  function revalidate(): void {
    const id = ++generation
    window.api.config.get(agent).then(
      (values) => {
        if (id === generation) store.set(values)
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
    async save(values: AgentConfig[A]): Promise<void> {
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

type ConfigStores = { [A in AgentId]: ConfigStore<A> }

const stores: ConfigStores = {
  claude: createConfigStore('claude'),
  codex: createConfigStore('codex')
}

window.api.config.onChanged((agent) => stores[agent].onChanged())

export function useSavedConfig<A extends AgentId>(agent: A): AgentConfig[A] | undefined {
  return useStore(stores[agent].store)
}

export function saveConfig<A extends AgentId>(agent: A, values: AgentConfig[A]): Promise<void> {
  return stores[agent].save(values)
}
