/**
 * LIFF Context - LINE Front-end Framework Integration
 * Provides LIFF SDK initialization and user profile access
 * 
 * Optimizations:
 * - Caches LIFF_ID in localStorage to reduce API calls
 * - Uses global state to prevent double initialization
 * - Skips init on non-LIFF routes
 */

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  getGlobalLiffState, 
  setGlobalLiffState, 
  isLiffInitialized, 
  getCachedLiffId, 
  setCachedLiffId,
  type LiffProfile as GlobalLiffProfile 
} from '@/lib/liff-state';

interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

type LiffErrorType = 'network' | 'config' | 'permission' | 'unknown';

interface LiffError {
  type: LiffErrorType;
  message: string;
  originalError?: any;
}

export interface LiffContextType {
  isReady: boolean;
  isLoggedIn: boolean;
  isInClient: boolean;
  profile: LiffProfile | null;
  error: string | null;
  errorDetails: LiffError | null;
  liffId: string | null;
  closeLiff: () => void;
  openExternalUrl: (url: string) => void;
  retry: () => void;
  isRetrying: boolean;
  initProgress: string;
}

const LiffContext = createContext<LiffContextType | undefined>(undefined);

export function useLiff() {
  const context = useContext(LiffContext);
  if (!context) {
    throw new Error('useLiff must be used within a LiffProvider');
  }
  return context;
}

// Optional hook that returns null if not in LiffProvider context
export function useLiffOptional(): LiffContextType | null {
  return useContext(LiffContext) ?? null;
}

interface LiffProviderProps {
  children: ReactNode;
}

// Timeout constants
const INIT_TIMEOUT_MS = 10000; // 10 seconds max wait for LIFF init

