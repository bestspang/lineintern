import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLiffOptional } from '@/contexts/LiffContext';
import { Loader2 } from 'lucide-react';

export function RootRedirect() {
  const { user, loading: authLoading } = useAuth();
  const liffContext = useLiffOptional();
  const [isLiffContext, setIsLiffContext] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkContext = () => {
      // Method 1: Check LIFF SDK status (most reliable)
      if (liffContext?.isReady) {
        console.log('[RootRedirect] LIFF SDK is ready, detected as LIFF context');
        setIsLiffContext(true);
        setChecking(false);
        return;
      }

      // Method 2: Comprehensive User-Agent check
      const ua = navigator.userAgent.toLowerCase();
      const isLineApp = ua.includes('line/') || 
                        ua.includes('liff/') || 
                        ua.includes('lineboot') ||
                        ua.includes('line ') ||
                        (ua.includes('line') && (ua.includes('android') || ua.includes('iphone')));

      // Method 3: Check URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const hasLiffParams = urlParams.has('liff.state') || 
                           urlParams.has('liff.referrer') ||
                           window.location.href.includes('liff.line.me');

      console.log('[RootRedirect] Checking context:', {
        userAgent: navigator.userAgent,
        liffReady: liffContext?.isReady,
        isLineApp,
        hasLiffParams,
        href: window.location.href,
      });

      setIsLiffContext(isLineApp || hasLiffParams);
      setChecking(false);
    };

    // Wait for LIFF to potentially initialize
    if (liffContext?.isReady) {
      checkContext();
    } else {
      // Give LIFF time to init, then fallback to User-Agent check
      const timeout = setTimeout(checkContext, 800);
      return () => clearTimeout(timeout);
    }
  }, [liffContext?.isReady]);

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
