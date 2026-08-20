import { Effect, type FileSystem, Semaphore } from 'effect'
import { watch, type FSWatcher } from 'fs'
import { basename, dirname } from 'path'
import { ipcMain } from 'electron'
import { AGENT_IDS, parseAgent, type AgentId } from '../shared/agent'
import type { ConfigPayload } from '../shared/config'
import { debouncedBroadcast } from './broadcast'
import { CLAUDE_FILE, loadClaudeConfig, saveClaudeConfig } from './config-claude'
import { CODEX_FILE, loadCodexConfig, saveCodexConfig } from './config-codex'
import { runtime } from './runtime'

export function registerConfig(): () => void {
  // Per-agent broadcasts so a change to one agent's file only revalidates
  // that agent's store; a shared notify would discard the other tab's draft.
  const broadcasts = {
    claude: debouncedBroadcast('config:changed', 'claude'),
    codex: debouncedBroadcast('config:changed', 'codex')
  }

  const watchers = new Map<AgentId, FSWatcher>()
  function ensureWatch(): void {
    for (const agent of AGENT_IDS) {
      if (watchers.has(agent)) continue
      const file = backends[agent].file
      try {
        const armed = watch(dirname(file), (_event, filename) => {
          if (!filename || filename === basename(file)) broadcasts[agent].notify()
        })
        armed.on('error', () => {
          armed.close()
          if (watchers.get(agent) === armed) watchers.delete(agent)
        })
        watchers.set(agent, armed)
      } catch {
        // directory does not exist yet; re-armed after the next get or save
      }
    }
  }

  // File edits are read-modify-write; the lock runs them one at a time so
  // rapid updates cannot overwrite each other.
  const lock = Semaphore.makeUnsafe(1)
  const locked = <A>(edit: Effect.Effect<A, unknown, FileSystem.FileSystem>): Promise<A> =>
    runtime.runPromise(lock.withPermit(edit).pipe(Effect.tap(() => Effect.sync(ensureWatch))))

  const backends = {
    claude: {
      file: CLAUDE_FILE,
      load: () => locked(loadClaudeConfig),
      save: (input: ConfigPayload) => locked(saveClaudeConfig(input))
    },
    codex: {
      file: CODEX_FILE,
      load: () => locked(loadCodexConfig),
      save: (input: ConfigPayload) => locked(saveCodexConfig(input))
    }
  } satisfies Record<
    AgentId,
    {
      file: string
      load: () => Promise<ConfigPayload>
      save: (input: ConfigPayload) => Promise<void>
    }
  >

  ipcMain.handle('config:get', (_event, agent: string) => backends[parseAgent(agent)].load())
  // each writer decodes the untrusted payload before touching disk
  ipcMain.handle('config:save', (_event, agent: string, input: ConfigPayload) =>
    backends[parseAgent(agent)].save(input)
  )

  ensureWatch()

  return () => {
    for (const agent of AGENT_IDS) broadcasts[agent].stop()
    for (const watcher of watchers.values()) watcher.close()
  }
}
