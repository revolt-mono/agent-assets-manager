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

// Claude Code agent defaults, persisted in ~/.claude/settings.json.
// `settings` storage is a top-level string key, `env` storage an entry in the
// `env` object; either way, absent or an unlisted value shows as "Not set".
export const CLAUDE_AGENT_FIELDS = [
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
    label: 'Effort level',
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
] as const

// Claude Code feature toggles, all persisted in ~/.claude/settings.json.
// `settings` storage is a top-level boolean key: absent means the field
// default, and saving the default deletes the key. `env` storage is an entry
// in the `env` object: a truthy value (anything but "", "0", "false") means
// on, an absent key means off; turning on writes "1", off deletes.
export const CLAUDE_FEATURE_FIELDS = [
  {
    key: 'disableClaudeAiConnectors',
    storage: 'settings',
    default: false,
    label: 'Disable claude.ai connectors',
    description: 'Stop auto-fetching and connecting MCP connectors from claude.ai.',
    note: {
      recommended: 'on',
      reason:
        'claude.ai connectors auto-attach MCP servers you never asked for and bloat the context.'
    }
  },
  {
    key: 'disableArtifact',
    storage: 'settings',
    default: false,
    label: 'Disable artifacts',
    description: 'Remove the Artifact tool that publishes session output to claude.ai.',
    note: {
      recommended: 'on',
      reason:
        'publishing session output to claude.ai is never wanted, and the tool wastes prompt space.'
    }
  },
  {
    key: 'disableRemoteControl',
    storage: 'settings',
    default: false,
    label: 'Disable remote control',
    description: 'Block remote-control sessions, auto-start, and the in-session toggle.',
    note: {
      recommended: 'on',
      reason:
        'nothing should drive local sessions remotely; removing remote control cuts attack surface and prompt bloat.'
    }
  },
  {
    key: 'promptSuggestionEnabled',
    storage: 'settings',
    default: true,
    label: 'Prompt suggestions',
    description: 'Show grayed-out predictions in the prompt input.',
    note: {
      recommended: 'off',
      reason: 'grayed-out predictions distract while typing and add background requests.'
    }
  },
  {
    key: 'switchModelsOnFlag',
    storage: 'settings',
    default: true,
    label: 'Switch models on flag',
    description: 'Auto-switch to the fallback model when a safety classifier flags a request.',
    note: {
      recommended: 'off',
      reason: 'a silent model swap changes quality mid-session; pause and decide yourself.'
    }
  },
  {
    key: 'wheelScrollAccelerationEnabled',
    storage: 'settings',
    default: true,
    label: 'Wheel scroll acceleration',
    description: 'Speed up mouse-wheel scrolling during fast scrolls in fullscreen mode.',
    note: {
      recommended: 'off',
      reason: 'a constant rate per notch is predictable; acceleration overshoots in fullscreen.'
    }
  },
  {
    key: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    storage: 'env',
    label: 'Disable nonessential traffic',
    description: 'Skip auto-updates, telemetry, error reporting, and other background requests.',
    note: {
      recommended: 'on',
      reason: 'auto-updates, telemetry, and error reporting are background traffic with no value.'
    }
  },
  {
    key: 'CLAUDE_CODE_DISABLE_BUNDLED_SKILLS',
    storage: 'env',
    label: 'Disable bundled skills',
    description: 'Remove built-in skills and slash commands like /code-review and /run.',
    note: {
      recommended: 'off',
      reason:
        'a blanket disable also removes useful built-in commands; deny unwanted ones individually.'
    }
  },
  {
    key: 'CLAUDE_CODE_DISABLE_CLAUDE_API_SKILL',
    storage: 'env',
    label: 'Disable Claude API skill',
    description: 'Stop the bundled skill that auto-triggers on Anthropic SDK and API code.',
    note: {
      recommended: 'on',
      reason: 'auto-triggers on Anthropic SDK code and injects context you rarely need.'
    }
  },
  {
    key: 'CLAUDE_CODE_DISABLE_CLAUDE_CODE_SKILL',
    storage: 'env',
    label: 'Disable Claude Code skill',
    description: 'Stop the bundled guide skill that answers Claude Code usage questions.',
    note: {
      recommended: 'on',
      reason: 'usage questions are rare, so the bundled guide skill just wastes context.'
    }
  },
  {
    key: 'CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS',
    storage: 'env',
    label: 'Disable git instructions',
    description: 'Drop the built-in git workflow guidance from the system prompt.',
    note: {
      recommended: 'on',
      reason: 'the built-in git guidance conflicts with your own rules and bloats the prompt.'
    }
  },
  {
    key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY',
    storage: 'env',
    label: 'Disable auto memory',
    description: 'Stop reading and writing per-project memory notes across sessions.',
    note: {
      recommended: 'on',
      reason: 'stale project memory leaks into unrelated sessions; manage context yourself.'
    }
  },
  {
    key: 'CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT',
    storage: 'env',
    label: 'Simple system prompt',
    description: 'Collapse the system prompt to a minimal identity-and-cwd version.',
    note: {
      recommended: 'on',
      reason:
        'a minimal prompt saves tokens and interferes less; your own config supplies the rules.'
    }
  },
  {
    key: 'CLAUDE_CODE_NO_FLICKER',
    storage: 'env',
    label: 'No-flicker renderer',
    description: 'Render the TUI on the alternate screen with mouse support and no flicker.',
    note: {
      recommended: 'on',
      reason: 'alternate-screen rendering avoids flicker and adds mouse support in fullscreen.'
    }
  }
] as const

type CodexAgentFieldKey = (typeof CODEX_AGENT_FIELDS)[number]['key']
type CodexFeatureKey = (typeof CODEX_FEATURE_FIELDS)[number]['key']
type ClaudeAgentField = (typeof CLAUDE_AGENT_FIELDS)[number]
type ClaudeFeatureField = (typeof CLAUDE_FEATURE_FIELDS)[number]
export type ClaudeAgentSettingKey = Extract<ClaudeAgentField, { storage: 'settings' }>['key']
export type ClaudeFeatureSettingKey = Extract<ClaudeFeatureField, { storage: 'settings' }>['key']

export type ProviderValues = {
  enabled: boolean
  baseUrl: string
  apiKey: string
}

export type ClaudeConfig = {
  agent: Record<ClaudeAgentField['key'], string | null>
  features: Record<ClaudeFeatureField['key'], boolean>
}

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
