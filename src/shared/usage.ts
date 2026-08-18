import type { AgentId } from './agent'

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
  /** fresh discards the parse cache and re-reads every log from disk */
  get: (fresh: boolean) => Promise<UsageBucket[]>
}
