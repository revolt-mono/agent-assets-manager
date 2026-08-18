export const AGENT_FIELDS = [
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
] as const

export const FEATURE_FIELDS = [
  {
    key: 'apps',
    label: 'Apps',
    description: 'Connect ChatGPT apps and connectors.',
    note: { recommended: 'off', reason: 'random ChatGPT app connectors can bloat the context.' },
    default: true
  },
  {
    key: 'memories',
    label: 'Memories',
    description: 'Remember context across sessions.',
    note: {
      recommended: 'off',
      reason: 'carries over conversation context other sessions rarely need.'
    },
    default: false
  },
  {
    key: 'guardian_approval',
    label: 'Guardian approval',
    description: 'Let a reviewer subagent handle approval requests.',
    note: {
      recommended: 'on',
      reason:
        'skips hand-clicked approvals while still stopping the agent from wrecking your system, though the reviewer burns extra tokens.'
    },
    default: true
  },
  {
    key: 'mentions_v2',
    label: 'Mentions v2',
    description: 'Unified @-mention popup for files, plugins, and skills.',
    note: {
      recommended: 'off',
      reason: 'makes the @ popup harder to use for what you actually mean.'
    },
    default: true
  }
] as const

export type AgentFieldKey = (typeof AGENT_FIELDS)[number]['key']
export type FeatureKey = (typeof FEATURE_FIELDS)[number]['key']

export type ProviderValues = {
  enabled: boolean
  baseUrl: string
  apiKey: string
}

export type ConfigValues = {
  agent: Record<AgentFieldKey, string | null>
  features: Record<FeatureKey, boolean>
  provider: ProviderValues
}

export type ConfigApi = {
  get: () => Promise<ConfigValues>
  save: (values: ConfigValues) => Promise<void>
  onChanged: (callback: () => void) => () => void
}
