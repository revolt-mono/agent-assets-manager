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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { toast } from '@renderer/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { AgentLogo } from '@renderer/components/agent-logos'
import { IconSwap, IconSwapItem } from '@renderer/components/icon-swap'
import { cn } from '@renderer/lib/utils'
import { saveConfig, useSavedConfig } from '@renderer/features/config/store'
import {
  AGENT_FIELDS,
  FEATURE_FIELDS,
  type ConfigValues,
  type ProviderValues
} from '@shared/config'

export function ConfigPage(): React.JSX.Element {
  const saved = useSavedConfig()
  // Edits overlay the saved snapshot they were based on; any newer snapshot
  // (external file change, or our own save landing) discards them.
  const [edit, setEdit] = useState<{ base: ConfigValues; draft: ConfigValues } | null>(null)
  const draft = edit && edit.base === saved ? edit.draft : saved
  const [justSaved, setJustSaved] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const patch = (next: ConfigValues): void => {
    if (saved) setEdit({ base: saved, draft: next })
  }

  const dirty = draft !== undefined && JSON.stringify(saved) !== JSON.stringify(draft)

  const save = async (): Promise<void> => {
    if (!draft) return
    try {
      await saveConfig(draft)
      setJustSaved(true)
      clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setJustSaved(false), 2000)
    } catch {
      toast.add({ title: 'Could not save config', type: 'error' })
    }
  }

  const showSaved = justSaved && !dirty

  return (
    <Tabs value="codex" className="min-h-0 flex-1 gap-0 overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between px-4 [-webkit-app-region:drag]">
        <TabsList className="[-webkit-app-region:no-drag]">
          <TabsTrigger value="codex">
            <AgentLogo agent="codex" />
            Codex
          </TabsTrigger>
        </TabsList>
        <div className="grid place-items-center [-webkit-app-region:no-drag] *:col-start-1 *:row-start-1">
          {/* invisible twin pins the width so Save and the checkmark swap in place */}
          <Button size="sm" aria-hidden tabIndex={-1} className="invisible">
            Save
          </Button>
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => void save()}
            className={cn(
              'w-full text-white',
              showSaved ? 'bg-[#008009] disabled:opacity-100' : 'bg-[#007aff] hover:bg-[#007aff]/80'
            )}
          >
            <IconSwap>
              <IconSwapItem key={showSaved ? 'saved' : 'idle'}>
                {showSaved ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} /> : 'Save'}
              </IconSwapItem>
            </IconSwap>
          </Button>
        </div>
      </header>

      <TabsContent
        value="codex"
        className="scroll-fade my-2 flex min-h-0 flex-col gap-8 overflow-y-auto px-6 pb-2"
      >
        <FieldSet className="gap-0">
          <FieldLegend>Model provider</FieldLegend>
          <ProviderFields
            provider={draft?.provider}
            onChange={(provider) => draft && patch({ ...draft, provider })}
          />
        </FieldSet>

        <FieldSet className="gap-0">
          <FieldLegend>Agent defaults</FieldLegend>
          {AGENT_FIELDS.map((field) => (
            <AgentFieldRow
              key={field.key}
              field={field}
              value={draft?.agent[field.key] ?? null}
              disabled={!draft}
              onChange={(value) =>
                draft && patch({ ...draft, agent: { ...draft.agent, [field.key]: value } })
              }
            />
          ))}
        </FieldSet>

        <FieldSet className="gap-0">
          <FieldLegend>Features</FieldLegend>
          {FEATURE_FIELDS.map((field) => (
            <FeatureRow
              key={field.key}
              field={field}
              enabled={draft?.features[field.key] ?? false}
              disabled={!draft}
              onChange={(enabled) =>
                draft && patch({ ...draft, features: { ...draft.features, [field.key]: enabled } })
              }
            />
          ))}
        </FieldSet>
      </TabsContent>
    </Tabs>
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
          onCheckedChange={(enabled) => set({ enabled })}
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
  field: (typeof AGENT_FIELDS)[number]
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
  field: (typeof FEATURE_FIELDS)[number]
  enabled: boolean
  disabled: boolean
  onChange: (enabled: boolean) => void
}): React.JSX.Element {
  return (
    <ConfigRow
      title={
        <>
          {field.label}
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
        </>
      }
      description={field.description}
    >
      <Switch checked={enabled} onCheckedChange={onChange} disabled={disabled} />
    </ConfigRow>
  )
}
