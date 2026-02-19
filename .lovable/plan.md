

## Phase 2: AI Test Console + Access Matrix + Audit Logs

### Overview

Add 3 new tabs to the existing `/settings/ai-cross-group` page, bringing it from 3 tabs to 6 (reordered for logical flow).

### 1) Database: New `ai_query_audit_logs` Table

The existing `ai_query_memory` has a 1-hour TTL and is not suitable for persistent audit. We need a dedicated audit log table.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| request_id | uuid | unique per query execution |
| user_id | uuid FK users | who asked |
| group_id | uuid FK groups | from which group |
| question | text | the question asked |
| answer | text | AI response |
| target_group_ids | text[] | groups that were searched |
| data_sources_used | text[] | e.g. ['messages','attendance'] |
| sources_used | jsonb | structured citations |
| policy_id | uuid FK ai_query_policies nullable | which policy was applied |
| evidence_count | int default 0 | total evidence items retrieved |
| response_time_ms | int | processing duration |
| created_at | timestamptz default now() | |

RLS: Only authenticated users with management access can read.

### 2) Backend: Log Audit on Every Cross-Group Query

Modify `cross-group-query.ts` to add a `logQueryAudit()` function that inserts into `ai_query_audit_logs` after every successful cross-group query. This is a small addition alongside the existing `saveQueryMemory()` call.

### 3) Tab D: Effective Access Matrix

A read-only visualization showing which requester (group/user) can access which target group's data.

- Rows = active policies (requester groups/users)
- Columns = all groups
- Cells = checkmark with data source badges if accessible, empty if not
- Computed client-side by intersecting policy scope with group export policies
- No new backend needed -- uses existing `ai_query_policies`, `ai_query_scope_groups`, and `ai_query_group_export` data

### 4) Tab E: AI Test Console (Dry-Run)

A form that simulates a cross-group query without sending to LINE:

- **Inputs**: Select requester (group or user), type a question
- **Process**: Calls a new edge function `ai-query-test` that runs the same logic as the real handler but returns structured debug output instead of sending a LINE reply
- **Output displays**:
  - Resolved entities (matched groups)
  - Effective scope (allowed groups + data sources)
  - Evidence preview (messages/attendance found)
  - AI answer draft
  - sources_used list

**New edge function: `supabase/functions/ai-query-test/index.ts`**
- Accepts: `{ requester_group_id, requester_user_id, question }`
- Runs: `getCrossGroupPolicy` -> `computeEffectiveScope` -> `resolveEntities` -> `retrieveCrossGroupEvidence` -> `generateCrossGroupReply`
- Returns: JSON with all intermediate steps (no LINE message sent)
- Auth: requires authenticated user with management access

### 5) Tab F: Audit Logs

A searchable, paginated table from `ai_query_audit_logs`:

- Columns: time, requester, group, question, answer (truncated), groups touched, data sources, evidence count, response time
- Expandable row to see full answer + sources_used detail
- Filter by date range and requester
- Sorted by newest first

### 6) Tab Reorder

Final tab order in the TabsList:
1. Access Rules (existing)
2. Group Export Policy (existing)
3. Access Matrix (new)
4. Test Console (new)
5. Audit Logs (new)
6. Recent Queries (existing, kept for quick TTL-based view)

### 7) Files to Create/Modify

| File | Action | Risk |
|------|--------|------|
| Migration SQL | CREATE `ai_query_audit_logs` + RLS | None (new table) |
| `src/pages/settings/AIQueryControl.tsx` | Add 3 new tab components + reorder tabs | Low (additive) |
| `supabase/functions/ai-query-test/index.ts` | New edge function for dry-run | None (new) |
| `supabase/functions/line-webhook/utils/cross-group-query.ts` | Add `logQueryAudit()` export | Low (additive) |
| `supabase/functions/line-webhook/index.ts` | Call `logQueryAudit()` after cross-group reply | Low (1 line add) |
| `supabase/config.toml` | Add `ai-query-test` function config | Low |

### 8) What We Will NOT Touch

- Existing 3 tabs (Access Rules, Export Policy, Recent Queries) -- no changes to their logic
- `parseCommand`, `generateAiReply`, memory system, all other webhook handlers
- Any other pages or edge functions

### 9) Implementation Order

1. Database migration (create `ai_query_audit_logs`)
2. Backend: add `logQueryAudit()` to `cross-group-query.ts` + call it in `line-webhook/index.ts`
3. New edge function `ai-query-test`
4. UI: Add Access Matrix tab
5. UI: Add Test Console tab
6. UI: Add Audit Logs tab
7. Reorder tabs

### 10) Technical Notes

- Access Matrix is computed purely client-side from existing queries (no new API)
- Test Console calls the new `ai-query-test` edge function via `supabase.functions.invoke()`
- Audit Logs table has no TTL -- data persists permanently for compliance
- `logQueryAudit` is fire-and-forget (non-blocking, errors logged but don't break the reply)

