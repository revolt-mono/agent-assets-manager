import type { ReactNode } from 'react'

// Every page's top strip doubles as the window drag region beside the traffic
// lights, so interactive children must opt back out of dragging; this is the
// one place that owns the -webkit-app-region pairing.
export function PageHeader({
  children,
  actions
}: {
  children: ReactNode
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between px-4 [-webkit-app-region:drag]">
      <div className="[-webkit-app-region:no-drag]">{children}</div>
      {actions !== undefined && <div className="[-webkit-app-region:no-drag]">{actions}</div>}
    </header>
  )
}
