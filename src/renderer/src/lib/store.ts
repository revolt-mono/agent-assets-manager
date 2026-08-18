import { useSyncExternalStore } from 'react'

export type Store<T> = {
  get: () => T
  set: (next: T) => void
  subscribe: (listener: () => void) => () => void
  watched: () => boolean
}

// Minimal observable value shared by the feature stores. onWatch fires when
// the store gains its first subscriber, which under <Activity> means a page
// just became visible: the natural point to (re)load from the main process.
export function createStore<T>(initial: T, onWatch?: () => void): Store<T> {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    get: () => snapshot,
    set: (next) => {
      snapshot = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      if (listeners.size === 0) onWatch?.()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    watched: () => listeners.size > 0
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get)
}
