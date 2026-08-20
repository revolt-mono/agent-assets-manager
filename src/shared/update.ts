export type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }

export type UpdateApi = {
  /** Pushed on every transition; main replays the current state on subscribe. */
  observe: (callback: (state: UpdateState) => void) => () => void
  proceed: () => void
}
