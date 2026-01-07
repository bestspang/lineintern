/**
 * LIFF Context - LINE Front-end Framework Integration
 * Provides LIFF SDK initialization and user profile access
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

interface LiffContextType {
  isReady: boolean;
  isLoggedIn: boolean;
  profile: LiffProfile | null;
  error: string | null;
  liffId: string | null;
  closeLiff: () => void;
  openExternalUrl: (url: string) => void;
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
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liffId, setLiffId] = useState<string | null>(null);
  const [liff, setLiff] = useState<any>(null);

  useEffect(() => {
    const initLiff = async () => {
      try {
        console.log('[LIFF] Starting initialization...');
        
        // Get LIFF_ID from api_configurations
        const { data: config, error: configError } = await supabase
          .from('api_configurations')
          .select('key_value')
          .eq('key_name', 'LIFF_ID')
          .single();

        if (configError) {
          console.error('[LIFF] Error fetching LIFF_ID:', configError);
        }

        if (!config?.key_value) {
          console.log('[LIFF] LIFF_ID not configured in api_configurations');
          setError('LIFF not configured');
          setIsReady(true);
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

        setIsReady(true);

        if (liffInstance.isLoggedIn()) {
          setIsLoggedIn(true);
          
          // Get user profile
          console.log('[LIFF] Fetching user profile...');
          const userProfile = await liffInstance.getProfile();
          console.log('[LIFF] Got profile:', { userId: userProfile.userId, displayName: userProfile.displayName });
          setProfile({
            userId: userProfile.userId,
            displayName: userProfile.displayName,
            pictureUrl: userProfile.pictureUrl,
            statusMessage: userProfile.statusMessage,
          });
        } else {
          console.log('[LIFF] User not logged in - isInClient:', liffInstance.isInClient());
          // If in LINE client but not logged in, this is unusual
          if (liffInstance.isInClient()) {
            console.warn('[LIFF] In LINE client but not logged in - this should not happen');
          }
        }
      } catch (err: any) {
        console.error('[LIFF] Initialization error:', err);
        console.error('[LIFF] Error details:', JSON.stringify(err, null, 2));
        setError(err.message || 'Failed to initialize LIFF');
        setIsReady(true);
      }
    };

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
      profile,
      error,
      liffId,
      closeLiff,
      openExternalUrl,
    }}>
      {children}
    </LiffContext.Provider>
  );
}
