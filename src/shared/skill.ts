export const AGENT_IDS = ['codex'] as const

export type AgentId = (typeof AGENT_IDS)[number]

export const AGENTS = {
  codex: { label: 'Codex', skillsDir: ['.codex', 'skills'] }
} as const satisfies Record<AgentId, { label: string; skillsDir: readonly string[] }>

export type Skill = {
  agent: AgentId
  id: string
  name: string
  description: string
  updatedAt: number
}

export type SkillBody = {
  markdown: string
  raw: string
}

export type SkillsApi = {
  list: (agent: AgentId) => Promise<Skill[]>
  get: (agent: AgentId, id: string) => Promise<SkillBody>
  uninstall: (agent: AgentId, id: string) => Promise<void>
  open: (agent: AgentId, id: string) => Promise<void>
  reveal: (agent: AgentId, id: string) => Promise<void>
  onChanged: (callback: () => void) => () => void
}

export type RendererApi = {
  platform: 'darwin' | 'win32' | 'other'
  skills: SkillsApi
}

export function parseAgent(value: string): AgentId {
  const agent = AGENT_IDS.find((id) => id === value)
  if (agent) return agent
  throw new Error(`Unknown agent: ${value}`)
}
