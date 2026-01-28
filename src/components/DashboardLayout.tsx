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
  Gift,
  Mail,
  ShoppingBag,
  Receipt,
  PieChart,
  Flag,
  Settings2,
  HelpCircle,
  Cake
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
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { useLocation } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { usePageAccess } from '@/hooks/usePageAccess';
import { Globe } from 'lucide-react';

const navigationGroups = [
  {
    title: 'Dashboard',
    titleTh: 'แดชบอร์ด',
    icon: Gauge,
    items: [
      { title: 'Overview', titleTh: 'ภาพรวม', url: '/', icon: LayoutDashboard },
      { title: 'Branch Report', titleTh: 'รายงานสาขา', url: '/branch-report', icon: TrendingUp },
      { title: 'Health Monitoring', titleTh: 'ตรวจสอบสุขภาพ', url: '/health-monitoring', icon: Activity },
      { title: 'Pre-Deploy Checklist', titleTh: 'เช็คลิสต์ก่อน Deploy', url: '/pre-deploy-checklist', icon: ClipboardCheck },
      { title: 'Feature Flags', titleTh: 'Feature Flags', url: '/feature-flags', icon: Flag },
      { title: 'Config Validator', titleTh: 'ตรวจสอบการตั้งค่า', url: '/config-validator', icon: Settings },
    ],
  },
  {
    title: 'Content & Knowledge',
    titleTh: 'เนื้อหาและความรู้',
    icon: BookOpen,
    items: [
      { title: 'Knowledge Base', titleTh: 'ฐานความรู้', url: '/knowledge', icon: BookOpen },
      { title: 'Portal FAQs', titleTh: 'FAQ พอร์ทัล', url: '/portal-faq-admin', icon: HelpCircle },
      { title: 'FAQ Logs', titleTh: 'บันทึก FAQ', url: '/faq-logs', icon: MessageSquare },
      { title: 'Training Queue', titleTh: 'คิวการฝึก', url: '/training', icon: GraduationCap },
      { title: 'Chat Summaries', titleTh: 'สรุปแชท', url: '/summaries', icon: FileText },
    ],
  },
  {
    title: 'Management',
    titleTh: 'การจัดการ',
    icon: Layers,
    items: [
      { title: 'Groups', titleTh: 'กลุ่ม', url: '/groups', icon: MessageSquare },
      { title: 'Users', titleTh: 'ผู้ใช้', url: '/users', icon: Users },
      { title: 'Direct Messages', titleTh: 'ข้อความโดยตรง', url: '/direct-messages', icon: Mail },
      { title: 'Tasks & Reminders', titleTh: 'งานและการแจ้งเตือน', url: '/tasks', icon: CheckSquare },
      { title: 'Broadcast', titleTh: 'ประกาศ', url: '/broadcast', icon: Radio },
      { title: 'Cron Jobs', titleTh: 'งานตั้งเวลา', url: '/cron-jobs', icon: Clock },
    ],
  },
  {
    title: 'AI Features',
    titleTh: 'ฟีเจอร์ AI',
    icon: Bot,
    items: [
      { title: 'Memory Bot', titleTh: 'บอทความจำ', url: '/memory', icon: Brain },
      { title: 'Personality AI', titleTh: 'บุคลิกภาพ AI', url: '/personality', icon: Sparkles },
      { title: 'Commands', titleTh: 'คำสั่ง', url: '/commands', icon: Terminal },
    ],
  },
  {
    title: 'Attendance',
    titleTh: 'การลงเวลา',
    icon: ClipboardCheck,
    items: [
      { title: 'Dashboard', titleTh: 'แดชบอร์ด', url: '/attendance/dashboard', icon: Gauge },
      { title: 'Analytics', titleTh: 'วิเคราะห์', url: '/attendance/analytics', icon: BarChart3 },
      { title: 'Live Tracking', titleTh: 'ติดตามสด', url: '/attendance/live-tracking', icon: Activity },
      { title: 'Attendance Logs', titleTh: 'บันทึกลงเวลา', url: '/attendance/logs', icon: FileText },
      { title: 'Photos', titleTh: 'รูปภาพ', url: '/attendance/photos', icon: Camera },
      { title: 'Fraud Detection', titleTh: 'ตรวจจับทุจริต', url: '/attendance/fraud-detection', icon: Shield },
      { title: 'Daily Summaries', titleTh: 'สรุปรายวัน', url: '/attendance/summaries', icon: Calendar },
      { title: 'Reminder Logs', titleTh: 'บันทึกแจ้งเตือน', url: '/attendance/reminder-logs', icon: Bell },
      { title: 'Employees', titleTh: 'พนักงาน', url: '/attendance/employees', icon: Users },
      { title: 'Employee Roles', titleTh: 'บทบาทพนักงาน', url: '/attendance/roles', icon: UserCog },
      { title: 'Branches', titleTh: 'สาขา', url: '/attendance/branches', icon: Building },
      { title: 'Settings', titleTh: 'ตั้งค่า', url: '/attendance/settings', icon: Settings },
    ],
  },
  {
    title: 'Schedule & Leaves',
    titleTh: 'กะงานและวันลา',
    icon: Calendar,
    items: [
      { title: 'Shift Templates', titleTh: 'รูปแบบกะ', url: '/attendance/shift-templates', icon: Clock },
      { title: 'Weekly Schedules', titleTh: 'ตารางรายสัปดาห์', url: '/attendance/schedules', icon: Calendar },
      { title: 'Holidays', titleTh: 'วันหยุด', url: '/attendance/holidays', icon: PartyPopper },
      { title: 'Birthdays', titleTh: 'วันเกิด', url: '/attendance/birthdays', icon: Cake },
      { title: 'Leave Balance', titleTh: 'วันลาคงเหลือ', url: '/attendance/leave-balance', icon: CalendarDays },
      { title: 'Early Leave Requests', titleTh: 'คำขอกลับก่อน', url: '/attendance/early-leave-requests', icon: AlertTriangle },
      { title: 'Flexible Day-Off', titleTh: 'วันหยุดยืดหยุ่น', url: '/attendance/flexible-day-off-requests', icon: CalendarDays },
    ],
  },
  {
    title: 'Overtime',
    titleTh: 'ทำงานล่วงเวลา',
    icon: Timer,
    items: [
      { title: 'OT Requests', titleTh: 'คำขอ OT', url: '/attendance/overtime-requests', icon: Clock },
      { title: 'OT Summary Report', titleTh: 'รายงานสรุป OT', url: '/attendance/overtime-summary', icon: DollarSign },
      { title: 'OT Monitoring', titleTh: 'ติดตาม OT', url: '/attendance/overtime-management', icon: Clock },
    ],
  },
  {
    title: 'Payroll',
    titleTh: 'เงินเดือน',
    icon: Wallet,
    items: [
      { title: 'Payroll', titleTh: 'เงินเดือน', url: '/attendance/payroll', icon: Wallet },
      { title: 'Payroll YTD', titleTh: 'เงินเดือนสะสม', url: '/attendance/payroll-ytd', icon: TrendingUp },
      { title: 'Work History', titleTh: 'ประวัติการทำงาน', url: '/attendance/work-history', icon: FileText },
    ],
  },
  {
    title: 'Points & Rewards',
    titleTh: 'แต้มและรางวัล',
    icon: Trophy,
    items: [
      { title: 'Happy Points', titleTh: 'แต้มความสุข', url: '/attendance/happy-points', icon: Trophy },
      { title: 'Point Transactions', titleTh: 'ธุรกรรมแต้ม', url: '/attendance/point-transactions', icon: Wallet },
      { title: 'Point Rules', titleTh: 'เงื่อนไขแต้ม', url: '/attendance/point-rules', icon: Settings2 },
      { title: 'Rewards', titleTh: 'รางวัล', url: '/attendance/rewards', icon: Gift },
      { title: 'Redemption Approvals', titleTh: 'อนุมัติแลกรางวัล', url: '/attendance/redemption-approvals', icon: ShoppingBag },
    ],
  },
  {
    title: 'Deposits',
    titleTh: 'เงินมัดจำ',
    icon: DollarSign,
    items: [
      { title: 'Deposits', titleTh: 'เงินมัดจำ', url: '/attendance/deposits', icon: DollarSign },
      { title: 'Deposit Settings', titleTh: 'ตั้งค่าเงินมัดจำ', url: '/attendance/deposit-settings', icon: Settings },
    ],
  },
  {
    title: 'Receipts',
    titleTh: 'ใบเสร็จ',
    icon: Receipt,
    items: [
      { title: 'All Receipts', titleTh: 'ใบเสร็จทั้งหมด', url: '/receipts', icon: Receipt },
      { title: 'Approval Logs', titleTh: 'บันทึกการอนุมัติ', url: '/receipts/approval-logs', icon: FileText },
      { title: 'Quota Management', titleTh: 'จัดการโควต้า', url: '/receipts/quota', icon: Gauge },
      { title: 'Analytics', titleTh: 'วิเคราะห์', url: '/receipts/analytics', icon: PieChart },
      { title: 'Businesses', titleTh: 'ธุรกิจ', url: '/receipts/businesses', icon: Building },
      { title: 'Export', titleTh: 'ส่งออก', url: '/receipts/export', icon: FileText },
      { title: 'Settings', titleTh: 'ตั้งค่า', url: '/receipts/settings', icon: Settings },
    ],
  },
  {
    title: 'Monitoring & Tools',
    titleTh: 'ตรวจสอบและเครื่องมือ',
    icon: BarChart3,
    items: [
      { title: 'Analytics', titleTh: 'วิเคราะห์', url: '/analytics', icon: BarChart3 },
      { title: 'Bot Message Logs', titleTh: 'บันทึกข้อความบอท', url: '/bot-logs', icon: MessageSquare },
      { title: 'Memory Analytics', titleTh: 'วิเคราะห์หน่วยความจำ', url: '/memory-analytics', icon: Database },
      { title: 'Profile Sync Health', titleTh: 'สุขภาพ Profile Sync', url: '/profile-sync-health', icon: Activity },
      { title: 'Test Bot', titleTh: 'ทดสอบบอท', url: '/test-bot', icon: TestTube2 },
    ],
  },
  {
    title: 'Configuration',
    titleTh: 'การตั้งค่า',
    icon: Settings,
    items: [
      { title: 'Settings', titleTh: 'ตั้งค่า', url: '/settings', icon: Settings },
    ],
  },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const location = useLocation();
  const { locale, setLocale, t } = useLocale();
  const { canAccessMenuGroup, isLoading: isRoleLoading } = useUserRole();
  const { canAccessPage, loading: isPageAccessLoading } = usePageAccess();

  // Helper to get localized title
  const getTitle = (item: { title: string; titleTh?: string }) => {
    return locale === 'th' && item.titleTh ? item.titleTh : item.title;
  };

  // Filter navigation groups based on role permissions
  // Then filter items within each group based on page-level permissions
  const filteredNavigationGroups = navigationGroups
    .filter(group => canAccessMenuGroup(group.title))
    .map(group => ({
      ...group,
      items: group.items.filter(item => canAccessPage(item.url)),
    }))
    .filter(group => group.items.length > 0); // Remove empty groups

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
            {isRoleLoading || isPageAccessLoading ? (
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
                        <span className="flex-1 text-left">{getTitle(group)}</span>
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
                                  <span>{getTitle(item)}</span>
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
                  <SidebarGroup className="py-0 space-y-0">
                    <SidebarGroupLabel asChild>
                      <CollapsibleTrigger className="flex w-full items-center gap-1.5 hover:bg-muted/50 rounded-md px-2 py-0.5 transition-colors text-xs">
                        <group.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 text-left">{getTitle(group)}</span>
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
                                  <span>{getTitle(item)}</span>
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
              <span>{t('ออกจากระบบ', 'Sign Out')}</span>
            </Button>
          </div>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 sm:h-14 border-b flex items-center px-3 sm:px-4 gap-2 bg-background shrink-0">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}
                className="h-7 px-2 text-xs"
              >
                <Globe className="h-3.5 w-3.5 mr-1" />
                {locale === 'th' ? 'EN' : 'TH'}
              </Button>
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
