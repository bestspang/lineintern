import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownWarning = useRef(false);

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

  const refreshData = useCallback(async () => {
    if (token) {
      await validateToken(token, true);
    }
  }, [token, validateToken]);

  // Setup auto-refresh and warning timers
  useEffect(() => {
    if (!token || !sessionExpiresAt) return;

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

    // Set up warning timer (5 minutes before expiry)
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

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [token, sessionExpiresAt, locale, refreshData]);

  // Initial token validation
  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    const storedToken = sessionStorage.getItem('portal_token');
    
    const tokenToUse = tokenFromUrl || storedToken;

    if (!tokenToUse) {
      setError('Token is required');
      setLoading(false);
      return;
    }

    // Store token in session storage for navigation within portal
    if (tokenFromUrl) {
      sessionStorage.setItem('portal_token', tokenFromUrl);
    }

    validateToken(tokenToUse);
  }, [searchParams, validateToken]);

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
