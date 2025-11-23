import { ReactNode } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  MessageSquare,
  GraduationCap,
  BookOpen, 
  CheckSquare, 
  BarChart3, 
  Settings,
  TestTube2,
  LogOut,
  Brain,
  Terminal,
  FileText,
  Sparkles,
  Clock,
  Layers,
  Bot,
  Gauge,
  Database,
  ClipboardCheck,
  Building,
  Calendar
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useLocation } from 'react-router-dom';

const navigationGroups = [
  {
    title: 'Dashboard',
    icon: Gauge,
    items: [
      { title: 'Overview', url: '/', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Content & Knowledge',
    icon: BookOpen,
    items: [
      { title: 'Knowledge Base', url: '/knowledge', icon: BookOpen },
      { title: 'FAQ Logs', url: '/faq-logs', icon: MessageSquare },
      { title: 'Training Queue', url: '/training', icon: GraduationCap },
      { title: 'Chat Summaries', url: '/summaries', icon: FileText },
    ],
  },
  {
    title: 'Management',
    icon: Layers,
    items: [
      { title: 'Groups', url: '/groups', icon: MessageSquare },
      { title: 'Users', url: '/users', icon: Users },
      { title: 'Tasks & Reminders', url: '/tasks', icon: CheckSquare },
      { title: 'Cron Jobs', url: '/cron-jobs', icon: Clock },
    ],
  },
  {
    title: 'AI Features',
    icon: Bot,
    items: [
      { title: 'Memory Bot', url: '/memory', icon: Brain },
      { title: 'Personality AI', url: '/personality', icon: Sparkles },
      { title: 'Commands', url: '/commands', icon: Terminal },
    ],
  },
  {
    title: 'Attendance',
    icon: ClipboardCheck,
    items: [
      { title: 'Analytics', url: '/attendance/analytics', icon: BarChart3 },
      { title: 'Employees', url: '/attendance/employees', icon: Users },
      { title: 'Branches', url: '/attendance/branches', icon: Building },
      { title: 'Attendance Logs', url: '/attendance/logs', icon: FileText },
      { title: 'Daily Summaries', url: '/attendance/summaries', icon: Calendar },
      { title: 'Settings', url: '/attendance/settings', icon: Settings },
    ],
  },
  {
    title: 'Monitoring & Tools',
    icon: BarChart3,
    items: [
      { title: 'Analytics', url: '/analytics', icon: BarChart3 },
      { title: 'Memory Analytics', url: '/memory-analytics', icon: Database },
      { title: 'Test Bot', url: '/test-bot', icon: TestTube2 },
    ],
  },
  {
    title: 'Configuration',
    icon: Settings,
    items: [
      { title: 'Settings', url: '/settings', icon: Settings },
    ],
  },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const location = useLocation();

  // Check if any item in a group is active
  const isGroupActive = (items: typeof navigationGroups[0]['items']) => {
    return items.some(item => {
      if (item.url === '/') {
        return location.pathname === '/';
      }
      return location.pathname.startsWith(item.url);
    });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar className="border-r">
          <div className="p-4 border-b">
            <h1 className="text-lg font-bold text-primary">LINE Intern</h1>
            <p className="text-xs text-muted-foreground">Control Panel</p>
          </div>
          
          <SidebarContent>
            {navigationGroups.map((group) => (
              <Collapsible
                key={group.title}
                defaultOpen={isGroupActive(group.items)}
                className="group/collapsible"
              >
                <SidebarGroup>
                  <SidebarGroupLabel asChild>
                    <CollapsibleTrigger className="flex w-full items-center gap-2 hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors">
                      <group.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-left">{group.title}</span>
                      <svg
                        className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-90"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {group.items.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild>
                              <NavLink 
                                to={item.url} 
                                end={item.url === '/'}
                                className="hover:bg-muted/50 pl-6"
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
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            ))}
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

          <main className="flex-1 overflow-auto">
            <div className="container max-w-7xl mx-auto p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
