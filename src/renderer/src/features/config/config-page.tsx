import { useRef, useState } from 'react'
import { InformationCircleIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLegend,
  FieldSet,
  FieldTitle
} from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsContent } from '@renderer/components/ui/tabs'
import { toast } from '@renderer/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { AgentTabsList } from '@renderer/components/agent-tabs'
import { IconSwap, IconSwapItem } from '@renderer/components/icon-swap'
import { PageHeader } from '@renderer/components/page-header'
import { cn } from '@renderer/lib/utils'
import { saveConfig, useSavedConfig } from '@renderer/features/config/store'
import { AGENT_IDS, parseAgent, type AgentId } from '@shared/agent'
import {
  CLAUDE_FEATURE_FIELDS,
  CODEX_AGENT_FIELDS,
  CODEX_FEATURE_FIELDS,
  type AgentConfig,
  type ProviderValues
} from '@shared/config'

// One agent's edit session: the draft overlays the saved snapshot it was
// based on and survives tab switches; a newer snapshot (external file change,
// or our own save landing) discards it.
type ConfigEditor<A extends AgentId> = {
  draft: AgentConfig[A] | undefined
  dirty: boolean
  patch: (update: (draft: AgentConfig[A]) => AgentConfig[A]) => void
  save: () => Promise<void>
}

function useConfigEditor<A extends AgentId>(agent: A): ConfigEditor<A> {
  const saved = useSavedConfig(agent)
  const [edit, setEdit] = useState<{ base: AgentConfig[A]; draft: AgentConfig[A] } | null>(null)
  const draft = edit && edit.base === saved ? edit.draft : saved
  return {
    draft,
    dirty: draft !== undefined && JSON.stringify(draft) !== JSON.stringify(saved),
    patch: (update) => {
      if (saved && draft) setEdit({ base: saved, draft: update(draft) })
    },
    save: async () => {
      if (draft) await saveConfig(agent, draft)
    }
  }
}

export function ConfigPage(): React.JSX.Element {
  const [agent, setAgent] = useState<AgentId>(AGENT_IDS[0])
  const claude = useConfigEditor('claude')
  const codex = useConfigEditor('codex')
  const active = agent === 'claude' ? claude : codex
  // Tracks which agent's save just landed so the checkmark only shows on the
  // tab that was saved, even when the save resolves after a tab switch.
  const [justSaved, setJustSaved] = useState<AgentId | null>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const save = async (): Promise<void> => {
    try {
      await active.save()
      setJustSaved(agent)
      clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setJustSaved(null), 2000)
    } catch {
      toast.add({ title: 'Could not save config', type: 'error' })
    }
  }

  const showSaved = justSaved === agent && !active.dirty

  return (
    <Tabs
      value={agent}
      onValueChange={(value) => {
        if (value == null) return
        setAgent(parseAgent(value))
      }}
      className="min-h-0 flex-1 gap-0 overflow-hidden"
    >
      <PageHeader
        actions={
          <div className="grid place-items-center *:col-start-1 *:row-start-1">
            {/* invisible twin pins the width so Save and the checkmark swap in place */}
            <Button size="sm" aria-hidden tabIndex={-1} className="invisible">
              Save
            </Button>
            <Button
              size="sm"
              disabled={!active.dirty}
              onClick={() => void save()}
              className={cn(
                'w-full text-white',
                showSaved
                  ? 'bg-[#008009] disabled:opacity-100'
                  : 'bg-[#007aff] hover:bg-[#007aff]/80'
              )}
            >
              <IconSwap>
                <IconSwapItem key={showSaved ? 'saved' : 'idle'}>
                  {showSaved ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} /> : 'Save'}
                </IconSwapItem>
              </IconSwap>
            </Button>
          </div>
        }
      >
        <AgentTabsList />
      </PageHeader>

      {/* One panel that always matches the selected tab, like the skills
          page: scroll-fade's scroll-driven animations never finish, and
          base-ui only unmounts a deselected panel once the panel element's
          animations complete — so panels carrying scroll-fade must not
          deselect. */}
      <TabsContent
        value={agent}
        className="scroll-fade my-2 flex min-h-0 flex-col gap-8 overflow-y-auto px-6 pb-2"
      >
        {agent === 'claude' ? <ClaudeFields editor={claude} /> : <CodexFields editor={codex} />}
      </TabsContent>
    </Tabs>
  )
}

function ClaudeFields({ editor }: { editor: ConfigEditor<'claude'> }): React.JSX.Element {
  const { draft, patch } = editor
  return (
    <FieldSet className="gap-0">
      <FieldLegend>Features</FieldLegend>
      {CLAUDE_FEATURE_FIELDS.map((field) => (
        <FeatureRow
          key={field.key}
          field={field}
          enabled={draft?.[field.key] ?? false}
          disabled={!draft}
          onChange={(enabled) => patch((current) => ({ ...current, [field.key]: enabled }))}
        />
      ))}
    </FieldSet>
  )
}

