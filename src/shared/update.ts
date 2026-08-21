import type { UpdateState as UpdateStateSchema } from './ipc-schema'

export type UpdateState = typeof UpdateStateSchema.Type

export type UpdateApi = {
  /** Pushed on every transition; main replays the current state on subscribe. */
  observe: (callback: (state: UpdateState) => void) => () => void
  proceed: () => void
}
