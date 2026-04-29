## Goal

Make `/attendance/employee-documents` clearer, faster to scan, and easier to act on — without breaking the existing upload/confirm/signed-URL pipeline already hardened in Phases 1A.1–1A.3.

## Affected modules & status

| Module | Status | Action |
|---|---|---|
| `src/pages/attendance/EmployeeDocuments.tsx` | WORKING (basic table) | Redesign UI shell only |
| `src/components/employee-documents/UploadDocumentDialog.tsx` | WORKING (locked) | Do not touch |
| `src/components/employee-documents/EmployeeDocumentsTab.tsx` | WORKING (locked) | Do not touch |
| `src/components/employee-documents/SelectEmployeeForUploadDialog.tsx` | WORKING | Reuse as-is |
| Edge functions (signed-url, confirm-upload, archive) | WORKING | No changes |
| `employee-document-types.ts` | WORKING | No changes |

## What must be preserved

- All current filters (search, branch, type, status, expiry window) and their query semantics.
- The "อัปโหลดเอกสาร" entry point → `SelectEmployeeForUploadDialog` flow.
- The deep-link to `EmployeeDetail` (where row-level Download/Replace/Archive/Activity already live).
- All Thai labels and the `active_only` / `pending_or_failed` derived filters.
- 500-row safety limit and current React Query keys (we'll keep the same key shape so cache stays warm).

## What's actually weak (UX problems to fix)

1. No at-a-glance health: HR can't see how many docs are expiring or stuck pending without scrolling.
2. Filters are a flat row of 5 dropdowns — no quick presets ("Expiring soon", "Needs attention").
3. Table is dense; mobile (<768px) horizontally scrolls and is hard to read.
4. No row-level quick actions from this page (HR must click into employee detail just to download or archive).
5. "อัปโหลดค้าง / ล้มเหลว" rows blend in with healthy rows — no visual urgency.
6. No sort control; expiry-asc is hardcoded.
7. Empty state is plain — only appears inside the table.

## Minimal-diff plan

### 1. New summary KPI strip (top of page)
Compute from the same `rows` already fetched (no extra query) using `useMemo`:
- Total active documents
- Expiring ≤30 days (red), ≤90 days (amber)
- Already expired
- Pending / failed uploads
Each KPI is a clickable chip that applies the matching filter preset. Uses existing shadcn `Card` + `Badge`.

### 2. Quick-filter preset bar
A row of toggle chips above the existing advanced filters:
- "ทั้งหมด" · "ใกล้หมดอายุ (90 วัน)" · "หมดอายุแล้ว" · "อัปโหลดค้าง" · "เก็บถาวร"
Each preset just sets the existing `statusFilter` + `expiryWindow` state — no new query logic.
Advanced filters collapse into a `Collapsible` ("ตัวกรองขั้นสูง") to reduce visual noise; opens by default if any non-default value is set.

### 3. View toggle: Table ↔ Cards
- Desktop default: improved table (sticky header, zebra rows, urgency-tinted left border for expiring/failed).
- Mobile / opt-in: card grid — each card shows employee + branch + doc title + type + expiry chip + status chips + quick actions.
Stored in `useState`; auto-switches to "cards" below `md`.

### 4. Inline quick actions per row (page-level, additive)
Add three buttons on each row, reusing the same edge functions already used by `EmployeeDocumentsTab`:
- Download (calls `employee-document-signed-url`, same error mapping via `SIGNED_URL_ERROR_CODE_TH`)
- "ดูประวัติ" (opens existing `DocumentActivityLogDialog` when `confirm_history` exists or upload not OK)
- "เปิดโปรไฟล์พนักงาน" (existing link)

Archive / Replace stay only inside `EmployeeDocumentsTab` (employee detail) — they need richer context and we don't want to duplicate that surface here.

### 5. Sortable columns
Add sort dropdown (วันหมดอายุ ↑/↓, อัปเดตล่าสุด, ชื่อพนักงาน). Sort happens client-side on the already-fetched rows.

### 6. Better empty / loading / error states
- Skeleton rows (5) instead of single spinner.
- Empty state with illustration-style icon + CTA "เลือกพนักงานเพื่ออัปโหลด".
- If query errors, show inline retry banner.

### 7. Row urgency styling
- Expired: subtle red-tinted row + destructive badge.
- ≤30 days: amber tint.
- `pending` / `failed`: outline border-l-4 in warning/destructive color.

### 8. Header polish
- Show last-refreshed time + manual refresh button.
- Result counter ("แสดง 42 จาก 500").
- CSV export button (client-side, exports currently filtered rows — pure-frontend, no new endpoint).

## Files to change

- `src/pages/attendance/EmployeeDocuments.tsx` — full UI rewrite of the page shell, same data layer.
- `src/components/employee-documents/EmployeeDocumentsKpiStrip.tsx` (new) — pure presentational.
- `src/components/employee-documents/EmployeeDocumentsCardGrid.tsx` (new) — mobile-friendly card view.
- `src/components/employee-documents/EmployeeDocumentsRowActions.tsx` (new) — shared download + activity buttons.

No changes to: edge functions, DB, types, `EmployeeDocumentsTab`, `UploadDocumentDialog`, `SelectEmployeeForUploadDialog`, tests.

## Regression checklist

- Upload entry-point still works (button + empty state CTA).
- All 5 existing filters still apply correctly.
- 500-row cap preserved.
- Deep-link to employee detail still navigates correctly.
- Existing test suite (`bun run test`, 7 cases) keeps passing — we don't touch tested files.
- No new external dependencies.
- Mobile (<768px) no longer requires horizontal scroll for primary info.

## Out of scope (explicitly)

- No bulk archive (would need server changes).
- No new edge functions.
- No DB migrations.
- No changes to EmployeeDocumentsTab inside employee detail page.
