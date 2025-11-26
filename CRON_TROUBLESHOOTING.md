# Cron Jobs Troubleshooting Guide

## Quick Diagnostic Checklist

When a cron job isn't working:

- [ ] Is the cron job active in `cron.job`?
- [ ] Is the edge function deployed and healthy?
- [ ] Are required secrets configured?
- [ ] Is the schedule in correct UTC time?
- [ ] Are there any RLS policy issues?
- [ ] Is LINE API responding correctly?

## Common Issues

### 1. Task Scheduler Not Sending Notifications

**Symptoms:**
- Tasks show as pending past due_at time
- No LINE messages received
- No entries in bot_message_logs

**Diagnosis:**

```sql
-- Check if cron job ran recently
SELECT * FROM cron.job_run_details 
WHERE jobname LIKE '%task-scheduler%' 
ORDER BY start_time DESC LIMIT 5;

-- Check pending tasks
SELECT id, title, due_at, status, 
       due_at < NOW() as is_overdue
FROM tasks 
WHERE status = 'pending'
ORDER BY due_at;

-- Check edge function logs
-- (Use Supabase dashboard: Functions > task-scheduler > Logs)
```

**Common Causes:**

1. **Invalid LINE User IDs**
   - Solution: Check tasks.created_by_user_id links to users.line_user_id
   - Verify line_user_id starts with 'U' (not 'U_test' or 'test_')

2. **LINE API Token Expired**
   ```sql
   -- Test LINE API manually
   SELECT net.http_post(
     url := 'https://api.line.me/v2/bot/message/push',
     headers := jsonb_build_object(
       'Authorization', 'Bearer ' || current_setting('app.line_token'),
       'Content-Type', 'application/json'
     ),
     body := '{"to":"USER_ID","messages":[{"type":"text","text":"Test"}]}'::jsonb
   );
   ```

3. **Group Left/Blocked Bot**
   - Check groups.status = 'active'
   - Verify bot is still member of LINE group

**Solution:**
```sql
-- Re-deploy edge function
-- Check Lovable deployment logs

-- Verify secrets are set
-- (Supabase Dashboard: Settings > Edge Functions > Secrets)

-- Manual retry
SELECT retry_cron_job(
  (SELECT jobid FROM cron.job WHERE jobname LIKE '%task-scheduler%')
);
```

---

### 2. Auto-Checkout Not Working

**Symptoms:**
- Employees still checked in next day
- No auto-checkout logs created
- Missing work sessions

**Diagnosis:**

```sql
-- Find employees still checked in from previous day
SELECT e.full_name, e.code, al.server_time as last_checkin
FROM employees e
JOIN LATERAL (
  SELECT server_time, event_type
  FROM attendance_logs
  WHERE employee_id = e.id
  ORDER BY server_time DESC
  LIMIT 1
) al ON al.event_type = 'check_in'
WHERE DATE(al.server_time) < CURRENT_DATE;

-- Check if grace period cron ran
SELECT * FROM cron.job_run_details 
WHERE jobname LIKE '%auto-checkout%'
ORDER BY start_time DESC LIMIT 10;
```

**Common Causes:**

1. **Grace Period Too Long**
   - Check employee.auto_checkout_grace_period_minutes
   - Verify shift end times are correct

2. **Midnight Cron Not Running**
   - Schedule: `30 19 * * *` (02:30 Bangkok = 19:30 UTC)
   - Verify timezone conversion is correct

3. **Missing Work Sessions**
   - Auto-checkout requires active work session
   - Run backfill if needed: `/backfill-work-sessions`

**Solution:**
```sql
-- Manual checkout old sessions
-- (Only if auto-checkout failed for multiple days)
-- BE CAREFUL: This creates checkout logs for all checked-in employees

-- First, review who would be affected:
SELECT e.full_name, e.code, 
       MAX(al.server_time) as last_activity
FROM employees e
JOIN attendance_logs al ON al.employee_id = e.id
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_logs al2
  WHERE al2.employee_id = e.id
    AND al2.event_type = 'check_out'
    AND al2.server_time > al.server_time
)
GROUP BY e.id, e.full_name, e.code;

-- Then run admin-checkout edge function for each employee
```

---

### 3. Attendance Reminders Not Arriving

**Symptoms:**
- Employees not receiving check-in/check-out reminders
- Reminders sent at wrong time
- Missing reminder logs

**Diagnosis:**

