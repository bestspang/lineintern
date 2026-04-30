/**
 * ⚠️ VERIFIED 2026-04-29 — STABLE, DO NOT REFACTOR
 * Touchpoints: PortalContext (employee + isManager), LiffContext, useFavorites,
 *              navItems (6 items, supervisor role IS intentional — keep).
 * Allowed changes: badge dot tweaks, copy edits, locale toggle styling.
 * Forbidden: adding/removing nav items without user OK (contract = exactly 6),
 *            changing roles array on Approvals (manager+supervisor+admin+owner),
 *            altering the deferred 200ms unread-count fetch (perf-critical).
 */
import { ReactNode, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Clock, Calendar, FileText, User, CheckCircle, Coins, Timer, RefreshCw, Loader2, Globe, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePortal } from '@/contexts/PortalContext';
import { useLiffOptional } from '@/contexts/LiffContext';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalErrorBoundary } from './PortalErrorBoundary';

interface NavItem {
  icon: typeof Home;
  label: string;
  labelEn: string;
  path: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { icon: Home, label: 'หน้าหลัก', labelEn: 'Home', path: '/portal' },
  { icon: Timer, label: 'เช็คอิน', labelEn: 'Check-in', path: '/portal/checkin' },
  { icon: Clock, label: 'ประวัติ', labelEn: 'History', path: '/portal/my-history' },
  { icon: Coins, label: 'แต้ม', labelEn: 'Points', path: '/portal/my-points' },
  { icon: Calendar, label: 'วันลา', labelEn: 'Leave', path: '/portal/my-leave' },
  { icon: CheckCircle, label: 'อนุมัติ', labelEn: 'Approve', path: '/portal/approvals', roles: ['manager', 'supervisor', 'admin', 'owner'] },
];

export function PortalLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { employee, loading, error, locale, setLocale, isManager, refreshData } = usePortal();
  const liff = useLiffOptional();
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread notification count (deferred 200ms after mount so first paint isn't blocked)
  useEffect(() => {
    if (!employee?.id) return;
    let cancelled = false;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('notifications' as never)
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', employee.id)
        .eq('is_read', false);
      if (!cancelled) setUnreadCount(count || 0);
    };

    const deferTimer = setTimeout(fetchCount, 200);

    // Realtime updates (subscribe immediately, subscription itself is non-blocking)
    const channel = supabase
      .channel('notif-count')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `employee_id=eq.${employee.id}`,
      }, () => fetchCount())
      .subscribe();
    return () => {
      cancelled = true;
      clearTimeout(deferTimer);
      supabase.removeChannel(channel);
    };
  }, [employee?.id]);

  // Toggle language
  const toggleLocale = () => {
    setLocale(locale === 'th' ? 'en' : 'th');
  };

  // Filter nav items based on role
  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!employee?.role?.role_key) return false;
    return item.roles.includes(employee.role.role_key.toLowerCase());
  });

  // Handle retry
  const handleRetry = () => {
    if (liff?.retry) {
      liff.retry();
    }
    if (refreshData) {
      refreshData();
    } else {
      window.location.reload();
    }
  };

  if (loading) {
    // Render real shell (header + bottom nav placeholders) so first paint is fast.
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-16" />
              </div>
            </div>
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </header>
        <main className="pb-24">
          <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm justify-center pt-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{liff?.initProgress || (locale === 'th' ? 'กำลังโหลด...' : 'Loading...')}</span>
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        </main>
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t safe-area-bottom">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-around py-2 px-2">
              {navItems.slice(0, 5).map((item) => (
                <div key={item.path} className="flex flex-col items-center gap-1 py-2 px-3 min-w-[60px] opacity-50">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {locale === 'th' ? item.label : item.labelEn}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </nav>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>{locale === 'th' ? 'เกิดข้อผิดพลาด' : 'Error'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground text-center">
              {locale === 'th'
                ? 'กรุณาลองใหม่อีกครั้ง หรือขอลิงก์เมนูใหม่จาก LINE'
                : 'Please try again or request a new menu link from LINE'}
            </p>
            <Button 
              onClick={handleRetry} 
              className="w-full"
              disabled={liff?.isRetrying}
            >
              {liff?.isRetrying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {locale === 'th' ? 'กำลังลองใหม่...' : 'Retrying...'}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {locale === 'th' ? 'ลองใหม่' : 'Retry'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PortalErrorBoundary locale={locale}>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-lg">
                  {employee?.full_name?.charAt(0) || 'P'}
                </div>
                <div>
                  <h1 className="font-semibold text-sm line-clamp-1">
                    {employee?.full_name || 'Portal'}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {employee?.role?.display_name_th || employee?.code}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {employee?.branch && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    📍 {employee.branch.name}
                  </span>
                )}
                {/* Notification Bell */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate('/portal/notifications')}
                  className="h-8 w-8 relative"
                  title={locale === 'th' ? 'การแจ้งเตือน' : 'Notifications'}
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Button>
                {/* Language Toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleLocale}
                  className="h-8 w-8"
                  title={locale === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
                >
                  <Globe className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="pb-24">
          <div className="max-w-lg mx-auto px-4 py-4">
            {children}
          </div>
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t safe-area-bottom">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-around py-2 px-2">
              {filteredNavItems.map((item) => {
                const isActive = location.pathname === item.path || 
                  (item.path !== '/portal' && location.pathname.startsWith(item.path));
                const Icon = item.icon;
                
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all min-w-[60px]',
                      isActive
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', isActive && 'scale-110')} />
                    <span className="text-[10px] font-medium">
                      {locale === 'th' ? item.label : item.labelEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </div>
    </PortalErrorBoundary>
  );
}
