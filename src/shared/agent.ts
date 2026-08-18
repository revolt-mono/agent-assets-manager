export const AGENT_IDS = ['claude', 'codex'] as const

export type AgentId = (typeof AGENT_IDS)[number]

export const AGENTS = {
  claude: { label: 'Claude', skillsDir: ['.claude', 'skills'] },
  codex: { label: 'Codex', skillsDir: ['.codex', 'skills'] }
} as const satisfies Record<AgentId, { label: string; skillsDir: readonly string[] }>

export function parseAgent(value: string): AgentId {
  const agent = AGENT_IDS.find((id) => id === value)
  if (agent) return agent
  throw new Error(`Unknown agent: ${value}`)
}
