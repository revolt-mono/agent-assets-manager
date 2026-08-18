import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@renderer/components/ui/chart'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@renderer/components/ui/empty'
import { Spinner } from '@renderer/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { toast } from '@renderer/components/ui/toast'
import { compact, usd, wholeUsd } from '@renderer/features/usage/format'
import { ModelsTable, type ModelRow } from '@renderer/features/usage/models-table'
import { AGENTS } from '@shared/skill'
import type { UsageBucket } from '@shared/usage'

const RANGES = [
  { id: '24h', label: '24 hours', unit: 'hour', count: 24 },
  { id: '7d', label: '7 days', unit: 'day', count: 7 },
  { id: '30d', label: '30 days', unit: 'day', count: 30 }
] as const

type Range = (typeof RANGES)[number]

const chartConfig = {
  claude: { label: 'Claude', color: 'var(--chart-1)' },
  codex: { label: 'Codex', color: 'var(--chart-2)' }
} satisfies ChartConfig

type ChartPoint = { start: number; label: string; claude: number; codex: number }

// One zeroed point per hour or local calendar day, oldest first.
function emptyPoints({ unit, count }: Range): ChartPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const start = new Date()
    if (unit === 'hour') {
      start.setMinutes(0, 0, 0)
      start.setHours(start.getHours() - (count - 1 - index))
    } else {
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - (count - 1 - index))
    }
    const label =
      unit === 'hour'
        ? `${String(start.getHours()).padStart(2, '0')}:00`
        : `${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    return { start: start.getTime(), label, claude: 0, codex: 0 }
  })
}

export function UsagePage(): React.JSX.Element {
  const [range, setRange] = useState<Range>(RANGES[0])
  const [buckets, setBuckets] = useState<UsageBucket[] | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.usage
      .get()
      .then((loaded) => {
        if (!cancelled) setBuckets(loaded)
      })
      .catch(() => {
        if (cancelled) return
        toast.add({ title: 'Could not load usage', type: 'error' })
        setBuckets([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const view = useMemo(() => {
    const points = emptyPoints(range)
    const window = (buckets ?? []).filter((bucket) => bucket.hour >= points[0].start)
    for (const bucket of window) {
      // points are sorted; find the last one starting at or before the bucket
      const point = points.findLast((candidate) => candidate.start <= bucket.hour)
      if (point) point[bucket.agent] += bucket.cost
    }

    const totals = { cost: 0, tokens: 0, claude: 0, codex: 0 }
    const rows = new Map<string, ModelRow>()
    for (const bucket of window) {
      const sum =
        bucket.tokens.input +
        bucket.tokens.output +
        bucket.tokens.cacheRead +
        bucket.tokens.cacheWrite
      totals.cost += bucket.cost
      totals.tokens += sum
      totals[bucket.agent] += bucket.cost
      const key = `${bucket.agent}|${bucket.model}`
      const row = rows.get(key) ?? {
        model: bucket.model,
        agent: AGENTS[bucket.agent].label,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0
      }
      row.input += bucket.tokens.input
      row.output += bucket.tokens.output
      row.cacheRead += bucket.tokens.cacheRead
      row.cacheWrite += bucket.tokens.cacheWrite
      row.cost += bucket.cost
      rows.set(key, row)
    }
    return { points, totals, rows: [...rows.values()] }
  }, [buckets, range])

  return (
    <Tabs
      value={range.id}
      onValueChange={(value) => {
        const next = RANGES.find((candidate) => candidate.id === value)
        if (next) setRange(next)
      }}
      className="min-h-0 flex-1 gap-0 overflow-hidden"
    >
      <header className="flex h-12 shrink-0 items-center px-4 [-webkit-app-region:drag]">
        <TabsList className="[-webkit-app-region:no-drag]">
          {RANGES.map((candidate) => (
            <TabsTrigger key={candidate.id} value={candidate.id}>
              {candidate.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </header>

      {buckets === null ? (
        <div className="grid flex-1 place-items-center">
          <Spinner className="size-5" />
        </div>
      ) : buckets.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No usage yet</EmptyTitle>
            <EmptyDescription>
              Session logs from Claude Code and Codex show up here once they exist.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <TabsContent
          value={range.id}
          className="scroll-fade my-2 flex min-h-0 flex-col gap-8 overflow-y-auto px-6 py-2"
        >
          <div className="grid shrink-0 grid-cols-4 gap-4">
            <Stat label="Spend" value={usd.format(view.totals.cost)} />
            <Stat label="Tokens" value={compact.format(view.totals.tokens)} />
            <Stat label="Claude" value={usd.format(view.totals.claude)} />
            <Stat label="Codex" value={usd.format(view.totals.codex)} />
          </div>

          <section className="flex shrink-0 flex-col gap-4">
            <h2 className="text-sm font-medium">Spend over time</h2>
            <ChartContainer config={chartConfig} className="aspect-auto h-52 w-full">
              <BarChart data={view.points} margin={{ left: 0, right: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(value: number) => wholeUsd.format(value)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, item) => (
                        <>
                          <div
                            className="size-2.5 shrink-0 rounded-[2px]"
                            style={{ background: item.color }}
                          />
                          {chartConfig[name === 'claude' ? 'claude' : 'codex'].label}
                          <span className="ml-auto font-mono font-medium tabular-nums">
                            {usd.format(Number(value))}
                          </span>
                        </>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                {/* the built-in tween tears when the point count changes across tabs */}
                <Bar
                  dataKey="claude"
                  fill="var(--color-claude)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="codex"
                  fill="var(--color-codex)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          </section>

          <ModelsTable rows={view.rows} />
        </TabsContent>
      )}
    </Tabs>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}
