export type AttendanceEventType = string | null | undefined;

export const CHECK_IN_EVENT_TYPES = ['check_in', 'check-in'] as const;
export const CHECK_OUT_EVENT_TYPES = ['check_out', 'check-out'] as const;

export function normalizeAttendanceEventType(eventType: AttendanceEventType): string {
  return eventType?.trim().toLowerCase().replaceAll('-', '_') ?? '';
}

export function isCheckInType(eventType: AttendanceEventType): boolean {
  return normalizeAttendanceEventType(eventType) === 'check_in';
}

export function isCheckOutType(eventType: AttendanceEventType): boolean {
  return normalizeAttendanceEventType(eventType) === 'check_out';
}
