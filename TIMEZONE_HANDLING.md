# Timezone Handling Policy

## Overview

ระบบ LINE Intern ทำงานใน 2 contexts ที่ใช้ timezone ต่างกัน เอกสารนี้อธิบาย policy และ best practices

---

## 🌏 Frontend (Browser)

**ใช้**: Browser's local timezone (ของ user) + Bangkok timezone utilities

**Utility**: `src/lib/timezone.ts`

**Functions ที่มี**:
- `formatBangkokDateTime(date)` - Full date and time in Bangkok
- `formatBangkokDate(date)` - Date only in Bangkok  
- `formatBangkokTime(date)` - Time only in Bangkok
- `formatBangkokISODate(date)` - ISO date string (YYYY-MM-DD) in Bangkok
- `getBangkokNow()` - Current Bangkok time as Date object
- `isBangkokToday(date)` - Check if date is today in Bangkok
- `getBangkokHoursMinutes(date)` - Get hours/minutes in Bangkok

**เมื่อไหร่ต้องใช้ Bangkok functions**:
- เมื่อ compare date กับ database
- เมื่อ match holiday, birthday, special dates
- เมื่อ display เวลาที่ต้องตรงกับ backend

**Monitoring**:
- `useCuteQuotes.ts` มี logging เพื่อ track timezone mismatches
- ดู browser console สำหรับ `[Timezone Monitor]` warnings

---

## ⚡ Backend (Edge Functions)

**ใช้**: Bangkok timezone (Asia/Bangkok, UTC+7) **เสมอ**

**Utility**: `supabase/functions/_shared/timezone.ts`

**Functions ที่มี**:
- `getBangkokNow()` - Current Bangkok time
- `toBangkokTime(utcDate)` - Convert UTC to Bangkok
- `toUTC(bangkokDate)` - Convert Bangkok to UTC
- `formatBangkokTime(date, format)` - Format date in Bangkok
- `getBangkokDateString(date)` - Get YYYY-MM-DD string
- `getBangkokStartOfDay(date)` - Start of day in Bangkok (as UTC)
- `getBangkokEndOfDay(date)` - End of day in Bangkok (as UTC)
- `hasBangkokTimePassed(time)` - Check if Bangkok time has passed
- `addMinutesBangkok(date, minutes)` - Add minutes to Bangkok time
- `getDifferenceInMinutes(later, earlier)` - Diff in minutes

**สิ่งที่ต้องทำเสมอ**:
```typescript
import { getBangkokDateString, getBangkokNow } from '../_shared/timezone.ts';

// ✅ Correct
const today = getBangkokDateString();
const now = getBangkokNow();

// ❌ Wrong - uses server timezone (could be UTC)
const today = new Date().toISOString().split('T')[0];
```

---

## 🗄️ Database

**Storage**: UTC (ค่าเริ่มต้นของ PostgreSQL)

**Display**: Convert เป็น Bangkok เสมอเมื่อแสดงผล

**Timestamps**:
- `created_at`, `updated_at` เก็บเป็น UTC
- Edge functions ต้อง convert เมื่อ compare กับ Bangkok time

---

## ⚠️ Common Mistakes

### 1. ใช้ toISOString() โดยตรง
```typescript
// ❌ Wrong - uses UTC
const today = new Date().toISOString().split('T')[0];

// ✅ Correct - uses Bangkok
const today = formatBangkokISODate(new Date());
```

### 2. Compare Bangkok Date object กับ UTC string
```typescript
// ❌ Wrong
const bangkokDate = getBangkokNow();
if (record.created_at === bangkokDate.toISOString()) // Wrong comparison

// ✅ Correct
const bangkokDateStr = formatBangkokISODate(new Date());
const recordDateStr = formatBangkokISODate(record.created_at);
if (recordDateStr === bangkokDateStr) // Correct
```

### 3. ลืมว่า server อาจไม่ได้อยู่ Bangkok timezone
```typescript
// ❌ Wrong - assumes server is in Bangkok
const hour = new Date().getHours();

// ✅ Correct - explicitly use Bangkok
const bangkokNow = getBangkokNow();
const hour = bangkokNow.getHours();
```

---

## 📊 Edge Functions ที่ใช้ Timezone Correctly

ตรวจสอบแล้วว่าใช้ `_shared/timezone.ts`:
- `attendance-submit`
- `attendance-reminder`
- `auto-checkout-grace`
- `auto-checkout-midnight`
- `birthday-reminder`
- `work-reminder`
- `attendance-daily-summary`
- `flexible-day-off-reminder`

---

## 🧪 Testing Timezone Issues

1. **Manual test**: เปลี่ยน browser timezone ใน DevTools
2. **Check logs**: ดู `[Timezone Monitor]` ใน console
3. **Time range test**: ทดสอบระหว่าง 00:00-07:00 UTC (07:00-14:00 Bangkok)

---

## 📅 Last Updated

2025-01-21 - เพิ่ม monitoring ใน useCuteQuotes.ts
