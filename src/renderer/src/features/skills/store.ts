import { Effect } from 'effect'
import { toast } from '@renderer/components/ui/toast'
import { createStore, latestWins, useStore } from '@renderer/lib/store'
import type { AgentId } from '@shared/agent'
import type { Skill, SkillBody } from '@shared/skill'

export type SkillsState =
  | { kind: 'blank' }
  | { kind: 'skeleton' }
  | { kind: 'loaded'; skills: Record<AgentId, Skill[]> }

const store = createStore<SkillsState>({ kind: 'blank' }, revalidate)
// A newer revalidate interrupts the in-flight one, so its results (and
// error toasts) are discarded.
const inflight = latestWins()

const listSkills = (agent: AgentId) =>
  Effect.tryPromise(() => window.api.skills.list(agent)).pipe(
    Effect.catch(() =>
      Effect.sync((): Skill[] => {
        toast.add({ title: 'Could not load skills', type: 'error' })
        return []
      })
    )
  )

const loadAll = Effect.gen(function* () {
  const skills = yield* Effect.all(
    { claude: listSkills('claude'), codex: listSkills('codex') },
    { concurrency: 'unbounded' }
  )
  store.set({ kind: 'loaded', skills })
})

function revalidate(): void {
  inflight.fork(loadAll)

  // only the very first load shows a skeleton, and only once it feels slow
  setTimeout(() => {
    if (store.get().kind === 'blank') store.set({ kind: 'skeleton' })
  }, 150)
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

// Returns a Promise (not an Effect) because the detail dialog reads it with
// React's use() hook, which needs a stable thenable per open.
export function loadSkillBody(skill: Skill): Promise<SkillBody | null> {
  const key = `${skill.agent}/${skill.id}`
  const cached = bodies.get(key)
  if (cached) return cached
  const body = window.api.skills.get(skill.agent, skill.id).catch((): null => {
    bodies.delete(key)
    return null
  })
  bodies.set(key, body)
  return body
}
