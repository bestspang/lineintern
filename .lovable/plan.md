## Goal

Add four UX/perf upgrades to `/attendance/employee-documents`:
1. Autocomplete search (employee/title/file)
2. Column visibility toggle for the table view
3. Pagination / "load more" instead of fetching 500 rows up-front
4. A single "Reset" button that returns the page to default state

All changes are additive — current data layer, edge functions, KPI logic, presets, sort, view toggle, CSV export, and tests stay intact.

## Affected modules

| Module | Status | Action |
|---|---|---|
| `src/pages/attendance/EmployeeDocuments.tsx` | WORKING | Extend (search box → Combobox, add column-visibility menu, paginate query, add reset button) |
| `src/components/employee-documents/EmployeeDocumentsCardGrid.tsx` | WORKING | Untouched |
| `src/components/employee-documents/EmployeeDocumentsKpiStrip.tsx` | WORKING | Untouched (KPIs continue to use the broader 2000-row aggregate query) |
| `src/components/employee-documents/EmployeeDocumentsRowActions.tsx` | WORKING | Untouched |
| Edge functions / DB / types | WORKING | No changes |

## What must be preserved

- All existing filters, presets, sort, view toggle, CSV export.
- KPI counts (still computed from the lightweight `kpiRows` query, independent of pagination).
- Deep-link to employee detail.
- The `active_only` / `pending_or_failed` derived filter logic.
- Existing test suite — we don't touch tested files.

## Implementation

### 1. Autocomplete search (Combobox)

Use shadcn `Popover` + `Command` (already in repo).

- Replace the plain `<Input>` in the search row with a popover-trigger button styled like the input. Typing inside it opens a `Command` palette listing matching suggestions.
- Suggestions come from a separate, debounced React Query (`["employee-documents-suggest", q]`) that runs only when `q.length >= 1`. It does three lightweight `ilike` queries on the same `employee_documents` table joined to `employees`:
  - by document title (`title ilike %q%`) — limit 8
  - by file name (`file_name ilike %q%`) — limit 5
  - by employee name (`employees.full_name ilike %q%`) — limit 8
- Suggestions are grouped in the Command list ("เอกสาร", "ไฟล์", "พนักงาน") and each item shows a small icon + secondary text.
- Selecting an item:
  - Document/title item → sets `search` to the document title (existing query already filters `title ilike`).
  - File item → sets `search` to the file name AND extends the filter logic so the page-level query applies `or(title.ilike, file_name.ilike)` instead of just title.
  - Employee item → sets a NEW `employeeFilter` state with `{ id, name }` and the page query adds `eq("employee_id", id)`. A removable chip appears next to the search box.
- The user can still type free text and press Enter to apply as the existing `search` (no employee chip).
- Debounce typing by 200ms with a `useEffect`/timeout (no extra dep).

This widens the search semantics without breaking existing behavior — the unmodified `search` text still drives the same `title ilike` query when no suggestion is picked.

### 2. Column visibility toggle (table mode only)

- Define a `ColumnKey` union: `employee | branch | title | type | expiry | visibility | status | actions`.
- `actions` is always visible (locked).
- Default visibility mirrors current responsive defaults (e.g. `branch` hidden by default on <lg, `visibility` hidden by default on <xl). On large screens default is "all visible."
- Add a `Columns` button (next to `รีเซ็ต`) that opens a `DropdownMenu` with `DropdownMenuCheckboxItem` for each non-locked column.
- Persist to `localStorage` under key `employee-documents.columns.v1` so HR's preference sticks across sessions.
- Render the table header/cells conditionally based on the visibility map. We keep the responsive `hidden lg:table-cell` etc. as the *initial* default but if the user explicitly toggles a column, that explicit choice wins on all viewports.
- Cards view ignores this setting (cards intentionally show everything compact).

### 3. Pagination / load-more

Switch from a single 500-row fetch to **range-based load-more** (simpler than full numbered pagination, mirrors how Supabase apps usually do this).

- Page size: 50 (constant `PAGE_SIZE`).
- Replace `useQuery` with `useInfiniteQuery` (TanStack Query already in project).
- `queryFn({ pageParam = 0 })` calls the same query but with `.range(pageParam, pageParam + PAGE_SIZE - 1)` instead of `.limit(500)`. We also use Supabase's `count: 'exact'` head=false on the first request so we know the total.
- `getNextPageParam` returns `pages.flat().length` while it's `< totalCount`.
- The flattened `rows` feeds the existing sort/render exactly as before. `sortedRows` continues to sort *only what's loaded* — and since the server already orders by `expiry_date asc` (the most common sort) this matches user expectations. When the user picks a different sort key, a small hint "เรียงเฉพาะรายการที่โหลดมาแล้ว" appears (a `Tooltip` on the sort dropdown) so they understand the local-sort caveat. This is the same tradeoff the current code already silently has.
- "โหลดเพิ่ม" button at the bottom of the table/card list shows "แสดง X จาก Y — โหลดเพิ่ม". Disabled when `!hasNextPage` or `isFetchingNextPage`.
- Bonus: an `IntersectionObserver`-based sentinel auto-loads the next page when the user scrolls near the bottom — *but* only after the user has clicked "โหลดเพิ่ม" once or scrolled past the first page (avoids surprise auto-loads on initial render). Implementation: a `useRef` + `IntersectionObserver` inside a `useEffect` keyed by `hasNextPage`.
- The "จำกัด 500" warning is removed — no more hard cap. Counter becomes "แสดง X จาก Y".

### 4. Reset button

- Add a `Button variant="ghost"` labeled "รีเซ็ต" with a `RotateCcw` icon, visible whenever any of these differ from default:
  - `search !== ""`
  - `employeeFilter !== null` (new from autocomplete)
  - `branchId !== "all"`
  - `typeFilter !== "all"`
  - `statusFilter !== "active_only"`
  - `expiryWindow !== "all"`
  - `sortKey !== "expiry_asc"`
  - `preset !== "all"`
- Clicking it calls `applyPreset("all")` plus clears `search`, `employeeFilter`, `branchId`, `typeFilter`, `sortKey`. Column visibility is NOT reset (that's a personal display preference, not a filter).
- Placed in the search/sort row so it's always reachable. Hidden when nothing to reset (avoid noise).

## Files to change

- `src/pages/attendance/EmployeeDocuments.tsx` — all four features land here (data hook, search box, columns menu, reset button).
- `src/components/employee-documents/DocumentSearchCombobox.tsx` (new) — encapsulates the Popover+Command autocomplete and emits `onPick({ kind, value, employeeId? })`.

No new dependencies. No DB or edge-function changes. No changes to KPI strip, card grid, row actions, upload dialog, or `EmployeeDocumentsTab`.

## Regression checklist

- KPI counts unchanged (still from `kpiRows`).
- All existing filters / presets / sort / view toggle still work.
- CSV export still exports currently-loaded + sorted rows (we'll add a small note "ส่งออกเฉพาะที่โหลดแล้ว" via tooltip; and a "โหลดทั้งหมดก่อนส่งออก" link that loops `fetchNextPage()` until done).
- Empty state still shows the "เลือกพนักงานเพื่ออัปโหลด" CTA.
- Mobile auto-switches to cards (unchanged).
- Existing `bun run test` suite passes (no tested files touched).

## Out of scope

- Server-side full-text search index (Postgres trigram). Keep `ilike` for now.
- Numbered pagination ("Page 3 of 12"). Load-more is sufficient and matches mobile behavior.
- Saving filters to URL params (could be a future enhancement).