export function LiffProvider({ children }: LiffProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isInClient, setIsInClient] = useState(false);
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<LiffError | null>(null);
  const [liffId, setLiffId] = useState<string | null>(null);
  const [liff, setLiff] = useState<any>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [initProgress, setInitProgress] = useState<string>('');
  const isInitializing = React.useRef(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const MAX_RETRIES = 2;

  // Helper to categorize errors
  const categorizeError = (err: any): LiffError => {
    const message = err?.message || String(err);
    
    // Network errors
    if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) {
      return { type: 'network', message: 'เครือข่ายมีปัญหา กรุณาลองใหม่', originalError: err };
    }
    
    // Config errors
    if (message.includes('INVALID_LIFF_ID') || message.includes('not found') || message.includes('not configured')) {
      return { type: 'config', message: 'LIFF ID ไม่ถูกต้อง', originalError: err };
    }
    
    // Permission errors
    if (message.includes('permission') || message.includes('denied') || message.includes('UNAUTHORIZED')) {
      return { type: 'permission', message: 'ไม่มีสิทธิ์เข้าใช้งาน', originalError: err };
    }
    
    return { type: 'unknown', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', originalError: err };
  };

  // Helper function to determine if we should init LIFF
  const checkShouldInitLiff = useCallback((): { shouldInit: boolean; reason: string } => {
    const urlParams = new URLSearchParams(window.location.search);
    const ua = navigator.userAgent;
    const pathname = window.location.pathname;
    
    // 1. Always init on /portal or /liff routes
    if (pathname.startsWith('/portal') || pathname.startsWith('/liff')) {
      const hasLiffParams = Array.from(urlParams.keys()).some(k => 
        k.startsWith('liff.') || k === 'access_token' || k === 'code'
      );
      const hasToken = urlParams.has('token');
      const hasDebug = urlParams.get('debug') === 'liff';
      const isLineUA = /line\/|liff\/|lineboot/i.test(ua);
      
      if (hasLiffParams || hasToken || hasDebug || isLineUA) {
        return { shouldInit: true, reason: 'LIFF route with indicators' };
      }
      
      // No indicators on portal/liff route - still try but with safe mode
      return { shouldInit: true, reason: 'LIFF route (will use safe mode)' };
    }
    
    // 2. Root path "/" - only init if LIFF indicators present
    if (pathname === '/') {
      const hasLiffParams = Array.from(urlParams.keys()).some(k => 
        k.startsWith('liff.') || k === 'access_token' || k === 'code'
      );
      const hasDebug = urlParams.get('debug') === 'liff';
      const isLineUA = /line\/|liff\/|lineboot/i.test(ua);
      const ref = document.referrer;
      const isFromLine = ref.includes('line.me');
      
      if (hasLiffParams || hasDebug || isLineUA || isFromLine) {
        return { shouldInit: true, reason: 'Root with LIFF indicators' };
      }
      
      // Root path without LINE context - skip LIFF init entirely
      return { shouldInit: false, reason: 'Root path on regular browser' };
    }
    
    // 3. Other paths - skip LIFF
    return { shouldInit: false, reason: `Non-LIFF path: ${pathname}` };
  }, []);

  const initLiff = useCallback(async (isRetry = false) => {
    if (isInitializing.current && !isRetry) {
      console.log('[LIFF] Already initializing, skipping...');
      return;
    }
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Check if LIFF was already initialized globally (prevents double init)
    if (isLiffInitialized() && !isRetry) {
      console.log('[LIFF] Already initialized globally, restoring state...');
      const globalState = getGlobalLiffState();
      setIsReady(globalState.isReady);
      setIsLoggedIn(globalState.isLoggedIn);
      setIsInClient(globalState.isInClient);
      setLiffId(globalState.liffId);
      if (globalState.profile) {
        setProfile(globalState.profile);
      }
      return;
    }
    
    // Check if we should skip LIFF initialization
    const shouldInitCheck = checkShouldInitLiff();
    
    if (!shouldInitCheck.shouldInit) {
      console.log('[LIFF] Skipping init:', shouldInitCheck.reason);
      setIsReady(true);
      setIsInClient(false);
      setIsLoggedIn(false);
      isInitializing.current = false;
      return;
    }
    
    console.log('[LIFF] Proceeding with init:', shouldInitCheck.reason);
    isInitializing.current = true;
    setInitProgress('กำลังเริ่มต้น...');
    
    // Set timeout for initialization
    timeoutRef.current = setTimeout(() => {
      if (!isReady && isInitializing.current) {
        console.error('[LIFF] Initialization timeout after', INIT_TIMEOUT_MS, 'ms');
        const timeoutError: LiffError = { 
          type: 'network', 
          message: 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่' 
        };
        setError(timeoutError.message);
        setErrorDetails(timeoutError);
        setIsReady(true);
        setIsRetrying(false);
        setInitProgress('');
        isInitializing.current = false;
      }
    }, INIT_TIMEOUT_MS);
    
    try {
      // Debug logging for URL state
      console.log('[LIFF] Window location:', {
        href: window.location.href,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      });
      
      if (isRetry) {
        setIsRetrying(true);
        console.log('[LIFF] Retrying initialization...');
      } else {
        console.log('[LIFF] Starting initialization...');
      }
      
      setError(null);
      setErrorDetails(null);
      
      // Try to use cached LIFF_ID first for faster loading
      setInitProgress('กำลังโหลดการตั้งค่า...');
      let liffIdToUse = getCachedLiffId();
      
      if (!liffIdToUse) {
        // Get LIFF_ID from api_configurations
        const { data: config, error: configError } = await supabase
          .from('api_configurations')
          .select('key_value')
          .eq('key_name', 'LIFF_ID')
          .single();

        if (configError) {
          console.error('[LIFF] Error fetching LIFF_ID:', configError);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          const errInfo = categorizeError({ message: 'Config fetch failed' });
          setError(errInfo.message);
          setErrorDetails(errInfo);
          setIsReady(true);
          setIsRetrying(false);
          setInitProgress('');
          return;
        }

        if (!config?.key_value) {
          console.log('[LIFF] LIFF_ID not configured in api_configurations');
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          const errInfo: LiffError = { type: 'config', message: 'LIFF ยังไม่ได้ตั้งค่า' };
          setError(errInfo.message);
          setErrorDetails(errInfo);
          setIsReady(true);
          setIsRetrying(false);
          setInitProgress('');
          return;
        }
        
        liffIdToUse = config.key_value;
        // Cache for next time
        setCachedLiffId(liffIdToUse);
        console.log('[LIFF] Got LIFF_ID from API, cached:', liffIdToUse);
      } else {
        console.log('[LIFF] Using cached LIFF_ID:', liffIdToUse);
      }

      setLiffId(liffIdToUse);

      // Dynamically import LIFF SDK
      setInitProgress('กำลังโหลด LINE SDK...');
      console.log('[LIFF] Importing LIFF SDK...');
      const liffModule = await import('@line/liff');
      const liffInstance = liffModule.default;
      setLiff(liffInstance);

      // Initialize LIFF
      setInitProgress('กำลังเชื่อมต่อ LINE...');
      console.log('[LIFF] Calling liff.init()...');
      await liffInstance.init({
        liffId: liffIdToUse,
        withLoginOnExternalBrowser: false, // Don't auto-redirect on external browsers
      });

      console.log('[LIFF] Init complete!');
      console.log('[LIFF] isInClient:', liffInstance.isInClient());
      console.log('[LIFF] isLoggedIn:', liffInstance.isLoggedIn());
      console.log('[LIFF] OS:', liffInstance.getOS?.() || 'unknown');
      console.log('[LIFF] Language:', liffInstance.getLanguage?.() || 'unknown');

      // Clear timeout since init succeeded
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // CRITICAL: Check login and get profile BEFORE setting isReady
      // This prevents race condition where PortalContext sees isReady=true but isLoggedIn=false
      const loggedIn = liffInstance.isLoggedIn();
      let userProfile = null;

      if (loggedIn) {
        setInitProgress('กำลังโหลดข้อมูลผู้ใช้...');
        console.log('[LIFF] Fetching user profile...');
        try {
          userProfile = await liffInstance.getProfile();
          console.log('[LIFF] Got profile:', { userId: userProfile.userId, displayName: userProfile.displayName });
        } catch (profileErr) {
          console.error('[LIFF] Error fetching profile:', profileErr);
        }
      } else {
        console.log('[LIFF] User not logged in - isInClient:', liffInstance.isInClient());
        if (liffInstance.isInClient()) {
          console.warn('[LIFF] In LINE client but not logged in - this should not happen');
        }
      }

      // Set all states TOGETHER to prevent race condition
      // Profile first, then isLoggedIn, then isReady (so PortalContext sees complete state)
      const profileData = userProfile ? {
        userId: userProfile.userId,
        displayName: userProfile.displayName,
        pictureUrl: userProfile.pictureUrl,
        statusMessage: userProfile.statusMessage,
      } : null;
      
      if (profileData) {
        setProfile(profileData);
      }
      setIsInClient(liffInstance.isInClient());
      setIsLoggedIn(loggedIn);
      setIsReady(true); // Set this LAST so other contexts see complete state
      setIsRetrying(false);
      setRetryCount(0);
      setInitProgress('');
      
      // Save to global state to prevent double init
      setGlobalLiffState({
        isInitialized: true,
        isReady: true,
        isLoggedIn: loggedIn,
        isInClient: liffInstance.isInClient(),
        liffId: liffIdToUse,
        profile: profileData,
        error: null,
      });
      console.log('[LIFF] Global state saved');
    } catch (err: any) {
      console.error('[LIFF] Initialization error:', err);
      console.error('[LIFF] Error details:', JSON.stringify(err, null, 2));
      
      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      const errInfo = categorizeError(err);
      
      // Auto-retry for network errors
      if (errInfo.type === 'network' && retryCount < MAX_RETRIES) {
        console.log(`[LIFF] Network error, auto-retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        setRetryCount(prev => prev + 1);
        setInitProgress(`กำลังลองใหม่ครั้งที่ ${retryCount + 1}...`);
        setTimeout(() => initLiff(true), 1000 * (retryCount + 1));
        return;
      }
      
      setError(errInfo.message);
      setErrorDetails(errInfo);
      setIsReady(true);
      setIsRetrying(false);
      setInitProgress('');
      isInitializing.current = false;
    }
  }, [retryCount, isReady]);

  // Manual retry function
  const retry = useCallback(() => {
    if (isRetrying) return;
    setRetryCount(0);
    setIsReady(false);
    setError(null);
    setErrorDetails(null);
    initLiff(true);
  }, [initLiff, isRetrying]);

  useEffect(() => {
    initLiff();
    
    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const closeLiff = () => {
    if (liff?.isInClient()) {
      liff.closeWindow();
    } else {
      window.close();
    }
  };

  const openExternalUrl = (url: string) => {
    if (liff?.isInClient()) {
      liff.openWindow({ url, external: true });
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <LiffContext.Provider value={{
      isReady,
      isLoggedIn,
      isInClient,
      profile,
      error,
      errorDetails,
      liffId,
      closeLiff,
      openExternalUrl,
      retry,
      isRetrying,
      initProgress,
    }}>
      {children}
    </LiffContext.Provider>
  );
}
