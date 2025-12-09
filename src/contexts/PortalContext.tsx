import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

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
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export function PortalProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<'th' | 'en'>('th');
  const [token, setToken] = useState<string | null>(null);

  const validateToken = async (tokenValue: string) => {
    try {
      setLoading(true);
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
      setLoading(false);
      return true;
    } catch (err) {
      console.error('Error validating token:', err);
      setError('Failed to load portal');
      setLoading(false);
      return false;
    }
  };

  const refreshData = async () => {
    if (token) {
      await validateToken(token);
    }
  };

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
  }, [searchParams]);

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
