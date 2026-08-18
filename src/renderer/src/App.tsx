import { BookOpen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SkillsPage } from '@renderer/skills-page'
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

function App(): React.JSX.Element {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="h-9 [-webkit-app-region:drag]" />
        <SidebarContent>
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={2} />
                    <span>Skills</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden">
        <SkillsPage />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
