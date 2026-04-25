import { describe, expect, it } from 'vitest';
import {
  hasPortalAdminAccess,
  hasPortalGlobalScope,
  hasPortalHrAccess,
  hasPortalManagerAccess,
  hasPortalTeamScope,
  normalizeRoleKey,
} from '../hr-roles';

describe('HR portal role helpers', () => {
  it('normalizes role keys before permission checks', () => {
    expect(normalizeRoleKey(' Owner ')).toBe('owner');
    expect(normalizeRoleKey(null)).toBe('');
  });

  it('keeps admin access limited to owner and admin', () => {
    expect(hasPortalAdminAccess('owner')).toBe(true);
    expect(hasPortalAdminAccess('admin')).toBe(true);
    expect(hasPortalAdminAccess('hr')).toBe(false);
  });

  it('treats HR, admin, and owner as global HR scope roles', () => {
    expect(hasPortalHrAccess('hr')).toBe(true);
    expect(hasPortalGlobalScope('admin')).toBe(true);
    expect(hasPortalGlobalScope('owner')).toBe(true);
    expect(hasPortalGlobalScope('manager')).toBe(false);
  });

  it('distinguishes branch-scoped team roles from global roles', () => {
    expect(hasPortalTeamScope('manager')).toBe(true);
    expect(hasPortalTeamScope('supervisor')).toBe(true);
    expect(hasPortalTeamScope('hr')).toBe(false);
  });

  it('allows manager surfaces for manager, supervisor, HR, admin, and owner', () => {
    expect(hasPortalManagerAccess('manager')).toBe(true);
    expect(hasPortalManagerAccess('supervisor')).toBe(true);
    expect(hasPortalManagerAccess('hr')).toBe(true);
    expect(hasPortalManagerAccess('admin')).toBe(true);
    expect(hasPortalManagerAccess('owner')).toBe(true);
    expect(hasPortalManagerAccess('employee')).toBe(false);
  });
});
