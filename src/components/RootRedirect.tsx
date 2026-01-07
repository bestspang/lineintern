import { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLiffOptional, LiffContextType } from '@/contexts/LiffContext';
import { Loader2 } from 'lucide-react';

// Helper function for comprehensive LINE environment check
function checkLineEnvironment(): boolean {
  const ua = navigator.userAgent;
  const uaLower = ua.toLowerCase();
  
  // Check for LINE pattern using regex (more reliable)
  // LINE user-agent typically contains "Line/X.X.X" or "LIFF/X.X.X"
  const hasLineInUA = /line\/[\d.]+/i.test(ua) || 
                      /liff\/[\d.]+/i.test(ua) ||
                      uaLower.includes('liff') ||
                      uaLower.includes('lineboot') ||
                      uaLower.includes('linecorp');
  
  // Check if it's Mobile LINE App (LINE + mobile OS)
  const isMobile = /android|iphone|ipad|ipod/i.test(ua);
  const isMobileLineApp = hasLineInUA && isMobile;
  
  // Check URL for LIFF indicators
  const url = window.location.href;
  const urlParams = new URLSearchParams(window.location.search);
  const hasLiffParams = urlParams.has('liff.state') || 
                        urlParams.has('liff.referrer');
  
  // Check URL and referrer for LINE indicators
  const hasLineIndicators = 
    url.includes('liff.line.me') ||
    document.referrer.includes('line.me') ||
    document.referrer.includes('liff.line.me');
  
  const result = hasLineInUA || isMobileLineApp || hasLiffParams || hasLineIndicators;
  
  console.log('[RootRedirect] checkLineEnvironment:', {
    ua,
    hasLineInUA,
    isMobile,
    isMobileLineApp,
    hasLiffParams,
    hasLineIndicators,
    result,
  });
  
  return result;
}

export function RootRedirect() {
  const { user, loading: authLoading } = useAuth();
  const liffContext = useLiffOptional();
  const [isLiffContext, setIsLiffContext] = useState(false);
  const [checking, setChecking] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Use ref to avoid stale closure in interval
  const liffContextRef = useRef(liffContext);
  useEffect(() => {
    liffContextRef.current = liffContext;
  }, [liffContext]);

  // Log initial state
  useEffect(() => {
    console.log('[RootRedirect] Mount - Initial state:', {
      liffIsReady: liffContext?.isReady,
      liffIsInClient: liffContext?.isInClient,
      liffIsLoggedIn: liffContext?.isLoggedIn,
      liffError: liffContext?.error,
      userAgent: navigator.userAgent,
      url: window.location.href,
      referrer: document.referrer,
    });
  }, []);

  useEffect(() => {
    const maxWait = 3000; // 3 seconds max wait
    const checkInterval = 100; // Check every 100ms
    let elapsed = 0;
    let finalized = false;

    const finalize = (isLiff: boolean, reason: string) => {
      if (finalized) return;
      finalized = true;
      
      console.log(`[RootRedirect] Finalized: isLiff=${isLiff}, reason=${reason}`, {
        liffState: liffContextRef.current,
        elapsed,
      });
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsLiffContext(isLiff);
      setChecking(false);
    };

    // Get current context from ref (always fresh)
    const ctx = liffContextRef.current;

    // Case 1: LIFF SDK ready and running inside LINE App
    if (ctx?.isReady && ctx?.isInClient) {
      finalize(true, 'LIFF SDK ready and isInClient=true');
      return;
    }

    // Case 2: LIFF SDK ready but NOT in LINE client (external browser)
    if (ctx?.isReady && !ctx?.isInClient && !ctx?.error) {
      const isLineEnv = checkLineEnvironment();
      finalize(isLineEnv, 'LIFF ready but external browser, UA check');
      return;
    }

    // Case 3: LIFF has error - fallback to User-Agent check
    if (ctx?.error) {
      const isLineEnv = checkLineEnvironment();
      finalize(isLineEnv, 'LIFF error, fallback to UA');
      return;
    }

    // Case 4: LIFF not ready yet - poll with interval using ref
    console.log('[RootRedirect] Waiting for LIFF SDK...');
    
    intervalRef.current = setInterval(() => {
      elapsed += checkInterval;
      
      // Read latest context from ref (not stale closure!)
      const currentCtx = liffContextRef.current;
      
      console.log('[RootRedirect] Polling...', {
        elapsed,
        isReady: currentCtx?.isReady,
        isInClient: currentCtx?.isInClient,
        error: currentCtx?.error,
      });

      // LIFF became ready and is in client
      if (currentCtx?.isReady && currentCtx?.isInClient) {
        finalize(true, 'LIFF became ready (isInClient=true)');
        return;
      }

      // LIFF became ready but not in client
      if (currentCtx?.isReady && !currentCtx?.isInClient) {
        const isLineEnv = checkLineEnvironment();
        finalize(isLineEnv, 'LIFF became ready (external browser), UA check');
        return;
      }

      // LIFF error occurred
      if (currentCtx?.error) {
        const isLineEnv = checkLineEnvironment();
        finalize(isLineEnv, 'LIFF error during polling, fallback to UA');
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
  }, []); // No dependencies - we use ref for fresh values

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
