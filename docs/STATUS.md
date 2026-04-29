# Project Status

## Phase 0A — Edge Function Hardening (complete)

Role guards via `_shared/authz.ts` + structured audit logs via `_shared/audit.ts`
on the following 7 edge functions. All audit rows land in `public.audit_logs`
with `metadata.function`, `metadata.caller_role`, and function-specific context.

| Function                          | Allowed roles                                         | Audit action |
|-----------------------------------|--------------------------------------------------------|--------------|
| `remote-checkout-approval`        | admin, owner, hr, manager, executive (+ internal)     | approve / archive / reject |
| `streak-backfill`                 | admin, owner                                          | backfill |
| `response-analytics-backfill`     | admin, owner                                          | backfill |
| `memory-backfill`                 | admin, owner                                          | backfill |
| `dm-send`                         | admin, owner, hr, manager, moderator                  | send |
| `broadcast-send`                  | admin, owner, hr                                      | send |
| `import-line-chat`                | admin, owner, hr, manager, executive                  | import |

### Internal-call contract — `remote-checkout-approval`

The only function that supports internal (non-user-JWT) calls. Used by
`portal-data` for portal-driven approvals.

Required headers:
- `x-internal-source: portal-data`
- `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (constant-time compared)

Half-set markers return `401 { code: "internal_marker_mismatch" }`.
Internal calls write audit rows with `metadata.caller_role='internal:portal-data'`
and `metadata.source='internal'`; the human approver is preserved in
`performed_by_employee_id`.

### Verification

See `docs/PHASE_0A_VERIFICATION.md` for the full curl-based test matrix and
audit-log spot-check SQL.
