import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'owner' | 'executive' | 'manager' | 'field' | 'moderator' | 'user';

// Role priority: lower number = higher authority
const rolePriority: Record<AppRole, number> = {
  owner: 1,
  admin: 2,
  executive: 3,
  manager: 4,
  moderator: 5,
  field: 6,
  user: 7,
};

// Mapping user role to max employee role priority they can assign
// Higher number = can assign more roles (employee_roles.priority)
const userToMaxEmployeeRolePriority: Record<AppRole, number> = {
  owner: 999,     // Can assign any role
  admin: 8,       // Can assign up to admin (priority 8)
  executive: 5,   // Can assign up to manager (priority 5)
  manager: 1,     // Can assign up to field (priority 1)
  moderator: 0,   // Employee only (priority 0)
  field: 0,       // Employee only
  user: 0,        // Employee only
};

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
    // Admin and owner can access everything
    if (roleData === 'admin' || roleData === 'owner') return true;
    
    // If no role assigned, deny access
    if (!roleData) return false;
    
    // If menu config not loaded yet, deny access for safety
    if (!menuConfig || Object.keys(menuConfig).length === 0) {
      return false;
    }
    
    // For other roles, check config
    return menuConfig[menuGroup] ?? false;
  };

  const hasFullAccess = roleData === 'admin' || roleData === 'owner';

  // Check if current user can manage (edit permissions of) a target role
  // User can only manage roles with LOWER priority (higher number)
  const canManageRole = (targetRole: AppRole): boolean => {
    if (!roleData) return false;
    // Must be admin or owner to manage any roles
    if (roleData !== 'admin' && roleData !== 'owner') return false;
    
    const myPriority = rolePriority[roleData];
    const targetPriority = rolePriority[targetRole];
    
    // Can only manage roles with strictly lower priority (higher number)
    return targetPriority > myPriority;
  };

  // Check if current user can assign a specific employee role
  // Based on employee_roles.priority from the database
  const canAssignEmployeeRole = (employeeRolePriority: number | null): boolean => {
    if (!roleData) return false;
    const maxPriority = userToMaxEmployeeRolePriority[roleData];
    return (employeeRolePriority ?? 0) <= maxPriority;
  };

  return {
    role: roleData,
    isLoading: isUserLoading || isRoleLoading || isMenuLoading,
    canAccessMenuGroup,
    canManageRole,
    canAssignEmployeeRole,
    isAdmin: roleData === 'admin',
    isOwner: roleData === 'owner',
    hasFullAccess,
  };
}
