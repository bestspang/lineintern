import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageAccess } from '@/hooks/usePageAccess';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Fallback paths for each menu group when getFirstAccessiblePage fails
const MENU_GROUP_FALLBACK_PATHS: Record<string, string> = {
  'Attendance': '/attendance/logs',
  'Management': '/groups',
  'Dashboard': '/',
  'Content & Knowledge': '/knowledge',
  'AI Features': '/memory',
  'Monitoring & Tools': '/bot-logs',
  'Configuration': '/settings',
};

const MENU_GROUP_ORDER = ['Attendance', 'Management', 'Dashboard', 'Content & Knowledge', 'AI Features', 'Monitoring & Tools', 'Configuration'];

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { canAccessPage, getFirstAccessiblePage, loading: pageAccessLoading } = usePageAccess();
  const { canAccessMenuGroup } = useUserRole();

  if (loading || pageAccessLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check page-level access
  if (!canAccessPage(location.pathname)) {
    // If user lands on root and doesn't have access, redirect to first accessible page
    if (location.pathname === '/') {
      const firstAccessiblePage = getFirstAccessiblePage();
      if (firstAccessiblePage) {
        return <Navigate to={firstAccessiblePage} replace />;
      }
      
      // Fallback: use hardcoded path based on accessible menu group
      for (const menuGroup of MENU_GROUP_ORDER) {
        if (canAccessMenuGroup(menuGroup)) {
          return <Navigate to={MENU_GROUP_FALLBACK_PATHS[menuGroup]} replace />;
        }
      }
    }
    
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
            <p className="text-muted-foreground mb-6">
              คุณไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อผู้ดูแลระบบ
            </p>
            <Button onClick={() => window.history.back()} variant="outline">
              กลับหน้าก่อนหน้า
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
