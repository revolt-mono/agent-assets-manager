import type { AgentId } from './agent'

type SelectOption = { value: string; label: string; description: string }
type NonEmpty<T> = readonly [T, ...T[]]

export type DefaultField = {
  key: string
  label: string
  description: string
  options: NonEmpty<SelectOption>
}

// Renderer metadata; each agent catalog extends it with its own persistence bindings.
export type ToggleField = {
  key: string
  label: string
  description: string
  note: { recommended: 'on' | 'off'; reason: string }
}

type CodexToggleField = ToggleField & {
  table: string | null
  default: boolean
}
type ClaudeToggleBinding =
  | { kind: 'env'; key: string; enabledValue: boolean }
  | { kind: 'setting'; key: string; enabledValue: boolean; defaultValue: boolean }

const codexDefaultFields = [
  {
    key: 'model_reasoning_effort',
    label: 'Reasoning effort',
    description: 'How much the model thinks before answering.',
    default: 'medium',
    options: [
      { value: 'low', label: 'Low', description: 'Faster answers with minimal reasoning' },
      { value: 'medium', label: 'Medium', description: 'Balanced speed and reasoning depth' },
      { value: 'high', label: 'High', description: 'Deeper reasoning for complex tasks' },
      { value: 'xhigh', label: 'Extra high', description: 'Maximum reasoning on supported models' }
    ]
  },
  {
    key: 'model_verbosity',
    label: 'Verbosity',
    description: 'Default length of model responses.',
    default: 'low',
    options: [
      { value: 'low', label: 'Low', description: 'Short, minimal output' },
      { value: 'medium', label: 'Medium', description: 'Balanced output length' },
      { value: 'high', label: 'High', description: 'Long, detailed output' }
    ]
  },
  {
    key: 'model_reasoning_summary',
    label: 'Reasoning summary',
    description: 'How reasoning is shown while the model works.',
    default: 'auto',
    options: [
      { value: 'auto', label: 'Auto', description: 'Let the model pick summary detail' },
      { value: 'concise', label: 'Concise', description: 'Short summaries of the reasoning' },
      { value: 'detailed', label: 'Detailed', description: 'Full summaries of the reasoning' },
      { value: 'none', label: 'None', description: 'Hide reasoning summaries' }
    ]
  },
  {
    key: 'approval_policy',
    label: 'Approval policy',
    description: 'When Codex asks before running commands.',
    default: 'on-request',
    options: [
      {
        value: 'untrusted',
        label: 'Untrusted',
        description: 'Ask before running any untrusted command'
      },
      {
        value: 'on-request',
        label: 'On request',
        description: 'Ask only when the model wants to escalate'
      },
      {
        value: 'never',
        label: 'Never ask',
        description: 'Never ask; failures go back to the model'
      }
    ]
  },
  {
    key: 'sandbox_mode',
    label: 'Sandbox',
    description: 'What commands can touch on your system.',
    default: 'workspace-write',
    options: [
      {
        value: 'read-only',
        label: 'Read only',
        description: 'Commands can read files but never write'
      },
      {
        value: 'workspace-write',
        label: 'Workspace write',
        description: 'Writes allowed in the workspace and temp dirs'
      },
      {
        value: 'danger-full-access',
        label: 'Full access',
        description: 'No sandbox; full file and network access'
      }
    ]
  }
] as const satisfies readonly (DefaultField & { default: string })[]

