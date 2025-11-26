# Cron Jobs Guide

## Overview

This system uses PostgreSQL `pg_cron` to schedule automated tasks. All cron jobs are configured to run specific Supabase Edge Functions at scheduled intervals.

## Active Cron Jobs

### 1. Task Scheduler (Every 5 Minutes)
**Schedule:** `*/5 * * * *` (Every 5 minutes)  
**Function:** `task-scheduler`  
**Purpose:** Processes pending tasks and sends LINE reminders

**What it does:**
- Checks for tasks due within the current time
- Validates LINE user IDs (skips test users)
- Sends LINE push notifications with mentions
- Marks overdue tasks (>1 hour) as cancelled
- Processes recurring task instances
- Logs all delivery attempts to `bot_message_logs`
- Creates alerts for failed deliveries

**SQL Command:**
```sql
SELECT net.http_post(
  url := 'https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/task-scheduler',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
  body := concat('{"time": "', now(), '"}')::jsonb
) as request_id;
```

### 2. Auto Checkout (Grace Period) - Every 30 Minutes
**Schedule:** `*/30 * * * *` (Every 30 minutes)  
**Function:** `auto-checkout-grace`  
**Purpose:** Auto-checkout employees after grace period expires

**What it does:**
- Uses Bangkok timezone utilities (`timezone.ts`)
- Checks for employees still checked in after grace period
- Creates check-out attendance logs
- Updates work sessions
- Sends LINE notifications to employees

**Grace Period Logic:**
- Global default: 1 hour after shift end
- Per-employee override: `employees.auto_checkout_grace_period_minutes`
- Checks against shift end time + grace period

### 3. Auto Checkout (Midnight) - Daily at 02:30 Bangkok Time
**Schedule:** `30 19 * * *` (02:30 Bangkok Time = 19:30 UTC)  
**Function:** `auto-checkout-midnight`  
**Purpose:** Force checkout all employees at end of day

**What it does:**
- Runs after midnight Bangkok time
- Checks out all employees still checked in from previous day
- Creates attendance logs with source = 'auto_checkout_midnight'
- Updates work sessions
- Critical failsafe to prevent employees being checked in indefinitely

### 4. Attendance Daily Summary - Daily at 18:00 Bangkok Time
**Schedule:** `0 11 * * *` (18:00 Bangkok Time = 11:00 UTC)  
**Function:** `attendance-daily-summary`  
**Purpose:** Sends daily attendance summary to branch LINE groups

**What it does:**
- Generates attendance statistics per branch
- Formats summary message with emoji indicators
- Sends to branch LINE group (via `branches.line_group_id`)
- Stores summary in `daily_attendance_summaries`
- Respects `attendance_settings.daily_summary_enabled`

**Summary includes:**
- Total employees
- Checked in / Checked out counts
- Late arrivals
- Absent employees
- Flagged events (fraud detection)

### 5. Attendance Reminder - Hourly
**Schedule:** `0 * * * *` (Every hour on the hour)  
**Function:** `attendance-reminder`  
**Purpose:** Sends personalized reminders to employees

**Reminder Types:**
- **Morning Check-in:** Sent at employee's shift start time
- **Evening Check-out:** Sent at shift end time
- **Second Check-in:** Optional, configurable per employee

**Smart Features:**
- Skips if employee already checked in/out
- Uses employee's preferred_start_time if set
- Respects employee.enable_second_checkin_reminder
- Timezone-aware (Bangkok time)

### 6. Overtime Warning - Every 30 Minutes
**Schedule:** `*/30 * * * *`  
**Function:** `overtime-warning`  
**Purpose:** Warns employees approaching max daily work hours

**What it does:**
- Checks employees currently checked in
- Calculates hours worked today
- Sends warning when within threshold of max_work_hours_per_day
- Default warning threshold: 30 minutes before limit
- Customizable via employee.ot_warning_minutes

### 7. Work Reminder - Hourly
**Schedule:** `0 * * * *`  
**Function:** `work-reminder`  
**Purpose:** Reminds assignees about work tasks and check-ins

**NOTE:** Not modified per user request. See WORK_REMINDER_SYSTEM.md for details.

### 8. Request Timeout Checker - Every 15 Minutes
**Schedule:** `*/15 * * * *`  
**Function:** `request-timeout-checker`  
**Purpose:** Auto-reject requests that exceed timeout period

**What it does:**
- Checks early_leave_requests with status = 'pending'
- Checks overtime_requests with status = 'pending'
- Compares timeout_at field against current time
- Auto-rejects expired requests
- Sends LINE notification about timeout

**Timeout Defaults:**
- Early leave: 2 hours
- Overtime: 24 hours

## Cron Job Management

### Viewing Active Jobs

Use the dashboard at `/cron-jobs` or query directly:

```sql
SELECT * FROM get_cron_jobs();
```

### Viewing Job History

```sql
SELECT * FROM get_cron_history(50); -- Last 50 executions
```

### Manual Retry

```sql
SELECT retry_cron_job(JOB_ID);
```

### Monitoring Health

Check edge function logs:
```sql
SELECT * 
FROM supabase_functions.logs 
WHERE function_name = 'task-scheduler'
ORDER BY timestamp DESC
LIMIT 50;
```

