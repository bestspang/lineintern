import { ReactNode } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  MessageSquare,
  GraduationCap,
  Shield,
  BookOpen, 
  CheckSquare, 
  BarChart3, 
  AlertTriangle, 
  Webhook, 
  Settings,
  TestTube2,
  LogOut,
  Brain,
  Terminal,
  FileText,
  Sparkles
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const navItems = [
  { title: 'Overview', url: '/', icon: LayoutDashboard },
  { title: 'Groups', url: '/groups', icon: MessageSquare },
  { title: 'Users', url: '/users', icon: Users },
  { title: 'Knowledge Base', url: '/knowledge', icon: BookOpen },
  { title: 'FAQ Logs', url: '/faq-logs', icon: MessageSquare },
  { title: 'Training Queue', url: '/training', icon: GraduationCap },
  { title: 'Chat Summaries', url: '/summaries', icon: FileText },
  { title: 'Tasks & Reminders', url: '/tasks', icon: CheckSquare },
  { title: 'Memory Bot', url: '/memory', icon: Brain },
  { title: 'Personality AI', url: '/personality', icon: Sparkles },
  { title: 'Commands', url: '/commands', icon: Terminal },
  { title: 'Analytics', url: '/analytics', icon: BarChart3 },
  { title: 'Reports', url: '/reports', icon: FileText },
  { title: 'Alerts & Logs', url: '/alerts', icon: AlertTriangle },
  { title: 'Safety Rules', url: '/safety-rules', icon: Shield },
  { title: 'Integrations', url: '/integrations', icon: Webhook },
  { title: 'Test Bot', url: '/test-bot', icon: TestTube2 },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar className="border-r">
          <div className="p-4 border-b">
            <h1 className="text-lg font-bold text-primary">LINE Intern</h1>
            <p className="text-xs text-muted-foreground">Control Panel</p>
          </div>
          
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink 
                          to={item.url} 
                          end={item.url === '/'}
                          className="hover:bg-muted/50"
                          activeClassName="bg-muted text-primary font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <div className="p-4 border-t mt-auto">
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </Sidebar>

        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b flex items-center px-4 gap-2 bg-background">
            <SidebarTrigger />
            <div className="ml-auto">
              <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                Sandbox
              </span>
            </div>
          </header>

          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
