import { useEffect, useState } from 'react'
import { Download06Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { UpdateState } from '@shared/update'
import { Button } from '@renderer/components/ui/button'

export function UpdateButton(): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => window.api.update.observe(setState), [])
  if (state.status === 'idle') return null

  const downloading = state.status === 'downloading'
  const downloaded = state.status === 'downloaded'
  const title = downloading
    ? `Downloading ${state.version}: ${state.percent}%`
    : downloaded
      ? `Restart to update to ${state.version}`
      : `Download update ${state.version}`

  return (
    <Button
      className="relative w-full overflow-hidden bg-[#007aff] text-white hover:bg-[#007aff]/90 disabled:opacity-100 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!"
      disabled={downloading}
      title={title}
      onClick={() => window.api.update.proceed()}
    >
      {downloading && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-black/15 transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${state.percent}%` }}
        />
      )}
      <HugeiconsIcon
        className="relative z-10"
        icon={downloaded ? Refresh01Icon : Download06Icon}
        strokeWidth={2}
      />
      <span className="relative z-10 truncate group-data-[collapsible=icon]:hidden">
        {downloading
          ? `Downloading ${state.percent}%`
          : downloaded
            ? 'Restart to update'
            : 'Download update'}
      </span>
    </Button>
  )
}
