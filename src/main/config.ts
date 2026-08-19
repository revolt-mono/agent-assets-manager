import { watch, type FSWatcher } from 'fs'
import { basename, dirname } from 'path'
import { ipcMain } from 'electron'
import { AGENT_IDS, parseAgent, type AgentId } from '../shared/agent'
import type { ClaudeConfig, CodexConfig } from '../shared/config'
import { debouncedBroadcast } from './broadcast'
import { CLAUDE_FILE, loadClaudeConfig, saveClaudeConfig } from './config-claude'
import { CODEX_FILE, loadCodexConfig, saveCodexConfig } from './config-codex'

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

  // File edits are read-modify-write; run them one at a time so rapid
  // updates cannot overwrite each other.
  let queue: Promise<unknown> = Promise.resolve()
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  ipcMain.handle('config:get', async (_event, agent: string) => {
    const values = await serialize<ClaudeConfig | CodexConfig>(
      parseAgent(agent) === 'claude' ? loadClaudeConfig : loadCodexConfig
    )
    ensureWatch()
    return values
  })
  ipcMain.handle(
    'config:save',
    async (_event, agent: string, values: ClaudeConfig | CodexConfig) => {
      // SAFETY: the payload is untrusted, but each writer re-validates every
      // field before touching disk; the cast only selects the expected shape.
      await serialize(() =>
        parseAgent(agent) === 'claude'
          ? saveClaudeConfig(values as ClaudeConfig)
          : saveCodexConfig(values as CodexConfig)
      )
      ensureWatch()
    }
  )

  ensureWatch()

  return () => {
    for (const agent of AGENT_IDS) changed[agent].stop()
    for (const watcher of watchers.values()) watcher.close()
  }
}
