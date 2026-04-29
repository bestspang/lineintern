## Goal

Address the 2 actionable security findings without touching anything that already works. The "Publishing failed" red banner has no actionable error text — these advisory warnings are the only items the security scanner can flag, so clearing them removes the noise. After this, retry Publish.

## Affected Modules & Status

| Module | Status | Action |
|---|---|---|
| `supabase/functions/health-check/index.ts` | WORKING (but leaks internal details to anonymous callers) | Gate full diagnostics behind `CRON_SECRET` header |
| DB function `public.update_feature_flags_updated_at` | WORKING (missing `SET search_path`) | Add `SET search_path = public` via migration |
| All other DB functions | WORKING + already hardened | **Do not touch** |
| Publish pipeline / frontend / RLS / edge functions | WORKING | **Do not touch** |

Verified via live linter query: only **one** function in `public` is missing `search_path` — `update_feature_flags_updated_at`. Every other function already has `SET search_path TO 'public'`.

## Changes

### 1. Harden `health-check` edge function

Anonymous callers (no auth header, no `x-cron-secret`) get only:

```json
{ "status": "ok" | "degraded" | "down", "timestamp": "..." }
```

Authenticated callers (request includes header `x-cron-secret: <CRON_SECRET>`) keep the full payload they get today: per-check details, response times, environment, summary counts. This is what cron and admin monitoring already use, so no breakage.

Implementation detail (single file edit, additive):
- Read `req.headers.get("x-cron-secret")` and `Deno.env.get("CRON_SECRET")` at the top.
- Run all existing checks unchanged so the `system_health_logs` insert and overall status calc are preserved.
- Right before the response, branch:
  - If header matches secret → return current full response (unchanged shape).
  - Otherwise → return minimal `{ status, timestamp }` with the same HTTP status code (200 / 503).
- CORS, OPTIONS handling, and the catch-all error handler stay as-is (the catch block also returns a minimal shape for anonymous callers).

No removal of checks, no new dependencies, no behavior change for cron callers.

### 2. Migration: set `search_path` on the one remaining function

```sql
ALTER FUNCTION public.update_feature_flags_updated_at()
  SET search_path = public;
```

Pure metadata change. Function body and trigger behavior are unchanged.

## What Must Be Preserved

- Full health-check JSON shape for cron / authenticated monitoring callers.
- All `system_health_logs` insertions (still happen for every call).
- HTTP 503 on `down`, 200 otherwise.
- Trigger behavior of `update_feature_flags_updated_at` (it just sets `updated_at = now()` on `feature_flags`).
- All other edge functions, migrations, RLS, cron jobs.

## Regression Checklist

- [ ] `curl <project>/functions/v1/health-check` (no header) returns `{status, timestamp}` only, status 200/503.
- [ ] `curl -H "x-cron-secret: $CRON_SECRET" .../health-check` returns the full diagnostic payload (same as today).
- [ ] `system_health_logs` continues to receive a row per call.
- [ ] `feature_flags` row update still bumps `updated_at` (trigger fires).
- [ ] Re-run security scan → the `INFO_LEAKAGE` and the remaining `search_path` warning are gone.
- [ ] Publish dialog → Update succeeds.

## Files Touched

- `supabase/functions/health-check/index.ts` — minimal, additive edit
- One new migration: `ALTER FUNCTION public.update_feature_flags_updated_at() SET search_path = public;`

## Not Doing (intentionally)

- No changes to public storage buckets (`attendance-photos`, `richmenu-images`, `line-bot-assets`) — accepted by design.
- No changes to `portal_favorites` RLS — accepted for LIFF.
- No changes to other security-definer views/functions — already hardened.
- No refactor of health-check checks themselves.

Approve to apply.