import React, { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, subMonths } from 'date-fns';
import { th } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { formatBangkokISODate } from '@/lib/timezone';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Download, FileText, Search, Loader2, Table, ArrowUpDown } from 'lucide-react';

interface PayrollExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payrollRecords: any[];
  employees: any[];
  branches: any[];
  currentMonth: Date;
}

const SUMMARY_COLUMNS = [
  { key: 'code', label: 'รหัส', default: true },
  { key: 'name', label: 'ชื่อ', default: true },
  { key: 'branch', label: 'สาขา', default: true },
  { key: 'pay_type', label: 'ประเภท', default: true },
  { key: 'work_days', label: 'วันทำงาน', default: true },
  { key: 'total_hours', label: 'ชม.รวม', default: true },
  { key: 'late_count', label: 'สาย(ครั้ง)', default: true },
  { key: 'late_minutes', label: 'สาย(นาที)', default: true },
  { key: 'leave_days', label: 'วันลา', default: true },
  { key: 'early_leave', label: 'ออกก่อน', default: false },
  { key: 'absent_days', label: 'ขาด', default: true },
  { key: 'ot_hours', label: 'OT ชม.', default: true },
  { key: 'base_salary', label: 'เงินเดือน', default: true },
  { key: 'ot_pay', label: 'OT', default: true },
  { key: 'allowances', label: 'เบี้ยเลี้ยง', default: true },
  { key: 'deductions', label: 'หัก', default: true },
  { key: 'net_pay', label: 'สุทธิ', default: true },
];

const DAILY_COLUMNS = [
  { key: 'code', label: 'รหัส', default: true },
  { key: 'name', label: 'ชื่อ', default: true },
  { key: 'branch', label: 'สาขา', default: true },
  { key: 'date', label: 'วันที่', default: true },
  { key: 'day_name', label: 'วัน', default: true },
  { key: 'status', label: 'สถานะ', default: true },
  { key: 'check_in', label: 'เวลาเข้า', default: true },
  { key: 'check_out', label: 'เวลาออก', default: true },
  { key: 'work_hours', label: 'ชม.ทำงาน', default: true },
  { key: 'late_minutes', label: 'สาย (นาที)', default: true },
  { key: 'capped_hours', label: 'ชม.จริง (cap)', default: true },
  { key: 'ot_approved_hours', label: 'OT อนุมัติ (ชม.)', default: false },
  { key: 'is_overtime', label: 'OT', default: false },
  { key: 'note', label: 'หมายเหตุ', default: false },
];

type SortBy = 'code' | 'name' | 'date';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'code', label: 'รหัสพนักงาน' },
  { value: 'name', label: 'ชื่อพนักงาน' },
  { value: 'date', label: 'วันที่' },
];

const DAY_NAMES_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function buildSummaryRow(r: any): Record<string, string> {
  return {
    code: r.employee?.code || '',
    name: r.employee?.full_name || '',
    branch: r.employee?.branches?.name || '-',
    pay_type: r.pay_type === 'salary' ? 'เงินเดือน' : 'รายชั่วโมง',
    work_days: String(r.actual_work_days || 0),
    total_hours: (r.total_work_hours || 0).toFixed(2),
    late_count: String(r.late_count || 0),
    late_minutes: String(r.late_minutes || 0),
    leave_days: String(r.leave_days || 0),
    early_leave: String(r.early_leave_count || 0),
    absent_days: String(r.absent_days || 0),
    ot_hours: (r.ot_hours || 0).toFixed(2),
    base_salary: (r.base_salary || 0).toFixed(2),
    ot_pay: (r.ot_pay || 0).toFixed(2),
    allowances: (r.total_allowances || 0).toFixed(2),
    deductions: (r.total_deductions || 0).toFixed(2),
    net_pay: (r.net_pay || 0).toFixed(2),
  };
}