```sql
-- Check reminder logs for today
SELECT * FROM attendance_reminders
WHERE reminder_date = CURRENT_DATE
ORDER BY scheduled_time DESC;

-- Check employee reminder preferences
SELECT e.full_name, e.shift_start_time, e.shift_end_time,
       e.enable_second_checkin_reminder,
       e.reminder_preferences
FROM employees e
WHERE e.is_active = true;

-- Check cron job execution
SELECT * FROM cron.job_run_details 
WHERE jobname LIKE '%attendance-reminder%'
ORDER BY start_time DESC LIMIT 10;
```

**Common Causes:**

1. **Wrong Timezone in Schedule**
   - Reminder cron runs every hour UTC
   - Edge function converts to Bangkok time
   - Verify employee shift times are in Bangkok time

2. **Employee LINE User ID Missing**
   - employees.line_user_id must be set
   - Must start with 'U'

3. **Already Checked In/Out**
   - Reminder skips if employee already performed action
   - This is expected behavior

**Solution:**
```sql
-- Verify timezone utilities are working
SELECT 
  NOW() as utc_now,
  timezone('Asia/Bangkok', NOW()) as bangkok_now;

-- Test reminder function manually
-- POST to /attendance-reminder edge function

-- Update employee LINE user ID if missing
UPDATE employees 
SET line_user_id = 'Uxxxxxxxxxxxxxxxxxxxxx'
WHERE id = 'employee-uuid';
```

---

### 4. Daily Summary Not Sending

**Symptoms:**
- No summary message at 18:00
- Empty daily_attendance_summaries table
- Branch not receiving reports

**Diagnosis:**

```sql
-- Check if summaries were created
SELECT * FROM daily_attendance_summaries
ORDER BY created_at DESC
LIMIT 10;

-- Check branch LINE group ID
SELECT id, name, line_group_id
FROM branches
WHERE is_deleted = false;

-- Verify attendance_settings
SELECT * FROM attendance_settings
WHERE scope = 'branch'
  AND daily_summary_enabled = true;
```

**Common Causes:**

1. **Branch LINE Group ID Missing**
   - branches.line_group_id must be set
   - Should start with 'C' for groups

2. **Summary Disabled**
   - Check attendance_settings.daily_summary_enabled
   - Check attendance_settings.daily_summary_time

3. **Wrong Schedule Time**
   - Schedule: `0 11 * * *` (18:00 Bangkok = 11:00 UTC)
   - Adjust if needed for different timezone

**Solution:**
```sql
-- Enable daily summary
UPDATE attendance_settings
SET daily_summary_enabled = true,
    daily_summary_time = '18:00'
WHERE scope = 'global';

-- Set branch LINE group ID
UPDATE branches
SET line_group_id = 'Cxxxxxxxxxxxxxxxxxxxxx'
WHERE id = 'branch-uuid';

-- Manual trigger
-- POST to /attendance-daily-summary edge function
```

---

### 5. Overtime Warning Not Triggering

**Symptoms:**
- Employees exceeding max hours without warning
- No warning messages sent
- Alerts not created

**Diagnosis:**

```sql
-- Find employees currently checked in for long time
SELECT e.full_name, e.code,
       e.max_work_hours_per_day,
       e.ot_warning_minutes,
       get_work_hours_today(e.id) as hours_today
FROM employees e
WHERE EXISTS (
  SELECT 1 FROM attendance_logs al
  WHERE al.employee_id = e.id
    AND al.event_type = 'check_in'
    AND DATE(al.server_time) = CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM attendance_logs al2
      WHERE al2.employee_id = e.id
        AND al2.event_type = 'check_out'
        AND al2.server_time > al.server_time
        AND DATE(al2.server_time) = CURRENT_DATE
    )
);

-- Check overtime warning logs
SELECT * FROM bot_message_logs
WHERE message_type = 'overtime_warning'
  AND created_at > NOW() - INTERVAL '24 hours';
```

**Common Causes:**

1. **Max Hours Not Set**
   - employees.max_work_hours_per_day is NULL
   - Default is 8 hours if not set

2. **Warning Threshold Too Late**
   - employees.ot_warning_minutes too small
   - Default is 30 minutes before max

3. **Employee Not Checked In**
   - Warning only sent for currently checked-in employees

**Solution:**
```sql
-- Set max hours for all employees
UPDATE employees
SET max_work_hours_per_day = 8,
    ot_warning_minutes = 30
WHERE max_work_hours_per_day IS NULL;

-- Check if cron is running
SELECT * FROM cron.job 
WHERE jobname LIKE '%overtime-warning%';
```

---

### 6. Request Timeout Not Working

**Symptoms:**
- Old requests still showing as pending
- No auto-rejection happening
- Requests never timing out

