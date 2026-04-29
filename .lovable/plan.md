## Goal

Backfill missing attendance logs for 3 employees at Glowfish Office during the period the app had issues (2026-03-06 → 2026-04-28), reconstructed from a LINE chat transcript provided by the user.

## What's already in DB (verified)

Existing `attendance_logs` for these employees end at **2026-03-05 09:14**. Everything from 2026-03-05 check-outs onward is missing.

## Employees to backfill

| Name in chat | employee_id | Branch |
|---|---|---|
| Porsza | `9064a128-ca9b-4fa2-9df4-882c11ac0cd7` | Glowfish Office (`4defa047-…`) |
| Noey | `a76b9d7f-1f70-4b31-a6b5-bcb2c81cd1af` | Glowfish Office |
| ntp.冬至 (ปอนด์) | `0a9c61de-8482-49ac-8586-e7878a740812` | Glowfish Office |

## Events to insert (parsed from transcript)

Total ≈ **128 events** across 33 working days. All at Glowfish Office. Examples:

```
2026-03-05 19:11 ntp / Noey / Porsza  check_out
2026-03-06 09:05 Noey  check_in
2026-03-06 09:06 Porsza check_in
2026-03-06 09:13 ntp   check_in
2026-03-06 18:25/18:25/18:26 check_out
... through 2026-04-28 18:29 (Noey, ntp check_out)
```

Full day list: 03-05 (co only), 03-06, 03-09, 03-10, 03-11, 03-12, 03-13, 03-16, 03-17, 03-18, 03-19, 03-20, 03-23, 03-24, 03-25, 03-26, 03-27, 03-30, 03-31, 04-01, 04-02, 04-03, 04-06, 04-07, 04-08, 04-09, 04-10, 04-16, 04-17, 04-20, 04-21, 04-22, 04-23, 04-24, 04-27, 04-28.

## How

Insert via a single SQL migration into `public.attendance_logs` with:

- `event_type` = `check_in` / `check_out`
- `server_time` = Bangkok local time converted to UTC (`'2026-03-06 09:05+07'`)
- `branch_id` = Glowfish Office
- `source` = `'backfill'` (clearly marked, not `'line'`)
- `admin_notes` = `'Backfilled from LINE chat transcript - app outage 2026-03-06 to 2026-04-28'`
- `is_flagged` = false, `fraud_score` = 0
- No photo / GPS (data not available)

Insert is **additive** — no UPDATE or DELETE of existing rows. Safe to re-run once because we'll add a guard:

```sql
INSERT INTO public.attendance_logs (...)
SELECT ... FROM (VALUES ...) v(...)
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_logs a
  WHERE a.employee_id = v.employee_id
    AND a.event_type = v.event_type
    AND a.server_time = v.server_time
);
```

## What I will NOT touch

- `claim_attendance_token`, attendance tokens, Bangkok timezone helpers, webhook logic, payroll calc — per global rules.
- Existing rows from 2026-03-02 → 2026-03-05 morning.
- No streak / points recompute in this step (can be a separate request if needed; daily summary cron usually picks up new logs on next run).

## Verification after insert

1. `SELECT COUNT(*)` per employee per day for the backfilled range — should match transcript.
2. `SELECT MAX(server_time)` should be `2026-04-28 18:29 BKK`.
3. Spot check `/attendance/logs` page that the new rows appear and are tagged `source = backfill`.

## Risks

- Streak counters in chat (e.g. "🔥 3 days streak!") were computed by the bot at the time; we are NOT replaying them — only inserting raw logs. Aggregated tables (daily_attendance_summaries, happy_points streaks) will re-derive on next nightly run if configured to. If user wants historical streak/points retroactively credited, that's a follow-up.
- Photos / GPS will be NULL for all backfilled rows. Fraud score 0, not flagged.

## Deliverable

One migration file inserting ~128 rows, idempotent via `NOT EXISTS` guard, then a verification SELECT printed back to the user.

Awaiting approval to switch to default mode and apply.