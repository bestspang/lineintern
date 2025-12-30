/**
 * ⚠️ CRITICAL NAVIGATION STRUCTURE - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This file defines the main navigation structure for the LINE Intern Control Panel.
 * 
 * INVARIANTS:
 * 1. All navigation items must have corresponding routes in App.tsx
 * 2. Icon imports must match the icon used in navigationGroups
 * 3. Do NOT remove or rename existing navigation items without updating related routes
 * 4. New items should be added at the end of their respective group
 * 
 * COMMON BUGS TO AVOID:
 * - Adding a nav item without a corresponding route = 404 error
 * - Removing a nav item that users bookmark = broken links
 * - Changing URLs breaks existing bookmarks and shared links
 */

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
  Timer,
  Building,
  Calendar,
  Camera,
  Shield,
  Bell,
  Activity,
  AlertTriangle,
  DollarSign,
  CalendarDays,
  UserCog,
  Wallet,
  TrendingUp,
  PartyPopper,
  Radio,
  Trophy,
  Gift
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
import { useUserRole } from '@/hooks/useUserRole';

const navigationGroups = [
  {
    title: 'Dashboard',
    icon: Gauge,
    items: [
      { title: 'Overview', url: '/', icon: LayoutDashboard },
      { title: 'Health Monitoring', url: '/health-monitoring', icon: Activity },
      { title: 'Config Validator', url: '/config-validator', icon: Settings },
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
      { title: 'Broadcast', url: '/broadcast', icon: Radio },
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
      { title: 'Dashboard', url: '/attendance/dashboard', icon: Gauge },
      { title: 'Analytics', url: '/attendance/analytics', icon: BarChart3 },
      { title: 'Live Tracking', url: '/attendance/live-tracking', icon: Activity },
      { title: 'Happy Points', url: '/attendance/happy-points', icon: Trophy },
      { title: 'Rewards', url: '/attendance/rewards', icon: Gift },
      { title: 'Redemptions', url: '/attendance/redemption-approvals', icon: Gift },
      { title: 'Point Transactions', url: '/attendance/point-transactions', icon: Wallet },
      { title: 'Payroll', url: '/attendance/payroll', icon: Wallet },
      { title: 'Payroll YTD', url: '/attendance/payroll/ytd', icon: TrendingUp },
      { title: 'Holidays', url: '/attendance/holidays', icon: PartyPopper },
      { title: 'Employees', url: '/attendance/employees', icon: Users },
      { title: 'Branches', url: '/attendance/branches', icon: Building },
      { title: 'Employee Roles', url: '/attendance/roles', icon: UserCog },
      { title: 'Leave Balance', url: '/attendance/leave-balance', icon: CalendarDays },
      { title: 'Attendance Logs', url: '/attendance/logs', icon: FileText },
      { title: 'Photos', url: '/attendance/photos', icon: Camera },
      { title: 'Fraud Detection', url: '/attendance/fraud-detection', icon: Shield },
      { title: 'OT Requests', url: '/attendance/overtime-requests', icon: Clock },
      { title: 'OT Summary Report', url: '/attendance/overtime-summary', icon: DollarSign },
      { title: 'Early Leave Requests', url: '/attendance/early-leave', icon: AlertTriangle },
      { title: 'Flexible Day-Off', url: '/attendance/flexible-day-off-requests', icon: CalendarDays },
      { title: 'OT Monitoring', url: '/attendance/overtime', icon: Clock },
      { title: 'Daily Summaries', url: '/attendance/summaries', icon: Calendar },
      { title: 'Reminder Logs', url: '/attendance/reminder-logs', icon: Bell },
      { title: 'Settings', url: '/attendance/settings', icon: Settings },
    ],
  },
  {
    title: 'Monitoring & Tools',
    icon: BarChart3,
    items: [
      { title: 'Analytics', url: '/analytics', icon: BarChart3 },
      { title: 'Bot Message Logs', url: '/bot-logs', icon: MessageSquare },
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
  const { canAccessMenuGroup, isLoading: isRoleLoading } = useUserRole();

  // Filter navigation groups based on role permissions
  const filteredNavigationGroups = navigationGroups.filter(group => 
    canAccessMenuGroup(group.title)
  );

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
        <Sidebar className="border-r" collapsible="icon">
          <div className="p-3 sm:p-4 border-b">
            <h1 className="text-base sm:text-lg font-bold text-primary">LINE Intern</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Control Panel</p>
          </div>
          
          <SidebarContent>
            {isRoleLoading ? (
              <div className="flex items-center justify-center p-4">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : filteredNavigationGroups.length === 0 ? (
              // Fallback: Show all menus if filtering returns nothing
              navigationGroups.map((group) => (
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
              ))
            ) : (
              filteredNavigationGroups.map((group) => (
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
              ))
            )}
          </SidebarContent>

          <div className="p-3 sm:p-4 border-t mt-auto">
            <Button 
              variant="ghost" 
              className="w-full justify-start text-sm" 
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              <span>Sign Out</span>
            </Button>
          </div>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 sm:h-14 border-b flex items-center px-3 sm:px-4 gap-2 bg-background shrink-0">
            <SidebarTrigger />
            <div className="ml-auto">
              <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                Sandbox
              </span>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <div className="container max-w-7xl mx-auto p-3 sm:p-4 md:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
