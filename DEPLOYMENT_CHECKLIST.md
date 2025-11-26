# ✅ Deployment Checklist

This checklist ensures all systems are properly configured and running after deployment.

## Prerequisites

- [ ] Supabase project created and configured
- [ ] LINE Messaging API channel created
- [ ] All environment variables/secrets configured
- [ ] Database migrations applied successfully
- [ ] Edge functions deployed

## 📋 Pre-Deployment

### 1. Environment Variables & Secrets
- [x] `APP_URL` = `https://intern.gem.me` (in Supabase Edge Function Secrets)
- [x] `MAPBOX_PUBLIC_TOKEN` = `pk.xxx...` (in Supabase Edge Function Secrets)
- [x] `LINE_CHANNEL_ACCESS_TOKEN` = (in Supabase Edge Function Secrets)
- [x] `LINE_CHANNEL_SECRET` = (in Supabase Edge Function Secrets)
- [x] `SUPABASE_URL` = (Auto-configured)
- [x] `SUPABASE_SERVICE_ROLE_KEY` = (Auto-configured)
- [x] `SUPABASE_ANON_KEY` = (Auto-configured)
- [ ] `VITE_MAPBOX_PUBLIC_TOKEN` (optional, for frontend - user can input manually)

### 2. Edge Functions
- [x] `line-webhook` deployed
- [x] `task-scheduler` deployed
- [x] `auto-checkout-grace` deployed
- [x] `auto-checkout-midnight` deployed
- [x] `attendance-reminder` deployed
- [x] `attendance-daily-summary` deployed
- [x] `overtime-warning` deployed
- [x] `request-timeout-checker` deployed
- [x] URL generation fixed (using APP_URL)

### 3. Database Extensions
- [x] `pg_cron` extension enabled
- [x] `pg_net` extension enabled
- [x] All migrations applied successfully

### 4. Frontend Components
- [x] `MapPicker` component created
- [x] `Branches.tsx` updated with Map Picker
- [x] Mapbox GL library installed
- [x] `/cron-jobs` dashboard page created
- [x] Monitoring dashboards configured

### 5. Cron Jobs Setup

**Required:** Configure all cron jobs after initial deployment.

```sql
-- 1. Task Scheduler (Every 5 minutes)
SELECT cron.schedule(
  'task-scheduler-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/task-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);

-- 2. Auto Checkout Grace (Every 30 minutes)
SELECT cron.schedule(
  'auto-checkout-grace-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/auto-checkout-grace',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);

-- 3. Auto Checkout Midnight (Daily at 02:30 Bangkok = 19:30 UTC)
SELECT cron.schedule(
  'auto-checkout-midnight-daily',
  '30 19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/auto-checkout-midnight',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);

-- 4. Attendance Reminder (Hourly)
SELECT cron.schedule(
  'attendance-reminder-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/attendance-reminder',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);

-- 5. Daily Summary (Daily at 18:00 Bangkok = 11:00 UTC)
SELECT cron.schedule(
  'attendance-daily-summary',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/attendance-daily-summary',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);

-- 6. Overtime Warning (Every 30 minutes)
SELECT cron.schedule(
  'overtime-warning-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/overtime-warning',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);

-- 7. Request Timeout Checker (Every 15 minutes)
SELECT cron.schedule(
  'request-timeout-checker-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/request-timeout-checker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);
```

**Note:** Replace `YOUR_ANON_KEY` with actual Supabase anon key from project settings.

**Verification:**
```sql
-- Check all cron jobs are active
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

-- Expected: 7 active jobs
```

---

## 🧪 Testing Phase

### Quick Tests (ต้องทำก่อน Production)

#### Test 1: URL Check-in ✅
```bash
# ใน LINE
checkin

# Expected:
# ✅ https://intern.gem.me/attendance?t=...
# ❌ https:///attendance?t=...
```
- [ ] ส่งข้อความใน LINE
- [ ] ได้ URL ถูกต้อง
- [ ] คลิกเปิดหน้า attendance ได้

