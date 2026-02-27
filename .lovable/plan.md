

## Add Preview Table + XLSX Export to Payroll Export Dialog

### Changes (1 file + 1 dependency)

**1. Install `xlsx` package** for .xlsx export support

**2. `src/components/attendance/PayrollExportDialog.tsx`**

- **Add format selector state** (`exportFormat: 'csv' | 'xlsx'`) with radio/select toggle in the footer area
- **Add preview table** after the column picker section:
  - Shows first 3-5 rows of data based on current mode, selected employees, and selected columns
  - For summary mode: uses `payrollRecords` data directly (no DB call needed)
  - For daily mode: shows placeholder preview from available data (actual daily data fetched on export)
  - Styled as a compact `<table>` with horizontal scroll, border, small text
  - Label: "ตัวอย่างข้อมูล (3 แถวแรก)"
- **Add `downloadXLSX` function**:
  - Uses `xlsx` library (`utils.json_to_sheet` + `writeFile`)
  - Same headers/rows structure as CSV
  - UTF-8 support built-in with xlsx library
- **Update `handleExport`** to branch on `exportFormat`
- **Update footer buttons**: Replace single "Export CSV" with format-aware button text ("Export CSV" / "Export XLSX")
- **Save `exportFormat` preference** in localStorage alongside existing prefs

### Risk: Low
- New dependency `xlsx` — well-established, no conflicts
- No changes to data queries or business logic
- Preview is read-only display of existing data