// A null TOML table addresses a top-level key.
const codexToggleFields = [
  {
    key: 'apps',
    table: 'features',
    default: true,
    label: 'Apps',
    description: 'Connect ChatGPT apps and connectors.',
    note: { recommended: 'off', reason: 'random ChatGPT app connectors can bloat the context.' }
  },
  {
    key: 'memories',
    table: 'features',
    default: false,
    label: 'Memories',
    description: 'Remember context across sessions.',
    note: {
      recommended: 'off',
      reason: 'carries over conversation context other sessions rarely need.'
    }
  },
  {
    key: 'guardian_approval',
    table: 'features',
    default: true,
    label: 'Guardian approval',
    description: 'Let a reviewer subagent handle approval requests.',
    note: {
      recommended: 'on',
      reason:
        'skips hand-clicked approvals while still stopping the agent from wrecking your system, though the reviewer burns extra tokens.'
    }
  },
  {
    key: 'mentions_v2',
    table: 'features',
    default: true,
    label: 'Mentions v2',
    description: 'Unified @-mention popup for files, plugins, and skills.',
    note: {
      recommended: 'off',
      reason: 'makes the @ popup harder to use for what you actually mean.'
    }
  },
  {
    key: 'include_permissions_instructions',
    table: null,
    default: true,
    label: 'Permission instructions',
    description: 'Tell the model about its active sandbox and approval rules.',
    note: {
      recommended: 'on',
      reason:
        'the model needs the active restrictions and approval path to avoid blocked actions and request access correctly.'
    }
  },
  {
    key: 'include_apps_instructions',
    table: null,
    default: true,
    label: 'App instructions',
    description: 'Tell the model how to discover and use available ChatGPT app connectors.',
    note: {
      recommended: 'off',
      reason:
        'pulls ChatGPT web app connectors into the local development agent and bloats its context with irrelevant tools.'
    }
  },
  {
    key: 'include_collaboration_mode_instructions',
    table: null,
    default: true,
    label: 'Collaboration mode instructions',
    description: 'Tell the model how to behave in the active default or plan mode.',
    note: {
      recommended: 'on',
      reason:
        'mode-specific rules must reach the model or switching modes may not change its behavior.'
    }
  }
] as const satisfies readonly CodexToggleField[]

// Claude Code agent defaults, persisted in ~/.claude/settings.json.
// `settings` storage is a top-level string key, `env` storage an entry in the
// `env` object; either way, absent or an unlisted value shows as "Not set".
const claudeDefaultFields = [
  {
    key: 'outputStyle',
    storage: 'settings',
    label: 'Output style',
    description: 'How Claude communicates with you.',
    options: [
      {
        value: 'default',
        label: 'Default',
        description: 'Completes coding tasks efficiently and provides concise responses'
      },
      {
        value: 'Proactive',
        label: 'Proactive',
        description:
          'Executes immediately, minimizes interruptions, and prefers action over planning'
      },
      {
        value: 'Concise',
        label: 'Concise',
        description: 'Responds tersely, leading with results and skipping preamble and narration'
      },
      {
        value: 'Explanatory',
        label: 'Explanatory',
        description: 'Explains its implementation choices and codebase patterns'
      },
      {
        value: 'Learning',
        label: 'Learning',
        description: 'Pauses and asks you to write small pieces of code for hands-on practice'
      }
    ]
  },
  {
    key: 'model',
    storage: 'settings',
    label: 'Model',
    description: 'Default model for new sessions.',
    options: [
      { value: 'haiku', label: 'Haiku', description: 'Fast and efficient for simple tasks' },
      { value: 'sonnet', label: 'Sonnet', description: 'Balanced speed and capability' },
      { value: 'opus', label: 'Opus', description: 'Deep reasoning for complex work' },
      { value: 'fable', label: 'Fable', description: 'Most capable Mythos-class tier' }
    ]
  },
  {
    key: 'effortLevel',
    storage: 'settings',
    label: 'Reasoning effort',
    description: 'How much adaptive reasoning the model applies to each step.',
    options: [
      { value: 'low', label: 'Low', description: 'Fastest for short, latency-sensitive tasks' },
      {
        value: 'medium',
        label: 'Medium',
        description: 'Reduced token usage for cost-sensitive work'
      },
      {
        value: 'high',
        label: 'High',
        description: 'Balanced token usage and intelligence; the default'
      },
      {
        value: 'xhigh',
        label: 'Extra high',
        description: 'Deeper reasoning at higher token spend'
      },
      { value: 'max', label: 'Max', description: 'Deepest reasoning, prone to overthinking' }
    ]
  },
  {
    key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    storage: 'env',
    label: 'Small model',
    description: 'Model the haiku alias resolves to for fast, simple tasks.',
    options: [
      {
        value: 'claude-haiku-4-5',
        label: 'Haiku',
        description: 'Fast and efficient for simple tasks'
      },
      { value: 'claude-sonnet-5', label: 'Sonnet', description: 'Balanced speed and capability' },
      { value: 'claude-opus-5', label: 'Opus', description: 'Deep reasoning for complex work' },
      { value: 'claude-fable-5', label: 'Fable', description: 'Most capable Mythos-class tier' }
    ]
  }
] as const satisfies readonly (DefaultField & { storage: 'settings' | 'env' })[]

