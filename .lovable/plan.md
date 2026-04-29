
# Phase 0A.1 — Audit Logging + Strict Internal-Call Validation

Builds on the 7 role guards already in place. No business logic changes. Pure additive: stricter validation on the one function that supports internal calls, structured audit logging on all 7, and a written verification checklist.

## 1. Caller audit (no frontend changes needed)

- `remote-checkout-approval`: only internal caller is `supabase/functions/portal-data/index.ts` (case `approve-remote-checkout`). It already sends `x-internal-source: portal-data` + service-role bearer (done in previous step). No frontend caller exists. Nothing else to update here.
- The other 6 functions (`streak-backfill`, `response-analytics-backfill`, `memory-backfill`, `dm-send`, `broadcast-send`, `import-line-chat`) have only frontend admin callers via `supabase.functions.invoke(...)` which already forwards the user's JWT. Nothing to change client-side.

## 2. Stricter internal-call validation in `remote-checkout-approval`

Tighten the existing `isInternal` check and produce a clear, distinguishable error when the marker is half-present.

Logic:

```text
internalSource = header "x-internal-source"
authHeader     = header "Authorization"
serviceKey     = env SUPABASE_SERVICE_ROLE_KEY

if internalSource is present:
    must equal exactly "portal-data"
    authHeader must equal exactly "Bearer <serviceKey>"
    serviceKey must be non-empty
    -> if any check fails: return 401
       { code: "internal_marker_mismatch",
         error: "x-internal-source supplied but service-role auth missing or invalid" }
    -> on success: skip role guard, continue

else:
    run requireRole(['admin','owner','hr','manager','executive'])
```

Constant-time string compare for the bearer check (prevents timing leaks). Log decision as `[authz] remote-checkout-approval source=internal|user actor=... decision=allow|deny:<reason>` (no secrets).

## 3. Shared structured audit logger

Add `supabase/functions/_shared/audit.ts` exporting:

```ts
writeAuditLog(supabase, {
  functionName,        // e.g. "broadcast-send"
  actionType,          // e.g. "approve" | "reject" | "backfill" | "send" | "import"
  resourceType,        // e.g. "remote_checkout_request" | "broadcast" | "memory" | "streak"
  resourceId?,         // request_id / broadcast_id / etc.
  performedByUserId?,  // from requireRole result
  callerRole?,         // "admin" | "owner" | ... | "internal:portal-data"
  metadata?,           // function-specific context (groupId, employeeId, counts, dryRun, etc.)
})
```

Implementation: insert one row into `public.audit_logs` using the service-role client. Wrapped in try/catch — audit failures must never break the request (log a warning and continue). PII rule: never write LINE access token, full message body, or photo URLs; truncate text > 200 chars.

### Per-function audit calls

| Function | action_type | resource_type | resource_id | metadata |
|---|---|---|---|---|
| `remote-checkout-approval` | `approve` or `reject` | `remote_checkout_request` | `request_id` | `{ employee_id, approver_employee_id, source: 'internal'\|'user', rejection_reason? }` |
| `streak-backfill` | `backfill` | `streak` | null | `{ updated_count, dry_run }` |
| `response-analytics-backfill` | `backfill` | `response_analytics` | null | `{ start_date, end_date, group_id, user_id, dry_run, updated_count }` |
| `memory-backfill` | `backfill` | `memory` | `group_id` | `{ days_back, limit, processed_count }` |
| `dm-send` | `send` | `dm` | `group_id` | `{ line_user_id_masked, group_id, char_count }` (mask: keep last 4 chars) |
| `broadcast-send` | `send` | `broadcast` | `broadcast_id` | `{ total_recipients, sent_count, failed_count, dry_run }` |
| `import-line-chat` | `import` | `branch_report` | null | `{ content_chars, parsed_count, inserted_count, dry_run }` |

For `remote-checkout-approval` internal calls, `performed_by_user_id` is null; `callerRole` is set to `internal:portal-data` and `metadata.approver_employee_id` is recorded so the audit trail still resolves a human approver via the portal.

Audit calls are inserted **after** the work succeeds, so we don't log phantom actions. For backfills, also write a single audit row at the end with the final counts, not per-row.

## 4. Verification checklist (`docs/PHASE_0A_VERIFICATION.md`)

Add a short doc with curl-based test matrix the operator can run, plus expected results.

For each of the 7 functions:

```text
[A] No bearer            -> 401  unauthorized / "Missing bearer token"
[B] Bad bearer           -> 401  unauthorized / "Invalid token"
[C] User w/ role 'user'  -> 403  forbidden    / "Insufficient role"
[D] User w/ role 'field' -> 403  forbidden    (except none — all 7 deny field)
[E] User w/ allowed role -> 200  success
```

Plus `remote-checkout-approval` only:

```text
[F] x-internal-source=portal-data + service-role bearer  -> 200 (skip role check)
[G] x-internal-source=portal-data + WRONG bearer         -> 401 internal_marker_mismatch
[H] x-internal-source=other       + service-role bearer  -> 401 internal_marker_mismatch
[I] No x-internal-source + user JWT(manager)             -> 200
```

The doc lists curl templates referencing `$SUPABASE_URL`, `$ANON_USER_JWT`, `$SERVICE_ROLE_KEY` and an "expected log line" excerpt for each row so the operator can confirm both the HTTP response and the `[authz]` / audit log entry.

Also add a `docs/STATUS.md` update entry under "Phase 0A": list the 7 hardened functions, the audit-log table they write to, and the internal-call contract for `remote-checkout-approval`.

## 5. Files touched

Created:
- `supabase/functions/_shared/audit.ts`
- `docs/PHASE_0A_VERIFICATION.md`

Edited (audit logging + per-function changes):
- `supabase/functions/remote-checkout-approval/index.ts` — strict internal validation + audit on approve/reject
- `supabase/functions/streak-backfill/index.ts` — audit at end
- `supabase/functions/response-analytics-backfill/index.ts` — audit at end
- `supabase/functions/memory-backfill/index.ts` — audit at end
- `supabase/functions/dm-send/index.ts` — audit on success
- `supabase/functions/broadcast-send/index.ts` — audit on completion
- `supabase/functions/import-line-chat/index.ts` — audit on success
- `docs/STATUS.md` — append Phase 0A entry (create if missing)

Not touched:
- `supabase/functions/portal-data/index.ts` (already sends the marker)
- Any frontend file (no client-side caller of the strict-internal endpoint exists)
- DB schema (uses existing `audit_logs` table)
- The shared `_shared/authz.ts` helper (unchanged)

## 6. Regression safety

- Role guards already in place are not changed; only the internal bypass branch in `remote-checkout-approval` becomes stricter (rejects half-set markers that previously would have fallen through to `requireRole`).
- All audit writes are best-effort and wrapped — a failed insert returns a warning log but the function still returns its normal response.
- No DB migration needed; `audit_logs` already exists with correct RLS.
- No change to request/response payloads of any function.
