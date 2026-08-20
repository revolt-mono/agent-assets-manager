import { toast } from '@renderer/components/ui/toast'
import { createStore, useStore, type Store } from '@renderer/lib/store'
import { AGENT_IDS, type AgentId } from '@shared/agent'
import type { Skill, SkillBody } from '@shared/skill'

// One store per agent: null until the first load, then the list stays cached
// across tab switches and revalidates in place.
function createSkillsStore(agent: AgentId): Store<Skill[] | null> & { revalidate: () => void } {
  let generation = 0
  const store = createStore<Skill[] | null>(null, () => revalidate())

  function revalidate(): void {
    const id = ++generation
    window.api.skills.list(agent).then(
      (skills) => {
        if (id === generation) store.set(skills)
      },
      () => {
        if (id !== generation) return
        toast.add({ title: 'Could not load skills', type: 'error' })
        store.set([])
      }
    )
  }

  return { ...store, revalidate }
}

const stores = {
  claude: createSkillsStore('claude'),
  codex: createSkillsStore('codex')
} satisfies Record<AgentId, Store<Skill[] | null>>

// Successful body reads are cached per skill until the next on-disk change;
// failed reads resolve null (the detail dialog owns the error message) and
// retry on the next open.
const bodies = new Map<string, Promise<SkillBody | null>>()

window.api.skills.onChanged(() => {
  bodies.clear()
  for (const agent of AGENT_IDS) {
    if (stores[agent].watched()) stores[agent].revalidate()
  }
})

export function useSkills(agent: AgentId): Skill[] | null {
  return useStore(stores[agent])
}

export function loadSkillBody(skill: Skill): Promise<SkillBody | null> {
  const key = `${skill.agent}/${skill.id}`
  const cached = bodies.get(key)
  if (cached) return cached
  const body = window.api.skills.get(skill.agent, skill.id).catch(() => {
    bodies.delete(key)
    return null
  })
  bodies.set(key, body)
  return body
}
