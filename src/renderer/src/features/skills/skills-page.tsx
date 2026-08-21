import { useMemo, useState } from 'react'
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
import { Tabs, TabsContent } from '@renderer/components/ui/tabs'
import { AgentTabsList } from '@renderer/components/agent-tabs'
import { PageHeader } from '@renderer/components/page-header'
import { SkillDetail } from '@renderer/features/skills/skill-detail'
import { loadSkillBody, useSkills } from '@renderer/features/skills/store'
import { AGENT_IDS, AGENTS, parseAgent, type AgentId } from '@shared/agent'
import type { SkillBody } from '@shared/skill'

export default function SkillsPage(): React.JSX.Element {
  const [agent, setAgent] = useState<AgentId>(AGENT_IDS[0])
  const [opened, setOpened] = useState<{ id: string; body: Promise<SkillBody | null> } | null>(null)
  const state = useSkills()

  // Memoized so the pair keeps its identity across re-renders; the dialog
  // closes by itself when the skill disappears from the list.
  const selection = useMemo(() => {
    if (!opened || state.kind !== 'loaded') return null
    const skill = state.skills[agent].find((candidate) => candidate.id === opened.id)
    return skill ? { skill, body: opened.body } : null
  }, [agent, opened, state])

  return (
    <>
      <Tabs
        value={agent}
        onValueChange={(value) => {
          if (value == null) return
          setAgent(parseAgent(value))
          setOpened(null)
        }}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <PageHeader>
          <AgentTabsList />
        </PageHeader>

        <TabsContent
          value={agent}
          className="scroll-fade my-2 flex min-h-0 flex-col overflow-y-auto px-4 pb-2"
        >
          {state.kind === 'blank' ? null : state.kind === 'skeleton' ? (
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
          ) : state.skills[agent].length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No {AGENTS[agent].label} skills</EmptyTitle>
                <EmptyDescription>
                  Put a folder with <code>SKILL.md</code> in{' '}
                  <code>~/{AGENTS[agent].skillsDir.join('/')}</code>.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {state.skills[agent].map((skill) => (
                <Item
                  key={skill.id}
                  render={
                    <button
                      type="button"
                      onClick={() => setOpened({ id: skill.id, body: loadSkillBody(skill) })}
                    />
                  }
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

      <SkillDetail selection={selection} onClose={() => setOpened(null)} />
    </>
  )
}
