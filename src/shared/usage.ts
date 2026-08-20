import type { AgentId } from './agent'

// Widest UI range in calendar days; main prunes logs just past this window,
// so a wider range must move this constant, not just the range table.
export const MAX_RANGE_DAYS = 30

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