## Timezone Handling

**CRITICAL:** All cron jobs use Bangkok timezone (Asia/Bangkok, UTC+7) via the shared `timezone.ts` utility.

### Available Utilities

```typescript
// From supabase/functions/_shared/timezone.ts

// Get current Bangkok time
const bangkokNow = getBangkokNow();

// Format Bangkok time string
const formatted = formatBangkokTime(date); // "2025-11-26 18:30:00"

// Convert UTC to Bangkok
const bangkokDate = toBangkokTime(utcDate);

// Get Bangkok time components
const { year, month, day, hours, minutes } = getBangkokTimeComponents(date);
```

### Best Practices

1. **Always use timezone utilities** for time formatting and display
2. **Store UTC in database** (server_time, due_at, etc.)
3. **Convert to Bangkok for display and business logic**
4. **Use UTC for cron schedule calculations**

## Failure Handling

### Task Scheduler Failures

When LINE API fails:
1. Error logged to console with task ID and status code
2. Entry created in `bot_message_logs` with `delivery_status = 'failed'`
3. Alert created in `alerts` table with severity = 'medium'
4. Task remains pending for manual retry

### Invalid User Handling

Tasks with invalid LINE user IDs are:
- Logged with warning
- Automatically cancelled
- Marked with status = 'cancelled_overdue' or 'skipped_invalid_user'

Invalid patterns:
- Starts with "U_test"
- Starts with "test_"
- Doesn't start with "U" (LINE user IDs must start with U)

### Monitoring Failures

Query failed deliveries:
```sql
SELECT * 
FROM bot_message_logs 
WHERE delivery_status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

Query active alerts:
```sql
SELECT * 
FROM alerts 
WHERE resolved = false
  AND type = 'failed_reply'
ORDER BY created_at DESC;
```

## Performance Optimization

### Rate Limiting

- LINE API: ~500 messages per minute max
- Task scheduler: Processes up to 100 tasks per run
- Batch processing with 100ms delay between messages

### Database Indexing

Ensure these indexes exist:
```sql
CREATE INDEX idx_tasks_status_due ON tasks(status, due_at);
CREATE INDEX idx_attendance_logs_employee_date ON attendance_logs(employee_id, server_time);
CREATE INDEX idx_bot_message_logs_status ON bot_message_logs(delivery_status, created_at);
```

## Troubleshooting

### Task Not Triggering

1. Check cron job is active:
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE '%task-scheduler%';
   ```

2. Check task status and due time:
   ```sql
   SELECT id, title, status, due_at, due_at < NOW() as is_due
   FROM tasks
   WHERE status = 'pending'
   ORDER BY due_at;
   ```

3. Check edge function logs for errors

### Message Not Delivered

1. Check bot_message_logs:
   ```sql
   SELECT * FROM bot_message_logs 
   WHERE created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   ```

2. Verify LINE user ID format (must start with 'U')

3. Check group is active in LINE

4. Verify LINE_CHANNEL_ACCESS_TOKEN is valid

### Timezone Issues

1. Verify server timezone:
   ```sql
   SELECT NOW(), timezone('Asia/Bangkok', NOW());
   ```

2. Check cron schedule matches expected Bangkok time:
   - Use https://crontab.guru/ to verify schedule
   - Remember: cron runs in UTC, not Bangkok time

3. Verify timezone utility is being used in edge functions

## Security Considerations

### Service Role Key

Cron jobs use SUPABASE_ANON_KEY, not service role key, to prevent privilege escalation.

### RLS Policies

Even though cron jobs run with elevated privileges, they respect:
- Row Level Security policies on all tables
- Database function SECURITY DEFINER settings
- Proper user context where applicable

### API Token Protection

- LINE_CHANNEL_ACCESS_TOKEN stored as Supabase secret
- Never logged or exposed in error messages
- Rotated periodically (recommended every 90 days)

## Maintenance

### Weekly Tasks

- [ ] Review failed message logs
- [ ] Check for accumulating pending tasks
- [ ] Verify all cron jobs executed successfully
- [ ] Review alert resolution rate

### Monthly Tasks

- [ ] Audit cron job execution times
- [ ] Review and clean old bot_message_logs (>90 days)
- [ ] Update LINE API token if needed
- [ ] Review attendance auto-checkout patterns

### Disaster Recovery

If cron jobs stop running:

1. Check pg_cron extension is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Re-create jobs if missing (see `DEPLOYMENT_CHECKLIST.md`)

3. Manual task processing:
   ```sql
   -- Call edge function directly via curl or Postman
   POST https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/task-scheduler
   Headers: Authorization: Bearer YOUR_ANON_KEY
   ```

## Additional Resources

- [PostgreSQL pg_cron Documentation](https://github.com/citusdata/pg_cron)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/)
- [Timezone Handling Guide](supabase/functions/_shared/README_TIMEZONE.md)

## Support

For issues or questions:
1. Check edge function logs in Supabase dashboard
2. Review `bot_message_logs` and `alerts` tables
3. Verify cron job execution history
4. Contact system administrator with specific error details
