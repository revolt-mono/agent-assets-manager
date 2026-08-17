export const AGENTS = {
  codex: { label: 'Codex', skillsDir: ['.codex', 'skills'] }
} as const

export type AgentId = keyof typeof AGENTS

export const AGENT_IDS =
  // SAFETY: AGENTS is a closed const object, so its keys are exactly the AgentId union.
  Object.keys(AGENTS) as AgentId[]

export type Skill = {
  agent: AgentId
  id: string
  name: string
  description: string
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
