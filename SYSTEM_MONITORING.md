# System Monitoring Guide

## Overview

This guide covers monitoring and maintaining the LINE Intern bot system, focusing on automated cron jobs, message delivery, and system health.

## Key Metrics to Monitor

### 1. Message Delivery Rate

**Target:** >95% success rate  
**Check:** Daily

```sql
-- Last 24 hours delivery success rate
SELECT 
  delivery_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM bot_message_logs
WHERE sent_at > NOW() - INTERVAL '24 hours'
GROUP BY delivery_status
ORDER BY count DESC;
```

**Alert Conditions:**
- Failed rate >5%: Investigate immediately
- Failed rate >10%: Critical - check LINE API status

### 2. Task Completion Rate

**Target:** >90% tasks completed within 1 hour of due time  
**Check:** Daily

```sql
-- Task completion metrics
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - due_at))/60) as avg_delay_minutes
FROM tasks
WHERE due_at > NOW() - INTERVAL '7 days'
GROUP BY status;
```

**Alert Conditions:**
- >20 tasks overdue by >1 hour: Check task-scheduler logs
- Growing backlog: Increase cron frequency or investigate bottleneck

### 3. Cron Job Health

**Target:** All jobs running on schedule with <1% failure rate  
**Check:** Hourly

```sql
-- Cron job execution summary
SELECT 
  j.jobname,
  j.schedule,
  j.active,
  COUNT(r.runid) as executions_24h,
  COUNT(*) FILTER (WHERE r.status = 'failed') as failures_24h,
  MAX(r.start_time) as last_run,
  MAX(r.end_time) - MAX(r.start_time) as last_duration
FROM cron.job j
LEFT JOIN cron.job_run_details r ON r.jobid = j.jobid 
  AND r.start_time > NOW() - INTERVAL '24 hours'
GROUP BY j.jobid, j.jobname, j.schedule, j.active
ORDER BY j.jobname;
```

**Alert Conditions:**
- Job hasn't run in expected interval: Check if active = false
- Failure rate >5%: Review edge function logs
- Inactive job: Re-enable if needed

### 4. Attendance Compliance

**Target:** >90% employees checking in/out on time  
**Check:** Daily

```sql
-- Daily attendance compliance
SELECT 
  DATE(al.server_time) as date,
  COUNT(DISTINCT CASE WHEN al.event_type = 'check_in' THEN al.employee_id END) as checked_in,
  COUNT(DISTINCT CASE WHEN al.event_type = 'check_out' THEN al.employee_id END) as checked_out,
  COUNT(DISTINCT e.id) as total_employees,
  ROUND(COUNT(DISTINCT CASE WHEN al.event_type = 'check_in' THEN al.employee_id END) * 100.0 / COUNT(DISTINCT e.id), 2) as compliance_rate
FROM employees e
LEFT JOIN attendance_logs al ON al.employee_id = e.id 
  AND DATE(al.server_time) >= CURRENT_DATE - 7
WHERE e.is_active = true
GROUP BY DATE(al.server_time)
ORDER BY date DESC;
```

**Alert Conditions:**
- Compliance <80%: Investigate reminder system
- Sudden drop: Check LINE API or bot status

### 5. Alert Resolution Rate

**Target:** >80% alerts resolved within 24 hours  
**Check:** Daily

```sql
-- Alert resolution metrics
SELECT 
  severity,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE resolved = true) as resolved,
  COUNT(*) FILTER (WHERE resolved = false AND created_at < NOW() - INTERVAL '24 hours') as overdue,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved = true) as avg_resolution_hours
FROM alerts
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY severity
ORDER BY severity DESC;
```

**Alert Conditions:**
- High severity overdue >24h: Escalate immediately
- >50 unresolved alerts: Review alert rules

## Monitoring Dashboards

### Real-Time Dashboard

Available at `/settings` (System Health tab):
- Active cron jobs count
- Recent failures
- Current system status
- Quick actions (manual triggers, etc.)

### Cron Jobs Dashboard

Available at `/cron-jobs`:
- All scheduled jobs with next run time
- Execution history (last 100 runs)
- Failure details and retry options
- Job management (enable/disable)

### Alerts Dashboard

Available at `/alerts`:
- Active alerts by severity
- Resolution status
- Alert trends
- Quick resolve/dismiss actions

## Automated Monitoring

### Database Functions for Monitoring

```sql
-- Create monitoring function
CREATE OR REPLACE FUNCTION get_system_health()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_health JSON;
BEGIN
  SELECT json_build_object(
    'cron_jobs', (
      SELECT json_agg(json_build_object(
        'name', jobname,
        'active', active,
        'last_run', (
          SELECT MAX(start_time) FROM cron.job_run_details r 
          WHERE r.jobid = j.jobid
        )
      ))
      FROM cron.job j
    ),
    'message_delivery', (
      SELECT json_build_object(
        'total_24h', COUNT(*),
        'failed_24h', COUNT(*) FILTER (WHERE delivery_status = 'failed'),
        'success_rate', ROUND(COUNT(*) FILTER (WHERE delivery_status = 'success') * 100.0 / NULLIF(COUNT(*), 0), 2)
      )
      FROM bot_message_logs
      WHERE sent_at > NOW() - INTERVAL '24 hours'
    ),
    'active_alerts', (
      SELECT COUNT(*) FROM alerts WHERE resolved = false
    ),
    'checked_timestamp', NOW()
  ) INTO v_health;
  
  RETURN v_health;
END;
$$;

-- Use in monitoring
SELECT get_system_health();
```

