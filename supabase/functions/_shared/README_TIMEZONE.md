# Timezone Utility Module

## 🎯 Purpose

This module provides **consistent Bangkok timezone handling** across all Edge Functions, preventing timezone-related bugs that can cause:
- ❌ Auto-checkout at wrong times
- ❌ Reminders sent at incorrect times
- ❌ Date comparisons failing
- ❌ Attendance logs showing wrong dates

## ⚠️ Critical Rules

### DO NOT USE:
```typescript
// ❌ WRONG - Unstable in serverless
new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })

// ❌ WRONG - Manual timezone math
new Date(Date.now() + (7 * 60 * 60 * 1000))

// ❌ WRONG - Doesn't handle DST or edge cases
const bangkokDate = new Date(utcDate.getTime() + 25200000)
```

### ALWAYS USE:
```typescript
import { getBangkokNow, toBangkokTime, formatBangkokTime } from './timezone.ts';

// ✅ CORRECT - Get current Bangkok time
const now = getBangkokNow();

// ✅ CORRECT - Convert UTC from DB to Bangkok
const bangkokTime = toBangkokTime(dbTimestamp);

// ✅ CORRECT - Format for display
const formatted = formatBangkokTime(date, 'yyyy-MM-dd HH:mm:ss');
```

## 📚 API Reference

### Core Functions

#### `getBangkokNow(): Date`
Get current time in Bangkok timezone.
```typescript
const now = getBangkokNow();
console.log(now); // Date object in Bangkok time
```

#### `toBangkokTime(utcDate: Date | string): Date`
Convert UTC date (from database) to Bangkok timezone.
```typescript
const dbTimestamp = '2025-01-15T10:00:00Z'; // UTC
const bangkokTime = toBangkokTime(dbTimestamp);
console.log(bangkokTime); // 17:00 Bangkok time
```

#### `toUTC(bangkokDate: Date): Date`
Convert Bangkok time back to UTC for database storage.
```typescript
const bangkokTime = new Date('2025-01-15 17:00:00');
const utcTime = toUTC(bangkokTime);
// Store utcTime in database
```

#### `formatBangkokTime(date: Date | string, format?: string): string`
Format date in Bangkok timezone for display.
```typescript
const formatted = formatBangkokTime(dbTimestamp, 'dd/MM/yyyy HH:mm');
// Output: "15/01/2025 17:00"
```

### Date Utilities

#### `getBangkokDateString(date?: Date | string): string`
Get date string in YYYY-MM-DD format for Bangkok timezone.
```typescript
const dateStr = getBangkokDateString(); // "2025-01-15"
```

#### `getBangkokStartOfDay(date?: Date | string): Date`
Get start of day (00:00:00) in Bangkok timezone as UTC.
```typescript
const startOfDay = getBangkokStartOfDay(); // Today 00:00:00 Bangkok as UTC
```

#### `getBangkokEndOfDay(date?: Date | string): Date`
Get end of day (23:59:59.999) in Bangkok timezone as UTC.
```typescript
const endOfDay = getBangkokEndOfDay(); // Today 23:59:59.999 Bangkok as UTC
```

### Time Comparison

#### `hasBangkokTimePassed(targetTime: Date | string): boolean`
Check if current Bangkok time is after target time.
```typescript
const graceExpiry = '2025-01-15T12:00:00Z';
if (hasBangkokTimePassed(graceExpiry)) {
  console.log('Grace period has expired');
}
```

#### `isBeforeBangkokTime(targetTime: Date | string): boolean`
Check if current Bangkok time is before target time.
```typescript
if (isBeforeBangkokTime(shiftStart)) {
  console.log('Before shift start time');
}
```

### Time Arithmetic

#### `addMinutesBangkok(date: Date | string, minutes: number): Date`
Add minutes in Bangkok timezone, return as UTC.
```typescript
const checkInTime = '2025-01-15T01:00:00Z';
const graceExpiry = addMinutesBangkok(checkInTime, 60); // +1 hour
```

#### `getDifferenceInMinutes(laterDate, earlierDate): number`
Calculate difference in minutes.
```typescript
const worked = getDifferenceInMinutes(checkOut, checkIn);
console.log(`Worked ${worked} minutes`);
```

