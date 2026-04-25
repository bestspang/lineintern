import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LogIn, LogOut, Coins } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { cn } from '@/lib/utils';
import { portalApi } from '@/lib/portal-api';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useFavorites } from '@/hooks/useFavorites';
import { FavoriteButton } from '@/components/portal/FavoriteButton';
import {
  PORTAL_ACTIONS,
  isVisibleToRole,
  type PortalAction,
} from '@/lib/portal-actions';

// ⚠️ HOME GRID CONTRACT (preserved):
// PortalHome shows a curated subset of `employee` actions in the main grid,
// because /portal/checkin and /portal/my-points already have dedicated
// hero cards above. The full list (including those) lives in `Help.tsx`.
const HOME_QUICK_ACTION_IDS = [
  'my-history',
  'my-schedule',
  'my-payroll',
  'my-leave',
  'request-leave',
  'request-ot',
  
  'leaderboard',
  'status',
  'rewards',
  'my-bag',
] as const;

// All action lists are now derived from PORTAL_ACTIONS (single source of truth).
// See src/lib/portal-actions.ts.
const quickActionsAll: PortalAction[] = HOME_QUICK_ACTION_IDS
  .map((id) => PORTAL_ACTIONS.find((a) => a.id === id))
  .filter((a): a is PortalAction => Boolean(a));

const managerActions: PortalAction[] = PORTAL_ACTIONS.filter((a) => a.group === 'manager');
const adminActions: PortalAction[] = PORTAL_ACTIONS.filter((a) => a.group === 'admin');
const hrActions: PortalAction[] = PORTAL_ACTIONS.filter((a) => a.group === 'hr');

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

  // Fetch pending requests count for badge
  const { data: pendingCounts } = useQuery({
    queryKey: ['pending-counts', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return { ot: 0, dayoff: 0, leave: 0 };
      const [otResult, dayOffResult, leaveResult] = await Promise.all([
        portalApi<any[]>({
          endpoint: 'my-pending-ot-requests',
          employee_id: employee.id
        }),
        portalApi<any[]>({
          endpoint: 'my-pending-dayoff-requests',
          employee_id: employee.id
        }),
        portalApi<any[]>({
          endpoint: 'my-leave-requests',
          employee_id: employee.id,
          params: { limit: 50 }
        })
      ]);
      // Filter leave for pending only
      const pendingLeaves = (leaveResult.data || []).filter((l: any) => l.status === 'pending');
      return {
        ot: otResult.data?.length || 0,
        dayoff: dayOffResult.data?.length || 0,
        leave: pendingLeaves.length
      };
    },
    enabled: !!employee?.id,
    refetchInterval: 60000,
  });

  const totalPending = (pendingCounts?.ot || 0) + (pendingCounts?.dayoff || 0) + (pendingCounts?.leave || 0);

  // Fetch home summary data using useQuery
  const { data: homeSummary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['home-summary', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return null;
      const { data, error } = await portalApi<{
        points: { current_balance: number } | null;
        todayAttendance: { event_type: string; server_time: string }[];
        pendingApprovals?: {
          overtime: number;
          leave: number;
          scope: 'self' | 'team' | 'global';
        };
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
  const approvalScope = homeSummary?.pendingApprovals?.scope || 'self';
  const approvalScopeLabel =
    locale === 'th'
      ? approvalScope === 'team'
        ? 'ทีมของคุณ'
        : approvalScope === 'global'
          ? 'ทั้งหมด'
          : 'ของฉัน'
      : approvalScope === 'team'
        ? 'Your Team'
        : approvalScope === 'global'
          ? 'All'
          : 'Mine';
  const pendingApprovalTotal =
    (homeSummary?.pendingApprovals?.overtime || 0) + (homeSummary?.pendingApprovals?.leave || 0);
  // API payload can contain legacy kebab-case values (e.g. 'check-in') in addition to snake_case ('check_in').
  const isCheckInType = (eventType?: string) => eventType === 'check_in' || eventType === 'check-in';
  const isCheckOutType = (eventType?: string) => eventType === 'check_out' || eventType === 'check-out';
  const todayAttendance = homeSummary?.todayAttendance || [];
  const checkIn = todayAttendance.find((a) => isCheckInType(a.event_type));
  const checkOut = todayAttendance.find((a) => isCheckOutType(a.event_type));
  const canCheckIn = !todayAttendance.some((a) => isCheckInType(a.event_type));
  const isWorking = !!checkIn && !checkOut;
  
  const minutesWorked = useMemo(() => {
    if (checkIn && !checkOut) {
      const checkInTime = new Date(checkIn.server_time);
      return Math.floor((Date.now() - checkInTime.getTime()) / 60000);
    }
    return null;
  }, [checkIn, checkOut, currentTime]); // Update when clock ticks

  // Filter actions based on role (uses shared registry helper)
  const visibleManagerActions = managerActions.filter((a) => isVisibleToRole(a, roleKey));
  const visibleAdminActions = adminActions.filter((a) => isVisibleToRole(a, roleKey));
  const visibleHrActions = hrActions.filter((a) => isVisibleToRole(a, roleKey));

  // Sort quick actions by favorites
  const sortedQuickActions = useMemo(() => {
    return [...quickActionsAll].sort((a, b) => {
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
                  {locale === 'th' ? 'เช็คอิน' : 'Check-in'}
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  {locale === 'th' ? 'เช็คเอาท์' : 'Check-out'}
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
        <p className="text-muted-foreground text-xs mt-1">
          {locale === 'th'
            ? `คำขอรออนุมัติ (${approvalScopeLabel}): ${pendingApprovalTotal}`
            : `Pending approvals (${approvalScopeLabel}): ${pendingApprovalTotal}`}
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
            const showPendingBadge = action.path === '/portal/my-history' && totalPending > 0;
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
                {/* Pending requests badge for Work History with breakdown tooltip */}
                {showPendingBadge && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className="absolute top-2 right-8 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 z-10 cursor-help">
                          {totalPending}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        <div className="space-y-1">
                          {(pendingCounts?.ot ?? 0) > 0 && (
                            <p>🕐 OT: {pendingCounts?.ot}</p>
                          )}
                          {(pendingCounts?.dayoff ?? 0) > 0 && (
                            <p>📅 Day-Off: {pendingCounts?.dayoff}</p>
                          )}
                          {(pendingCounts?.leave ?? 0) > 0 && (
                            <p>🏖️ Leave: {pendingCounts?.leave}</p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
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
