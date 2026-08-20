import { toast } from '@renderer/components/ui/toast'
import { createStore, latestWins, type Store } from '@renderer/lib/store'
import type { AgentId } from '@shared/agent'
import { CONFIG_CATALOGS, type ConfigCatalog, type ConfigValues } from '@shared/config'

export type ConfigStore<A extends AgentId> = {
  catalog: ConfigCatalog<A>
  values: Store<ConfigValues<A> | undefined>
  save: (values: ConfigValues<A>) => Promise<void>
}

type WatchedConfigStore<A extends AgentId> = ConfigStore<A> & { onChanged: () => void }
type ConfigStores = { [A in AgentId]: ConfigStore<A> }

function createConfigStore<A extends AgentId>(
  agent: A,
  catalog: ConfigCatalog<A>
): WatchedConfigStore<A> {
  const values = createStore<ConfigValues<A> | undefined>(undefined, () => revalidate())
  // A newer revalidate (or a landed save) supersedes the in-flight read so a
  // stale snapshot can never overwrite a fresher one.
  const inflight = latestWins()

  function revalidate(): void {
    void inflight.run(
      () => window.api.config.get(agent),
      (next) => {
        // The save echo and unmanaged-key file churn arrive as deep-equal
        // snapshots; keep the old reference so the page's identity-keyed
        // draft only resets when the managed content really changed.
        if (JSON.stringify(next) !== JSON.stringify(values.get())) values.set(next)
      },
      () => toast.add({ title: 'Could not load config', type: 'error' })
    )
  }

  // Publishes the draft as the new saved value once main has written it, so
  // the UI settles immediately instead of waiting for the file watcher's
  // echo. On failure it re-reads the file to show what actually stuck.
  const save = async (next: ConfigValues<A>): Promise<void> => {
    try {
      await window.api.config.save(agent, next)
    } catch (error) {
      revalidate()
      throw error
    }
    inflight.cancel()
    values.set(next)
  }

  return {
    catalog,
    values,
    // An unwatched store skips the re-read; the next subscriber revalidates.
    onChanged: () => {
      if (values.watched()) revalidate()
    },
    save
  }
}

const watchedConfigStores = {
  claude: createConfigStore('claude', CONFIG_CATALOGS.claude),
  codex: createConfigStore('codex', CONFIG_CATALOGS.codex)
} satisfies { [A in AgentId]: WatchedConfigStore<A> }

window.api.config.onChanged((agent) => watchedConfigStores[agent].onChanged())

export const configStores: ConfigStores = watchedConfigStores
