import { TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { AgentLogo } from '@renderer/components/agent-logos'
import { AGENT_IDS, AGENTS } from '@shared/agent'

// One tab per agent; the value of each trigger is the AgentId itself.
export function AgentTabsList(): React.JSX.Element {
  return (
    <TabsList>
      {AGENT_IDS.map((id) => (
        <TabsTrigger key={id} value={id}>
          <AgentLogo agent={id} />
          {AGENTS[id].label}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
