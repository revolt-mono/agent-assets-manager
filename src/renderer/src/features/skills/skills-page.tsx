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

export function SkillsPage(): React.JSX.Element {
  const [agent, setAgent] = useState<AgentId>(AGENT_IDS[0])
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const next = await window.api.skills.list(agent)
        if (!cancelled) setSkills(next)
      } catch {
        if (!cancelled) toast.add({ title: 'Could not load skills', type: 'error' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    setLoading(true)
    void load()
    return window.api.skills.onChanged(() => {
      void load()
    })
  }, [agent])

  const selected = skills.find((skill) => skill.id === selectedId) ?? null

  return (
    <>
      <Tabs
        value={agent}
        onValueChange={(value) => {
          if (value == null) return
          setAgent(parseAgent(value))
          setSelectedId(null)
        }}
        className="flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden"
      >
        <header className="flex h-12 shrink-0 items-center gap-2 px-4 [-webkit-app-region:drag]">
          <TabsList className="[-webkit-app-region:no-drag]">
            {AGENT_IDS.map((id) => (
              <TabsTrigger key={id} value={id}>
                <AgentLogo agent={id} />
                {AGENTS[id].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>

        <TabsContent value={agent} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="scroll-fade min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-4">
            {loading ? (
              <div className="grid grid-cols-1 gap-x-12 gap-y-2 md:grid-cols-2">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="flex items-center gap-3 px-3 py-2.5">
                    <Skeleton className="size-10" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : skills.length === 0 ? (
              <Empty className="min-h-80">
                <EmptyHeader>
                  <EmptyTitle>No {AGENTS[agent].label} skills</EmptyTitle>
                  <EmptyDescription>
                    Put a folder with <code>SKILL.md</code> in{' '}
                    <code>~/{AGENTS[agent].skillsDir.join('/')}</code>.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid grid-cols-1 gap-x-12 gap-y-1 md:grid-cols-2">
                {skills.map((skill) => (
                  <Item
                    key={skill.id}
                    render={<button type="button" onClick={() => setSelectedId(skill.id)} />}
                    className="cursor-pointer px-3 py-3 hover:bg-muted/80"
                  >
                    <ItemMedia className="flex size-10 items-center justify-center">
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
          </div>
        </TabsContent>
      </Tabs>

      <SkillDetail
        skill={selected}
        onClose={() => setSelectedId(null)}
        onUninstalled={(id) => {
          setSkills((current) => current.filter((skill) => skill.id !== id))
          setSelectedId(null)
        }}
      />
    </>
  )
}
