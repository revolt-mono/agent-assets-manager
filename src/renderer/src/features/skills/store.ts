import { toast } from '@renderer/components/ui/toast'
import { createStore, useStore, type Store } from '@renderer/lib/store'
import { AGENT_IDS, type AgentId } from '@shared/agent'
import type { Skill, SkillBody } from '@shared/skill'

const SKELETON_DELAY_MS = 150

export type SkillsView =
  | { kind: 'blank' }
  | { kind: 'skeleton' }
  | { kind: 'loaded'; skills: Skill[] }

// One store per agent: a loaded list stays cached across tab switches and
// revalidates in place, so only a never-loaded agent goes blank, then to the
// skeleton once the load has been pending past SKELETON_DELAY_MS.
function createSkillsStore(agent: AgentId): Store<SkillsView> & { revalidate: () => void } {
  let generation = 0
  const store = createStore<SkillsView>({ kind: 'blank' }, () => revalidate())

  function revalidate(): void {
    const id = ++generation
    setTimeout(() => {
      if (id === generation && store.get().kind === 'blank') store.set({ kind: 'skeleton' })
    }, SKELETON_DELAY_MS)
    window.api.skills.list(agent).then(
      (skills) => {
        if (id === generation) store.set({ kind: 'loaded', skills })
      },
      () => {
        if (id !== generation) return
        toast.add({ title: 'Could not load skills', type: 'error' })
        store.set({ kind: 'loaded', skills: [] })
      }
    )
  }

  return { ...store, revalidate }
}

const stores = {
  claude: createSkillsStore('claude'),
  codex: createSkillsStore('codex')
} satisfies Record<AgentId, Store<SkillsView>>

// Successful body reads are cached per skill until the next on-disk change;
// failed reads retry on the next open.
const bodies = new Map<string, Promise<SkillBody | null>>()

window.api.skills.onChanged(() => {
  bodies.clear()
  for (const agent of AGENT_IDS) {
    if (stores[agent].watched()) stores[agent].revalidate()
  }
})

export function useSkills(agent: AgentId): SkillsView {
  return useStore(stores[agent])
}

export function loadSkillBody(skill: Skill): Promise<SkillBody | null> {
  const key = `${skill.agent}/${skill.id}`
  const cached = bodies.get(key)
  if (cached) return cached
  const body = window.api.skills.get(skill.agent, skill.id).catch(() => {
    bodies.delete(key)
    toast.add({ title: 'Could not open skill', type: 'error' })
    return null
  })
  bodies.set(key, body)
  return body
}
