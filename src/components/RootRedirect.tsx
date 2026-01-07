import { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLiffOptional } from '@/contexts/LiffContext';
import { Loader2 } from 'lucide-react';

// Helper function for comprehensive LINE environment check
function checkLineEnvironment(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  
  // All known LINE browser patterns
  const linePatterns = [
    'line/',
    'liff/',
    'lineboot',
    'line ',
    ' line',
  ];
  
  // Check if any pattern matches
  const matchesLine = linePatterns.some(pattern => ua.includes(pattern));
  
  // Also check for in-app browser indicators combined with LINE hints
  const isInAppBrowser = ua.includes('wv') || // WebView
                         ua.includes('iab'); // In-App Browser
  
  // Check URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const hasLiffParams = urlParams.has('liff.state') || 
                       urlParams.has('liff.referrer');
  
  // Check if URL contains liff.line.me (redirect case)
  const isFromLiffDomain = window.location.href.includes('liff.line.me');
  
  console.log('[RootRedirect] Environment check:', {
    ua: navigator.userAgent,
    matchesLine,
    isInAppBrowser,
    hasLiffParams,
    isFromLiffDomain,
  });
  
  return matchesLine || hasLiffParams || isFromLiffDomain;
}

export function RootRedirect() {
  const { user, loading: authLoading } = useAuth();
  const liffContext = useLiffOptional();
  const [isLiffContext, setIsLiffContext] = useState(false);
  const [checking, setChecking] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const maxWait = 3000; // 3 seconds max wait
    const checkInterval = 100; // Check every 100ms
    let elapsed = 0;

    const finalize = (isLiff: boolean, reason: string) => {
      console.log(`[RootRedirect] Finalized: isLiff=${isLiff}, reason=${reason}`);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsLiffContext(isLiff);
      setChecking(false);
    };

    // Case 1: LIFF is already ready
    if (liffContext?.isReady && !liffContext?.error) {
      finalize(true, 'LIFF SDK ready');
      return;
    }

    // Case 2: LIFF has error - fallback to User-Agent check
    if (liffContext?.error) {
      const isLineEnv = checkLineEnvironment();
      finalize(isLineEnv, 'LIFF error, fallback to UA');
      return;
    }

    // Case 3: LIFF not ready yet - poll with interval
    console.log('[RootRedirect] Waiting for LIFF SDK...');
    
    intervalRef.current = setInterval(() => {
      elapsed += checkInterval;

      // LIFF became ready
      if (liffContext?.isReady) {
        finalize(!liffContext?.error, 'LIFF became ready');
        return;
      }

      // Max wait reached - fallback to environment check
      if (elapsed >= maxWait) {
        console.log('[RootRedirect] Max wait reached, checking environment');
        const isLineEnv = checkLineEnvironment();
        finalize(isLineEnv, 'Max wait reached, fallback to UA');
      }
    }, checkInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [liffContext?.isReady, liffContext?.error]);

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
