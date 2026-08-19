import { useEffect, useState } from 'react'
import { Download06Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/ui/button'

export function UpdateButton(): React.JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    // pull current state on mount; a push broadcast can land before this
    // component subscribes, so onReady alone would miss it
    void window.api.update.get().then(setVersion)
    return window.api.update.onReady(setVersion)
  }, [])
  if (version === null) return null

  return (
    <Button
      className="w-full overflow-hidden bg-[#007aff] text-white hover:bg-[#007aff]/90 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!"
      title={`Restart to update to ${version}`}
      onClick={() => window.api.update.install()}
    >
      <HugeiconsIcon icon={Download06Icon} strokeWidth={2} />
      <span className="truncate group-data-[collapsible=icon]:hidden">Restart to update</span>
    </Button>
  )
}
