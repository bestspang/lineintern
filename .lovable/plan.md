

## Plan: Enhanced Payroll Export with Multiple Modes

### Problem
Current export is a single "Export" button that dumps summary CSV (1 row per employee). User wants:
1. **Summary mode** (current) vs **Daily detail mode** (1 row per employee per day)
2. Month range selector (select multiple months)
3. Employee/branch filter for export
4. Column picker (choose which data to include)

### Approach
Create a new `PayrollExportDialog` component used from Payroll.tsx. This keeps Payroll.tsx changes minimal (just import + replace the export button).

### Implementation

**New file: `src/components/attendance/PayrollExportDialog.tsx`**
- Dialog with tabs: "Summary" vs "Daily Detail"
- Month range picker (from/to month)
- Branch filter dropdown (reuse existing branches data)
- Employee multi-select checkboxes (filter by branch first)
- Column picker with checkboxes:
  - Summary: รหัส, ชื่อ, สาขา, ประเภท, วันทำงาน, ชม.รวม, สาย, ขาด, ลา, OT, เงินเดือน, หัก, สุทธิ
  - Daily: รหัส, ชื่อ, วันที่, สถานะ (มา/สาย/ขาด/ลา), เวลาเข้า, เวลาออก, ชม.ทำงาน, OT, หมายเหตุ
- Export button generates CSV based on selections
- For daily mode: query `attendance_logs` + `work_sessions` for selected employees/months
- Props: `payrollRecords`, `employees`, `branches`, `currentMonth`, `open`, `onOpenChange`

**Edit: `src/pages/attendance/Payroll.tsx`**
- Import `PayrollExportDialog`
- Add state `exportDialogOpen`
- Replace existing `handleExport` button click with opening the dialog
- Pass existing data (employees, branches, payrollRecords, currentMonth) as props

### Files Changed

| File | Change | Risk |
|------|--------|------|
| `src/components/attendance/PayrollExportDialog.tsx` | New component (~250 lines) | None (new file) |
| `src/pages/attendance/Payroll.tsx` | Import + replace export button (~5 lines changed) | Very Low |

### Key Design Decisions
- Daily mode queries `attendance_logs` directly in the dialog (lazy load when user picks daily mode)
- Multi-month support: loop months and query each
- Column picker uses simple checkbox list with "Select All" toggle
- Keep existing `handleExport` as fallback, dialog calls similar logic internally
- No DB changes, no edge function changes

