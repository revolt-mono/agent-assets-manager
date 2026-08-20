import { toast } from '@renderer/components/ui/toast'
import { createStore, useStore } from '@renderer/lib/store'
import type { AgentId } from '@shared/agent'
import type { Skill, SkillBody } from '@shared/skill'

export type SkillsState =
  | { kind: 'blank' }
  | { kind: 'skeleton' }
  | { kind: 'loaded'; skills: Record<AgentId, Skill[]> }

let generation = 0
const store = createStore<SkillsState>({ kind: 'blank' }, revalidate)

function revalidate(): void {
  const id = ++generation

  setTimeout(() => {
    if (id === generation && store.get().kind === 'blank') store.set({ kind: 'skeleton' })
  }, 150)

  function load(agent: AgentId): Promise<Skill[]> {
    return window.api.skills.list(agent).catch(() => {
      if (id === generation) toast.add({ title: 'Could not load skills', type: 'error' })
      return []
    })
  }

  void Promise.all([load('claude'), load('codex')]).then(([claude, codex]) => {
    if (id !== generation) return
    store.set({ kind: 'loaded', skills: { claude, codex } })
  })
}

// Successful body reads are cached per skill until the next on-disk change;
// failed reads resolve null (the detail dialog owns the error message) and
// retry on the next open.
const bodies = new Map<string, Promise<SkillBody | null>>()

window.api.skills.onChanged(() => {
  bodies.clear()
  if (store.watched()) revalidate()
})

export function useSkills(): SkillsState {
  return useStore(store)
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
