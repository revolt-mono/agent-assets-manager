import { Effect, type FileSystem, Semaphore } from 'effect'
import { watch, type FSWatcher } from 'fs'
import { basename, dirname } from 'path'
import { AGENT_IDS, type AgentId } from '../shared/agent'
import { debouncedBroadcast } from './broadcast'
import { CLAUDE_FILE, loadClaudeConfig, saveClaudeConfig, type ClaudeConfig } from './config-claude'
import { CODEX_FILE, loadCodexConfig, saveCodexConfig, type CodexConfig } from './config-codex'
import { handleIpc } from './ipc'
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
      save: (input: ClaudeConfig) => locked(saveClaudeConfig(input))
    },
    codex: {
      file: CODEX_FILE,
      load: () => locked(loadCodexConfig),
      save: (input: CodexConfig) => locked(saveCodexConfig(input))
    }
  }

  const stopHandlers = [
    handleIpc('config:claude:get', () => backends.claude.load()),
    handleIpc('config:claude:save', (input) => backends.claude.save(input)),
    handleIpc('config:codex:get', () => backends.codex.load()),
    handleIpc('config:codex:save', (input) => backends.codex.save(input))
  ]

  ensureWatch()

  return () => {
    for (const agent of AGENT_IDS) broadcasts[agent].stop()
    for (const watcher of watchers.values()) watcher.close()
    for (const stop of stopHandlers) stop()
  }
}
