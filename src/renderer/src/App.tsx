import { useState } from 'react'
import { BookOpen01Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ConfigPage } from '@renderer/features/config/config-page'
import { SkillsPage } from '@renderer/features/skills/skills-page'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@renderer/components/ui/sidebar'

const PAGES = [
  { id: 'skills', label: 'Skills', icon: BookOpen01Icon, content: <SkillsPage /> },
  { id: 'config', label: 'Config', icon: Settings02Icon, content: <ConfigPage /> }
] as const

type PageId = (typeof PAGES)[number]['id']

function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>('skills')

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="h-9 [-webkit-app-region:drag]" />
        <SidebarContent>
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              <SidebarMenu>
                {PAGES.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton isActive={page === item.id} onClick={() => setPage(item.id)}>
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden">
        {PAGES.map((item) => (
          <div
            key={item.id}
            className={page === item.id ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          >
            {item.content}
          </div>
        ))}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
