# Phase 0A.1 — Edge Function Auth & Audit Verification

Manual operator checklist for the 7 hardened edge functions. Run after each
deploy that touches `_shared/authz.ts`, `_shared/audit.ts`, or any of the
guarded functions.

## Setup

```bash
SUPABASE_URL="https://<project-ref>.supabase.co"
ANON_USER_JWT="..."          # JWT for a normal employee user with role='user'
FIELD_USER_JWT="..."         # JWT for a 'field' role
MANAGER_JWT="..."            # JWT for a 'manager' role
ADMIN_JWT="..."              # JWT for an 'admin' or 'owner'
SERVICE_ROLE_KEY="..."       # SUPABASE_SERVICE_ROLE_KEY (NEVER ship in client code)
```

## Per-function role matrix

| Function                          | Allowed roles                                         |
|-----------------------------------|--------------------------------------------------------|
| `remote-checkout-approval`        | admin, owner, hr, manager, executive (+ internal)     |
| `streak-backfill`                 | admin, owner                                          |
| `response-analytics-backfill`     | admin, owner                                          |
| `memory-backfill`                 | admin, owner                                          |
| `dm-send`                         | admin, owner, hr, manager, moderator                  |
| `broadcast-send`                  | admin, owner, hr                                      |
| `import-line-chat`                | admin, owner, hr, manager, executive                  |

## Common test cases (run for every function)

For each function `<FN>`, run:

```bash
# [A] No bearer  -> 401 unauthorized / "Missing bearer token"
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/functions/v1/<FN>" \
  -H "Content-Type: application/json" -d '{}'

# [B] Bad bearer -> 401 unauthorized / "Invalid token"
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/functions/v1/<FN>" \
  -H "Authorization: Bearer not-a-jwt" \
  -H "Content-Type: application/json" -d '{}'

# [C] role='user' -> 403 forbidden / "Insufficient role"
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/functions/v1/<FN>" \
  -H "Authorization: Bearer $ANON_USER_JWT" \
  -H "Content-Type: application/json" -d '{}'

# [D] role='field' -> 403 forbidden (every function denies 'field')
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/functions/v1/<FN>" \
  -H "Authorization: Bearer $FIELD_USER_JWT" \
  -H "Content-Type: application/json" -d '{}'

# [E] allowed role -> 200 (or function-specific 4xx for missing payload, NOT 401/403)
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/functions/v1/<FN>" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" -d '<valid-body>'
```

Expected log lines (Edge Function Logs):

- A/B: `[authz] <FN> actor=- role=- decision=deny:no-bearer|invalid-jwt`
- C/D: `[authz] <FN> actor=<uuid> role=user|field decision=deny:role-not-allowed`
- E:   `[authz] <FN> actor=<uuid> role=admin decision=allow`
       followed by `[audit] <FN> action=... resource=... actor=<uuid> role=admin ok=true`

## `remote-checkout-approval` — internal-call cases

```bash
FN="remote-checkout-approval"
REQ_ID="<uuid-of-pending-remote_checkout_request>"
APPROVER_EMP_ID="<uuid>"
BODY=$(printf '{"request_id":"%s","approved":true,"approver_employee_id":"%s"}' \
  "$REQ_ID" "$APPROVER_EMP_ID")

# [F] internal marker + service-role bearer -> 200, audit row source=internal
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/functions/v1/$FN" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "x-internal-source: portal-data" \
  -H "Content-Type: application/json" -d "$BODY"

# [G] internal marker + WRONG bearer -> 401 internal_marker_mismatch
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/functions/v1/$FN" \
  -H "Authorization: Bearer $ANON_USER_JWT" \
  -H "x-internal-source: portal-data" \
  -H "Content-Type: application/json" -d "$BODY"

# [H] wrong x-internal-source + service-role bearer -> 401 internal_marker_mismatch
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/functions/v1/$FN" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "x-internal-source: not-portal-data" \
  -H "Content-Type: application/json" -d "$BODY"

# [I] No x-internal-source + manager JWT -> 200, audit row source=user
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/functions/v1/$FN" \
  -H "Authorization: Bearer $MANAGER_JWT" \
  -H "Content-Type: application/json" -d "$BODY"
```

Expected:

- F: `200`. Log: `[authz] remote-checkout-approval source=internal decision=allow`,
  then audit row with `metadata.caller_role='internal:portal-data'`,
  `metadata.source='internal'`, `performed_by_user_id=NULL`,
  `performed_by_employee_id=<APPROVER_EMP_ID>`.
- G/H: `401` with body `{ "code": "internal_marker_mismatch", ... }`.
  Log: `[authz] remote-checkout-approval source=internal decision=deny:internal_marker_mismatch source_ok=<bool> bearer_ok=<bool>`.
  No audit row written.
- I: `200`. Log: `[authz] remote-checkout-approval actor=<uuid> role=manager decision=allow`,
  audit row with `metadata.source='user'`, `performed_by_user_id=<uuid>`.

## Audit log spot-check SQL

After running the matrix, confirm rows landed:

```sql
SELECT created_at,
       metadata->>'function'    AS fn,
       action_type,
       resource_type,
       resource_id,
       performed_by_user_id,
       metadata->>'caller_role' AS role,
       metadata->>'source'      AS source
FROM public.audit_logs
WHERE created_at > now() - interval '15 minutes'
  AND metadata->>'function' IN (
    'remote-checkout-approval','streak-backfill','response-analytics-backfill',
    'memory-backfill','dm-send','broadcast-send','import-line-chat'
  )
ORDER BY created_at DESC;
```

## Pass criteria

- Every `[A]–[D]` row above returns the documented 401/403 status.
- Every `[E]` row returns 2xx (or a function-specific validation 4xx — never 401/403).
- `remote-checkout-approval` cases F, I succeed; G, H return
  `401 internal_marker_mismatch`.
- Audit-log query shows one row per successful E/F/I call and zero rows for
  any denied call.
- No log line contains the service-role key, LINE access token, full
  message body, or photo URL.
