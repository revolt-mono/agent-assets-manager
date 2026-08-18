import { useCallback, useEffect, useRef, useState } from 'react'
import { InformationCircleIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { motion } from 'motion/react'
import { Button } from '@renderer/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLegend,
  FieldSet,
  FieldTitle
} from '@renderer/components/ui/field'
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
import {
  AGENT_FIELDS,
  FEATURE_FIELDS,
  type AgentFieldKey,
  type ConfigValues,
  type FeatureKey
} from '@shared/config'

export function ConfigPage(): React.JSX.Element {
  const [saved, setSaved] = useState<ConfigValues | null>(null)
  const [draft, setDraft] = useState<ConfigValues | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const load = useCallback(async (): Promise<void> => {
    try {
      const values = await window.api.config.get()
      setSaved(values)
      setDraft(values)
    } catch {
      toast.add({ title: 'Could not load config', type: 'error' })
    }
  }, [])

  useEffect(() => {
    void load()
    const unsubscribe = window.api.config.onChanged(() => {
      void load()
    })
    return () => {
      unsubscribe()
      clearTimeout(resetTimer.current)
    }
  }, [load])

  const updateAgent = (key: AgentFieldKey, value: string): void => {
    setDraft((current) => current && { ...current, agent: { ...current.agent, [key]: value } })
  }

  const updateFeature = (key: FeatureKey, enabled: boolean): void => {
    setDraft(
      (current) => current && { ...current, features: { ...current.features, [key]: enabled } }
    )
  }

  const dirty = saved !== null && draft !== null && JSON.stringify(saved) !== JSON.stringify(draft)

  const save = async (): Promise<void> => {
    if (!draft) return
    try {
      await window.api.config.save(draft)
      setSaved(draft)
      setJustSaved(true)
      clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setJustSaved(false), 2000)
    } catch {
      toast.add({ title: 'Could not save config', type: 'error' })
      void load()
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
              <IconSwapItem key={showSaved ? 'saved' : 'idle'} as={motion.span}>
                {showSaved ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} /> : 'Save'}
              </IconSwapItem>
            </IconSwap>
          </Button>
        </div>
      </header>

      <TabsContent
        value="codex"
        className="scroll-fade flex min-h-0 flex-col gap-8 overflow-y-auto px-6 pt-2 pb-4"
      >
        <FieldSet className="gap-0">
          <FieldLegend>Agent defaults</FieldLegend>
          {AGENT_FIELDS.map((field) => (
            <AgentFieldRow
              key={field.key}
              field={field}
              value={draft?.agent[field.key] ?? null}
              disabled={!draft}
              onChange={(value) => updateAgent(field.key, value)}
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
              onChange={(enabled) => updateFeature(field.key, enabled)}
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
    <Field orientation="horizontal" className="border-b py-4 last:border-b-0">
      <FieldContent>
        <FieldTitle>{title}</FieldTitle>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      {children}
    </Field>
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
          <RecommendationHint note={field.note} />
        </>
      }
      description={field.description}
    >
      <Switch checked={enabled} onCheckedChange={onChange} disabled={disabled} />
    </ConfigRow>
  )
}

function RecommendationHint({
  note
}: {
  note: (typeof FEATURE_FIELDS)[number]['note']
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="text-muted-foreground" />}>
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>
        <span>
          Recommended <span className="font-semibold">{note.recommended}</span>: {note.reason}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
