import { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLiffOptional, LiffContextType } from '@/contexts/LiffContext';
import { Loader2 } from 'lucide-react';

// Helper function to check for LIFF URL parameters (most reliable method)
function hasLiffUrlParams(): boolean {
  const urlParams = new URLSearchParams(window.location.search);
  const hasLiffState = urlParams.has('liff.state');
  const hasLiffReferrer = urlParams.has('liff.referrer');
  const hasAnyLiffParam = Array.from(urlParams.keys()).some(k => k.startsWith('liff.'));
  
  const result = hasLiffState || hasLiffReferrer || hasAnyLiffParam;
  
  if (result) {
    console.log('[RootRedirect] LIFF URL params detected:', {
      hasLiffState,
      hasLiffReferrer,
      params: Array.from(urlParams.entries()).filter(([k]) => k.startsWith('liff.')),
    });
  }
  
  return result;
}

// Helper function for comprehensive LINE environment check (fallback)
function checkLineEnvironment(): boolean {
  const ua = navigator.userAgent;
  const uaLower = ua.toLowerCase();
  
  // 1. Check for LIFF URL parameters FIRST (most reliable!)
  if (hasLiffUrlParams()) {
    return true;
  }
  
  // 2. Check for LINE pattern in User-Agent
  const hasLineInUA = /line\/[\d.]+/i.test(ua) || 
                      /liff\/[\d.]+/i.test(ua) ||
                      uaLower.includes('liff') ||
                      uaLower.includes('lineboot') ||
                      uaLower.includes('linecorp');
  
  // 3. Check URL and referrer for LINE indicators
  const url = window.location.href;
  const hasLineIndicators = 
    url.includes('liff.line.me') ||
    document.referrer.includes('line.me') ||
    document.referrer.includes('liff.line.me');
  
  const result = hasLineInUA || hasLineIndicators;
  
  console.log('[RootRedirect] checkLineEnvironment (UA fallback):', {
    ua: ua.substring(0, 100),
    hasLineInUA,
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

    // *** EARLY DETECTION: Check LIFF URL params IMMEDIATELY ***
    // This is the most reliable method - works before LIFF SDK loads
    if (hasLiffUrlParams()) {
      finalize(true, 'LIFF URL params detected (early detection)');
      return;
    }

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
      finalize(isLineEnv, 'LIFF ready but external browser, env check');
      return;
    }

    // Case 3: LIFF has error - fallback to environment check
    if (ctx?.error) {
      const isLineEnv = checkLineEnvironment();
      finalize(isLineEnv, 'LIFF error, fallback to env check');
      return;
    }

    // Case 4: LIFF not ready yet - poll with interval using ref
    console.log('[RootRedirect] Waiting for LIFF SDK...');
    
    intervalRef.current = setInterval(() => {
      elapsed += checkInterval;
      
      // Read latest context from ref (not stale closure!)
      const currentCtx = liffContextRef.current;

      // LIFF became ready and is in client
      if (currentCtx?.isReady && currentCtx?.isInClient) {
        finalize(true, 'LIFF became ready (isInClient=true)');
        return;
      }

      // LIFF became ready but not in client
      if (currentCtx?.isReady && !currentCtx?.isInClient) {
        const isLineEnv = checkLineEnvironment();
        finalize(isLineEnv, 'LIFF became ready (external browser), env check');
        return;
      }

      // LIFF error occurred
      if (currentCtx?.error) {
        const isLineEnv = checkLineEnvironment();
        finalize(isLineEnv, 'LIFF error during polling, fallback to env check');
        return;
      }

      // Max wait reached - fallback to environment check
      if (elapsed >= maxWait) {
        console.log('[RootRedirect] Max wait reached, checking environment');
        const isLineEnv = checkLineEnvironment();
        finalize(isLineEnv, 'Max wait reached, fallback to env check');
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
