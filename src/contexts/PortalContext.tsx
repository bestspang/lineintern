import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLiffOptional } from './LiffContext';

interface EmployeeRole {
  display_name_th: string;
  display_name_en: string;
  role_key: string;
}

interface EmployeeBranch {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  code: string;
  full_name: string;
  line_user_id: string | null;
  role: EmployeeRole | null;
  role_id: string | null;
  branch: EmployeeBranch | null;
  branch_id: string | null;
  birth_date: string | null;
  skip_attendance_tracking?: boolean;
  exclude_from_points?: boolean;
}

interface MenuItem {
  id: string;
  menu_key: string;
  display_name_th: string;
  display_name_en: string;
  icon: string;
  action_type: string;
  action_url: string;
  display_order: number;
}

interface PortalContextType {
  employee: Employee | null;
  menuItems: MenuItem[];
  loading: boolean;
  error: string | null;
  locale: 'th' | 'en';
  setLocale: (locale: 'th' | 'en') => void;
  token: string | null;
  isManager: boolean;
  isAdmin: boolean;
  refreshData: () => Promise<void>;
  sessionExpiresAt: Date | null;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

// Session duration: 2 hours (same as token validity, but we'll refresh at 80%)
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const REFRESH_THRESHOLD_MS = SESSION_DURATION_MS * 0.8; // Refresh at 80% (96 minutes)
const WARNING_THRESHOLD_MS = 5 * 60 * 1000; // Warn 5 minutes before expiry

export function PortalProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<'th' | 'en'>('th');
  const [token, setToken] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<Date | null>(null);
  const [authMethod, setAuthMethod] = useState<'token' | 'liff' | null>(null);
  
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownWarning = useRef(false);

  // Get LIFF context safely - returns null if not in LiffProvider
  const liffContext = useLiffOptional();
  
  // Create derived state for proper dependency tracking
  const liffIsReady = liffContext?.isReady ?? false;
  const liffIsLoggedIn = liffContext?.isLoggedIn ?? false;
  const liffUserId = liffContext?.profile?.userId ?? null;
  
  console.log('[Portal] LIFF state:', { liffIsReady, liffIsLoggedIn, liffUserId });

  const validateToken = useCallback(async (tokenValue: string, isRefresh = false) => {
    try {
      if (!isRefresh) {
        setLoading(true);
      }
      setError(null);

      const { data, error: validateError } = await supabase.functions.invoke(
        'employee-menu-validate',
        {
          body: { token: tokenValue }
        }
      );

      if (validateError || !data?.success) {
        setError(data?.error || 'Invalid or expired token');
        setLoading(false);
        return false;
      }

      setEmployee(data.employee);
      setMenuItems(data.menuItems || []);
      setToken(tokenValue);
      setAuthMethod('token');
      
      // Set session expiry time
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      setSessionExpiresAt(expiresAt);
      hasShownWarning.current = false;
      
      setLoading(false);
      return true;
    } catch (err) {
      console.error('Error validating token:', err);
      setError('Failed to load portal');
      setLoading(false);
      return false;
    }
  }, []);

