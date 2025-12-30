import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Clock, Calendar, FileText, User, CheckCircle, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePortal } from '@/contexts/PortalContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
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
  { icon: Clock, label: 'ประวัติงาน', labelEn: 'History', path: '/portal/my-history' },
  { icon: Coins, label: 'แต้ม', labelEn: 'Points', path: '/portal/my-points' },
  { icon: Calendar, label: 'วันลา', labelEn: 'Leave', path: '/portal/my-leave' },
  { icon: CheckCircle, label: 'อนุมัติ', labelEn: 'Approve', path: '/portal/approvals', roles: ['manager', 'supervisor', 'admin', 'owner'] },
  { icon: User, label: 'โปรไฟล์', labelEn: 'Profile', path: '/portal/my-profile' },
];

export function PortalLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { employee, loading, error, locale, isManager } = usePortal();

  // Filter nav items based on role
  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!employee?.role?.role_key) return false;
    return item.roles.includes(employee.role.role_key.toLowerCase());
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="p-4 pb-24">
          <div className="max-w-lg mx-auto space-y-4">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
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
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <p className="mt-4 text-sm text-muted-foreground text-center">
              {locale === 'th'
                ? 'กรุณาขอลิงก์เมนูใหม่จาก LINE'
                : 'Please request a new menu link from LINE'}
            </p>
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
              {employee?.branch && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  📍 {employee.branch.name}
                </span>
              )}
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
