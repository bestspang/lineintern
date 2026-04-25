export type AttendanceEventType = string | null | undefined;

export const CHECK_IN_EVENT_TYPES = ['check_in', 'check-in'] as const;
export const CHECK_OUT_EVENT_TYPES = ['check_out', 'check-out'] as const;

export type CanonicalAttendanceEventType = 'check_in' | 'check_out';

export const normalizeAttendanceEventType = (
  eventType: AttendanceEventType,
): string => eventType?.trim().toLowerCase().replace(/-/g, '_') ?? '';

export const isCheckInType = (eventType: AttendanceEventType) =>
  normalizeAttendanceEventType(eventType) === 'check_in';

export const isCheckOutType = (eventType: AttendanceEventType) =>
  normalizeAttendanceEventType(eventType) === 'check_out';

export const toCanonicalAttendanceEventType = (
  eventType: AttendanceEventType,
): CanonicalAttendanceEventType | null => {
  const normalized = normalizeAttendanceEventType(eventType);
  if (normalized === 'check_in' || normalized === 'check_out') {
    return normalized;
  }
  return null;
};