function CodexFields({ editor }: { editor: ConfigEditor<'codex'> }): React.JSX.Element {
  const { draft, patch } = editor
  return (
    <>
      <FieldSet className="gap-0">
        <FieldLegend>Model provider</FieldLegend>
        <ProviderFields
          provider={draft?.provider}
          onChange={(provider) => patch((current) => ({ ...current, provider }))}
        />
      </FieldSet>

      <FieldSet className="gap-0">
        <FieldLegend>Agent defaults</FieldLegend>
        {CODEX_AGENT_FIELDS.map((field) => (
          <AgentFieldRow
            key={field.key}
            field={field}
            value={draft?.agent[field.key] ?? null}
            disabled={!draft}
            onChange={(value) =>
              patch((current) => ({ ...current, agent: { ...current.agent, [field.key]: value } }))
            }
          />
        ))}
      </FieldSet>

      <FieldSet className="gap-0">
        <FieldLegend>Features</FieldLegend>
        {CODEX_FEATURE_FIELDS.map((field) => (
          <FeatureRow
            key={field.key}
            field={field}
            enabled={draft?.features[field.key] ?? false}
            disabled={!draft}
            onChange={(enabled) =>
              patch((current) => ({
                ...current,
                features: { ...current.features, [field.key]: enabled }
              }))
            }
          />
        ))}
      </FieldSet>
    </>
  )
}

function ConfigRow({
  title,
  description,
  children
}: {
  title: React.ReactNode
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Field orientation="horizontal" className="border-b py-3 last:border-b-0">
      <FieldContent>
        <FieldTitle>{title}</FieldTitle>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      {children}
    </Field>
  )
}

function ProviderFields({
  provider,
  onChange
}: {
  provider: ProviderValues | undefined
  onChange: (provider: ProviderValues) => void
}): React.JSX.Element {
  // Credentials gate the switch: clearing either field turns the provider off,
  // and it cannot be re-enabled until both are filled in again.
  const set = (partial: Partial<ProviderValues>): void => {
    if (!provider) return
    const next = { ...provider, ...partial }
    if (next.baseUrl === '' || next.apiKey === '') next.enabled = false
    onChange(next)
  }
  return (
    <>
      <ConfigRow
        title="Use custom provider"
        description="Route requests through this provider instead of the built-in one."
      >
        <Switch
          checked={provider?.enabled ?? false}
          disabled={
            !provider || (!provider.enabled && (provider.baseUrl === '' || provider.apiKey === ''))
          }
          onToggle={() => set({ enabled: !provider?.enabled })}
        />
      </ConfigRow>
      <ConfigRow title="Base URL" description="Endpoint speaking the OpenAI Responses API.">
        <Input
          value={provider?.baseUrl ?? ''}
          disabled={!provider}
          placeholder="https://api.example.com/v1"
          spellCheck={false}
          className="w-72"
          onChange={(event) => set({ baseUrl: event.target.value.trim() })}
        />
      </ConfigRow>
      <ConfigRow title="API key" description="Sent as a bearer token; stored in config.toml.">
        <Input
          type="password"
          value={provider?.apiKey ?? ''}
          disabled={!provider}
          placeholder="sk-..."
          autoComplete="off"
          className="w-72"
          onChange={(event) => set({ apiKey: event.target.value.trim() })}
        />
      </ConfigRow>
    </>
  )
}

function AgentFieldRow({
  field,
  value,
  disabled,
  onChange
}: {
  field: (typeof CODEX_AGENT_FIELDS)[number]
  value: string | null
  disabled: boolean
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <ConfigRow title={field.label} description={field.description}>
      <Select
        items={field.options.map((option) => ({ value: option.value, label: option.label }))}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next)
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent className="w-auto p-1" align="end" alignItemWithTrigger={false}>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex flex-col pe-6">
                {option.label}
                <span className="text-muted-foreground">{option.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ConfigRow>
  )
}

function FeatureRow({
  field,
  enabled,
  disabled,
  onChange
}: {
  field: { label: string; description: string; note?: { recommended: string; reason: string } }
  enabled: boolean
  disabled: boolean
  onChange: (enabled: boolean) => void
}): React.JSX.Element {
  return (
    <ConfigRow
      title={
        <>
          {field.label}
          {field.note && (
            <Tooltip>
              <TooltipTrigger render={<span className="text-muted-foreground" />}>
                <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  Recommended <span className="font-semibold">{field.note.recommended}</span>:{' '}
                  {field.note.reason}
                </span>
              </TooltipContent>
            </Tooltip>
          )}
        </>
      }
      description={field.description}
    >
      <Switch checked={enabled} onToggle={() => onChange(!enabled)} disabled={disabled} />
    </ConfigRow>
  )
}
