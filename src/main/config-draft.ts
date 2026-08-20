import { z } from 'zod'

// Draft schemas derived from the shared field catalogs: each writer runs its
// schema on the untrusted IPC draft before touching disk, so everything past
// the parse trusts the declared config type. A null agent value means "leave
// the file value alone".

const agentValue = (field: { key: string; options: readonly { value: string }[] }) =>
  z
    .string()
    .nullable()
    .refine(
      (value) => value === null || field.options.some((option) => option.value === value),
      (value) => ({ message: `Unsupported ${field.key} value: ${value}` })
    )

// An enabled provider must carry both credentials; the rule holds for every
// accepted draft so both writers can trust it.
const providerDraft = z
  .object({ enabled: z.boolean(), baseUrl: z.string(), apiKey: z.string() })
  .refine((provider) => !provider.enabled || (provider.baseUrl !== '' && provider.apiKey !== ''), {
    message: 'Enabled provider needs a base URL and an API key'
  })

export function configDraftSchema<K extends string, F extends string>(
  agentFields: readonly { key: K; options: readonly { value: string }[] }[],
  featureFields: readonly { key: F }[]
) {
  return z.object({
    // SAFETY: fromEntries over the complete field lists yields every key.
    agent: z.object(
      Object.fromEntries(agentFields.map((field) => [field.key, agentValue(field)])) as Record<
        K,
        ReturnType<typeof agentValue>
      >
    ),
    // SAFETY: fromEntries over the complete field lists yields every key.
    features: z.object(
      Object.fromEntries(featureFields.map((field) => [field.key, z.boolean()])) as Record<
        F,
        z.ZodBoolean
      >
    ),
    provider: providerDraft
  })
}