// Claude bindings target either the settings root or its env object. Inverted
// DISABLE_* controls state that false is the value meaning enabled.
const claudeToggleFields = [
  {
    key: 'claudeAiConnectors',
    bindings: [
      {
        kind: 'setting',
        key: 'disableClaudeAiConnectors',
        enabledValue: false,
        defaultValue: false
      }
    ],
    label: 'Claude.ai connectors',
    description: 'Auto-fetch and connect MCP connectors from claude.ai.',
    note: {
      recommended: 'off',
      reason:
        'claude.ai connectors auto-attach MCP servers you never asked for and bloat the context.'
    }
  },
  {
    key: 'artifacts',
    bindings: [
      { kind: 'setting', key: 'disableArtifact', enabledValue: false, defaultValue: false }
    ],
    label: 'Artifacts',
    description: 'Offer the Artifact tool that publishes session output to claude.ai.',
    note: {
      recommended: 'off',
      reason:
        'publishing session output to claude.ai is never wanted, and the tool wastes prompt space.'
    }
  },
  {
    key: 'remoteControl',
    bindings: [
      { kind: 'setting', key: 'disableRemoteControl', enabledValue: false, defaultValue: false }
    ],
    label: 'Remote control',
    description: 'Allow remote-control sessions, auto-start, and the in-session toggle.',
    note: {
      recommended: 'off',
      reason:
        'nothing should drive local sessions remotely; turning this off cuts attack surface and prompt bloat.'
    }
  },
  {
    key: 'promptSuggestionEnabled',
    bindings: [
      { kind: 'setting', key: 'promptSuggestionEnabled', enabledValue: true, defaultValue: true }
    ],
    label: 'Prompt suggestions',
    description: 'Show grayed-out predictions in the prompt input.',
    note: {
      recommended: 'off',
      reason: 'grayed-out predictions distract while typing and add background requests.'
    }
  },
  {
    key: 'awaySummaryEnabled',
    bindings: [
      { kind: 'setting', key: 'awaySummaryEnabled', enabledValue: true, defaultValue: true }
    ],
    label: 'Session recap',
    description: 'Recap what happened when you return after 5+ minutes away.',
    note: {
      recommended: 'on',
      reason:
        'the recap burns an extra model call, but catching up at a glance beats rereading scrollback when you juggle sessions or lose the thread easily.'
    }
  },
  {
    key: 'switchModelsOnFlag',
    bindings: [
      { kind: 'setting', key: 'switchModelsOnFlag', enabledValue: true, defaultValue: true }
    ],
    label: 'Switch models on flag',
    description: 'Auto-switch to the fallback model when a safety classifier flags a request.',
    note: {
      recommended: 'off',
      reason: 'a silent model swap changes quality mid-session; pause and decide yourself.'
    }
  },
  {
    key: 'wheelScrollAccelerationEnabled',
    bindings: [
      {
        kind: 'setting',
        key: 'wheelScrollAccelerationEnabled',
        enabledValue: true,
        defaultValue: true
      }
    ],
    label: 'Wheel scroll acceleration',
    description: 'Speed up mouse-wheel scrolling during fast scrolls in fullscreen mode.',
    note: {
      recommended: 'off',
      reason: 'a constant rate per notch is predictable; acceleration overshoots in fullscreen.'
    }
  },
  {
    key: 'nonessentialTraffic',
    bindings: [
      { kind: 'env', key: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', enabledValue: false }
    ],
    label: 'Nonessential traffic',
    description: 'Send auto-updates, telemetry, error reporting, and other background requests.',
    note: {
      recommended: 'off',
      reason: 'auto-updates, telemetry, and error reporting are background traffic with no value.'
    }
  },
  {
    key: 'bundledSkills',
    bindings: [{ kind: 'env', key: 'CLAUDE_CODE_DISABLE_BUNDLED_SKILLS', enabledValue: false }],
    label: 'Bundled skills',
    description: 'Ship built-in skills and slash commands like /code-review and /run.',
    note: {
      recommended: 'on',
      reason:
        'a blanket disable also removes useful built-in commands; deny unwanted ones individually.'
    }
  },
  {
    key: 'claudeApiSkill',
    bindings: [{ kind: 'env', key: 'CLAUDE_CODE_DISABLE_CLAUDE_API_SKILL', enabledValue: false }],
    label: 'Claude API skill',
    description: 'Bundled skill that auto-triggers on Anthropic SDK and API code.',
    note: {
      recommended: 'off',
      reason: 'auto-triggers on Anthropic SDK code and injects context you rarely need.'
    }
  },
  {
    key: 'claudeCodeSkill',
    bindings: [{ kind: 'env', key: 'CLAUDE_CODE_DISABLE_CLAUDE_CODE_SKILL', enabledValue: false }],
    label: 'Claude Code skill',
    description: 'Bundled guide skill that answers Claude Code usage questions.',
    note: {
      recommended: 'off',
      reason: 'usage questions are rare, so the bundled guide skill just wastes context.'
    }
  },
  {
    key: 'gitInstructions',
    bindings: [{ kind: 'env', key: 'CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS', enabledValue: false }],
    label: 'Git instructions',
    description: 'Include the built-in git workflow guidance in the system prompt.',
    note: {
      recommended: 'off',
      reason: 'the built-in git guidance conflicts with your own rules and bloats the prompt.'
    }
  },
  {
    key: 'autoMemory',
    bindings: [
      { kind: 'env', key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', enabledValue: false },
      {
        kind: 'setting',
        key: 'autoMemoryEnabled',
        enabledValue: true,
        defaultValue: true
      }
    ],
    label: 'Auto memory',
    description: 'Read and write per-project memory notes across sessions.',
    note: {
      recommended: 'off',
      reason: 'stale project memory leaks into unrelated sessions; manage context yourself.'
    }
  },
  {
    key: 'simpleSystemPrompt',
    bindings: [{ kind: 'env', key: 'CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT', enabledValue: true }],
    label: 'Simple system prompt',
    description: 'Collapse the system prompt to a minimal identity-and-cwd version.',
    note: {
      recommended: 'on',
      reason:
        'a minimal prompt saves tokens and interferes less; your own config supplies the rules.'
    }
  },
  {
    key: 'noFlicker',
    bindings: [{ kind: 'env', key: 'CLAUDE_CODE_NO_FLICKER', enabledValue: true }],
    label: 'No-flicker renderer',
    description: 'Render the TUI on the alternate screen with mouse support and no flicker.',
    note: {
      recommended: 'on',
      reason: 'alternate-screen rendering avoids flicker and adds mouse support in fullscreen.'
    }
  }
] as const satisfies readonly (ToggleField & {
  bindings: NonEmpty<ClaudeToggleBinding>
})[]

type DefaultFieldKey<Fields extends readonly DefaultField[]> = Fields[number]['key']
type DefaultFieldValue<
  Fields extends readonly DefaultField[],
  Key extends DefaultFieldKey<Fields>
> = Extract<Fields[number], { key: Key }>['options'][number]['value']

type DefaultRule<Fields extends readonly DefaultField[]> = {
  [Controller in DefaultFieldKey<Fields>]: {
    kind: 'disableWhen'
    target: DefaultFieldKey<Fields>
    when: { field: Controller; value: DefaultFieldValue<Fields, Controller> }
  }
}[DefaultFieldKey<Fields>]

function defineCatalog<
  const Fields extends NonEmpty<DefaultField>,
  const Toggles extends readonly ToggleField[],
  const Rules extends readonly DefaultRule<Fields>[]
>(catalog: {
  defaultFields: Fields
  defaultRules: Rules
  toggleFields: Toggles
  baseUrlDescription: string
  apiKeyDescription: string
}) {
  return catalog
}

export const CONFIG_CATALOGS = {
  claude: defineCatalog({
    defaultFields: claudeDefaultFields,
    defaultRules: [
      {
        kind: 'disableWhen',
        target: 'effortLevel',
        when: { field: 'model', value: 'haiku' }
      }
    ],
    toggleFields: claudeToggleFields,
    baseUrlDescription: 'Endpoint speaking the Anthropic Messages API.',
    apiKeyDescription: 'Sent to the configured endpoint; stored in settings.json.'
  }),
  codex: defineCatalog({
    defaultFields: codexDefaultFields,
    defaultRules: [],
    toggleFields: codexToggleFields,
    baseUrlDescription: 'Endpoint speaking the OpenAI Responses API.',
    apiKeyDescription: 'Sent to the configured endpoint; stored in config.toml.'
  })
} as const satisfies Record<AgentId, ReturnType<typeof defineCatalog>>

export type ProviderValues = {
  enabled: boolean
  baseUrl: string
  apiKey: string
}

type Catalog = typeof CONFIG_CATALOGS
export type ConfigCatalog<A extends AgentId> = Catalog[A]
export type ConfigDefaultKey<A extends AgentId> = Catalog[A]['defaultFields'][number]['key']
export type ConfigToggleKey<A extends AgentId> = Catalog[A]['toggleFields'][number]['key']
type AnyConfigCatalog = Catalog[AgentId]
type CatalogDefaultKey<C extends AnyConfigCatalog> = C['defaultFields'][number]['key']
type CatalogDefaults<C extends AnyConfigCatalog> = Record<CatalogDefaultKey<C>, string | null>

export type ConfigValues<A extends AgentId> = {
  defaults: Record<ConfigDefaultKey<A>, string | null>
  toggles: Record<ConfigToggleKey<A>, boolean>
  provider: ProviderValues
}

export function disabledDefaultKeys<C extends AnyConfigCatalog>(
  catalog: C,
  defaults: CatalogDefaults<C>
): ReadonlySet<CatalogDefaultKey<C>> {
  return new Set(
    catalog.defaultRules.flatMap((rule) =>
      defaults[rule.when.field] === rule.when.value ? [rule.target] : []
    )
  )
}

export function applyDefaultChange<C extends AnyConfigCatalog>(input: {
  catalog: C
  saved: CatalogDefaults<C>
  current: CatalogDefaults<C>
  key: CatalogDefaultKey<C>
  value: string
}): CatalogDefaults<C> {
  const { catalog, saved, current, key, value } = input
  const changed = { ...current, [key]: value } satisfies CatalogDefaults<C>
  return [...disabledDefaultKeys(catalog, changed)].reduce<CatalogDefaults<C>>(
    (values, disabledKey) => ({ ...values, [disabledKey]: saved[disabledKey] }),
    changed
  )
}

export type ConfigAgentApi<A extends AgentId> = {
  get: () => Promise<ConfigValues<A>>
  save: (values: ConfigValues<A>) => Promise<void>
}

export type ConfigApi = { [A in AgentId]: ConfigAgentApi<A> } & {
  onChanged: (callback: (agent: AgentId) => void) => () => void
}
