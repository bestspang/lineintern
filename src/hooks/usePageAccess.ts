/**
 * ⚠️ VERIFIED 2026-05-02 — page-level RBAC. Pairs with ProtectedRoute + role_access_levels DB.
 * Changing access logic here can lock users out of legit pages. Test with all role tiers.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, AppRole } from './useUserRole';
import {
  normalizeAdminPath,
  resolveAdminMenuGroup,
  toIdForm,
  MENU_GROUP_PRIORITY,
  PATH_ALIASES,
} from '@/lib/admin-page-registry';

interface PageConfig {
  id: string;
  role: AppRole;
  menu_group: string;
  page_path: string;
  page_name: string;
  can_access: boolean;
}

/**
 * Build a lookup that accepts both the canonical path and any legacy
 * alias from `PATH_ALIASES`, so DB rows like `/attendance/employee-history/:id`
 * still grant the same access as the canonical route.
 */
function buildPageConfigMap(configs: PageConfig[]): Map<string, PageConfig> {
  const map = new Map<string, PageConfig>();
  for (const cfg of configs) {
    const canonical = normalizeAdminPath(cfg.page_path);
    map.set(canonical, cfg);
    // Also index by the original path so direct lookups still work
    map.set(cfg.page_path, cfg);
  }
  // Index alias forms back to their canonical config (if present)
  for (const [legacy, canonical] of Object.entries(PATH_ALIASES)) {
    if (!map.has(legacy) && map.has(canonical)) {
      map.set(legacy, map.get(canonical)!);
    }
  }
  return map;
}

export function usePageAccess() {
  const { role, canAccessMenuGroup, isAdmin, isOwner, isLoading: roleLoading } = useUserRole();

  const { data: pageConfigs, isLoading: pageConfigLoading } = useQuery({
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

    // Normalize incoming path so /overview, /branch-reports, etc. all resolve
    const canonicalPath = normalizeAdminPath(toIdForm(path));

    // Hardening: if pageConfigs failed to load (network race / partial load),
    // fall back to menu group check instead of hard-deny.
    if (!pageConfigs || pageConfigs.length === 0) {
      const menuGroup = resolveAdminMenuGroup(canonicalPath);
      if (!menuGroup) return false;
      return canAccessMenuGroup(menuGroup);
    }

    const lookup = buildPageConfigMap(pageConfigs);
    const pageConfig =
      lookup.get(canonicalPath) ??
      lookup.get(path) ??
      lookup.get(toIdForm(path));

    // If no specific page config, fall back to menu group access
    if (!pageConfig) {
      const menuGroup = resolveAdminMenuGroup(canonicalPath);
      if (!menuGroup) return false;
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

    for (const menuGroup of MENU_GROUP_PRIORITY) {
      if (!canAccessMenuGroup(menuGroup)) continue;

      const accessiblePages = pageConfigs
        .filter(pc => pc.menu_group === menuGroup && pc.can_access)
        .map(pc => normalizeAdminPath(pc.page_path))
        // Skip dynamic routes like `/something/:id` — never a safe landing page
        .filter(p => !p.includes(':'))
        .sort((a, b) => a.localeCompare(b));

      if (accessiblePages.length > 0) {
        return accessiblePages[0];
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
    loading: roleLoading || pageConfigLoading,
  };
}
