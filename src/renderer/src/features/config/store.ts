import { type Cause, Effect } from 'effect'
import { toast } from '@renderer/components/ui/toast'
import { createStore, latestWins, useStore, type Store } from '@renderer/lib/store'
import type { AgentId } from '@shared/agent'
import type { AgentConfigValues } from '@shared/config'

type ConfigStore = {
  store: Store<AgentConfigValues | undefined>
  onChanged: () => void
  save: (values: AgentConfigValues) => Effect.Effect<void, Cause.UnknownError>
}

function createConfigStore(agent: AgentId): ConfigStore {
  const store = createStore<AgentConfigValues | undefined>(undefined, () => revalidate())
  // A newer revalidate (or a landed save) interrupts the in-flight read so a
  // stale snapshot can never overwrite a fresher one.
  const inflight = latestWins()

  function revalidate(): void {
    inflight.fork(
      Effect.gen(function* () {
        const values = yield* Effect.tryPromise(() => window.api.config.get(agent))
        // The save echo and unmanaged-key file churn arrive as deep-equal
        // snapshots; keep the old reference so the page's identity-keyed
        // draft only resets when the managed content really changed.
        if (JSON.stringify(values) !== JSON.stringify(store.get())) store.set(values)
      }).pipe(
        Effect.catch(() =>
          Effect.sync(() => {
            toast.add({ title: 'Could not load config', type: 'error' })
          })
        )
      )
    )
  }

  // Publishes the draft as the new saved value once main has written it, so
  // the UI settles immediately instead of waiting for the file watcher's
  // echo. On failure it re-reads the file to show what actually stuck.
  const save = Effect.fn('saveConfig')(function* (values: AgentConfigValues) {
    yield* Effect.tryPromise(() => window.api.config.save(agent, values)).pipe(
      Effect.tapError(() => Effect.sync(revalidate))
    )
    inflight.interrupt()
    store.set(values)
  })

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
} satisfies Record<AgentId, ConfigStore>

window.api.config.onChanged((agent) => stores[agent].onChanged())

export function useSavedConfig(agent: AgentId): AgentConfigValues | undefined {
  return useStore(stores[agent].store)
}

export function saveConfig(
  agent: AgentId,
  values: AgentConfigValues
): Effect.Effect<void, Cause.UnknownError> {
  return stores[agent].save(values)
}
