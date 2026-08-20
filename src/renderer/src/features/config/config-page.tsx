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
import { configStores, type ConfigStore } from '@renderer/features/config/store'
import { useStore } from '@renderer/lib/store'
import { AGENT_IDS, parseAgent, type AgentId } from '@shared/agent'
import {
  applyDefaultChange,
  disabledDefaultKeys,
  type ConfigDefaultKey,
  type ConfigFeatureKey,
  type ConfigValues,
  type DefaultField,
  type FeatureField,
  type ProviderValues
} from '@shared/config'

// One agent's edit session: the draft overlays the saved snapshot it was
// based on and survives tab switches; a newer snapshot (external file change,
// or our own save landing) discards it.
type ConfigEditor<A extends AgentId> = {
  catalog: ConfigStore<A>['catalog']
  draft: ConfigValues<A> | undefined
  dirty: boolean
  setDefault: (key: ConfigDefaultKey<A>, value: string) => void
  setFeature: (key: ConfigFeatureKey<A>, enabled: boolean) => void
  setProvider: (provider: ProviderValues) => void
  save: () => Promise<boolean>
}

function useConfigEditor<A extends AgentId>(config: ConfigStore<A>): ConfigEditor<A> {
  const saved = useStore(config.values)
  const [edit, setEdit] = useState<{
    base: ConfigValues<A>
    draft: ConfigValues<A>
  } | null>(null)
  const draft = edit && edit.base === saved ? edit.draft : saved
  const patch = (
    update: (current: ConfigValues<A>, saved: ConfigValues<A>) => ConfigValues<A>
  ): void => {
    if (saved && draft) setEdit({ base: saved, draft: update(draft, saved) })
  }
  return {
    catalog: config.catalog,
    draft,
    dirty: draft !== undefined && JSON.stringify(draft) !== JSON.stringify(saved),
    setDefault: (key, value) =>
      patch((current, saved) => ({
        ...current,
        defaults: applyDefaultChange({
          catalog: config.catalog,
          saved: saved.defaults,
          current: current.defaults,
          key,
          value
        })
      })),
    setFeature: (key, enabled) =>
      patch((current) => ({
        ...current,
        features: { ...current.features, [key]: enabled }
      })),
    setProvider: (provider) => patch((current) => ({ ...current, provider })),
    save: async () => {
      if (!draft) return false
      await config.save(draft)
      return true
    }
  }
}

export function ConfigPage(): React.JSX.Element {
  const [agent, setAgent] = useState<AgentId>(AGENT_IDS[0])
  const editors = {
    claude: useConfigEditor(configStores.claude),
    codex: useConfigEditor(configStores.codex)
  }
  const active = editors[agent]
  const sections = {
    claude: <ConfigSections editor={editors.claude} />,
    codex: <ConfigSections editor={editors.codex} />
  } satisfies Record<AgentId, React.JSX.Element>
  // Tracks which agent's save just landed so the checkmark only shows on the
  // tab that was saved, even when the save resolves after a tab switch.
  const [justSaved, setJustSaved] = useState<AgentId | null>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const save = async (): Promise<void> => {
    try {
      if (!(await active.save())) return
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
              onClick={save}
              className={cn(
                'w-full text-white',
                showSaved
                  ? 'bg-[#35C759] disabled:opacity-100'
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
        {sections[agent]}
      </TabsContent>
    </Tabs>
  )
}

function ConfigSections<A extends AgentId>({
  editor
}: {
  editor: ConfigEditor<A>
}): React.JSX.Element {
  const { catalog, draft } = editor
  const disabledDefaults = draft ? disabledDefaultKeys(catalog, draft.defaults) : undefined
  return (
    <>
      <FieldSet className="gap-0">
        <FieldLegend>Model provider</FieldLegend>
        <ProviderFields
          provider={draft?.provider}
          baseUrlDescription={catalog.baseUrlDescription}
          apiKeyDescription={catalog.apiKeyDescription}
          onChange={editor.setProvider}
        />
      </FieldSet>

      <FieldSet className="gap-0">
        <FieldLegend>Agent defaults</FieldLegend>
        {catalog.defaultFields
          .toSorted((left, right) => left.label.localeCompare(right.label))
          .map((field) => (
            <DefaultFieldRow
              key={field.key}
              field={field}
              value={draft?.defaults[field.key] ?? null}
              disabled={!draft || disabledDefaults?.has(field.key) === true}
              onChange={(value) => editor.setDefault(field.key, value)}
            />
          ))}
      </FieldSet>

      <FieldSet className="gap-0">
        <FieldLegend>Features</FieldLegend>
        {catalog.featureFields
          .toSorted((left, right) => left.label.localeCompare(right.label))
          .map((field) => (
            <FeatureRow
              key={field.key}
              field={field}
              enabled={draft?.features[field.key] ?? false}
              disabled={!draft}
              onChange={(enabled) => editor.setFeature(field.key, enabled)}
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
  baseUrlDescription,
  apiKeyDescription,
  onChange
}: {
  provider: ProviderValues | undefined
  baseUrlDescription: string
  apiKeyDescription: string
  onChange: (provider: ProviderValues) => void
}): React.JSX.Element {
  // Credentials gate the switch: clearing either field turns the provider off,
  // and it cannot be re-enabled until both are filled in again.
  const updateProvider = (partial: Partial<ProviderValues>): void => {
    if (!provider) return
    const next = { ...provider, ...partial }
    onChange(next.baseUrl === '' || next.apiKey === '' ? { ...next, enabled: false } : next)
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
          onToggle={() => updateProvider({ enabled: !provider?.enabled })}
        />
      </ConfigRow>
      <ConfigRow title="Base URL" description={baseUrlDescription}>
        <Input
          value={provider?.baseUrl ?? ''}
          disabled={!provider}
          placeholder="https://api.example.com/v1"
          spellCheck={false}
          className="w-72"
          onChange={(event) => updateProvider({ baseUrl: event.target.value.trim() })}
        />
      </ConfigRow>
      <ConfigRow title="API key" description={apiKeyDescription}>
        <Input
          type="password"
          value={provider?.apiKey ?? ''}
          disabled={!provider}
          placeholder="sk-..."
          autoComplete="off"
          className="w-72"
          onChange={(event) => updateProvider({ apiKey: event.target.value.trim() })}
        />
      </ConfigRow>
    </>
  )
}

function DefaultFieldRow({
  field,
  value,
  disabled,
  onChange
}: {
  field: DefaultField
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
  field: FeatureField
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
      <Switch checked={enabled} onToggle={() => onChange(!enabled)} disabled={disabled} />
    </ConfigRow>
  )
}
