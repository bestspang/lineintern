import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Clock, Calendar, History, Users, Camera,
  CalendarPlus, ClipboardList, TrendingUp, LogIn, LogOut,
  Receipt, Gift, Banknote, FileText, Coins, CalendarDays,
  Wallet, Trophy, Building2, BarChart3, ReceiptText
} from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { cn } from '@/lib/utils';
import { portalApi } from '@/lib/portal-api';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useFavorites } from '@/hooks/useFavorites';
import { FavoriteButton } from '@/components/portal/FavoriteButton';

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
    icon: CalendarDays,
    label: 'ตารางกะ',
    labelEn: 'My Schedule',
    description: 'ดูตารางกะประจำสัปดาห์',
    descriptionEn: 'View weekly schedule',
    path: '/portal/my-schedule',
    color: 'from-sky-500 to-sky-600',
  },
  {
    icon: Wallet,
    label: 'Payroll ของฉัน',
    labelEn: 'My Payroll',
    description: 'ดูรายได้ประมาณการ',
    descriptionEn: 'View estimated earnings',
    path: '/portal/my-payroll',
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    icon: Calendar,
    label: 'วันลาคงเหลือ',
    labelEn: 'Leave Balance',
    description: 'ตรวจสอบวันลาที่เหลือ',
    descriptionEn: 'Check remaining leave days',
    path: '/portal/my-leave',
    color: 'from-teal-500 to-teal-600',
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
  {
    icon: Receipt,
    label: 'ใบเสร็จของฉัน',
    labelEn: 'My Receipts',
    description: 'ดูและจัดการใบเสร็จ',
    descriptionEn: 'View & manage receipts',
    path: '/portal/my-receipts',
    color: 'from-cyan-500 to-cyan-600',
  },
  {
    icon: Trophy,
    label: 'Leaderboard',
    labelEn: 'Leaderboard',
    description: 'อันดับแต้มในทีม',
    descriptionEn: 'Team point rankings',
    path: '/portal/leaderboard',
    color: 'from-amber-500 to-amber-600',
  },
  {
    icon: Gift,
    label: 'แลกรางวัล',
    labelEn: 'Rewards',
    description: 'ใช้แต้มแลกของรางวัล',
    descriptionEn: 'Redeem rewards',
    path: '/portal/rewards',
    color: 'from-pink-500 to-pink-600',
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
    roles: ['manager', 'supervisor', 'admin', 'owner', 'hr'],
  },
  {
    icon: Banknote,
    label: 'ตรวจสอบใบฝาก',
    labelEn: 'Review Deposits',
    description: 'ตรวจสอบใบฝากเงินสาขา',
    descriptionEn: 'Review branch deposits',
    path: '/portal/deposit-review-list',
    color: 'from-green-500 to-green-600',
    roles: ['manager', 'admin', 'owner'],
  },
  {
    icon: Building2,
    label: 'รายงานสาขา',
    labelEn: 'Branch Report',
    description: 'ดูยอดขายและสถิติสาขา',
    descriptionEn: 'View branch sales & stats',
    path: '/portal/branch-report',
    color: 'from-indigo-500 to-indigo-600',
    roles: ['manager', 'admin', 'owner'],
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
    color: 'from-rose-500 to-rose-600',
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
  {
    icon: Users,
    label: 'จัดการพนักงาน',
    labelEn: 'Manage Employees',
    description: 'ดูข้อมูลพนักงาน',
    descriptionEn: 'View employee data',
    path: '/portal/employees',
    color: 'from-blue-500 to-blue-600',
    roles: ['admin', 'owner'],
  },
  {
    icon: ReceiptText,
    label: 'จัดการใบเสร็จ',
    labelEn: 'Receipt Management',
    description: 'ตรวจสอบและอนุมัติใบเสร็จ',
    descriptionEn: 'Review and approve receipts',
    path: '/portal/receipt-management',
    color: 'from-teal-500 to-teal-600',
    roles: ['admin', 'owner'],
  },
  {
    icon: BarChart3,
    label: 'วิเคราะห์ใบเสร็จ',
    labelEn: 'Receipt Analytics',
    description: 'สถิติและรายงานใบเสร็จ',
    descriptionEn: 'Receipt statistics and reports',
    path: '/portal/receipt-analytics',
    color: 'from-violet-500 to-violet-600',
    roles: ['admin', 'owner'],
  },
  {
    icon: Gift,
    label: 'อนุมัติแลกรางวัล',
    labelEn: 'Approve Redemptions',
    description: 'อนุมัติการแลกรางวัล',
    descriptionEn: 'Approve reward redemptions',
    path: '/portal/approve-redemptions',
    color: 'from-fuchsia-500 to-fuchsia-600',
    roles: ['admin', 'owner'],
  },
];

const hrActions: QuickAction[] = [
  {
    icon: FileText,
    label: 'รายงาน Payroll',
    labelEn: 'Payroll Report',
    description: 'ดูสรุปการจ่ายเงินเดือน',
    descriptionEn: 'View payroll summary',
    path: '/portal/payroll-report',
    color: 'from-slate-500 to-slate-600',
    roles: ['hr', 'admin', 'owner'],
  },
];

export default function PortalHome() {
  const navigate = useNavigate();
  const { employee, locale, isManager, isAdmin } = usePortal();
  const { favorites, toggleFavorite, isFavorite } = useFavorites(employee?.id || '');
  
  // Clock state
  const [currentTime, setCurrentTime] = useState(new Date());
  const roleKey = employee?.role?.role_key?.toLowerCase() || '';

  // Realtime clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch home summary data using useQuery
  const { data: homeSummary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['home-summary', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return null;
      const { data, error } = await portalApi<{
        points: { current_balance: number } | null;
        todayAttendance: { event_type: string; server_time: string }[];
      }>({
        endpoint: 'home-summary',
        employee_id: employee.id
      });

      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  // Derived state from homeSummary
  const pointBalance = homeSummary?.points?.current_balance || 0;
  const checkIn = homeSummary?.todayAttendance?.find(a => a.event_type === 'check-in');
  const checkOut = homeSummary?.todayAttendance?.find(a => a.event_type === 'check-out');
  const canCheckIn = !checkIn;
  const isWorking = !!checkIn && !checkOut;
  
  const minutesWorked = useMemo(() => {
    if (checkIn && !checkOut) {
      const checkInTime = new Date(checkIn.server_time);
      return Math.floor((Date.now() - checkInTime.getTime()) / 60000);
    }
    return null;
  }, [checkIn, checkOut, currentTime]); // Update when clock ticks

  // Filter actions based on role
  const visibleManagerActions = managerActions.filter(
    (action) => !action.roles || action.roles.includes(roleKey)
  );
  const visibleAdminActions = adminActions.filter(
    (action) => !action.roles || action.roles.includes(roleKey)
  );
  const visibleHrActions = hrActions.filter(
    (action) => !action.roles || action.roles.includes(roleKey)
  );

  // Sort quickActions by favorites
  const sortedQuickActions = useMemo(() => {
    return [...quickActions].sort((a, b) => {
      const aFav = isFavorite(a.path);
      const bFav = isFavorite(b.path);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });
  }, [favorites, isFavorite]);

  const formatDuration = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (locale === 'th') {
      return `${hours} ชม. ${minutes} นาที`;
    }
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Check-in/out Status Card */}
      <Card 
        className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground cursor-pointer hover:opacity-95 transition-opacity overflow-hidden"
        onClick={() => navigate('/portal/checkin')}
      >
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-3xl font-bold font-mono">
                {format(currentTime, 'HH:mm:ss')}
              </p>
              <p className="text-sm opacity-90 mt-1">
                {format(currentTime, locale === 'th' ? 'EEEE d MMM yyyy' : 'EEEE, MMM d, yyyy', 
                  { locale: locale === 'th' ? th : undefined }
                )}
              </p>
              <p className="text-sm opacity-80 mt-2">
                {isWorking && minutesWorked !== null
                  ? `⏱️ ${locale === 'th' ? 'ทำงานแล้ว' : 'Working'} ${formatDuration(minutesWorked)}`
                  : `📍 ${locale === 'th' ? 'ยังไม่ได้เช็คอิน' : 'Not checked in yet'}`}
              </p>
            </div>
            <Button 
              variant="secondary" 
              size="sm"
              className={cn(
                'shadow-lg font-semibold',
                canCheckIn 
                  ? 'bg-green-500 hover:bg-green-600 text-white' 
                  : 'bg-red-500 hover:bg-red-600 text-white'
              )}
              onClick={(e) => {
                e.stopPropagation();
                navigate('/portal/checkin');
              }}
            >
              {canCheckIn ? (
                <>
                  <LogIn className="h-4 w-4" />
                  Check-in
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  Check-out
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Points Card */}
      <Card 
        className="bg-gradient-to-br from-yellow-400 to-orange-500 text-white cursor-pointer hover:opacity-95 transition-opacity"
        onClick={() => navigate('/portal/my-points')}
      >
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm opacity-90">{locale === 'th' ? 'แต้มของฉัน' : 'My Points'}</p>
            {isLoadingSummary ? (
              <Skeleton className="h-9 w-20 bg-white/30" />
            ) : (
              <p className="text-3xl font-bold">{pointBalance.toLocaleString()}</p>
            )}
          </div>
          <Coins className="h-10 w-10 opacity-80" />
        </CardContent>
      </Card>

      {/* Welcome Section */}
      <div className="text-center py-2">
        <h2 className="text-xl font-bold">
          {locale === 'th' ? 'สวัสดี' : 'Hello'}, {employee?.full_name?.split(' ')[0] || 'User'}! 👋
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {locale === 'th' ? 'เลือกเมนูที่ต้องการ' : 'Choose what you need'}
        </p>
      </div>

      {/* Quick Actions Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
          {locale === 'th' ? 'เมนูของฉัน' : 'My Menu'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {sortedQuickActions.map((action) => {
            const Icon = action.icon;
            const isFav = isFavorite(action.path);
            return (
              <Card
                key={action.path}
                className={cn(
                  "cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-[0.98] overflow-hidden group relative",
                  isFav && "ring-2 ring-yellow-400/50"
                )}
                onClick={() => navigate(action.path)}
              >
                <FavoriteButton
                  isFavorite={isFav}
                  onToggle={(e) => {
                    e.stopPropagation();
                    toggleFavorite(action.path);
                  }}
                />
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
            {[...visibleManagerActions].sort((a, b) => {
              const aFav = isFavorite(a.path);
              const bFav = isFavorite(b.path);
              if (aFav && !bFav) return -1;
              if (!aFav && bFav) return 1;
              return 0;
            }).map((action) => {
              const Icon = action.icon;
              const isFav = isFavorite(action.path);
              return (
                <Card
                  key={action.path}
                  className={cn(
                    "cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-[0.98] overflow-hidden group border-amber-200/50 relative",
                    isFav && "ring-2 ring-yellow-400/50"
                  )}
                  onClick={() => navigate(action.path)}
                >
                  <FavoriteButton
                    isFavorite={isFav}
                    onToggle={(e) => {
                      e.stopPropagation();
                      toggleFavorite(action.path);
                    }}
                  />
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
            {[...visibleAdminActions].sort((a, b) => {
              const aFav = isFavorite(a.path);
              const bFav = isFavorite(b.path);
              if (aFav && !bFav) return -1;
              if (!aFav && bFav) return 1;
              return 0;
            }).map((action) => {
              const Icon = action.icon;
              const isFav = isFavorite(action.path);
              return (
                <Card
                  key={action.path}
                  className={cn(
                    "cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-[0.98] overflow-hidden group border-destructive/20 relative",
                    isFav && "ring-2 ring-yellow-400/50"
                  )}
                  onClick={() => navigate(action.path)}
                >
                  <FavoriteButton
                    isFavorite={isFav}
                    onToggle={(e) => {
                      e.stopPropagation();
                      toggleFavorite(action.path);
                    }}
                  />
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

      {/* HR Actions */}
      {visibleHrActions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-2">
            {locale === 'th' ? 'HR' : 'HR'}
            <Badge variant="outline" className="text-[10px]">
              HR
            </Badge>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[...visibleHrActions].sort((a, b) => {
              const aFav = isFavorite(a.path);
              const bFav = isFavorite(b.path);
              if (aFav && !bFav) return -1;
              if (!aFav && bFav) return 1;
              return 0;
            }).map((action) => {
              const Icon = action.icon;
              const isFav = isFavorite(action.path);
              return (
                <Card
                  key={action.path}
                  className={cn(
                    "cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-[0.98] overflow-hidden group border-muted relative",
                    isFav && "ring-2 ring-yellow-400/50"
                  )}
                  onClick={() => navigate(action.path)}
                >
                  <FavoriteButton
                    isFavorite={isFav}
                    onToggle={(e) => {
                      e.stopPropagation();
                      toggleFavorite(action.path);
                    }}
                  />
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
