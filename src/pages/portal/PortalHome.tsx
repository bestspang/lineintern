import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, Calendar, History, FileText, Users, Camera,
  ChevronRight, CalendarPlus, ClipboardList, TrendingUp
} from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { cn } from '@/lib/utils';

interface QuickAction {
  icon: typeof Clock;
  label: string;
  labelEn: string;
  description: string;
  descriptionEn: string;
  path: string;
  color: string;
  roles?: string[];
}

const quickActions: QuickAction[] = [
  {
    icon: History,
    label: 'ประวัติการทำงาน',
    labelEn: 'Work History',
    description: 'ดูประวัติเช็คอิน/เอาท์',
    descriptionEn: 'View check-in/out history',
    path: '/portal/my-history',
    color: 'from-blue-500 to-blue-600',
  },
  {
    icon: Calendar,
    label: 'วันลาคงเหลือ',
    labelEn: 'Leave Balance',
    description: 'ตรวจสอบวันลาที่เหลือ',
    descriptionEn: 'Check remaining leave days',
    path: '/portal/my-leave',
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    icon: CalendarPlus,
    label: 'ขอลางาน',
    labelEn: 'Request Leave',
    description: 'ส่งคำขอลางาน',
    descriptionEn: 'Submit leave request',
    path: '/portal/request-leave',
    color: 'from-violet-500 to-violet-600',
  },
  {
    icon: Clock,
    label: 'ขอ OT',
    labelEn: 'Request OT',
    description: 'ส่งคำขอทำ OT',
    descriptionEn: 'Submit OT request',
    path: '/portal/request-ot',
    color: 'from-orange-500 to-orange-600',
  },
];

const managerActions: QuickAction[] = [
  {
    icon: ClipboardList,
    label: 'อนุมัติคำขอ',
    labelEn: 'Approve Requests',
    description: 'OT และการลา',
    descriptionEn: 'OT and leave requests',
    path: '/portal/approvals',
    color: 'from-amber-500 to-amber-600',
    roles: ['manager', 'supervisor', 'admin', 'owner'],
  },
  {
    icon: Users,
    label: 'สรุปทีม',
    labelEn: 'Team Summary',
    description: 'ดูสถานะทีมวันนี้',
    descriptionEn: 'View team status today',
    path: '/portal/team-summary',
    color: 'from-cyan-500 to-cyan-600',
    roles: ['manager', 'supervisor', 'admin', 'owner'],
  },
];

const adminActions: QuickAction[] = [
  {
    icon: Camera,
    label: 'รูปวันนี้',
    labelEn: "Today's Photos",
    description: 'ดูรูปเช็คอินวันนี้',
    descriptionEn: "View today's check-in photos",
    path: '/portal/photos',
    color: 'from-pink-500 to-pink-600',
    roles: ['admin', 'owner'],
  },
  {
    icon: TrendingUp,
    label: 'สรุปประจำวัน',
    labelEn: 'Daily Summary',
    description: 'สถิติและรายงาน',
    descriptionEn: 'Statistics and reports',
    path: '/portal/daily-summary',
    color: 'from-indigo-500 to-indigo-600',
    roles: ['admin', 'owner'],
  },
];

export default function PortalHome() {
  const navigate = useNavigate();
  const { employee, locale, isManager, isAdmin } = usePortal();

  const roleKey = employee?.role?.role_key?.toLowerCase() || '';

  // Filter actions based on role
  const visibleManagerActions = managerActions.filter(
    (action) => !action.roles || action.roles.includes(roleKey)
  );
  const visibleAdminActions = adminActions.filter(
    (action) => !action.roles || action.roles.includes(roleKey)
  );

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="text-center py-4">
        <h2 className="text-2xl font-bold">
          {locale === 'th' ? 'สวัสดี' : 'Hello'}, {employee?.full_name?.split(' ')[0] || 'User'}! 👋
        </h2>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? 'เลือกเมนูที่ต้องการ' : 'Choose what you need'}
        </p>
      </div>

      {/* Quick Actions Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
          {locale === 'th' ? 'เมนูของฉัน' : 'My Menu'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Card
                key={action.path}
                className="cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-[0.98] overflow-hidden group"
                onClick={() => navigate(action.path)}
              >
                <CardContent className="p-4">
                  <div className={cn(
                    'h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3 group-hover:scale-110 transition-transform',
                    action.color
                  )}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h4 className="font-semibold text-sm">
                    {locale === 'th' ? action.label : action.labelEn}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {locale === 'th' ? action.description : action.descriptionEn}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Manager Actions */}
      {visibleManagerActions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-2">
            {locale === 'th' ? 'หัวหน้างาน' : 'Manager'}
            <Badge variant="secondary" className="text-[10px]">
              {locale === 'th' ? 'เฉพาะสิทธิ์' : 'Authorized'}
            </Badge>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {visibleManagerActions.map((action) => {
              const Icon = action.icon;
              return (
                <Card
                  key={action.path}
                  className="cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-[0.98] overflow-hidden group border-amber-200/50"
                  onClick={() => navigate(action.path)}
                >
                  <CardContent className="p-4">
                    <div className={cn(
                      'h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3 group-hover:scale-110 transition-transform',
                      action.color
                    )}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <h4 className="font-semibold text-sm">
                      {locale === 'th' ? action.label : action.labelEn}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {locale === 'th' ? action.description : action.descriptionEn}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin Actions */}
      {visibleAdminActions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-2">
            {locale === 'th' ? 'ผู้ดูแลระบบ' : 'Admin'}
            <Badge variant="destructive" className="text-[10px]">
              Admin
            </Badge>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {visibleAdminActions.map((action) => {
              const Icon = action.icon;
              return (
                <Card
                  key={action.path}
                  className="cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-[0.98] overflow-hidden group border-destructive/20"
                  onClick={() => navigate(action.path)}
                >
                  <CardContent className="p-4">
                    <div className={cn(
                      'h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3 group-hover:scale-110 transition-transform',
                      action.color
                    )}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <h4 className="font-semibold text-sm">
                      {locale === 'th' ? action.label : action.labelEn}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {locale === 'th' ? action.description : action.descriptionEn}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4 pb-2">
        <p className="text-xs text-muted-foreground">
          {locale === 'th' 
            ? '🏢 Employee Portal • เข้าถึงผ่าน LINE เท่านั้น'
            : '🏢 Employee Portal • Access via LINE only'}
        </p>
      </div>
    </div>
  );
}
