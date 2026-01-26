/**
 * ⚠️ TIMEZONE UTILITY - USE THIS FOR ALL DATE/TIME DISPLAY
 * 
 * This utility ensures consistent Bangkok timezone handling across the frontend.
 * 
 * INVARIANTS:
 * 1. All database times are stored in UTC
 * 2. All display times should be in Bangkok timezone (Asia/Bangkok, UTC+7)
 * 3. NEVER use toLocaleString() without timeZone parameter
 * 
 * USAGE:
 * - formatBangkokDateTime(date) - Full date and time
 * - formatBangkokDate(date) - Date only
 * - formatBangkokTime(date) - Time only
 */

export const BANGKOK_TIMEZONE = 'Asia/Bangkok';

/**
 * Format date as Bangkok datetime string
 * @param date - Date string or Date object
 * @returns Formatted datetime in Bangkok timezone (e.g., "2 ธ.ค. 2025 14:30:00")
 */
export function formatBangkokDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('th-TH', { timeZone: BANGKOK_TIMEZONE });
  } catch {
    return '-';
  }
}

/**
 * Format date as Bangkok date string
 * @param date - Date string or Date object
 * @returns Formatted date in Bangkok timezone (e.g., "2 ธ.ค. 2025")
 */
export function formatBangkokDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('th-TH', { timeZone: BANGKOK_TIMEZONE });
  } catch {
    return '-';
  }
}

/**
 * Format date as Bangkok time string
 * @param date - Date string or Date object
 * @returns Formatted time in Bangkok timezone (e.g., "14:30:00")
 */
export function formatBangkokTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('th-TH', { timeZone: BANGKOK_TIMEZONE });
  } catch {
    return '-';
  }
}

/**
 * Format date as Bangkok short date string
 * @param date - Date string or Date object
 * @returns Formatted short date (e.g., "2 ธ.ค.")
 */
export function formatBangkokShortDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('th-TH', { 
      timeZone: BANGKOK_TIMEZONE,
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '-';
  }
}

/**
 * Format date as Bangkok ISO date string (YYYY-MM-DD)
 * @param date - Date string or Date object
 * @returns ISO date string in Bangkok timezone
 */
export function formatBangkokISODate(date: string | Date | null | undefined): string {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    // Get Bangkok date components
    const bangkokDate = new Date(d.toLocaleString('en-US', { timeZone: BANGKOK_TIMEZONE }));
    const year = bangkokDate.getFullYear();
    const month = String(bangkokDate.getMonth() + 1).padStart(2, '0');
    const day = String(bangkokDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

/**
 * Get current Bangkok time as Date object
 * Note: The Date object itself is in UTC, but this returns the current Bangkok time
 * @returns Date object representing current Bangkok time
 */
export function getBangkokNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: BANGKOK_TIMEZONE }));
}

/**
 * Check if a date is today in Bangkok timezone
 * @param date - Date to check
 * @returns true if the date is today in Bangkok timezone
 */
export function isBangkokToday(date: string | Date | null | undefined): boolean {
  if (!date) return false;
  try {
    const today = formatBangkokISODate(new Date());
    const checkDate = formatBangkokISODate(date);
    return today === checkDate;
  } catch {
    return false;
  }
}

/**
 * Get hours and minutes in Bangkok timezone from a date
 * @param date - Date string or Date object (UTC)
 * @returns Object with hours and minutes in Bangkok timezone, or null if invalid
 */
export function getBangkokHoursMinutes(date: string | Date | null | undefined): { hours: number; minutes: number } | null {
  if (!date) return null;
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    const bangkokTime = new Date(d.toLocaleString('en-US', { timeZone: BANGKOK_TIMEZONE }));
    return {
      hours: bangkokTime.getHours(),
      minutes: bangkokTime.getMinutes()
    };
  } catch {
    return null;
  }
}

/**
 * Format date as Bangkok time string (HH:mm only)
 * @param date - Date string or Date object
 * @returns Formatted time in Bangkok timezone (e.g., "14:30")
 */
export function formatBangkokTimeShort(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('th-TH', { 
      timeZone: BANGKOK_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return '-';
  }
}

/**
 * Convert a local datetime-local input value to UTC ISO string
 * datetime-local gives "2025-01-26T08:30" without timezone
 * This assumes the input is Bangkok time and converts to UTC
 * @param localDatetime - Value from datetime-local input (e.g., "2025-01-26T08:30")
 * @returns UTC ISO string
 */
export function bangkokLocalToUTC(localDatetime: string): string {
  if (!localDatetime) return '';
  try {
    // Append Bangkok timezone offset (+07:00) to tell JS this is Bangkok time
    const bangkokDate = new Date(localDatetime + '+07:00');
    return bangkokDate.toISOString();
  } catch {
    return '';
  }
}