**Diagnosis:**

```sql
-- Find old pending requests
SELECT 'early_leave' as type, id, employee_id, 
       requested_at, timeout_at, status
FROM early_leave_requests
WHERE status = 'pending'
  AND timeout_at < NOW()
UNION ALL
SELECT 'overtime' as type, id, employee_id,
       requested_at, timeout_at, status
FROM overtime_requests
WHERE status = 'pending'
  AND timeout_at < NOW()
ORDER BY timeout_at;

-- Check if checker ran
SELECT * FROM cron.job_run_details 
WHERE jobname LIKE '%timeout-checker%'
ORDER BY start_time DESC LIMIT 10;
```

**Common Causes:**

1. **Timeout Field Not Set**
   - early_leave_requests.timeout_at is NULL
   - overtime_requests.timeout_at is NULL

2. **Checker Not Running**
   - Cron job inactive or deleted
   - Schedule: `*/15 * * * *` (every 15 min)

3. **Edge Function Error**
   - Check logs for error messages

**Solution:**
```sql
-- Set timeout for existing requests (2 hours for early leave)
UPDATE early_leave_requests
SET timeout_at = requested_at + INTERVAL '2 hours'
WHERE timeout_at IS NULL
  AND status = 'pending';

-- Set timeout for overtime (24 hours)
UPDATE overtime_requests
SET timeout_at = requested_at + INTERVAL '24 hours'
WHERE timeout_at IS NULL
  AND status = 'pending';

-- Re-create cron job if missing
-- (See DEPLOYMENT_CHECKLIST.md)
```

---

## Emergency Procedures

### Stop All Cron Jobs

```sql
-- Disable all cron jobs immediately
UPDATE cron.job SET active = false;
```

### Re-enable After Fix

```sql
-- Re-enable all jobs
UPDATE cron.job SET active = true;

-- Or re-enable specific job
UPDATE cron.job 
SET active = true 
WHERE jobname = 'task-scheduler-5min';
```

### Clear Job Queue

```sql
-- Remove failed job runs from history
-- (History is kept for debugging, safe to clear old entries)
DELETE FROM cron.job_run_details
WHERE start_time < NOW() - INTERVAL '30 days';
```

### Force Manual Execution

```bash
# Use curl to trigger edge function manually
curl -X POST \
  'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/task-scheduler' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"time":"2025-11-26T12:00:00Z"}'
```

---

## Monitoring Best Practices

### Set Up Alerts

Create alerts for critical failures:

```sql
-- Alert for task scheduler failures
-- (Run this daily or setup dashboard alert)
SELECT COUNT(*) as failed_messages
FROM bot_message_logs
WHERE delivery_status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours';

-- Alert for old pending tasks
SELECT COUNT(*) as overdue_tasks
FROM tasks
WHERE status = 'pending'
  AND due_at < NOW() - INTERVAL '1 hour';
```

### Dashboard Monitoring

Use `/cron-jobs` page to monitor:
- Total active cron jobs
- Recent failures
- Execution history
- Job retry capability

### Log Analysis

```sql
-- Find patterns in failures
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  delivery_status,
  COUNT(*) as count
FROM bot_message_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY hour, delivery_status
ORDER BY hour DESC;
```

---

## Getting Help

If issues persist after trying these solutions:

1. **Check Edge Function Logs** in Supabase Dashboard
2. **Review Error Messages** in bot_message_logs
3. **Verify LINE API Status** at https://status.line.me/
4. **Check Database Triggers** haven't been accidentally disabled
5. **Contact System Administrator** with:
   - Specific error messages
   - Affected cron job name
   - Recent changes made
   - Steps already tried

---

## Useful SQL Queries

```sql
-- Health check: Recent cron executions
SELECT 
  j.jobname,
  MAX(r.start_time) as last_run,
  COUNT(*) FILTER (WHERE r.status = 'failed') as failures_24h
FROM cron.job j
LEFT JOIN cron.job_run_details r ON r.jobid = j.jobid 
  AND r.start_time > NOW() - INTERVAL '24 hours'
GROUP BY j.jobname
ORDER BY last_run DESC NULLS LAST;

-- Find stuck tasks
SELECT id, title, due_at, status,
       EXTRACT(HOUR FROM (NOW() - due_at)) as hours_overdue
FROM tasks
WHERE status = 'pending'
  AND due_at < NOW() - INTERVAL '1 hour'
ORDER BY due_at;

-- LINE API delivery success rate
SELECT 
  delivery_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM bot_message_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY delivery_status;
```