### Email Alerts (Optional)

Set up email notifications for critical events:

```sql
-- Example: Email on critical alert
-- (Requires pg_net or external service integration)

CREATE OR REPLACE FUNCTION notify_critical_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.severity = 'high' AND NEW.resolved = false THEN
    -- Send email via external service
    PERFORM net.http_post(
      url := 'https://your-email-service.com/send',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := json_build_object(
        'to', 'admin@example.com',
        'subject', 'Critical Alert: ' || NEW.summary,
        'body', NEW.details
      )::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER alert_notification
AFTER INSERT ON alerts
FOR EACH ROW
EXECUTE FUNCTION notify_critical_alert();
```

## Performance Monitoring

### Database Performance

```sql
-- Query performance
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%tasks%' OR query LIKE '%attendance_logs%'
ORDER BY total_exec_time DESC
LIMIT 20;

-- Table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  pg_total_relation_size(schemaname||'.'||tablename) as bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY bytes DESC;

-- Index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Edge Function Performance

```sql
-- Function execution times (from logs)
-- Access via Supabase Dashboard > Functions > [function-name] > Logs

-- Look for:
-- - Average response time <500ms
-- - No timeouts (30s limit)
-- - No memory errors
```

## Maintenance Tasks

### Daily

- [ ] Review message delivery rate
- [ ] Check for high severity alerts
- [ ] Verify cron jobs executed successfully
- [ ] Review attendance compliance

### Weekly

- [ ] Review all unresolved alerts
- [ ] Check task completion metrics
- [ ] Analyze failed message patterns
- [ ] Review edge function error logs
- [ ] Clean up old test data

### Monthly

- [ ] Rotate LINE API tokens (if applicable)
- [ ] Archive old bot_message_logs (>90 days)
- [ ] Review and optimize database indexes
- [ ] Update system documentation
- [ ] Audit user roles and permissions

### Quarterly

- [ ] Full system security audit
- [ ] Review and update cron schedules
- [ ] Performance testing under load
- [ ] Disaster recovery testing
- [ ] Update dependencies and packages

## Data Retention

### Automated Cleanup

```sql
-- Archive old message logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete old bot message logs
  DELETE FROM bot_message_logs
  WHERE sent_at < NOW() - INTERVAL '90 days';
  
  -- Archive old attendance logs (move to archive table)
  -- (Implement if needed)
  
  -- Clean up resolved alerts
  DELETE FROM alerts
  WHERE resolved = true
    AND resolved_at < NOW() - INTERVAL '30 days';
    
  RAISE NOTICE 'Cleanup completed at %', NOW();
END;
$$;

-- Schedule cleanup monthly
SELECT cron.schedule(
  'monthly-cleanup',
  '0 2 1 * *', -- 2 AM on 1st of each month
  $$
  SELECT cleanup_old_logs();
  $$
);
```

## Incident Response

### Critical Incident Procedure

1. **Identify Severity**
   - P0 (Critical): System completely down, no messages sending
   - P1 (High): Major feature broken, affecting >50% of users
   - P2 (Medium): Minor feature broken, affecting <50% of users
   - P3 (Low): Cosmetic issue, no functional impact

2. **Initial Response**
   - Acknowledge incident in monitoring system
   - Check system status dashboard
   - Review recent deployments/changes
   - Check edge function logs

3. **Mitigation**
   - Rollback recent changes if applicable
   - Disable problematic cron job if needed
   - Switch to manual mode for critical operations
   - Communicate status to stakeholders

4. **Resolution**
   - Identify root cause
   - Apply permanent fix
   - Test thoroughly
   - Re-enable automated systems
   - Document incident

5. **Post-Mortem**
   - Write incident report
   - Identify preventive measures
   - Update runbooks
   - Share lessons learned

## Useful Monitoring Queries

```sql
-- System health snapshot
SELECT 
  'Active Cron Jobs' as metric,
  COUNT(*) as value
FROM cron.job
WHERE active = true
UNION ALL
SELECT 
  'Failed Messages (24h)',
  COUNT(*)
FROM bot_message_logs
WHERE delivery_status = 'failed'
  AND sent_at > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 
  'Unresolved Alerts',
  COUNT(*)
FROM alerts
WHERE resolved = false
UNION ALL
SELECT 
  'Pending Tasks',
  COUNT(*)
FROM tasks
WHERE status = 'pending'
UNION ALL
SELECT 
  'Employees Checked In',
  COUNT(DISTINCT employee_id)
FROM attendance_logs al1
WHERE event_type = 'check_in'
  AND DATE(server_time) = CURRENT_DATE
  AND NOT EXISTS (
    SELECT 1 FROM attendance_logs al2
    WHERE al2.employee_id = al1.employee_id
      AND al2.event_type = 'check_out'
      AND al2.server_time > al1.server_time
      AND DATE(al2.server_time) = CURRENT_DATE
  );
```

## Additional Resources

- [Cron Jobs Guide](CRON_JOBS_GUIDE.md)
- [Troubleshooting Guide](CRON_TROUBLESHOOTING.md)
- [Deployment Checklist](DEPLOYMENT_CHECKLIST.md)
- [Supabase Monitoring Docs](https://supabase.com/docs/guides/platform/metrics)
