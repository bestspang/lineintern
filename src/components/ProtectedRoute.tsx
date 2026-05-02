/**
 * ⚠️ VERIFIED 2026-05-02 — auth gate for admin routes. Coordinated with usePageAccess + RootRedirect.
 * Do not change redirect targets without checking AuthContext + memory:auth/unauthorized-redirect.
 */
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageAccess } from '@/hooks/usePageAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, RefreshCw, Home, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccessPage, getFirstAccessiblePage, loading: pageAccessLoading } = usePageAccess();

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
    // For any restricted page, redirect to first accessible page
    const firstAccessiblePage = getFirstAccessiblePage();
    if (firstAccessiblePage && firstAccessiblePage !== location.pathname) {
      return <Navigate to={firstAccessiblePage} replace />;
    }

    // If no accessible page found, show error with escape hatches
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
            <p className="text-muted-foreground mb-6">
              คุณไม่มีสิทธิ์เข้าถึงหน้านี้ หรือข้อมูลสิทธิ์ยังโหลดไม่สำเร็จ
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => window.location.reload()} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                ลองใหม่ (โหลดข้อมูลใหม่)
              </Button>
              <Button onClick={() => navigate('/')} variant="outline">
                <Home className="h-4 w-4 mr-2" />
                ไปหน้าหลัก
              </Button>
              <Button onClick={() => signOut()} variant="ghost">
                <LogOut className="h-4 w-4 mr-2" />
                ออกจากระบบ
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
