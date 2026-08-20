import { Effect, type FileSystem, Semaphore } from 'effect'
import { watch, type FSWatcher } from 'fs'
import { basename, dirname } from 'path'
import { ipcMain } from 'electron'
import { AGENT_IDS, parseAgent, type AgentId } from '../shared/agent'
import type { AgentConfigValues } from '../shared/config'
import { debouncedBroadcast } from './broadcast'
import { CLAUDE_FILE, loadClaudeConfig, saveClaudeConfig } from './config-claude'
import { CODEX_FILE, loadCodexConfig, saveCodexConfig } from './config-codex'
import { runtime } from './runtime'

const CONFIG_FILES = { claude: CLAUDE_FILE, codex: CODEX_FILE } satisfies Record<AgentId, string>

export function registerConfig(): () => void {
  // Per-agent broadcasts so a change to one agent's file only revalidates
  // that agent's store; a shared notify would discard the other tab's draft.
  const changed = {
    claude: debouncedBroadcast('config:changed', 'claude'),
    codex: debouncedBroadcast('config:changed', 'codex')
  }

  const watchers = new Map<AgentId, FSWatcher>()
  const ensureWatch = (): void => {
    for (const agent of AGENT_IDS) {
      if (watchers.has(agent)) continue
      const file = CONFIG_FILES[agent]
      try {
        const armed = watch(dirname(file), (_event, filename) => {
          if (!filename || filename === basename(file)) changed[agent].notify()
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

  ipcMain.handle('config:get', (_event, agent: string) =>
    locked<AgentConfigValues>(parseAgent(agent) === 'claude' ? loadClaudeConfig : loadCodexConfig)
  )
  // each writer decodes the untrusted payload before touching disk
  ipcMain.handle('config:save', (_event, agent: string, values) =>
    locked<void>(
      parseAgent(agent) === 'claude' ? saveClaudeConfig(values) : saveCodexConfig(values)
    )
  )

  ensureWatch()

  return () => {
    for (const agent of AGENT_IDS) changed[agent].stop()
    for (const watcher of watchers.values()) watcher.close()
  }
}
