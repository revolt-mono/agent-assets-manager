import type { AgentId } from './agent'

export const CODEX_AGENT_FIELDS = [
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

export const CODEX_FEATURE_FIELDS = [
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

// Claude Code toggles map 1:1 to entries in the `env` object of
// ~/.claude/settings.json; a truthy value (anything but "", "0", "false")
// means on, an absent key means off. Turning on writes "1", off deletes.
export const CLAUDE_ENV_FIELDS = [
  {
    key: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    label: 'Disable nonessential traffic',
    description: 'Skip auto-updates, telemetry, error reporting, and other background requests.'
  },
  {
    key: 'CLAUDE_CODE_DISABLE_BUNDLED_SKILLS',
    label: 'Disable bundled skills',
    description: 'Remove built-in skills and slash commands like /code-review and /run.'
  },
  {
    key: 'CLAUDE_CODE_DISABLE_CLAUDE_API_SKILL',
    label: 'Disable Claude API skill',
    description: 'Stop the bundled skill that auto-triggers on Anthropic SDK and API code.'
  },
  {
    key: 'CLAUDE_CODE_DISABLE_CLAUDE_CODE_SKILL',
    label: 'Disable Claude Code skill',
    description: 'Stop the bundled guide skill that answers Claude Code usage questions.'
  },
  {
    key: 'CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS',
    label: 'Disable git instructions',
    description: 'Drop the built-in git workflow guidance from the system prompt.'
  },
  {
    key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY',
    label: 'Disable auto memory',
    description: 'Stop reading and writing per-project memory notes across sessions.'
  },
  {
    key: 'CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT',
    label: 'Simple system prompt',
    description: 'Collapse the system prompt to a minimal identity-and-cwd version.'
  },
  {
    key: 'CLAUDE_CODE_NO_FLICKER',
    label: 'No-flicker renderer',
    description: 'Render the TUI on the alternate screen with mouse support and no flicker.'
  }
] as const

type CodexAgentFieldKey = (typeof CODEX_AGENT_FIELDS)[number]['key']
type CodexFeatureKey = (typeof CODEX_FEATURE_FIELDS)[number]['key']
type ClaudeEnvKey = (typeof CLAUDE_ENV_FIELDS)[number]['key']

export type ProviderValues = {
  enabled: boolean
  baseUrl: string
  apiKey: string
}

export type ClaudeConfig = Record<ClaudeEnvKey, boolean>

export type CodexConfig = {
  agent: Record<CodexAgentFieldKey, string | null>
  features: Record<CodexFeatureKey, boolean>
  provider: ProviderValues
}

export type AgentConfig = {
  claude: ClaudeConfig
  codex: CodexConfig
}

export type ConfigApi = {
  get: <A extends AgentId>(agent: A) => Promise<AgentConfig[A]>
  save: <A extends AgentId>(agent: A, values: AgentConfig[A]) => Promise<void>
  onChanged: (callback: (agent: AgentId) => void) => () => void
}
