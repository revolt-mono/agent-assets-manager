import type { AgentId } from './agent'
import type {
  Skill as SkillSchema,
  SkillBody as SkillBodySchema,
  SkillId as SkillIdSchema
} from './ipc-schema'

export type SkillId = typeof SkillIdSchema.Type
export type Skill = typeof SkillSchema.Type
export type SkillBody = typeof SkillBodySchema.Type

export type SkillsApi = {
  list: (agent: AgentId) => Promise<Skill[]>
  get: (agent: AgentId, id: SkillId) => Promise<SkillBody>
  uninstall: (agent: AgentId, id: SkillId) => Promise<void>
  open: (agent: AgentId, id: SkillId) => Promise<void>
  reveal: (agent: AgentId, id: SkillId) => Promise<void>
  onChanged: (callback: () => void) => () => void
}
