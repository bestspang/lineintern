import React, { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, addMonths, subMonths } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { formatBangkokISODate, getBangkokHoursMinutes } from '@/lib/timezone';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Download, FileText, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

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
  { key: 'is_overtime', label: 'OT', default: false },
  { key: 'note', label: 'หมายเหตุ', default: false },
];

const DAY_NAMES_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

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
  const [summaryColumns, setSummaryColumns] = useState<Set<string>>(
    new Set(SUMMARY_COLUMNS.filter(c => c.default).map(c => c.key))
  );
  const [dailyColumns, setDailyColumns] = useState<Set<string>>(
    new Set(DAILY_COLUMNS.filter(c => c.default).map(c => c.key))
  );
  const [isExporting, setIsExporting] = useState(false);

  // Load saved preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('payroll-export-prefs');
      if (saved) {
        const prefs = JSON.parse(saved);
        if (prefs.mode) setMode(prefs.mode);
        if (prefs.selectedBranch) setSelectedBranch(prefs.selectedBranch);
        if (Array.isArray(prefs.summaryColumns)) setSummaryColumns(new Set(prefs.summaryColumns));
        if (Array.isArray(prefs.dailyColumns)) setDailyColumns(new Set(prefs.dailyColumns));
      }
    } catch {}
  }, []);

  // Filter employees by branch & search
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

  // When selectAll changes or filter changes, update selected
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

  // Generate month options (12 months back + current)
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(new Date(), i);
      options.push(m);
    }
    return options;
  }, []);

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

  const exportSummary = (employeeIds: string[]) => {
    const filtered = payrollRecords?.filter(r => employeeIds.includes(r.employee_id)) || [];
    if (filtered.length === 0) {
      toast.error('ไม่มีข้อมูล Payroll สำหรับพนักงานที่เลือก');
      return;
    }

    const cols = SUMMARY_COLUMNS.filter(c => summaryColumns.has(c.key));
    const headers = cols.map(c => c.label);

    const rows = filtered.map(r => {
      const row: Record<string, string> = {
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
      return cols.map(c => row[c.key] || '');
    });

    downloadCSV(headers, rows, `payroll_summary_${format(fromMonth, 'yyyy-MM')}`);
  };

  const exportDaily = async (employeeIds: string[]) => {
    const start = startOfMonth(fromMonth);
    const end = endOfMonth(toMonth);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    // Batch query (handle >1000 rows with pagination)
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

    // Build employee lookup
    const empMap = new Map<string, { code: string; name: string; branch: string }>();
    employees?.forEach(e => {
      empMap.set(e.id, {
        code: e.code || '',
        name: e.full_name || '',
        branch: e.branches?.name || '-',
      });
    });

    // Generate rows: 1 per employee per day
    const days = eachDayOfInterval({ start, end });
    const cols = DAILY_COLUMNS.filter(c => dailyColumns.has(c.key));
    const headers = cols.map(c => c.label);
    const rows: string[][] = [];

    for (const empId of employeeIds) {
      const emp = empMap.get(empId);
      if (!emp) continue;
      const empLogs = allLogs.filter(l => l.employee_id === empId);

      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayLogs = empLogs.filter(l => formatBangkokISODate(l.server_time) === dateStr);
        const checkIn = dayLogs.find(l => l.event_type === 'check_in');
        const checkOut = dayLogs.find(l => l.event_type === 'check_out');

        let status = 'ขาด';
        if (checkIn) status = 'มา';
        const dayOfWeek = day.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          if (!checkIn) status = 'วันหยุด';
        }

        const checkInTime = checkIn ? format(parseISO(checkIn.server_time), 'HH:mm') : '-';
        const checkOutTime = checkOut ? format(parseISO(checkOut.server_time), 'HH:mm') : '-';
        const workHours = checkIn && checkOut
          ? ((parseISO(checkOut.server_time).getTime() - parseISO(checkIn.server_time).getTime()) / 3600000).toFixed(2)
          : '0';

        const rowData: Record<string, string> = {
          code: emp.code,
          name: emp.name,
          branch: emp.branch,
          date: dateStr,
          day_name: DAY_NAMES_TH[dayOfWeek],
          status,
          check_in: checkInTime,
          check_out: checkOutTime,
          work_hours: workHours,
          is_overtime: checkIn?.is_overtime ? 'ใช่' : '-',
          note: checkIn?.flag_reason || '-',
        };
        rows.push(cols.map(c => rowData[c.key] || ''));
      }
    }

    if (rows.length === 0) {
      toast.error('ไม่พบข้อมูลในช่วงที่เลือก');
      return;
    }

    const fromStr = format(fromMonth, 'yyyy-MM');
    const toStr = format(toMonth, 'yyyy-MM');
    const filename = fromStr === toStr ? `payroll_daily_${fromStr}` : `payroll_daily_${fromStr}_to_${toStr}`;
    downloadCSV(headers, rows, filename);
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
    toast.success('Export สำเร็จ');
    // Save preferences for next time
    try {
      localStorage.setItem('payroll-export-prefs', JSON.stringify({
        mode,
        selectedBranch,
        summaryColumns: Array.from(summaryColumns),
        dailyColumns: Array.from(dailyColumns),
      }));
    } catch {}
  };

  const activeColumns = mode === 'summary' ? SUMMARY_COLUMNS : DAILY_COLUMNS;
  const activeColSet = mode === 'summary' ? summaryColumns : dailyColumns;
  const allColsSelected = activeColumns.every(c => activeColSet.has(c.key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export Payroll
          </DialogTitle>
          <DialogDescription>เลือกรูปแบบ, ช่วงเวลา, พนักงาน และคอลัมน์ที่ต้องการ</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 pb-2">
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
              <div className="border rounded-md max-h-36 overflow-y-auto">
                {filteredEmployees.map(emp => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectAll || selectedEmployees.has(emp.id)}
                      onCheckedChange={() => toggleEmployee(emp.id)}
                    />
                    <span className="text-muted-foreground w-12 text-xs">{emp.code || '-'}</span>
                    <span className="truncate">{emp.full_name}</span>
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
          </div>
        </ScrollArea>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
