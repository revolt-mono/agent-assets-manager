import type { AgentId } from './agent'

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
