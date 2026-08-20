import { toast } from '@renderer/components/ui/toast'
import { createStore, latestWins, useStore } from '@renderer/lib/store'
import type { AgentId } from '@shared/agent'
import type { AgentConfigValues } from '@shared/config'

function createConfigStore(agent: AgentId) {
  const store = createStore<AgentConfigValues | undefined>(undefined, () => revalidate())
  // A newer revalidate (or a landed save) supersedes the in-flight read so a
  // stale snapshot can never overwrite a fresher one.
  const inflight = latestWins()

  function revalidate(): void {
    void inflight.run(
      () => window.api.config.get(agent),
      (values) => {
        // The save echo and unmanaged-key file churn arrive as deep-equal
        // snapshots; keep the old reference so the page's identity-keyed
        // draft only resets when the managed content really changed.
        if (JSON.stringify(values) !== JSON.stringify(store.get())) store.set(values)
      },
      () => toast.add({ title: 'Could not load config', type: 'error' })
    )
  }

  // Publishes the draft as the new saved value once main has written it, so
  // the UI settles immediately instead of waiting for the file watcher's
  // echo. On failure it re-reads the file to show what actually stuck.
  const save = async (values: AgentConfigValues): Promise<void> => {
    try {
      await window.api.config.save(agent, values)
    } catch (error) {
      revalidate()
      throw error
    }
    inflight.cancel()
    store.set(values)
  }

  return {
    store,
    // An unwatched store skips the re-read; the next subscriber revalidates.
    onChanged: () => {
      if (store.watched()) revalidate()
    },
    save
  }
}

const stores = {
  claude: createConfigStore('claude'),
  codex: createConfigStore('codex')
}

window.api.config.onChanged((agent) => stores[agent].onChanged())

export function useSavedConfig(agent: AgentId): AgentConfigValues | undefined {
  return useStore(stores[agent].store)
}

export function saveConfig(agent: AgentId, values: AgentConfigValues): Promise<void> {
  return stores[agent].save(values)
}
