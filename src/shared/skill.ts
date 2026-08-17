export const AGENTS = {
  codex: { label: 'Codex', skillsDir: ['.codex', 'skills'] }
} as const

export type AgentId = keyof typeof AGENTS

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

export function parseAgent(value: unknown): AgentId {
  if (typeof value === 'string' && value in AGENTS) return value as AgentId
  throw new Error(`Unknown agent: ${String(value)}`)
}
