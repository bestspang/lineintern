import { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLiffOptional } from '@/contexts/LiffContext';
import { Loader2 } from 'lucide-react';

// Helper function for comprehensive LINE environment check
function checkLineEnvironment(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  
  // Extended LINE browser patterns
  const linePatterns = [
    'line/',           // LINE/x.x.x
    'liff/',           // LIFF browser
    'lineboot',        // LINE internal
    'line ',           // space after LINE
    ' line',           // space before LINE
    'linecorp',        // LINE Corporation
  ];
  
  // Check if any pattern matches
  const matchesLine = linePatterns.some(pattern => ua.includes(pattern));
  
  // Check Mobile LINE App specifically
  const isMobileLineApp = 
    ua.includes('line') && 
    (ua.includes('android') || ua.includes('iphone') || ua.includes('ipad'));
  
  // Check URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const hasLiffParams = urlParams.has('liff.state') || 
                       urlParams.has('liff.referrer');
  
  // Check URL and referrer indicators
  const currentUrl = window.location.href.toLowerCase();
  const referrer = document.referrer.toLowerCase();
  const hasLineIndicators = 
    currentUrl.includes('liff.line.me') ||
    referrer.includes('line.me') ||
    referrer.includes('liff.line.me');
  
  console.log('[RootRedirect] Environment check:', {
    ua: navigator.userAgent,
    matchesLine,
    isMobileLineApp,
    hasLiffParams,
    hasLineIndicators,
  });
  
  return matchesLine || isMobileLineApp || hasLiffParams || hasLineIndicators;
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

    // Case 1: LIFF SDK ready and running inside LINE App
    if (liffContext?.isReady && liffContext?.isInClient) {
      finalize(true, 'LIFF SDK ready and isInClient=true');
      return;
    }

    // Case 2: LIFF SDK ready but NOT in LINE client (external browser)
    // Still might be LIFF context if opened from liff.line.me
    if (liffContext?.isReady && !liffContext?.isInClient && !liffContext?.error) {
      const isLineEnv = checkLineEnvironment();
      finalize(isLineEnv, 'LIFF ready but external browser, UA check');
      return;
    }

    // Case 3: LIFF has error - fallback to User-Agent check
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
  }, [liffContext?.isReady, liffContext?.isInClient, liffContext?.error]);

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