  const validateLiffUser = useCallback(async (lineUserId: string) => {
    try {
      setLoading(true);
      setError(null);

      console.log('[Portal] Validating via LIFF User ID');

      const { data, error: validateError } = await supabase.functions.invoke(
        'employee-liff-validate',
        {
          body: { line_user_id: lineUserId }
        }
      );

      if (validateError) {
        console.error('[Portal] LIFF validation error:', validateError);
        setError('ไม่สามารถเข้าสู่ระบบได้');
        setLoading(false);
        return false;
      }

      if (!data?.success) {
        setError(data?.message || data?.error || 'ไม่พบข้อมูลพนักงาน');
        setLoading(false);
        return false;
      }

      setEmployee(data.employee);
      setMenuItems(data.menuItems || []);
      setAuthMethod('liff');
      
      // LIFF sessions don't expire the same way, but set a long session
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      setSessionExpiresAt(expiresAt);
      hasShownWarning.current = false;
      
      setLoading(false);
      return true;
    } catch (err) {
      console.error('[Portal] Error validating LIFF user:', err);
      setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
      setLoading(false);
      return false;
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (authMethod === 'token' && token) {
      await validateToken(token, true);
    } else if (authMethod === 'liff' && liffUserId) {
      await validateLiffUser(liffUserId);
    }
  }, [authMethod, token, liffUserId, validateToken, validateLiffUser]);

  // Setup auto-refresh and warning timers
  useEffect(() => {
    if (!employee || !sessionExpiresAt) return;

    // Clear existing timers
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    const now = Date.now();
    const expiryTime = sessionExpiresAt.getTime();
    const timeUntilRefresh = Math.max(0, expiryTime - now - (SESSION_DURATION_MS - REFRESH_THRESHOLD_MS));
    const timeUntilWarning = Math.max(0, expiryTime - now - WARNING_THRESHOLD_MS);

    // Set up refresh timer (silent refresh at 80% of session)
    refreshTimerRef.current = setTimeout(() => {
      console.log('[Portal] Auto-refreshing session...');
      refreshData();
    }, timeUntilRefresh);

    // Set up warning timer (5 minutes before expiry) - only for token auth
    if (authMethod === 'token') {
      warningTimerRef.current = setTimeout(() => {
        if (!hasShownWarning.current) {
          hasShownWarning.current = true;
          toast.warning(
            locale === 'th' 
              ? 'Session ของคุณจะหมดอายุใน 5 นาที' 
              : 'Your session will expire in 5 minutes',
            {
              duration: 10000,
              action: {
                label: locale === 'th' ? 'ต่ออายุ' : 'Refresh',
                onClick: () => refreshData(),
              },
            }
          );
        }
      }, timeUntilWarning);
    }

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [employee, sessionExpiresAt, authMethod, locale, refreshData]);

  // Initial authentication
  useEffect(() => {
    console.log('[Portal] Auth check:', { 
      tokenFromUrl: !!searchParams.get('token'), 
      storedToken: !!sessionStorage.getItem('portal_token'),
      liffIsReady, 
      liffIsLoggedIn, 
      liffUserId,
      liffError: liffContext?.error
    });

    const tokenFromUrl = searchParams.get('token');
    const storedToken = sessionStorage.getItem('portal_token');
    const tokenToUse = tokenFromUrl || storedToken;

    // Priority 1: Use token from URL or session storage
    if (tokenToUse) {
      console.log('[Portal] Authenticating via token');
      if (tokenFromUrl) {
        sessionStorage.setItem('portal_token', tokenFromUrl);
      }
      validateToken(tokenToUse);
      return;
    }

    // Priority 2: Use LIFF authentication if available
    if (!liffIsReady) {
      // Wait for LIFF to be ready
      console.log('[Portal] Waiting for LIFF to be ready...');
      return;
    }

    // LIFF is ready - check various states
    if (liffContext?.error) {
      console.log('[Portal] LIFF has error:', liffContext.error);
      setError('ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
      return;
    }

    if (liffIsLoggedIn && liffUserId) {
      console.log('[Portal] Authenticating via LIFF, userId:', liffUserId);
      validateLiffUser(liffUserId);
      return;
    }

    // LIFF ready but not logged in
    if (!liffIsLoggedIn) {
      console.log('[Portal] LIFF ready but user not logged in');
      setError('กรุณาเปิดผ่าน LINE App เพื่อเข้าใช้งาน');
      setLoading(false);
      return;
    }

    // No authentication method available
    console.log('[Portal] No authentication method available');
    setError('กรุณาพิมพ์ /menu ใน LINE เพื่อรับลิงก์เข้าใช้งาน');
    setLoading(false);
  }, [searchParams, validateToken, validateLiffUser, liffIsReady, liffIsLoggedIn, liffUserId, liffContext?.error]);

  // Determine role permissions
  const roleKey = employee?.role?.role_key?.toLowerCase() || '';
  const isManager = roleKey === 'manager' || roleKey === 'supervisor' || roleKey === 'admin' || roleKey === 'owner';
  const isAdmin = roleKey === 'admin' || roleKey === 'owner';

  return (
    <PortalContext.Provider
      value={{
        employee,
        menuItems,
        loading,
        error,
        locale,
        setLocale,
        token,
        isManager,
        isAdmin,
        refreshData,
        sessionExpiresAt,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const context = useContext(PortalContext);
  if (context === undefined) {
    throw new Error('usePortal must be used within a PortalProvider');
  }
  return context;
}
