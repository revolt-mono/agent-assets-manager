import { useEffect, useState } from 'react'
import { CubeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@renderer/components/ui/empty'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@renderer/components/ui/item'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { toast } from '@renderer/components/ui/toast'
import { AgentLogo } from '@renderer/components/agent-logos'
import { SkillDetail } from '@renderer/features/skills/skill-detail'
import { AGENT_IDS, AGENTS, parseAgent, type AgentId, type Skill } from '@shared/skill'

const SKELETON_DELAY_MS = 150

type SkillsView =
  | { kind: 'pending'; slow: boolean }
  | { kind: 'loaded'; agent: AgentId; skills: Skill[] }

// Stale-while-revalidate: on agent switch the previous list keeps rendering
// until the new one arrives; the skeleton appears only past SKELETON_DELAY_MS.
function useSkillsView(agent: AgentId): SkillsView {
  const [loaded, setLoaded] = useState<{ agent: AgentId; skills: Skill[] } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const skills = await window.api.skills.list(agent)
        if (!cancelled) setLoaded({ agent, skills })
      } catch {
        if (cancelled) return
        toast.add({ title: 'Could not load skills', type: 'error' })
        setLoaded({ agent, skills: [] })
      }
    }

    void load()
    const unsubscribe = window.api.skills.onChanged(() => void load())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [agent])

  const loading = loaded?.agent !== agent
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    const timer = setTimeout(() => setSlow(true), SKELETON_DELAY_MS)
    return () => clearTimeout(timer)
  }, [loading])

  if (loaded && (loaded.agent === agent || !slow)) {
    return { kind: 'loaded', agent: loaded.agent, skills: loaded.skills }
  }
  return { kind: 'pending', slow }
}

export function SkillsPage(): React.JSX.Element {
  const [agent, setAgent] = useState<AgentId>(AGENT_IDS[0])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const view = useSkillsView(agent)
  const selected =
    view.kind === 'loaded' ? (view.skills.find((skill) => skill.id === selectedId) ?? null) : null

  return (
    <>
      <Tabs
        value={agent}
        onValueChange={(value) => {
          if (value == null) return
          setAgent(parseAgent(value))
          setSelectedId(null)
        }}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <header className="flex h-12 shrink-0 items-center px-4 [-webkit-app-region:drag]">
          <TabsList className="[-webkit-app-region:no-drag]">
            {AGENT_IDS.map((id) => (
              <TabsTrigger key={id} value={id}>
                <AgentLogo agent={id} />
                {AGENTS[id].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>

        <TabsContent
          value={agent}
          className="scroll-fade my-2 flex min-h-0 flex-col overflow-y-auto px-4 pb-2"
        >
          {view.kind === 'pending' ? (
            view.slow ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Array.from({ length: 8 }, (_, index) => (
                  <Item key={index} className="py-3">
                    <ItemMedia>
                      <Skeleton className="size-10" />
                    </ItemMedia>
                    <ItemContent className="gap-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-full" />
                    </ItemContent>
                  </Item>
                ))}
              </div>
            ) : null
          ) : view.skills.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No {AGENTS[view.agent].label} skills</EmptyTitle>
                <EmptyDescription>
                  Put a folder with <code>SKILL.md</code> in{' '}
                  <code>~/{AGENTS[view.agent].skillsDir.join('/')}</code>.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {view.skills.map((skill) => (
                <Item
                  key={skill.id}
                  render={<button type="button" onClick={() => setSelectedId(skill.id)} />}
                  className="cursor-pointer py-3 hover:bg-muted/80"
                >
                  <ItemMedia className="size-10">
                    <HugeiconsIcon icon={CubeIcon} strokeWidth={2} className="size-5" />
                  </ItemMedia>
                  <ItemContent className="gap-0.5">
                    <ItemTitle>{skill.name}</ItemTitle>
                    <ItemDescription>{skill.description}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <SkillDetail skill={selected} onClose={() => setSelectedId(null)} />
    </>
  )
}
