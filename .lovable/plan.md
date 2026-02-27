

## Plan: Save Last Export Options in PayrollExportDialog

### Current State
- **Pattern Insights tab**: Already implemented in `Analytics.tsx` with `PatternInsightsContent` component (lines 1155-1165)
- **Payroll Export Dialog**: Already implemented in `PayrollExportDialog.tsx` with summary/daily modes, employee filter, column picker, multi-month support
- **Missing**: Export options are reset every time the dialog opens. User wants to persist last-used settings.

### What to Do
Add `localStorage` persistence to `PayrollExportDialog.tsx` so the last export configuration is remembered:

**Saved settings** (via `localStorage` key `payroll-export-prefs`):
- `mode` (summary/daily)
- `selectedBranch`
- `summaryColumns` (Set → array)
- `dailyColumns` (Set → array)

**NOT saved** (changes per session):
- `fromMonth` / `toMonth` (always default to `currentMonth`)
- `selectedEmployees` (always default to select all)
- `employeeSearch`

### Implementation

| File | Change | Risk |
|------|--------|------|
| `src/components/attendance/PayrollExportDialog.tsx` | Add localStorage load on mount + save on export (~20 lines) | Very Low |

### Changes Detail

1. **On component mount**: Read `payroll-export-prefs` from localStorage, if exists → set `mode`, `selectedBranch`, `summaryColumns`, `dailyColumns` from saved values
2. **On successful export**: Save current `mode`, `selectedBranch`, `summaryColumns`, `dailyColumns` to localStorage
3. Use a single `useEffect` for loading + save inside `handleExport`

### Risk: Very Low
- Additive change only (localStorage read/write)
- No DB, no edge function changes
- Fallback: if localStorage is empty/corrupt, use existing defaults

