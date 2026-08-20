import { useEffect, useState } from 'react'
import { CheckmarkCircle04Icon, Download06Icon, Exchange01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { UpdateState } from '@shared/update'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'

export function UpdateButton(): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => window.api.update.observe(setState), [])
  if (state.status === 'idle') return null

  const title =
    state.status === 'downloading'
      ? `Downloading ${state.version}: ${state.percent}%`
      : state.status === 'downloaded'
        ? `Restart to update to ${state.version}`
        : `Download update ${state.version}`

  return (
    <Button
      className="relative w-full overflow-hidden bg-[#007aff] text-white hover:bg-[#007aff]/90 disabled:opacity-100 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!"
      disabled={state.status === 'downloading'}
      title={title}
      onClick={() => window.api.update.proceed()}
    >
      {state.status === 'downloading' && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-black/15 transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${state.percent}%` }}
        />
      )}
      {state.status === 'downloading' ? (
        <Spinner className="relative z-10" icon={Exchange01Icon} />
      ) : (
        <HugeiconsIcon
          className="relative z-10"
          icon={state.status === 'downloaded' ? CheckmarkCircle04Icon : Download06Icon}
          strokeWidth={2}
        />
      )}
      <span className="relative z-10 truncate group-data-[collapsible=icon]:hidden">
        {state.status === 'downloading'
          ? `Downloading ${state.percent}%`
          : state.status === 'downloaded'
            ? 'Restart to update'
            : 'Download update'}
      </span>
    </Button>
  )
}
