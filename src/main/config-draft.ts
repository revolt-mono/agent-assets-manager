import { Schema } from 'effect'

// Draft schemas derived from the shared field catalogs: each writer decodes
// the untrusted IPC draft with its schema before touching disk, so everything
// past the decode trusts the declared config type. A null agent value means
// "leave the file value alone".

const agentValue = (field: { key: string; options: readonly { value: string }[] }) =>
  Schema.NullOr(Schema.String).check(
    Schema.makeFilter((value) =>
      value === null || field.options.some((option) => option.value === value)
        ? undefined
        : `Unsupported ${field.key} value: ${value}`
    )
  )

// An enabled provider must carry both credentials; the rule holds for every
// accepted draft so both writers can trust it.
const providerDraft = Schema.Struct({
  enabled: Schema.Boolean,
  baseUrl: Schema.String,
  apiKey: Schema.String
}).check(
  Schema.makeFilter((provider) =>
    !provider.enabled || (provider.baseUrl !== '' && provider.apiKey !== '')
      ? undefined
      : 'Enabled provider needs a base URL and an API key'
  )
)

export function configDraftSchema<K extends string, F extends string>(
  agentFields: readonly { key: K; options: readonly { value: string }[] }[],
  featureFields: readonly { key: F }[]
) {
  return Schema.Struct({
    // SAFETY: fromEntries over the complete field lists yields every key.
    agent: Schema.Struct(
      Object.fromEntries(agentFields.map((field) => [field.key, agentValue(field)])) as Record<
        K,
        ReturnType<typeof agentValue>
      >
    ),
    // SAFETY: fromEntries over the complete field lists yields every key.
    features: Schema.Struct(
      Object.fromEntries(featureFields.map((field) => [field.key, Schema.Boolean])) as Record<
        F,
        typeof Schema.Boolean
      >
    ),
    provider: providerDraft
  })
}
