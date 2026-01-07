import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function RootRedirect() {
  const { user, loading: authLoading } = useAuth();
  const [isLiffContext, setIsLiffContext] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkContext = () => {
      try {
        // Check if in LINE browser
        const userAgent = navigator.userAgent.toLowerCase();
        const isInLine = userAgent.includes('line');
        
        // Check if came from LIFF redirect
        const urlParams = new URLSearchParams(window.location.search);
        const hasLiffState = urlParams.has('liff.state');
        
        console.log('[RootRedirect] Checking context:', {
          userAgent: navigator.userAgent,
          isInLine,
          hasLiffState,
          href: window.location.href,
        });
        
        setIsLiffContext(isInLine || hasLiffState);
      } catch (e) {
        console.error('[RootRedirect] Error checking context:', e);
        setIsLiffContext(false);
      }
      setChecking(false);
    };
    
    checkContext();
  }, []);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If in LINE context → go to Portal
  if (isLiffContext) {
    console.log('[RootRedirect] LINE context detected, redirecting to /portal');
    return <Navigate to="/portal" replace />;
  }

  // If has user → go to Dashboard
  if (user) {
    console.log('[RootRedirect] User logged in, redirecting to /overview');
    return <Navigate to="/overview" replace />;
  }

  // If no user → go to Auth
  console.log('[RootRedirect] No user, redirecting to /auth');
  return <Navigate to="/auth" replace />;
}
