/**
 * Timezone Utility Module
 * 
 * Provides consistent timezone handling across all edge functions.
 * Uses date-fns-tz for proper Bangkok time conversion.
 * 
 * CRITICAL: Always use these utilities instead of Date.toLocaleString() or manual timezone math
 * to avoid timezone-related bugs in auto-checkout and reminder systems.
 */

import { toZonedTime, fromZonedTime, format } from 'npm:date-fns-tz@3.2.0';
import { parseISO, startOfDay, endOfDay, isAfter, isBefore, addMinutes, differenceInMinutes } from 'npm:date-fns@4.1.0';

export const BANGKOK_TIMEZONE = 'Asia/Bangkok';

/**
 * Get current time in Bangkok timezone as a Date object
 * Use this instead of new Date() when you need Bangkok time
 */
export function getBangkokNow(): Date {
  return toZonedTime(new Date(), BANGKOK_TIMEZONE);
}

/**
 * Convert UTC date to Bangkok timezone
 * @param utcDate - Date in UTC (from database)
 * @returns Date object in Bangkok timezone
 */
export function toBangkokTime(utcDate: Date | string): Date {
  const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
  return toZonedTime(date, BANGKOK_TIMEZONE);
}

/**
 * Convert Bangkok time to UTC for database storage
 * @param bangkokDate - Date in Bangkok timezone
 * @returns Date object in UTC
 */
export function toUTC(bangkokDate: Date): Date {
  return fromZonedTime(bangkokDate, BANGKOK_TIMEZONE);
}

/**
 * Format date in Bangkok timezone
 * @param date - Date to format
 * @param formatString - Format pattern (e.g., 'yyyy-MM-dd HH:mm:ss')
 * @returns Formatted string in Bangkok timezone
 */
export function formatBangkokTime(date: Date | string, formatString: string = 'yyyy-MM-dd HH:mm:ss'): string {
  const bangkokDate = toBangkokTime(date);
  return format(bangkokDate, formatString, { timeZone: BANGKOK_TIMEZONE });
}

/**
 * Get start of day in Bangkok timezone (00:00:00)
 * @param date - Optional date (defaults to now)
 * @returns Start of day in Bangkok timezone as UTC Date
 */
export function getBangkokStartOfDay(date?: Date | string): Date {
  const bangkokDate = date ? toBangkokTime(date) : getBangkokNow();
  const startOfDayBangkok = startOfDay(bangkokDate);
  return toUTC(startOfDayBangkok);
}

/**
 * Get end of day in Bangkok timezone (23:59:59.999)
 * @param date - Optional date (defaults to now)
 * @returns End of day in Bangkok timezone as UTC Date
 */
export function getBangkokEndOfDay(date?: Date | string): Date {
  const bangkokDate = date ? toBangkokTime(date) : getBangkokNow();
  const endOfDayBangkok = endOfDay(bangkokDate);
  return toUTC(endOfDayBangkok);
}

/**
 * Get Bangkok date string in YYYY-MM-DD format
 * @param date - Optional date (defaults to now)
 * @returns Date string in Bangkok timezone
 */
export function getBangkokDateString(date?: Date | string): string {
  const bangkokDate = date ? toBangkokTime(date) : getBangkokNow();
  return format(bangkokDate, 'yyyy-MM-dd', { timeZone: BANGKOK_TIMEZONE });
}

/**
 * Check if a time has passed in Bangkok timezone
 * @param targetTime - Target time to check
 * @returns true if current Bangkok time is after target time
 */
export function hasBangkokTimePassed(targetTime: Date | string): boolean {
  const now = getBangkokNow();
  const target = toBangkokTime(targetTime);
  return isAfter(now, target);
}

/**
 * Check if current time is before target in Bangkok timezone
 * @param targetTime - Target time to check
 * @returns true if current Bangkok time is before target time
 */
export function isBeforeBangkokTime(targetTime: Date | string): boolean {
  const now = getBangkokNow();
  const target = toBangkokTime(targetTime);
  return isBefore(now, target);
}

/**
 * Add minutes to Bangkok time and return as UTC
 * @param date - Base date
 * @param minutes - Minutes to add
 * @returns UTC Date with minutes added in Bangkok timezone
 */
export function addMinutesBangkok(date: Date | string, minutes: number): Date {
  const bangkokDate = toBangkokTime(date);
  const newBangkokDate = addMinutes(bangkokDate, minutes);
  return toUTC(newBangkokDate);
}

/**
 * Calculate difference in minutes between two dates in Bangkok timezone
 * @param laterDate - Later date
 * @param earlierDate - Earlier date
 * @returns Difference in minutes
 */
export function getDifferenceInMinutes(laterDate: Date | string, earlierDate: Date | string): number {
  const later = toBangkokTime(laterDate);
  const earlier = toBangkokTime(earlierDate);
  return differenceInMinutes(later, earlier);
}

/**
 * Get Bangkok time components for logging
 * @param date - Optional date (defaults to now)
 * @returns Object with Bangkok time components
 */
export function getBangkokTimeComponents(date?: Date | string): {
  date: string;
  time: string;
  datetime: string;
  iso: string;
} {
  const bangkokDate = date ? toBangkokTime(date) : getBangkokNow();
  
  return {
    date: format(bangkokDate, 'yyyy-MM-dd', { timeZone: BANGKOK_TIMEZONE }),
    time: format(bangkokDate, 'HH:mm:ss', { timeZone: BANGKOK_TIMEZONE }),
    datetime: format(bangkokDate, 'yyyy-MM-dd HH:mm:ss', { timeZone: BANGKOK_TIMEZONE }),
    iso: bangkokDate.toISOString(),
  };
}
