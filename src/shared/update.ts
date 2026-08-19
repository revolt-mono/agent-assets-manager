export type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }

export type UpdateApi = {
  observe: (callback: (state: UpdateState) => void) => () => void
  proceed: () => void
}
