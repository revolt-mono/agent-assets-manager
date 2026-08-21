import { Schema } from 'effect'
import { AGENT_IDS } from './agent'
import { CONFIG_CATALOGS, type ConfigValues, type ProviderValues } from './config'

export const AgentId = Schema.Literals(AGENT_IDS)

export const SkillId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/)).pipe(
  Schema.brand('SkillId')
)

export const Skill = Schema.Struct({
  agent: AgentId,
  id: SkillId,
  name: Schema.String,
  description: Schema.String,
  updatedAt: Schema.Number
})

export const SkillBody = Schema.Struct({ markdown: Schema.String, raw: Schema.String })

export const UsageTokens = Schema.Struct({
  input: Schema.mutableKey(Schema.Number),
  output: Schema.mutableKey(Schema.Number),
  cacheRead: Schema.mutableKey(Schema.Number),
  cacheWrite: Schema.mutableKey(Schema.Number)
})

export const UsageBucket = Schema.Struct({
  hour: Schema.Number,
  agent: AgentId,
  model: Schema.String,
  tokens: UsageTokens,
  cost: Schema.mutableKey(Schema.Number)
})

export const UpdateState = Schema.Union([
  Schema.Struct({ status: Schema.Literal('idle') }),
  Schema.Struct({ status: Schema.Literal('available'), version: Schema.String }),
  Schema.Struct({
    status: Schema.Literal('downloading'),
    version: Schema.String,
    percent: Schema.Number
  }),
  Schema.Struct({ status: Schema.Literal('downloaded'), version: Schema.String })
])

const defaultValue = (field: { key: string; options: readonly { value: string }[] }) =>
  Schema.NullOr(Schema.String).check(
    Schema.makeFilter((value) =>
      value === null || field.options.some((option) => option.value === value)
        ? undefined
        : `Unsupported ${field.key} value: ${value}`
    )
  )

export const ConfigProvider = Schema.Struct({
  enabled: Schema.Boolean,
  baseUrl: Schema.String,
  apiKey: Schema.String
}).check(
  Schema.makeFilter((value) =>
    !value.enabled || (value.baseUrl !== '' && value.apiKey !== '')
      ? undefined
      : 'Enabled provider needs a base URL and an API key'
  )
) satisfies Schema.Schema<ProviderValues>

const configValues = <K extends string, T extends string>(
  defaultFields: readonly { key: K; options: readonly { value: string }[] }[],
  toggleFields: readonly { key: T }[]
) =>
  Schema.Struct({
    // SAFETY: fromEntries over the complete field lists yields every key.
    defaults: Schema.Struct(
      Object.fromEntries(defaultFields.map((field) => [field.key, defaultValue(field)])) as Record<
        K,
        ReturnType<typeof defaultValue>
      >
    ),
    // SAFETY: fromEntries over the complete field lists yields every key.
    toggles: Schema.Struct(
      Object.fromEntries(toggleFields.map((field) => [field.key, Schema.Boolean])) as Record<
        T,
        typeof Schema.Boolean
      >
    ),
    provider: ConfigProvider
  })

export const CONFIG_SCHEMAS = {
  claude: configValues(CONFIG_CATALOGS.claude.defaultFields, CONFIG_CATALOGS.claude.toggleFields),
  codex: configValues(CONFIG_CATALOGS.codex.defaultFields, CONFIG_CATALOGS.codex.toggleFields)
} as const satisfies {
  readonly [A in keyof typeof CONFIG_CATALOGS]: Schema.Schema<ConfigValues<A>>
}
