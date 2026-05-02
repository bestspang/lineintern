/**
 * ⚠️ VERIFIED 2026-05-02 — DO NOT REFACTOR (production-critical timezone math)
 * ⚠️⚠️⚠️ CRITICAL TIMEZONE HANDLING - DO NOT MODIFY WITHOUT REVIEW ⚠️⚠️⚠️
 * 
 * Timezone Utility Module for Bangkok (Asia/Bangkok, UTC+7)
 * 
 * Provides consistent timezone handling across all edge functions.
 * Uses date-fns-tz for proper Bangkok time conversion.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️⚠️ CRITICAL BUG PREVENTION - DOUBLE CONVERSION ⚠️⚠️⚠️
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ❌ WRONG - Double conversion (adds +7 TWICE = +14 hours!):
 *    const bangkokNow = getBangkokNow();
 *    formatBangkokTime(bangkokNow, 'HH:mm:ss');  // WRONG!
 * 
 * ❌ WRONG - Same problem with toBangkokTime:
 *    const zonedDate = toBangkokTime(someDate);
 *    formatBangkokTime(zonedDate, 'HH:mm:ss');  // WRONG!
 * 
 * ✅ CORRECT - Single conversion from UTC:
 *    formatBangkokTime(new Date(), 'HH:mm:ss');  // UTC → Bangkok (once)
 *    formatBangkokTime(utcDateFromDB, 'HH:mm:ss');  // UTC → Bangkok (once)
 * 
 * ✅ CORRECT - Direct access to zoned values:
 *    const bangkokNow = getBangkokNow();
 *    const hours = bangkokNow.getHours();  // Already in Bangkok!
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * INVARIANTS (MUST FOLLOW):
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. All server_time values in database are stored in UTC (ISO 8601)
 * 
 * 2. Use formatBangkokTime() for display - NEVER use toLocaleString()
 * 
 * 3. Use getBangkokStartOfDay/getBangkokEndOfDay for date boundaries
 * 
 * 4. When creating Bangkok midnight/specific time manually:
 *    ✅ CORRECT: new Date("2025-01-01T23:59:59+07:00")  // Bangkok midnight
 *    ❌ WRONG:   new Date("2025-01-01T23:59:59")        // This is UTC!
 * 
 * 5. checkout.server_time MUST be > checkin.server_time for valid sessions
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMON BUGS TO AVOID:
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * BUG #1: Midnight without timezone offset
 *   ❌ new Date("2025-11-29T23:59:59")
 *      → Interpreted as UTC 23:59:59
 *      → In Bangkok = 06:59:59 NEXT DAY (Nov 30)
 *   ✅ new Date("2025-11-29T23:59:59+07:00")
 *      → Bangkok 23:59:59 = UTC 16:59:59 (Same day)
 * 
 * BUG #2: Using .find() for checkout without checking time order
 *   ❌ logs.find(l => l.event_type === 'check_out')
 *      → May find auto-checkout from previous day
 *   ✅ logs.find(l => l.event_type === 'check_out' && 
 *        new Date(l.server_time) > new Date(checkIn.server_time))
 * 
 * BUG #3: Negative work hours
 *   ❌ Allowing checkout < checkin to calculate hours
 *   ✅ Always validate: if (end <= start) return 0;
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Before modifying any timezone-related code:
 * [ ] Are you using +07:00 offset for Bangkok times?
 * [ ] Are you checking checkout > checkin for session validity?
 * [ ] Are you using Math.max(0, hours) to prevent negative values?
 * [ ] Are you using formatBangkokTime() instead of toLocaleString()?
 * [ ] Are you using getBangkokStartOfDay/EndOfDay for date boundaries?
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { toZonedTime, fromZonedTime, formatInTimeZone } from 'npm:date-fns-tz@3.2.0';
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
 * FIXED: Use formatInTimeZone for single conversion (no double conversion)
 * @param date - Date to format
 * @param formatString - Format pattern (e.g., 'yyyy-MM-dd HH:mm:ss')
 * @returns Formatted string in Bangkok timezone (24-hour format)
 */
export function formatBangkokTime(date: Date | string, formatString: string = 'yyyy-MM-dd HH:mm:ss'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(dateObj, BANGKOK_TIMEZONE, formatString);
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
 * FIXED: Use formatInTimeZone for single conversion
 * @param date - Optional date (defaults to now)
 * @returns Date string in Bangkok timezone
 */
export function getBangkokDateString(date?: Date | string): string {
  const dateObj = date ? (typeof date === 'string' ? parseISO(date) : date) : new Date();
  return formatInTimeZone(dateObj, BANGKOK_TIMEZONE, 'yyyy-MM-dd');
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
 * FIXED: Use formatInTimeZone for single conversion (24-hour format)
 * @param date - Optional date (defaults to now)
 * @returns Object with Bangkok time components in 24-hour format
 */
export function getBangkokTimeComponents(date?: Date | string): {
  date: string;
  time: string;
  datetime: string;
  iso: string;
} {
  const dateObj = date ? (typeof date === 'string' ? parseISO(date) : date) : new Date();
  
  return {
    date: formatInTimeZone(dateObj, BANGKOK_TIMEZONE, 'yyyy-MM-dd'),
    time: formatInTimeZone(dateObj, BANGKOK_TIMEZONE, 'HH:mm:ss'),
    datetime: formatInTimeZone(dateObj, BANGKOK_TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
    iso: dateObj.toISOString(),
  };
}
