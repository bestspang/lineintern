/**
 * LIFF Layout - Mobile-optimized layout for LINE mini app
 */

import { ReactNode } from 'react';
import { useLiff } from '@/contexts/LiffContext';
import { Loader2, AlertTriangle, User, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LiffLayoutProps {
  children: ReactNode;
  title?: string;
  showHeader?: boolean;
}

export default function LiffLayout({ children, title, showHeader = true }: LiffLayoutProps) {
  const { isReady, isLoggedIn, profile, error, errorDetails, closeLiff, retry, isRetrying } = useLiff();

  // Loading state
  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    const canRetry = errorDetails?.type === 'network' || errorDetails?.type === 'unknown';
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h2 className="text-lg font-semibold">เกิดข้อผิดพลาด</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          
          {errorDetails?.type === 'config' && (
            <p className="text-xs text-muted-foreground">
              กรุณาติดต่อผู้ดูแลระบบ
            </p>
          )}
          
          <div className="flex gap-2 justify-center">
            {canRetry && (
              <Button onClick={retry} variant="default" disabled={isRetrying}>
                {isRetrying ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> กำลังลอง...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> ลองใหม่</>
                )}
              </Button>
            )}
            <Button onClick={closeLiff} variant="outline">
              ปิด
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <User className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">กรุณาเข้าสู่ระบบ</h2>
          <p className="text-sm text-muted-foreground">
            กรุณาเปิดผ่าน LINE เพื่อใช้งาน
          </p>
          <Button onClick={closeLiff} variant="outline">
            ปิด
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {showHeader && (
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {profile?.pictureUrl && (
                <img 
                  src={profile.pictureUrl} 
                  alt={profile.displayName}
                  className="h-8 w-8 rounded-full"
                />
              )}
              <div>
                {title && <h1 className="font-semibold text-sm">{title}</h1>}
                {!title && profile && (
                  <span className="text-sm text-muted-foreground">{profile.displayName}</span>
                )}
              </div>
            </div>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={closeLiff}
              className="text-muted-foreground"
            >
              ปิด
            </Button>
          </div>
        </header>
      )}
      <main className="pb-safe">
        {children}
      </main>
    </div>
  );
}
