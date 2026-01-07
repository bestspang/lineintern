/**
 * LIFF Context - LINE Front-end Framework Integration
 * Provides LIFF SDK initialization and user profile access
 */

/**
 * LIFF Context - LINE Front-end Framework Integration
 * Provides LIFF SDK initialization and user profile access
 */

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

  const initLiff = useCallback(async (isRetry = false) => {
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
      
      // Get LIFF_ID from api_configurations
      const { data: config, error: configError } = await supabase
        .from('api_configurations')
        .select('key_value')
        .eq('key_name', 'LIFF_ID')
        .single();

      if (configError) {
        console.error('[LIFF] Error fetching LIFF_ID:', configError);
        const errInfo = categorizeError({ message: 'Config fetch failed' });
        setError(errInfo.message);
        setErrorDetails(errInfo);
        setIsReady(true);
        setIsRetrying(false);
        return;
      }

      if (!config?.key_value) {
        console.log('[LIFF] LIFF_ID not configured in api_configurations');
        const errInfo: LiffError = { type: 'config', message: 'LIFF ยังไม่ได้ตั้งค่า' };
        setError(errInfo.message);
        setErrorDetails(errInfo);
        setIsReady(true);
        setIsRetrying(false);
        return;
      }

      console.log('[LIFF] Got LIFF_ID:', config.key_value);
      setLiffId(config.key_value);

      // Dynamically import LIFF SDK
      console.log('[LIFF] Importing LIFF SDK...');
      const liffModule = await import('@line/liff');
      const liffInstance = liffModule.default;
      setLiff(liffInstance);

      // Initialize LIFF
      console.log('[LIFF] Calling liff.init()...');
      await liffInstance.init({
        liffId: config.key_value,
        withLoginOnExternalBrowser: true,
      });

      console.log('[LIFF] Init complete!');
      console.log('[LIFF] isInClient:', liffInstance.isInClient());
      console.log('[LIFF] isLoggedIn:', liffInstance.isLoggedIn());
      console.log('[LIFF] OS:', liffInstance.getOS?.() || 'unknown');
      console.log('[LIFF] Language:', liffInstance.getLanguage?.() || 'unknown');

      // CRITICAL: Check login and get profile BEFORE setting isReady
      // This prevents race condition where PortalContext sees isReady=true but isLoggedIn=false
      const loggedIn = liffInstance.isLoggedIn();
      let userProfile = null;

      if (loggedIn) {
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
      if (userProfile) {
        setProfile({
          userId: userProfile.userId,
          displayName: userProfile.displayName,
          pictureUrl: userProfile.pictureUrl,
          statusMessage: userProfile.statusMessage,
        });
      }
      setIsInClient(liffInstance.isInClient());
      setIsLoggedIn(loggedIn);
      setIsReady(true); // Set this LAST so other contexts see complete state
      setIsRetrying(false);
      setRetryCount(0);
    } catch (err: any) {
      console.error('[LIFF] Initialization error:', err);
      console.error('[LIFF] Error details:', JSON.stringify(err, null, 2));
      
      const errInfo = categorizeError(err);
      
      // Auto-retry for network errors
      if (errInfo.type === 'network' && retryCount < MAX_RETRIES) {
        console.log(`[LIFF] Network error, auto-retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => initLiff(true), 1000 * (retryCount + 1));
        return;
      }
      
      setError(errInfo.message);
      setErrorDetails(errInfo);
      setIsReady(true);
      setIsRetrying(false);
    }
  }, [retryCount]);

  // Manual retry function
  const retry = useCallback(() => {
    if (isRetrying) return;
    setRetryCount(0);
    setIsReady(false);
    initLiff(true);
  }, [initLiff, isRetrying]);

  useEffect(() => {
    initLiff();
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
    }}>
      {children}
    </LiffContext.Provider>
  );
}
