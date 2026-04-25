export type RoleKeyInput = string | null | undefined;

export const ADMIN_ROLE_KEYS = ['admin', 'owner'] as const;
export const HR_ROLE_KEYS = ['hr', 'admin', 'owner'] as const;
export const TEAM_SCOPE_ROLE_KEYS = ['manager', 'supervisor'] as const;
export const MANAGER_ACCESS_ROLE_KEYS = [
  ...TEAM_SCOPE_ROLE_KEYS,
  ...HR_ROLE_KEYS,
] as const;

export function normalizeRoleKey(roleKey: RoleKeyInput): string {
  return roleKey?.trim().toLowerCase() ?? '';
}

function includesRole(roles: readonly string[], roleKey: RoleKeyInput): boolean {
  return roles.includes(normalizeRoleKey(roleKey));
}

export function hasPortalAdminAccess(roleKey: RoleKeyInput): boolean {
  return includesRole(ADMIN_ROLE_KEYS, roleKey);
}

export function hasPortalHrAccess(roleKey: RoleKeyInput): boolean {
  return includesRole(HR_ROLE_KEYS, roleKey);
}

export function hasPortalTeamScope(roleKey: RoleKeyInput): boolean {
  return includesRole(TEAM_SCOPE_ROLE_KEYS, roleKey);
}

export function hasPortalManagerAccess(roleKey: RoleKeyInput): boolean {
  return includesRole(MANAGER_ACCESS_ROLE_KEYS, roleKey);
}

export function hasPortalGlobalScope(roleKey: RoleKeyInput): boolean {
  return hasPortalHrAccess(roleKey);
}
