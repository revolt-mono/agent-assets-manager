import { useCallback, useEffect, useState } from 'react'
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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
import {
  AGENT_FIELDS,
  FEATURE_FIELDS,
  type AgentFieldKey,
  type ConfigValues,
  type FeatureKey
} from '@shared/config'

export function ConfigPage(): React.JSX.Element {
  const [values, setValues] = useState<ConfigValues | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setValues(await window.api.config.get())
    } catch {
      toast.add({ title: 'Could not load config', type: 'error' })
    }
  }, [])

  useEffect(() => {
    void load()
    return window.api.config.onChanged(() => {
      void load()
    })
  }, [load])

  const updateAgent = (key: AgentFieldKey, value: string): void => {
    setValues((current) => current && { ...current, agent: { ...current.agent, [key]: value } })
    window.api.config.set(key, value).catch(() => {
      toast.add({ title: 'Could not update config', type: 'error' })
      void load()
    })
  }

  const updateFeature = (key: FeatureKey, enabled: boolean): void => {
    setValues(
      (current) => current && { ...current, features: { ...current.features, [key]: enabled } }
    )
    window.api.config.setFeature(key, enabled).catch(() => {
      toast.add({ title: 'Could not update config', type: 'error' })
      void load()
    })
  }

  return (
    <Tabs value="codex" className="min-h-0 flex-1 gap-0 overflow-hidden">
      <header className="flex h-12 shrink-0 items-center px-4 [-webkit-app-region:drag]">
        <TabsList className="[-webkit-app-region:no-drag]">
          <TabsTrigger value="codex">
            <AgentLogo agent="codex" />
            Codex
          </TabsTrigger>
        </TabsList>
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
              value={values?.agent[field.key] ?? null}
              disabled={!values}
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
              enabled={values?.features[field.key] ?? false}
              disabled={!values}
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
