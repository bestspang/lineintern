

## Problem Analysis

The column picker UI code looks correct — `activeColumns` switches between `SUMMARY_COLUMNS` and `DAILY_COLUMNS` based on `mode`, and `toggleColumn` correctly handles both sets. The issue is likely that the **ScrollArea is cutting off** the column picker section at the bottom of the dialog, making it impossible to scroll down to see/interact with the column checkboxes — especially when the employee list is expanded.

The `DialogContent` uses `max-h-[90vh]` with `overflow-hidden`, and `ScrollArea` with `flex-1`. If the content above (mode tabs + month range + branch filter + employee list with `max-h-52`) takes up most of the viewport height, the column picker gets pushed below the visible area.

## Fix

**File: `src/components/attendance/PayrollExportDialog.tsx`**

1. Reduce employee list max-height from `max-h-52` to `max-h-40` to leave room for column picker
2. Add `min-h-0` to the ScrollArea to ensure flex shrinking works properly
3. Add extra bottom padding (`pb-4`) to the inner content so the column picker section has breathing room when scrolled

These are UI-only changes. No logic or data changes.

| File | Change | Risk |
|------|--------|------|
| `PayrollExportDialog.tsx` | Adjust scroll area sizing (~3 lines) | Very Low |

