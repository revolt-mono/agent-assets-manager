export type UpdateApi = {
  /** Resolves with the downloaded update's version, or null when none is ready. */
  get: () => Promise<string | null>
  /** Fires with the new version once an update is downloaded and ready to install. */
  onReady: (callback: (version: string) => void) => () => void
  /** Quits the app and installs the downloaded update. */
  install: () => void
}
