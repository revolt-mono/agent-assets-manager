import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Main-process modules import electron at load time; tests swap in a stub
    // that records ipc handlers so they can be invoked directly.
    alias: { electron: fileURLToPath(new URL('./src/main/electron-stub.ts', import.meta.url)) }
  },
  test: { include: ['src/**/*.test.ts'] }
})
