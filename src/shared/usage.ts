import type { AgentId } from './skill'

export type UsageTokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** Priced usage for one (hour, agent, model) bucket. */
export type UsageBucket = {
  hour: number // epoch ms of the hour start
  agent: AgentId
  model: string
  tokens: UsageTokens
  cost: number
}

export type UsageApi = {
  get: () => Promise<UsageBucket[]>
}
