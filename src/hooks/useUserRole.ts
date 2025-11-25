import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'executive' | 'manager' | 'field' | 'moderator' | 'user';

interface MenuConfig {
  menu_group: string;
  can_access: boolean;
}

export function useUserRole() {
  const { data: user, isLoading: isUserLoading } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: roleData, isLoading: isRoleLoading } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }
      
      return data?.role as AppRole | null;
    },
    enabled: !!user?.id,
  });

  const { data: menuConfig, isLoading: isMenuLoading } = useQuery({
    queryKey: ['webapp-menu-config', roleData],
    queryFn: async () => {
      const role = roleData || 'user';
      
      const { data, error } = await supabase
        .from('webapp_menu_config')
        .select('menu_group, can_access')
        .eq('role', role);
      
      if (error) {
        console.error('Error fetching menu config:', error);
        return {};
      }
      
      // Convert array to object for easy lookup
      return (data as MenuConfig[]).reduce((acc, item) => {
        acc[item.menu_group] = item.can_access;
        return acc;
      }, {} as Record<string, boolean>);
    },
    enabled: !isUserLoading && !isRoleLoading,
  });

  const canAccessMenuGroup = (menuGroup: string): boolean => {
    // Admin can access everything
    if (roleData === 'admin') return true;
    
    // Default to true if menu config not loaded yet or empty
    if (!menuConfig || Object.keys(menuConfig).length === 0) {
      return true;
    }
    
    // For other roles, check config
    return menuConfig[menuGroup] ?? false;
  };

  return {
    role: roleData,
    isLoading: isUserLoading || isRoleLoading || isMenuLoading,
    canAccessMenuGroup,
    isAdmin: roleData === 'admin',
  };
}