#### Test 2: Map Picker ✅
- [ ] เปิดหน้า Branches
- [ ] คลิก "Add Branch"
- [ ] คลิก "🗺️ แผนที่"
- [ ] แผนที่โหลดได้ (หรือขอ token)
- [ ] เลือกตำแหน่งได้
- [ ] บันทึก Branch สำเร็จ

#### Test 3: Integration ✅
- [ ] สร้าง Branch ด้วย Map Picker
- [ ] ส่ง checkin ใน LINE
- [ ] คลิกลิงก์
- [ ] Check-in สำเร็จ (หรือ fail ถ้านอกรัศมี)

#### Test 4: Cron Jobs ✅
- [ ] เปิดหน้า `/cron-jobs`
- [ ] เห็น cron jobs ทั้งหมด (7 jobs)
- [ ] ทุก job มีสถานะ active = true
- [ ] เห็น execution history
- [ ] ลอง retry job สำเร็จ

---

## 🚀 Production Deployment

### Step 1: Verify All Changes
```bash
✅ line-webhook/index.ts - URL generation fixed
✅ MapPicker.tsx - Component created
✅ Branches.tsx - Map Picker integrated
✅ mapbox-gl - Dependency added
```

### Step 2: Deploy Edge Functions
```bash
# Already deployed via Lovable
✅ line-webhook deployed automatically
```

### Step 3: Update Environment
```bash
# In Supabase Dashboard > Edge Functions > Secrets
✅ APP_URL = https://intern.gem.me
✅ MAPBOX_PUBLIC_TOKEN = pk.xxx...
```

### Step 4: Frontend Deployment
```bash
# Click "Update" in Lovable Publish dialog
- Update frontend to production
- New features:
  ✅ Map Picker in Branches page
  ✅ Fixed URL generation
```

---

## 🎯 Post-Deployment Verification

### Smoke Tests

1. **URL Check-in** (Critical)
   - [ ] Send "checkin" in LINE
   - [ ] Verify URL: `https://intern.gem.me/attendance?t=...`
   - [ ] Click link opens attendance page
   
2. **Map Picker** (Critical)
   - [ ] Open Branches page
   - [ ] Add new branch with Map Picker
   - [ ] Coordinates saved correctly
   
3. **Geofence** (Important)
   - [ ] Check-in inside radius = Success
   - [ ] Check-in outside radius = Error
   
4. **Cron Jobs** (Critical)
   - [ ] All 7 cron jobs are active
   - [ ] Task scheduler runs every 5 min
   - [ ] Auto-checkout jobs scheduled correctly
   - [ ] No failed executions in history
   
5. **Task Reminders** (Important)
   - [ ] Create a test task due in 5 minutes
   - [ ] Wait for task scheduler run
   - [ ] Verify LINE reminder received
   - [ ] Check bot_message_logs for delivery
   
6. **Performance** (Monitor)
   - [ ] Map loads within 3 seconds
   - [ ] No console errors
   - [ ] GPS works (if allowed)
   - [ ] Cron jobs complete within 10s

---

## 📊 Monitoring

### Key Metrics to Watch

1. **LINE Messages**
   - Check-in command usage
   - Success rate of URL clicks
   - Token expiration rate
   - Message delivery rate (target: >95%)

2. **Map Picker**
   - Usage frequency
   - Token input rate (if no env var)
   - Error rate

3. **Attendance System**
   - Check-in success rate
   - Geofence violations
   - Late check-ins
   - Auto-checkout execution

4. **Cron Jobs** (New - Critical!)
   - All jobs executing on schedule
   - No failed executions
   - Task completion rate >90%
   - Alert resolution time <24h

5. **System Health**
   - Active alerts count
   - Failed message logs
   - Database performance
   - Edge function execution times

