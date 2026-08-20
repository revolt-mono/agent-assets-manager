import { useSyncExternalStore } from 'react'
import { Effect, type Fiber } from 'effect'

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

// Latest wins: forking interrupts the in-flight fiber, so a stale result (or
// its error handling) can never land after a fresher one. Shared so every
// feature store gets the same cancellation semantics.
export type Latest = {
  fork: (effect: Effect.Effect<void>) => Fiber.Fiber<void>
  interrupt: () => void
}

export function latestWins(): Latest {
  let inflight: Fiber.Fiber<void> | undefined
  return {
    fork: (effect) => {
      inflight?.interruptUnsafe()
      inflight = Effect.runFork(effect)
      return inflight
    },
    interrupt: () => {
      inflight?.interruptUnsafe()
    }
  }
}
