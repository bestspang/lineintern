
# Phase 1A QA Patch — Employee Documents

Read-only review complete. One real bug found, one documented risk. Scope strictly limited to Phase 1A files. No protected systems touched.

## Findings

### 1. Build / JSX / Imports — OK (no fix needed)
- `EmployeeDetail.tsx` line 31 imports `EmployeeDocumentsTab` correctly.
- Line 688 uses **valid** JSX comment: `{/* Phase 1A — Employee Documents */}`. The malformed `{/ ... /}` form does **not** exist in the file.
- All four edge functions, the dialog, the tab, the page, and `lib/employee-document-types.ts` are present.
- Will run `npm run build` + `npm run smoke:quick` in build mode to confirm; no code change expected from this task.

### 2. signed-url ownership query — REAL BUG (must fix)
File: `supabase/functions/employee-document-signed-url/index.ts` line 74

```ts
.or(`auth_user_id.eq.${auth.userId},line_user_id.in.(select line_user_id from users where id = '${auth.userId}')`)
```

PostgREST does **not** evaluate SQL subqueries inside `.or()`. The `select ...` text is parsed as a literal value list, so the `line_user_id.in.(...)` branch silently never matches. Worse, this couples a user-controlled-shape filter with raw interpolation. Result today: employees linked **only via LINE** (no `auth_user_id`) cannot fetch their own visible documents — falls through to 403.

**Fix (two-step, no behavior weakening):**

```ts
// Resolve LINE id from auth user (best-effort)
const { data: linkedUser } = await supabase
  .from("users")
  .select("line_user_id")
  .eq("id", auth.userId)
  .maybeSingle();
const lineUserId = linkedUser?.line_user_id ?? null;

// Find an employee row matching this caller AND owning this document
let ownEmp: { id: string } | null = null;
{
  const q = supabase
    .from("employees")
    .select("id")
    .eq("id", doc.employee_id);
  const { data } = lineUserId
    ? await q.or(`auth_user_id.eq.${auth.userId},line_user_id.eq.${lineUserId}`).maybeSingle()
    : await q.eq("auth_user_id", auth.userId).maybeSingle();
  ownEmp = data ?? null;
}

let allowed = !!ownEmp;
if (!allowed && (role === "manager" || role === "executive" || role === "moderator")) {
  const { data: scopeOk } = await supabase.rpc("can_view_employee_by_priority", {
    viewer_user_id: auth.userId,
    target_employee_id: doc.employee_id,
  });
  allowed = !!scopeOk;
}
if (!allowed) return jsonResponse({ error: "forbidden" }, 403);
```

Preserved invariants:
- Non-HR still blocked from `hr_only` (early `visibility !== 'employee_visible'` check kept).
- Employee A still cannot fetch employee B's docs (filter `id = doc.employee_id`).
- Manager priority gate unchanged (`can_view_employee_by_priority`).
- HR/Admin/Owner short-circuit unchanged.
- `auth.userId` is a UUID from JWT validation in `requireRole`, but we still use `.or()` with parameter syntax — no raw SQL, no subquery, no injection surface.

### 3. Upload-failure orphan rows — DOCUMENT AS RISK (defer)
Current flow: insert metadata row → return signed upload URL → client uploads to Storage. If the browser dies between step 2 and step 3, a metadata row exists with no Storage object.

**Decision: Option B (defer to Phase 1A.1).**
Rationale:
- Adding `upload_status` + a confirm function touches the schema, the upload edge fn, the dialog, the tab list filter, the admin page filter, and the signed-url fn. That is no longer a "QA patch" — it is a feature change with regression risk on a freshly shipped module.
- Existing rollback already covers the most common failure (signed-URL creation itself failing — we delete the row).
- Orphan rows are HR-visible (`hr_only` default) and cause a clean "file not found" on signed-URL fetch, not a security issue.

Will document in `docs/STATUS.md` as **Phase 1A.1 Risk** with proposed remediation:
- Add `upload_status text NOT NULL DEFAULT 'pending'` (`pending|uploaded|failed`).
- Add `employee-document-confirm-upload` function (HR/admin/owner) that verifies the Storage object exists then sets `uploaded`.
- List/expiring queries filter `upload_status = 'uploaded'`.
- Nightly cleanup cron deletes `pending` rows older than 24 h.

### 4. Manual security checklist — to verify after deploy
Cannot execute in plan mode. Will add the 10-item checklist to `docs/STATUS.md` and walk through it during the patch:
1. HR uploads `hr_only` contract → row + object created, audit `upload`.
2. HR fetches signed URL → 200, audit `view`.
3. Employee A (own) fetches `hr_only` → 403 (visibility gate).
4. Employee A fetches own `employee_visible` → 200 (after fix).
5. Employee B fetches A's `employee_visible` → 403 (`id = doc.employee_id` mismatch).
6. Manager in scope fetches `employee_visible` → 200 via priority RPC.
7. Manager fetches `hr_only` → 403 (visibility gate).
8. Archive: `status='archived'` excluded from default tab list & employee/manager RLS.
9. Replace: old row `status='replaced'`, `replaced_by_document_id` set.
10. `audit_logs` rows present for `upload`, `view`, `archive`, `replace`.

## Files to change
1. `supabase/functions/employee-document-signed-url/index.ts` — replace lines 71–89 with safe two-step ownership query.
2. `docs/STATUS.md` — append Phase 1A QA Patch section with build/smoke results, fix summary, manual checklist, and Phase 1A.1 risk note.

## Will NOT change
- Any line-webhook, attendance, payroll, points, leave/OT, portal check-in, or Bangkok timezone code.
- Schema (`employee_documents` table untouched).
- Storage policies.
- RLS on `employee_documents` (the SQL `IN (SELECT …)` in the RLS policy is real SQL inside a Postgres policy — it works correctly; only the PostgREST `.or()` string was broken).
- `employee-document-upload`, `-archive`, `-replace`, the React tab, dialog, or admin page.

## Verdict path
After applying the one-file fix and confirming `npm run build` + `npm run smoke:quick` pass: **READY FOR PHASE 1B PERFORMANCE**, with Phase 1A.1 (upload confirm) tracked as a non-blocking follow-up.
