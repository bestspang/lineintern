import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, AppRole } from './useUserRole';

interface PageConfig {
  id: string;
  role: AppRole;
  menu_group: string;
  page_path: string;
  page_name: string;
  can_access: boolean;
}

export function usePageAccess() {
  const { role, canAccessMenuGroup, isAdmin, isOwner, isLoading: roleLoading } = useUserRole();

  const { data: pageConfigs, isLoading: pageConfigLoading, isFetching } = useQuery({
    queryKey: ['webapp-page-config', role],
    queryFn: async () => {
      if (!role) return [];
      
      const { data, error } = await supabase
        .from('webapp_page_config')
        .select('*')
        .eq('role', role);
      
      if (error) {
        console.error('Error fetching page config:', error);
        return [];
      }
      
      return data as PageConfig[];
    },
    enabled: !!role,
  });

  const canAccessPage = (path: string): boolean => {
    // Owner and Admin always have full access
    if (isOwner || isAdmin) return true;
    
    // If still loading, default to false to prevent showing unauthorized menus
    if (roleLoading || pageConfigLoading) return false;
    
    // Find the page config for this path
    const pageConfig = pageConfigs?.find(pc => pc.page_path === path);
    
    // If no specific page config, deny access (security first)
    if (!pageConfig) {
      // Find menu group from path
      const menuGroup = getMenuGroupFromPath(path);
      if (!menuGroup) return false; // Unknown path = deny
      return canAccessMenuGroup(menuGroup);
    }
    
    // First check if menu group is accessible
    if (!canAccessMenuGroup(pageConfig.menu_group)) {
      return false;
    }
    
    // Then check page-level access
    return pageConfig.can_access;
  };

  const getAccessiblePages = (menuGroup: string): string[] => {
    // Owner and Admin can access all pages
    if (isOwner || isAdmin) {
      return pageConfigs?.filter(pc => pc.menu_group === menuGroup).map(pc => pc.page_path) || [];
    }
    
    // First check if the menu group is accessible
    if (!canAccessMenuGroup(menuGroup)) {
      return [];
    }
    
    // Return only pages with can_access = true
    return pageConfigs?.filter(pc => pc.menu_group === menuGroup && pc.can_access).map(pc => pc.page_path) || [];
  };

  const getPagesByMenuGroup = (menuGroup: string): PageConfig[] => {
    return pageConfigs?.filter(pc => pc.menu_group === menuGroup) || [];
  };

  // Get the first accessible page for redirect purposes
  const getFirstAccessiblePage = (): string | null => {
    if (!pageConfigs || pageConfigs.length === 0) return null;
    
    // Priority order of menu groups
    const menuGroupOrder = ['Dashboard', 'Attendance', 'Management', 'Content & Knowledge', 'AI Features', 'Monitoring & Tools', 'Configuration'];
    
    for (const menuGroup of menuGroupOrder) {
      if (!canAccessMenuGroup(menuGroup)) continue;
      
      const accessiblePages = pageConfigs
        .filter(pc => pc.menu_group === menuGroup && pc.can_access)
        .sort((a, b) => a.page_path.localeCompare(b.page_path));
      
      if (accessiblePages.length > 0) {
        return accessiblePages[0].page_path;
      }
    }
    
    return null;
  };

  return {
    canAccessPage,
    getAccessiblePages,
    getPagesByMenuGroup,
    getFirstAccessiblePage,
    pageConfigs,
    loading: roleLoading || pageConfigLoading || isFetching || (!!role && !pageConfigs),
  };
}

// Helper to determine menu group from path
function getMenuGroupFromPath(path: string): string | null {
  if (path === '/' || path === '/health' || path === '/config-validator') {
    return 'Dashboard';
  }
  if (path.startsWith('/attendance')) {
    return 'Attendance';
  }
  if (['/groups', '/users', '/tasks', '/commands', '/alerts', '/broadcast', '/direct-messages', '/summaries', '/reports', '/cron-jobs'].includes(path)) {
    return 'Management';
  }
  if (['/memory', '/memory-analytics', '/personality', '/analytics'].includes(path)) {
    return 'AI Features';
  }
  if (['/faq-logs', '/knowledge', '/training', '/safety-rules'].includes(path)) {
    return 'Content & Knowledge';
  }
  if (['/settings', '/integrations'].includes(path) || path.startsWith('/settings/')) {
    return 'Configuration';
  }
  if (['/bot-logs', '/test-bot'].includes(path)) {
    return 'Monitoring & Tools';
  }
  return null;
}
