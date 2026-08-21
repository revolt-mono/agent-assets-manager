import { Activity, lazy, Suspense, useState } from 'react'
import { Analytics01Icon, BookOpen01Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ConfigPage } from '@renderer/features/config/config-page'
import { UpdateButton } from '@renderer/components/update-button'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@renderer/components/ui/sidebar'

const PAGES = [
  { id: 'config', label: 'Config', icon: Settings02Icon },
  {
    id: 'skills',
    label: 'Skills',
    icon: BookOpen01Icon,
    Page: lazy(() => import('@renderer/features/skills/skills-page'))
  },
  {
    id: 'usage',
    label: 'Usage',
    icon: Analytics01Icon,
    Page: lazy(() => import('@renderer/features/usage/usage-page'))
  }
] as const

function App(): React.JSX.Element {
  const [page, setPage] = useState<(typeof PAGES)[number]>(PAGES[0])

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar variant="inset" collapsible="icon">
        <div className="h-9 shrink-0 [-webkit-app-region:drag]" />
        <SidebarContent>
          {/* Icon center at 24px sits on the red traffic light center:
              sidebar p-2 (8) + default button p-2 (8) + half of size-4 icon (8). */}
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              <SidebarMenu>
                {PAGES.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton isActive={page.id === item.id} onClick={() => setPage(item)}>
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <UpdateButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden">
        <Activity mode={page.id === 'config' ? 'visible' : 'hidden'}>
          <ConfigPage />
        </Activity>
        {page.id === 'config' ? null : (
          <Suspense
            fallback={
              <div className="grid min-h-0 flex-1 place-items-center">
                <Spinner />
              </div>
            }
          >
            <page.Page />
          </Suspense>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
