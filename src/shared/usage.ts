import type {
  UsageBucket as UsageBucketSchema,
  UsageTokens as UsageTokensSchema
} from './ipc-schema'

// Widest UI range in calendar days; main prunes logs just past this window,
// so a wider range must move this constant, not just the range table.
export const MAX_RANGE_DAYS = 30

export type UsageTokens = typeof UsageTokensSchema.Type

/** Priced usage for one (hour, agent, model) bucket. */
export type UsageBucket = typeof UsageBucketSchema.Type

export type UsageApi = {
  /** fresh discards the parse cache and re-reads every log from disk */
  get: (fresh: boolean) => Promise<UsageBucket[]>
}
