## Goal
Unblock `Publish` by fixing the one migration that errors on Live, without touching working migrations or data.

## Root cause (confirmed)
Migration `20260425100335_b3cf04de-...sql` runs:
```sql
SELECT cron.unschedule('deposit-reminder-hourly');
```
On **Live**, this cron job does not exist → Postgres raises an ERROR → entire pending chain (15 migrations) aborts → Publish fails.

## Audit of remaining 14 pending migrations
- All `DROP TABLE` use `IF EXISTS` ✅ idempotent
- All `DROP POLICY/FUNCTION/TRIGGER` use `IF EXISTS` ✅ idempotent
- Other `cron.unschedule` call (`20260429073632`) is already guarded with `WHERE EXISTS` ✅ safe
- No other risky non-idempotent operations found

**Only one file needs fixing.**

## The fix (minimal, surgical)
Replace contents of `supabase/migrations/20260425100335_b3cf04de-761a-4bab-8350-8b3c40e10a81.sql` with:

```sql
-- Unschedule the cron job (idempotent: only if it exists)
-- Live environment may not have this job; guard against ERROR that blocks publish.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deposit-reminder-hourly') THEN
    PERFORM cron.unschedule('deposit-reminder-hourly');
  END IF;
END $$;

-- Drop deposit tables (CASCADE removes any dependent objects)
DROP TABLE IF EXISTS public.deposit_approval_logs CASCADE;
DROP TABLE IF EXISTS public.deposit_reminders CASCADE;
DROP TABLE IF EXISTS public.daily_deposits CASCADE;
DROP TABLE IF EXISTS public.deposit_settings CASCADE;
```

Drop logic and CASCADE behavior unchanged — only the unschedule is wrapped in an existence guard.

## Important caveat about Test environment
This migration has **already been applied to Test** (Test is ahead). Editing the file will:
- ✅ Allow Live to apply it cleanly on next Publish
- ⚠️ Not re-run on Test (already in `schema_migrations`)
- This is fine — the end state on Test is identical to what the new SQL produces

## Steps I will execute (in build mode)
1. Overwrite the one migration file with the idempotent version above
2. Ask you to click **Publish** — Lovable will apply all 15 pending migrations to Live in order
3. Monitor: if any other migration fails, repeat the same idempotent-guard pattern on it (ask first before editing)

## What I will NOT touch
- Other 14 migration files (all verified safe)
- Data on Live (tables will be dropped per your earlier approval — receipts/deposits)
- Schema migrations table
- Any application code

## Regression checklist
- [ ] After Publish: confirm `deposit_*` and `receipt_*` tables are gone on Live
- [ ] Confirm new tables (`employee_documents`, `webhook_verification_logs`) exist on Live
- [ ] Confirm `audit-logs-cleanup-daily` cron job is scheduled
- [ ] No edge function errors in logs after publish

## Fallback
If editing the migration triggers Lovable's "migration drift" detection (because checksum changes for an already-applied migration on Test), we fall back to **Way 1** (you run `unblock_publish.sql` on Live manually). I'll know within 1 minute of Publish attempt.