### Logs to Monitor
```bash
# Edge Function Logs
- [handleAttendanceCommand] logs
- [task-scheduler] execution logs
- [auto-checkout-grace] logs
- [attendance-reminder] logs
- APP_URL usage
- Token generation

# Database Logs
- bot_message_logs (delivery status)
- alerts table (unresolved alerts)
- cron.job_run_details (execution history)

# Frontend Logs (Console)
- Map initialization errors
- GPS errors
- API errors
```

### Monitoring Dashboards

- **Cron Jobs:** `/cron-jobs` - View all scheduled tasks and history
- **Alerts:** `/alerts` - Monitor system alerts and resolution
- **System Health:** `/settings` - Overall system status
- **Bot Logs:** `/bot-logs` - Message delivery tracking

### Quick Health Check

```sql
-- Run this daily
SELECT get_system_health();

-- Expected output:
-- {
--   "cron_jobs": [...],      -- All active
--   "message_delivery": {     
--     "success_rate": >95%    -- Good health
--   },
--   "active_alerts": <10      -- Manageable
-- }
```

---

## 🐛 Rollback Plan

### If Critical Issues Occur

#### Issue: Wrong URLs in LINE
```bash
1. Check APP_URL secret
2. Redeploy line-webhook
3. Test immediately
```

#### Issue: Map not loading
```bash
1. Check MAPBOX_PUBLIC_TOKEN
2. Verify Mapbox API status
3. Use manual input fallback
```

#### Issue: Check-in failures
```bash
1. Check geofence calculations
2. Verify branch coordinates
3. Test GPS permissions
```

#### Issue: Cron jobs not running
```bash
1. Check pg_cron extension enabled
2. Verify all jobs are active
3. Check edge function logs
4. Manual retry via /cron-jobs dashboard
```

#### Issue: Task reminders not sending
```bash
1. Check LINE_CHANNEL_ACCESS_TOKEN
2. Verify task-scheduler is active
3. Check bot_message_logs for errors
4. Review alerts table for failures
```

#### Issue: Mass failures
```bash
# Emergency: Disable all cron jobs
UPDATE cron.job SET active = false;

# Investigate issue, then re-enable
UPDATE cron.job SET active = true 
WHERE jobname IN ('task-scheduler-5min', ...);
```

---

## 📝 Release Notes

### Version: Attendance System v1.1

**New Features:**
- ✅ Fixed check-in URL generation (`https://intern.gem.me`)
- ✅ Interactive Map Picker for branch locations
- ✅ GPS-based location selection
- ✅ Drag-and-drop marker positioning
- ✅ Mapbox integration with fallback token input

**Improvements:**
- Better geofence accuracy
- Enhanced UX for location selection
- Loading states and error handling
- Mobile-responsive map interface

**Bug Fixes:**
- Fixed empty domain in check-in URLs
- Improved coordinate precision

---

## 🎉 Success Criteria

All checkboxes ✅ = Ready for Production!

- [x] Environment configured
- [x] Edge functions deployed
- [x] Cron jobs configured and active
- [x] Frontend updated
- [ ] All tests passed (including cron job tests)
- [ ] No critical bugs
- [ ] Monitoring dashboards accessible
- [ ] Alert system working
- [ ] Rollback plan ready and tested

---

## 📞 Support & Documentation

**Technical Issues:**
- Check ATTENDANCE_MAP_TESTING.md
- Check QUICK_TEST_STEPS.md
- Review edge function logs
- Check CRON_TROUBLESHOOTING.md

**Cron Jobs:**
- CRON_JOBS_GUIDE.md - Complete guide to all scheduled tasks
- CRON_TROUBLESHOOTING.md - Common issues and solutions
- SYSTEM_MONITORING.md - Monitoring best practices

**Mapbox Issues:**
- https://docs.mapbox.com/
- https://account.mapbox.com/

**LINE API Issues:**
- LINE Developers Console
- LINE Messaging API docs
- https://developers.line.biz/

**System Architecture:**
- All edge functions in `supabase/functions/`
- Timezone utilities in `supabase/functions/_shared/timezone.ts`
- Database schema in migrations folder