### Logging Helper

#### `getBangkokTimeComponents(date?: Date | string): Object`
Get Bangkok time broken down for logging.
```typescript
const components = getBangkokTimeComponents();
console.log({
  date: components.date,        // "2025-01-15"
  time: components.time,        // "17:30:45"
  datetime: components.datetime, // "2025-01-15 17:30:45"
  iso: components.iso           // ISO string
});
```

## 🔧 Common Use Cases

### Auto-Checkout Logic
```typescript
import { getBangkokNow, hasBangkokTimePassed, getBangkokDateString } from '../_shared/timezone.ts';

// Get Bangkok date for filtering
const bangkokDate = getBangkokDateString();

// Fetch work sessions
const { data: sessions } = await supabase
  .from('work_sessions')
  .select('*')
  .eq('status', 'active')
  .eq('date', bangkokDate);

// Check if grace period expired
for (const session of sessions) {
  if (hasBangkokTimePassed(session.auto_checkout_grace_expires_at)) {
    // Perform auto-checkout
  }
}
```

### Reminder Scheduling
```typescript
import { getBangkokNow, addMinutesBangkok, formatBangkokTime } from '../_shared/timezone.ts';

const now = getBangkokNow();
const reminderTime = addMinutesBangkok(now, 30); // 30 minutes from now

console.log(`Reminder scheduled for: ${formatBangkokTime(reminderTime, 'HH:mm')}`);
```

### Date Filtering (Today's Logs)
```typescript
import { getBangkokStartOfDay, getBangkokEndOfDay } from '../_shared/timezone.ts';

const startOfDay = getBangkokStartOfDay();
const endOfDay = getBangkokEndOfDay();

const { data } = await supabase
  .from('attendance_logs')
  .select('*')
  .gte('server_time', startOfDay.toISOString())
  .lte('server_time', endOfDay.toISOString());
```

## 🐛 Common Mistakes to Avoid

### ❌ Comparing Bangkok Date Object with UTC String
```typescript
// WRONG
const bangkokNow = getBangkokNow();
const utcString = '2025-01-15T10:00:00Z';
if (bangkokNow > utcString) { } // Unreliable!

// CORRECT
const bangkokNow = getBangkokNow();
const bangkokTarget = toBangkokTime('2025-01-15T10:00:00Z');
if (bangkokNow > bangkokTarget) { } // Reliable!
```

### ❌ Using toISOString() on Bangkok Date
```typescript
// WRONG - Creates "fake Bangkok" time in UTC
const bangkokNow = getBangkokNow();
await supabase
  .from('work_sessions')
  .select('*')
  .eq('date', bangkokNow.toISOString().split('T')[0]); // WRONG!

// CORRECT
const bangkokDateStr = getBangkokDateString();
await supabase
  .from('work_sessions')
  .select('*')
  .eq('date', bangkokDateStr);
```

### ❌ Manual Timezone Conversion
```typescript
// WRONG
const bangkokTime = new Date(utcTime.getTime() + 7 * 60 * 60 * 1000);

// CORRECT
const bangkokTime = toBangkokTime(utcTime);
```

## 📝 Migration Guide

If you have existing code using manual timezone handling:

### Before:
```typescript
const bangkokTime = new Date().toLocaleString('en-US', { 
  timeZone: 'Asia/Bangkok' 
});
const today = bangkokTime.split(',')[0];
```

### After:
```typescript
import { getBangkokDateString } from '../_shared/timezone.ts';

const today = getBangkokDateString();
```

## 🧪 Testing

Always test timezone-sensitive code with:
- Different times of day (midnight, noon, etc.)
- Date boundaries (23:59:59)
- Different dates (beginning/end of month/year)

```typescript
// Example test
console.log('=== Timezone Test ===');
const now = getBangkokNow();
const formatted = formatBangkokTime(now);
const dateStr = getBangkokDateString();
console.log({ now, formatted, dateStr });
```

## 📞 Support

If you encounter timezone-related issues:
1. Check that you're using timezone.ts utilities
2. Log Bangkok time components for debugging
3. Verify database timestamps are in UTC
4. Test edge function locally with different times
