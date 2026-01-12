import { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLiffOptional } from '@/contexts/LiffContext';
import { Loader2 } from 'lucide-react';

// Comprehensive LIFF indicators check - returns detection result with reason
function hasLiffIndicators(): { detected: boolean; reason: string } {
  const urlParams = new URLSearchParams(window.location.search);
  const url = window.location.href;
  const ua = navigator.userAgent;
  
  // 1. Check for LIFF URL parameters (most reliable)
  const liffParams = Array.from(urlParams.keys()).filter(k => 
    k.startsWith('liff.') || k === 'access_token' || k === 'code'
  );
  if (liffParams.length > 0) {
    return { detected: true, reason: `LIFF params: ${liffParams.join(', ')}` };
  }
  
  // 2. Check referrer from LINE
  const ref = document.referrer;
  if (ref.includes('line.me') || ref.includes('liff.line.me')) {
    return { detected: true, reason: `Referrer: ${ref}` };
  }
  
  // 3. Check User-Agent for LINE patterns
  const lineUAPatterns = [
    /line\/[\d.]+/i,
    /liff\/[\d.]+/i,
    /lineboot/i,
    /linecorp/i,
    /\bline\b/i
  ];
  for (const pattern of lineUAPatterns) {
    if (pattern.test(ua)) {
      return { detected: true, reason: `UA pattern: ${pattern.toString()}` };
    }
  }
  
  // 4. Check if URL contains liff.line.me
  if (url.includes('liff.line.me')) {
    return { detected: true, reason: 'URL contains liff.line.me' };
  }
  
  // 5. Check for debug=liff parameter (intentional testing)
  const debugParam = new URLSearchParams(window.location.search).get('debug');
  if (debugParam === 'liff') {
    return { detected: true, reason: 'debug=liff parameter' };
  }
  
  // NOTE: sessionStorage check removed - it persists across tabs and causes false positives
  
  return { detected: false, reason: 'No LIFF indicators found' };
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
    const indicators = hasLiffIndicators();
    console.log('[RootRedirect] Mount - Initial state:', {
      liffIsReady: liffContext?.isReady,
      liffIsInClient: liffContext?.isInClient,
      liffIsLoggedIn: liffContext?.isLoggedIn,
      liffError: liffContext?.error,
      indicators,
      userAgent: navigator.userAgent,
      url: window.location.href,
      referrer: document.referrer,
    });
  }, []);

  useEffect(() => {
    const maxWait = 3000; // 3 seconds max wait (reduced from 5)
    const checkInterval = 100;
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

    // *** EARLY DETECTION: Check LIFF indicators IMMEDIATELY ***
    const indicators = hasLiffIndicators();
    const ua = navigator.userAgent;
    const isLineUserAgent = /line\/|liff\/|lineboot/i.test(ua);
    
    console.log('[RootRedirect] Checking context:', {
      indicators,
      isLineUserAgent,
      userAgent: ua.substring(0, 100)
    });

    // If strong LIFF indicators detected, go to portal immediately
    if (indicators.detected) {
      finalize(true, `Early detection: ${indicators.reason}`);
      return;
    }

    // Check for LINE User-Agent patterns
    if (isLineUserAgent) {
      finalize(true, 'LINE User-Agent detected');
      return;
    }

    // ★ NEW: If no indicators AND not LINE UA, finalize immediately (don't wait for LIFF SDK)
    // This prevents regular browsers from getting stuck or waiting for LIFF
    if (!indicators.detected && !isLineUserAgent) {
      console.log('[RootRedirect] Regular browser detected, skipping LIFF wait');
      finalize(false, 'No LIFF indicators, regular browser');
      return;
    }

    // For edge cases only (shouldn't reach here normally)
    // Get current context from ref
    const ctx = liffContextRef.current;

    // Case 1: LIFF SDK ready and running inside LINE App
    if (ctx?.isReady && ctx?.isInClient) {
      finalize(true, 'LIFF SDK ready and isInClient=true');
      return;
    }

    // Case 2: LIFF SDK ready but NOT in LINE client
    if (ctx?.isReady && !ctx?.isInClient && !ctx?.error) {
      finalize(false, 'LIFF ready but not in LINE client');
      return;
    }

    // Case 3: LIFF has error - not in LIFF context
    if (ctx?.error) {
      finalize(false, 'LIFF error, not in LINE');
      return;
    }

    // Case 4: LIFF not ready yet - poll with interval (edge case only)
    console.log('[RootRedirect] Waiting for LIFF SDK (edge case)...');
    
    intervalRef.current = setInterval(() => {
      elapsed += checkInterval;
      const currentCtx = liffContextRef.current;

      // LIFF became ready and is in client
      if (currentCtx?.isReady && currentCtx?.isInClient) {
        finalize(true, 'LIFF became ready (isInClient=true)');
        return;
      }

      // LIFF became ready but not in client
      if (currentCtx?.isReady && !currentCtx?.isInClient) {
        finalize(false, 'LIFF became ready (not in LINE client)');
        return;
      }

      // LIFF error occurred
      if (currentCtx?.error) {
        finalize(false, 'LIFF error during polling');
        return;
      }

      // Max wait reached - final check
      if (elapsed >= maxWait) {
        console.log('[RootRedirect] Max wait reached');
        const finalCheck = hasLiffIndicators();
        finalize(finalCheck.detected, `Timeout: ${finalCheck.reason}`);
      }
    }, checkInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Show loading ONLY while checking LIFF context
  // Once LIFF check is done, redirect immediately (don't wait for auth)
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If in LINE context → go to Portal (regardless of auth state)
  if (isLiffContext) {
    console.log('[RootRedirect] LINE context detected, redirecting to /portal');
    return <Navigate to="/portal" replace />;
  }

  // Not in LIFF context - check auth state
  // If auth is still loading, show loading spinner
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
