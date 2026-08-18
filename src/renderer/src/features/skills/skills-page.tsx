import { useEffect, useMemo, useRef, useState } from 'react'
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
import { AgentLogo } from '@renderer/components/agent-logos'
import { SkillDetail } from '@renderer/features/skills/skill-detail'
import { loadSkillBody, useSkills } from '@renderer/features/skills/store'
import { AGENT_IDS, AGENTS, parseAgent, type AgentId } from '@shared/agent'
import type { Skill, SkillBody } from '@shared/skill'

const SKELETON_DELAY_MS = 150

type SkillsView =
  | { kind: 'blank' }
  | { kind: 'skeleton' }
  | { kind: 'loaded'; agent: AgentId; skills: Skill[] }

// Stale-while-revalidate across tabs: a cold tab keeps the last loaded list
// (tagged with its agent, so labels stay truthful) on screen until its own
// list arrives; the skeleton takes over once the load has been pending past
// SKELETON_DELAY_MS. Blank only ever shows before the very first load.
function useSkillsView(agent: AgentId): SkillsView {
  const skills = useSkills(agent)
  const last = useRef<{ agent: AgentId; skills: Skill[] } | null>(null)
  if (skills) last.current = { agent, skills }

  const pending = skills === null
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!pending) {
      setSlow(false)
      return
    }
    const timer = setTimeout(() => setSlow(true), SKELETON_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pending])

  return useMemo(() => {
    if (skills) return { kind: 'loaded', agent, skills }
    if (slow) return { kind: 'skeleton' }
    return last.current ? { kind: 'loaded', ...last.current } : { kind: 'blank' }
  }, [skills, agent, slow])
}

export function SkillsPage(): React.JSX.Element {
  const [agent, setAgent] = useState<AgentId>(AGENT_IDS[0])
  const [opened, setOpened] = useState<{ id: string; body: Promise<SkillBody | null> } | null>(null)
  const view = useSkillsView(agent)

  // Memoized so the pair keeps its identity across re-renders; the dialog
  // closes by itself when the skill disappears from the list.
  const selection = useMemo(() => {
    if (!opened || view.kind !== 'loaded') return null
    const skill = view.skills.find((candidate) => candidate.id === opened.id)
    return skill ? { skill, body: opened.body } : null
  }, [view, opened])

  const openSkill = (skill: Skill): void => {
    setOpened({ id: skill.id, body: loadSkillBody(skill) })
  }

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
          {view.kind === 'blank' ? null : view.kind === 'skeleton' ? (
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
                  render={<button type="button" onClick={() => openSkill(skill)} />}
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
