import { useSyncExternalStore } from 'react'

const query = window.matchMedia('(max-width: 767px)')

function subscribe(onChange: () => void): () => void {
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => query.matches)
}
