import { useEffect, useState } from 'react'
import { CubeIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SkillDetail } from '@renderer/components/skill-detail'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@renderer/components/ui/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@renderer/components/ui/item'
import { SidebarTrigger } from '@renderer/components/ui/sidebar'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { toast } from '@renderer/components/ui/toast'
import { AGENTS, parseAgent, type AgentId, type Skill } from '@shared/skill'

export function SkillsPage(): React.JSX.Element {
  const [agent, setAgent] = useState<AgentId>('codex')
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

  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    const next = await window.api.skills.setEnabled(agent, id, enabled)
    setSkills((current) => current.map((skill) => (skill.id === id ? next : skill)))
  }

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
        <header className="flex h-12 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <TabsList>
            {Object.values(AGENTS).map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>

        <TabsContent
          value={agent}
          className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-4"
        >
          <div className="scroll-fade min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="grid grid-cols-1 gap-x-12 gap-y-2 md:grid-cols-2">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="flex items-center gap-3 px-3 py-2.5">
                    <Skeleton className="size-10 rounded-xl" />
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
                    <code>{AGENTS[agent].skillsDir}</code>.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid grid-cols-1 gap-x-12 gap-y-1 md:grid-cols-2">
                {skills.map((skill) => (
                  <Item
                    key={skill.id}
                    render={<button type="button" onClick={() => setSelectedId(skill.id)} />}
                    className="cursor-pointer rounded-xl border-transparent px-3 py-3 hover:bg-muted/80"
                  >
                    <ItemMedia className="flex size-10 items-center justify-center rounded-xl bg-muted shadow-none">
                      <HugeiconsIcon icon={CubeIcon} strokeWidth={2} className="size-5" />
                    </ItemMedia>
                    <ItemContent className="gap-0.5">
                      <ItemTitle className="text-sm font-semibold">{skill.name}</ItemTitle>
                      <ItemDescription className="line-clamp-1">
                        {skill.description}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {skill.enabled ? (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          strokeWidth={2}
                          className="size-4 text-muted-foreground"
                        />
                      ) : null}
                    </ItemActions>
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
        onEnabledChange={setEnabled}
        onUninstalled={(id) => {
          setSkills((current) => current.filter((skill) => skill.id !== id))
          setSelectedId(null)
        }}
      />
    </>
  )
}