export default function PayrollExportDialog({
  open,
  onOpenChange,
  payrollRecords,
  employees,
  branches,
  currentMonth,
}: PayrollExportDialogProps) {
  const [mode, setMode] = useState<'summary' | 'daily'>('summary');
  const [fromMonth, setFromMonth] = useState(currentMonth);
  const [toMonth, setToMonth] = useState(currentMonth);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(true);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('csv');
  const [sortBy, setSortBy] = useState<SortBy>('code');
  const [summaryColumns, setSummaryColumns] = useState<Set<string>>(
    new Set(SUMMARY_COLUMNS.filter(c => c.default).map(c => c.key))
  );
  const [dailyColumns, setDailyColumns] = useState<Set<string>>(
    new Set(DAILY_COLUMNS.filter(c => c.default).map(c => c.key))
  );
  const [isExporting, setIsExporting] = useState(false);
  const [lateThreshold, setLateThreshold] = useState<number | null>(null); // null = use globalGrace

  // Load saved preferences
  useEffect(() => {
    try {
      const saved = localStorage.getItem('payroll-export-prefs');
      if (saved) {
        const prefs = JSON.parse(saved);
        if (prefs.mode) setMode(prefs.mode);
        if (prefs.selectedBranch) setSelectedBranch(prefs.selectedBranch);
        if (prefs.exportFormat) setExportFormat(prefs.exportFormat);
        if (prefs.sortBy) setSortBy(prefs.sortBy);
        if (prefs.lateThreshold != null) setLateThreshold(prefs.lateThreshold);
        if (Array.isArray(prefs.summaryColumns)) setSummaryColumns(new Set(prefs.summaryColumns));
        if (Array.isArray(prefs.dailyColumns)) setDailyColumns(new Set(prefs.dailyColumns));
      }
    } catch {}
  }, []);

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter(emp => {
      const matchBranch = selectedBranch === 'all' || emp.branch_id === selectedBranch;
      const matchSearch = !employeeSearch ||
        emp.full_name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        emp.code?.toLowerCase().includes(employeeSearch.toLowerCase());
      return matchBranch && matchSearch;
    });
  }, [employees, selectedBranch, employeeSearch]);

  const effectiveSelectedIds = useMemo(() => {
    if (selectAll) return new Set(filteredEmployees.map(e => e.id));
    return selectedEmployees;
  }, [selectAll, selectedEmployees, filteredEmployees]);

  const toggleEmployee = (id: string) => {
    setSelectAll(false);
    const next = new Set(selectedEmployees);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEmployees(next);
  };

  const toggleAllEmployees = () => {
    if (selectAll) {
      setSelectAll(false);
      setSelectedEmployees(new Set());
    } else {
      setSelectAll(true);
    }
  };

  const toggleColumn = (key: string, isSummary: boolean) => {
    const set = isSummary ? new Set(summaryColumns) : new Set(dailyColumns);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    isSummary ? setSummaryColumns(set) : setDailyColumns(set);
  };

  const toggleAllColumns = (isSummary: boolean) => {
    const cols = isSummary ? SUMMARY_COLUMNS : DAILY_COLUMNS;
    const current = isSummary ? summaryColumns : dailyColumns;
    const allSelected = cols.every(c => current.has(c.key));
    if (allSelected) {
      isSummary ? setSummaryColumns(new Set()) : setDailyColumns(new Set());
    } else {
      isSummary
        ? setSummaryColumns(new Set(cols.map(c => c.key)))
        : setDailyColumns(new Set(cols.map(c => c.key)));
    }
  };

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(new Date(), i);
      options.push(m);
    }
    return options;
  }, []);

  // --- Preview data (3 rows) ---
  const previewData = useMemo(() => {
    const ids = Array.from(effectiveSelectedIds);
    if (ids.length === 0) return { headers: [] as string[], rows: [] as string[][] };

    if (mode === 'summary') {
      const cols = SUMMARY_COLUMNS.filter(c => summaryColumns.has(c.key));
      const headers = cols.map(c => c.label);
      const filtered = payrollRecords?.filter(r => ids.includes(r.employee_id)) || [];
      const rows = filtered.slice(0, 3).map(r => {
        const row = buildSummaryRow(r);
        return cols.map(c => row[c.key] || '');
      });
      return { headers, rows };
    } else {
      // Daily mode: show placeholder from first employee's info
      const cols = DAILY_COLUMNS.filter(c => dailyColumns.has(c.key));
      const headers = cols.map(c => c.label);
      const empMap = new Map<string, any>();
      employees?.forEach(e => empMap.set(e.id, e));

      const sampleRows: string[][] = [];
      const today = new Date();
      for (let i = 0; i < Math.min(3, ids.length); i++) {
        const emp = empMap.get(ids[i]);
        if (!emp) continue;
        const rowData: Record<string, string> = {
          code: emp.code || '-',
          name: emp.full_name || '',
          branch: emp.branches?.name || '-',
          date: format(today, 'yyyy-MM-dd'),
          day_name: DAY_NAMES_TH[today.getDay()],
          status: 'ตรงเวลา',
          check_in: '08:00',
          check_out: '17:00',
          late_minutes: '0',
          work_hours: '8.00',
          capped_hours: '8.00',
          ot_approved_hours: '-',
          is_overtime: '-',
          note: '-',
        };
        sampleRows.push(cols.map(c => rowData[c.key] || ''));
      }
      return { headers, rows: sampleRows };
    }
  }, [mode, effectiveSelectedIds, payrollRecords, employees, summaryColumns, dailyColumns]);

  // --- Save prefs helper ---
  const savePrefs = () => {
    try {
      localStorage.setItem('payroll-export-prefs', JSON.stringify({
        mode,
        selectedBranch,
        exportFormat,
        sortBy,
        lateThreshold,
        summaryColumns: Array.from(summaryColumns),
        dailyColumns: Array.from(dailyColumns),
      }));
    } catch {}
  };

  // --- Export handlers ---
  const handleExport = async () => {
    const ids = Array.from(effectiveSelectedIds);
    if (ids.length === 0) {
      toast.error('กรุณาเลือกพนักงานอย่างน้อย 1 คน');
      return;
    }

    setIsExporting(true);
    try {
      if (mode === 'summary') {
        exportSummary(ids);
      } else {
        await exportDaily(ids);
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('เกิดข้อผิดพลาดในการ Export');
    } finally {
      setIsExporting(false);
    }
  };

  const sortRows = (rows: { sortCode: string; sortName: string; sortDate: string; cells: string[] }[]): string[][] => {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortBy === 'name') return a.sortName.localeCompare(b.sortName, 'th');
      if (sortBy === 'date') return a.sortDate.localeCompare(b.sortDate) || a.sortCode.localeCompare(b.sortCode);
      return a.sortCode.localeCompare(b.sortCode); // default: code
    });
    return sorted.map(r => r.cells);
  };

  const exportSummary = (employeeIds: string[]) => {
    const filtered = payrollRecords?.filter(r => employeeIds.includes(r.employee_id)) || [];
    if (filtered.length === 0) {
      toast.error('ไม่มีข้อมูล Payroll สำหรับพนักงานที่เลือก');
      return;
    }

    const cols = SUMMARY_COLUMNS.filter(c => summaryColumns.has(c.key));
    const headers = cols.map(c => c.label);
    const taggedRows = filtered.map(r => {
      const row = buildSummaryRow(r);
      return {
        sortCode: row.code,
        sortName: row.name,
        sortDate: '',
        cells: cols.map(c => row[c.key] || ''),
      };
    });
    const rows = sortRows(taggedRows);

    const filename = `payroll_summary_${format(fromMonth, 'yyyy-MM')}`;
    exportFormat === 'xlsx' ? downloadXLSX(headers, rows, filename) : downloadCSV(headers, rows, filename);
  };

  const exportDaily = async (employeeIds: string[]) => {
    const start = startOfMonth(fromMonth);
    const end = endOfMonth(toMonth);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    // Fetch attendance logs in batches
    let allLogs: any[] = [];
    const BATCH = 50;
    for (let i = 0; i < employeeIds.length; i += BATCH) {
      const batch = employeeIds.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('employee_id, event_type, server_time, is_overtime, flag_reason')
        .in('employee_id', batch)
        .gte('server_time', startStr)
        .lte('server_time', endStr + 'T23:59:59')
        .order('server_time');
      if (error) throw error;
      allLogs = allLogs.concat(data || []);
    }

    // Fetch work_schedules, attendance_adjustments, overtime_requests in parallel
    const [schedulesRes, adjustmentsRes, otRes, settingsRes, holidaysRes] = await Promise.all([
      supabase.from('work_schedules').select('employee_id, day_of_week, is_working_day, start_time, end_time, expected_hours').in('employee_id', employeeIds),
      supabase.from('attendance_adjustments').select('employee_id, adjustment_date, override_status, leave_type, override_work_hours, override_ot_hours').in('employee_id', employeeIds).gte('adjustment_date', startStr).lte('adjustment_date', endStr),
      supabase.from('overtime_requests').select('employee_id, request_date, estimated_hours, status').in('employee_id', employeeIds).gte('request_date', startStr).lte('request_date', endStr).eq('status', 'approved'),
      supabase.from('attendance_settings').select('grace_period_minutes, standard_start_time').eq('scope', 'global').limit(1),
      supabase.from('holidays').select('date').gte('date', startStr).lte('date', endStr),
    ]);

    // Build lookup maps
    const scheduleMap = new Map<string, Map<number, any>>();
    (schedulesRes.data || []).forEach(s => {
      if (!scheduleMap.has(s.employee_id)) scheduleMap.set(s.employee_id, new Map());
      scheduleMap.get(s.employee_id)!.set(s.day_of_week, s);
    });

    const adjustmentMap = new Map<string, any>();
    (adjustmentsRes.data || []).forEach(a => {
      adjustmentMap.set(`${a.employee_id}_${a.adjustment_date}`, a);
    });

    const otMap = new Map<string, number>();
    (otRes.data || []).forEach((o: any) => {
      const key = `${o.employee_id}_${o.request_date}`;
      otMap.set(key, (otMap.get(key) || 0) + (o.estimated_hours || 0));
    });

    const globalGrace = settingsRes.data?.[0]?.grace_period_minutes || 15;
    const effectiveGrace = lateThreshold != null ? lateThreshold : globalGrace;
    const globalStartTime = settingsRes.data?.[0]?.standard_start_time || '08:00:00';

    const holidaySet = new Set<string>();
    (holidaysRes.data || []).forEach((h: any) => holidaySet.add(h.date));

    const empMap = new Map<string, { code: string; name: string; branch: string; shift_start_time?: string; max_work_hours_per_day?: number; break_hours?: number }>();
    employees?.forEach(e => {
      empMap.set(e.id, {
        code: e.code || '',
        name: e.full_name || '',
        branch: e.branches?.name || '-',
        shift_start_time: e.shift_start_time,
        max_work_hours_per_day: e.max_work_hours_per_day,
        break_hours: e.break_hours,
      });
    });

    const days = eachDayOfInterval({ start, end });
    const cols = DAILY_COLUMNS.filter(c => dailyColumns.has(c.key));
    const headers = cols.map(c => c.label);
    const taggedRows: { sortCode: string; sortName: string; sortDate: string; cells: string[] }[] = [];

    for (const empId of employeeIds) {
      const emp = empMap.get(empId);
      if (!emp) continue;
      const empLogs = allLogs.filter(l => l.employee_id === empId);
      const empSchedule = scheduleMap.get(empId);
      const maxHours = emp.max_work_hours_per_day || 8;
      const breakHrs = emp.break_hours || 0;

      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = day.getDay();
        const dayLogs = empLogs.filter(l => formatBangkokISODate(l.server_time) === dateStr);
        const checkIn = dayLogs.find(l => l.event_type === 'check_in');
        const checkOut = dayLogs.find(l => l.event_type === 'check_out');
        const adjKey = `${empId}_${dateStr}`;
        const adjustment = adjustmentMap.get(adjKey);
        const approvedOtHours = otMap.get(adjKey) || 0;

        // Determine schedule for this day
        const schedule = empSchedule?.get(dayOfWeek);
        const isWorkingDay = schedule ? schedule.is_working_day : (dayOfWeek >= 1 && dayOfWeek <= 5);
        const isHoliday = holidaySet.has(dateStr);
        const shiftStartStr = schedule?.start_time || emp.shift_start_time || globalStartTime;

        // Determine detailed status
        let status = '';
        let lateMinutes = 0;
        if (adjustment?.override_status) {
          const os = adjustment.override_status.toLowerCase();
          if (['leave', 'vacation', 'sick', 'personal', 'ลา', 'ลาป่วย', 'ลากิจ', 'ลาพักร้อน'].some(t => os.includes(t))) {
            status = adjustment.leave_type ? `ลา (${adjustment.leave_type})` : 'ลา';
          } else if (os === 'absent' || os === 'ขาด') {
            status = 'ขาด';
          } else if (os === 'holiday' || os === 'วันหยุด') {
            status = 'วันหยุด';
          } else {
            status = adjustment.override_status;
          }
        } else if (!isWorkingDay || isHoliday) {
          if (checkIn) {
            status = checkIn.is_overtime ? 'OT (วันหยุด)' : 'มา (วันหยุด)';
          } else {
            status = 'วันหยุด';
          }
        } else if (!checkIn) {
          status = 'ขาด';
        } else {
          // Compare check_in time vs shift start
          const checkInDate = parseISO(checkIn.server_time);
          const [sh, sm] = shiftStartStr.split(':').map(Number);
          const shiftStart = new Date(day);
          shiftStart.setHours(sh, sm, 0, 0);
          const diffMinutes = (checkInDate.getTime() - shiftStart.getTime()) / 60000;

          if (diffMinutes < 0) {
            status = 'ก่อนเวลา';
          } else if (diffMinutes <= effectiveGrace) {
            status = 'ตรงเวลา';
          } else {
            status = 'สาย';
            lateMinutes = Math.round(diffMinutes);
          }
        }

        // Calculate work hours
        const checkInTime = checkIn ? format(parseISO(checkIn.server_time), 'HH:mm') : '-';
        const checkOutTime = checkOut ? format(parseISO(checkOut.server_time), 'HH:mm') : '-';
        let rawHours = 0;
        if (checkIn && checkOut) {
          rawHours = (parseISO(checkOut.server_time).getTime() - parseISO(checkIn.server_time).getTime()) / 3600000;
        }
        const netHours = Math.max(0, rawHours - breakHrs);

        // Override work hours from adjustment if available
        const finalWorkHours = adjustment?.override_work_hours != null ? adjustment.override_work_hours : netHours;

        // Capped hours: min(netHours, maxHours) + approved OT
        const cappedHours = Math.min(finalWorkHours, maxHours) + approvedOtHours;

        const rowData: Record<string, string> = {
          code: emp.code,
          name: emp.name,
          branch: emp.branch,
          date: dateStr,
          day_name: DAY_NAMES_TH[dayOfWeek],
          status,
          late_minutes: checkIn ? String(lateMinutes) : '-',
          check_in: checkInTime,
          check_out: checkOutTime,
          work_hours: finalWorkHours.toFixed(2),
          capped_hours: cappedHours.toFixed(2),
          ot_approved_hours: approvedOtHours > 0 ? approvedOtHours.toFixed(2) : '-',
          is_overtime: checkIn?.is_overtime ? 'ใช่' : '-',
          note: checkIn?.flag_reason || '-',
        };
        taggedRows.push({
          sortCode: emp.code,
          sortName: emp.name,
          sortDate: dateStr,
          cells: cols.map(c => rowData[c.key] || ''),
        });
      }
    }

    if (taggedRows.length === 0) {
      toast.error('ไม่พบข้อมูลในช่วงที่เลือก');
      return;
    }

    const rows = sortRows(taggedRows);
    const fromStr = format(fromMonth, 'yyyy-MM');
    const toStr = format(toMonth, 'yyyy-MM');
    const filename = fromStr === toStr ? `payroll_daily_${fromStr}` : `payroll_daily_${fromStr}_to_${toStr}`;
    exportFormat === 'xlsx' ? downloadXLSX(headers, rows, filename) : downloadCSV(headers, rows, filename);
  };

  const downloadCSV = (headers: string[], rows: string[][], filename: string) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV สำเร็จ');
    savePrefs();
  };

  const downloadXLSX = (headers: string[], rows: string[][], filename: string) => {
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Auto-width columns
    ws['!cols'] = headers.map((h, i) => {
      const maxLen = Math.max(h.length, ...rows.map(r => (r[i] || '').length));
      return { wch: Math.min(maxLen + 2, 30) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode === 'summary' ? 'สรุป' : 'รายวัน');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    toast.success('Export XLSX สำเร็จ');
    savePrefs();
  };

  const activeColumns = mode === 'summary' ? SUMMARY_COLUMNS : DAILY_COLUMNS;
  const activeColSet = mode === 'summary' ? summaryColumns : dailyColumns;
  const allColsSelected = activeColumns.every(c => activeColSet.has(c.key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] !grid !grid-rows-[auto_1fr_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export Payroll
          </DialogTitle>
          <DialogDescription>เลือกรูปแบบ, ช่วงเวลา, พนักงาน และคอลัมน์ที่ต้องการ</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-4 pb-6">
            {/* Mode tabs */}
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'summary' | 'daily')}>
              <TabsList className="w-full">
                <TabsTrigger value="summary" className="flex-1">สรุปรายคน</TabsTrigger>
                <TabsTrigger value="daily" className="flex-1">รายวัน</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Month range */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">ช่วงเดือน</Label>
              <div className="flex items-center gap-2">
                <Select value={format(fromMonth, 'yyyy-MM')} onValueChange={(v) => setFromMonth(parseISO(v + '-01'))}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(m => (
                      <SelectItem key={format(m, 'yyyy-MM')} value={format(m, 'yyyy-MM')}>
                        {format(m, 'MMMM yyyy', { locale: th })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-sm">ถึง</span>
                <Select value={format(toMonth, 'yyyy-MM')} onValueChange={(v) => setToMonth(parseISO(v + '-01'))}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(m => (
                      <SelectItem key={format(m, 'yyyy-MM')} value={format(m, 'yyyy-MM')}>
                        {format(m, 'MMMM yyyy', { locale: th })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode === 'summary' && (
                <p className="text-xs text-muted-foreground">โหมดสรุป ใช้ข้อมูล Payroll ของเดือนปัจจุบันที่คำนวณแล้ว</p>
              )}
            </div>

            {/* Branch filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">สาขา</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="ทุกสาขา" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกสาขา</SelectItem>
                  {branches?.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort selector + Late threshold */}
            <div className="flex gap-3">
              <div className="space-y-2 flex-1">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  เรียงลำดับ
                </Label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.filter(o => mode === 'daily' || o.value !== 'date').map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode === 'daily' && (
                <div className="space-y-2 w-40">
                  <Label className="text-sm font-medium">นับสายหลังจาก (นาที)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    placeholder="ค่าเริ่มต้น"
                    value={lateThreshold != null ? lateThreshold : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLateThreshold(v === '' ? null : Math.max(0, Number(v)));
                    }}
                    className="h-10"
                  />
                </div>
              )}
            </div>

            {/* Employee picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  พนักงาน ({selectAll ? filteredEmployees.length : selectedEmployees.size} คน)
                </Label>
                <Button variant="ghost" size="sm" onClick={toggleAllEmployees} className="h-7 text-xs">
                  {selectAll ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาชื่อ / รหัส..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="border rounded-md max-h-40 overflow-y-auto">
                <label
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer text-sm sticky top-0 bg-background border-b font-medium z-10"
                >
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={toggleAllEmployees}
                  />
                  <span>เลือกทั้งหมด ({filteredEmployees.length} คน)</span>
                </label>
                {filteredEmployees.map(emp => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectAll || selectedEmployees.has(emp.id)}
                      onCheckedChange={() => toggleEmployee(emp.id)}
                    />
                    <span className="text-muted-foreground w-12 shrink-0 text-xs">{emp.code || '-'}</span>
                    <span className="flex-1 min-w-0 truncate">{emp.full_name}</span>
                  </label>
                ))}
                {filteredEmployees.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground text-center">ไม่พบพนักงาน</div>
                )}
              </div>
            </div>

            {/* Column picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">คอลัมน์ที่ต้องการ</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleAllColumns(mode === 'summary')}
                  className="h-7 text-xs"
                >
                  {allColsSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </Button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                {activeColumns.map(col => (
                  <label key={col.key} className="flex items-center gap-1.5 text-sm cursor-pointer py-1 px-1.5 rounded hover:bg-muted/50">
                    <Checkbox
                      checked={activeColSet.has(col.key)}
                      onCheckedChange={() => toggleColumn(col.key, mode === 'summary')}
                    />
                    <span className="text-xs">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Preview table */}
            {previewData.rows.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Table className="h-3.5 w-3.5" />
                  ตัวอย่างข้อมูล ({previewData.rows.length} แถวแรก)
                  {mode === 'daily' && <span className="text-muted-foreground font-normal">(ข้อมูลจำลอง)</span>}
                </Label>
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        {previewData.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows.map((row, ri) => (
                        <tr key={ri} className="border-b last:border-b-0 hover:bg-muted/30">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-2 py-1 whitespace-nowrap">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Format selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">รูปแบบไฟล์</Label>
              <RadioGroup
                value={exportFormat}
                onValueChange={(v) => setExportFormat(v as 'csv' | 'xlsx')}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="csv" />
                  <span>CSV</span>
                  <span className="text-muted-foreground text-xs">(เปิดใน Excel/Google Sheets)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="xlsx" />
                  <span>XLSX</span>
                  <span className="text-muted-foreground text-xs">(Excel native)</span>
                </label>
              </RadioGroup>
            </div>
          </div>
        </ScrollArea>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export {exportFormat.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
