import { describe, expect, it } from 'vitest';
import {
  isCheckInType,
  isCheckOutType,
  normalizeAttendanceEventType,
  toCanonicalAttendanceEventType,
} from '../portal-attendance';

describe('portal attendance event helpers', () => {
  it('normalizes legacy kebab-case and current snake_case values', () => {
    expect(normalizeAttendanceEventType('check-in')).toBe('check_in');
    expect(normalizeAttendanceEventType(' CHECK_OUT ')).toBe('check_out');
  });

  it('detects check-in and check-out variants', () => {
    expect(isCheckInType('check_in')).toBe(true);
    expect(isCheckInType('check-in')).toBe(true);
    expect(isCheckInType('check_out')).toBe(false);

    expect(isCheckOutType('check_out')).toBe(true);
    expect(isCheckOutType('check-out')).toBe(true);
    expect(isCheckOutType('check_in')).toBe(false);
  });

  it('returns canonical event types only for known attendance events', () => {
    expect(toCanonicalAttendanceEventType('check-in')).toBe('check_in');
    expect(toCanonicalAttendanceEventType('check_out')).toBe('check_out');
    expect(toCanonicalAttendanceEventType('break_start')).toBeNull();
    expect(toCanonicalAttendanceEventType(null)).toBeNull();
  });
});
