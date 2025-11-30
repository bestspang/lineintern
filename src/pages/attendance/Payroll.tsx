import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { 
  DollarSign, 
  Users, 
  Clock, 
  Calendar, 
  Download, 
  Plus,
  CheckCircle,
  AlertCircle,
  XCircle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
  TrendingUp,
  TrendingDown,
  Building
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDay, parseISO, isWeekend, addMonths, subMonths } from "date-fns";
import { th } from "date-fns/locale";

interface PayrollRecord {
  id: string;
  employee_id: string;
  employee: {
    id: string;
    full_name: string;
    code: string;
    branch_id: string;
    branches?: { name: string } | null;
  };
  pay_type: string;
  scheduled_work_days: number;
  actual_work_days: number;
  total_work_hours: number;
  late_count: number;
  late_minutes: number;
  absent_days: number;
  leave_days: number;
  early_leave_count: number;
  ot_hours: number;
  ot_pay: number;
  base_salary: number;
  gross_pay: number;
  deductions: any[];
  allowances: any[];
  total_deductions: number;
  total_allowances: number;
  net_pay: number;
  status: string;
}

interface DailyAttendance {
  date: string;
  status: 'present' | 'late' | 'absent' | 'leave' | 'weekend' | 'future';
  check_in?: string;
  check_out?: string;
  work_hours?: number;
  is_overtime?: boolean;
}

export default function Payroll() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [isCreatePeriodOpen, setIsCreatePeriodOpen] = useState(false);
  const [newPeriodCutoffDay, setNewPeriodCutoffDay] = useState("25");

  // Fetch current payroll period
  const { data: currentPeriod, isLoading: isPeriodLoading } = useQuery({
    queryKey: ["payroll-period", format(currentMonth, "yyyy-MM")],
    queryFn: async () => {
      const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");
      
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .gte("start_date", startDate)
        .lte("end_date", endDate)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch employees with payroll settings
  const { data: employees, isLoading: isEmployeesLoading } = useQuery({
    queryKey: ["employees-payroll"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(`
          id,
          full_name,
          code,
          branch_id,
          is_active,
          salary_per_month,
          working_time_type,
          hours_per_day,
          ot_rate_multiplier,
          branches (name),
          employee_payroll_settings (*)
        `)
        .eq("is_active", true)
        .order("full_name");
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ["branches-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name")
        .eq("is_deleted", false)
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch attendance data for selected employee
  const { data: attendanceData } = useQuery({
    queryKey: ["employee-attendance", selectedEmployee, format(currentMonth, "yyyy-MM")],
    queryFn: async () => {
      if (!selectedEmployee) return null;
      
      const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");
      
      const { data, error } = await supabase
        .from("attendance_logs")
        .select("*")
        .eq("employee_id", selectedEmployee)
        .gte("server_time", startDate)
        .lte("server_time", endDate + "T23:59:59")
        .order("server_time");
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEmployee,
  });

  // Fetch payroll records for current period
  const { data: payrollRecords, isLoading: isRecordsLoading } = useQuery({
    queryKey: ["payroll-records", currentPeriod?.id],
    queryFn: async () => {
      if (!currentPeriod) return [];
      
      const { data, error } = await supabase
        .from("payroll_records")
        .select(`
          *,
          employee:employees (
            id,
            full_name,
            code,
            branch_id,
            branches (name)
          )
        `)
        .eq("period_id", currentPeriod.id);
      
      if (error) throw error;
      return data as PayrollRecord[];
    },
    enabled: !!currentPeriod,
  });

  // Calculate payroll summaries
  const payrollSummary = useMemo(() => {
    if (!payrollRecords?.length) {
      return {
        totalGross: 0,
        totalNet: 0,
        totalDeductions: 0,
        totalOT: 0,
        employeeCount: employees?.length || 0,
        totalOTHours: 0,
      };
    }
    
    return {
      totalGross: payrollRecords.reduce((sum, r) => sum + (r.gross_pay || 0), 0),
      totalNet: payrollRecords.reduce((sum, r) => sum + (r.net_pay || 0), 0),
      totalDeductions: payrollRecords.reduce((sum, r) => sum + (r.total_deductions || 0), 0),
      totalOT: payrollRecords.reduce((sum, r) => sum + (r.ot_pay || 0), 0),
      employeeCount: payrollRecords.length,
      totalOTHours: payrollRecords.reduce((sum, r) => sum + (r.ot_hours || 0), 0),
    };
  }, [payrollRecords, employees]);

  // Filter employees
  const filteredEmployees = useMemo(() => {
    let result = employees || [];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(e => 
        e.full_name.toLowerCase().includes(query) ||
        e.code.toLowerCase().includes(query)
      );
    }
    
    if (selectedBranch !== "all") {
      result = result.filter(e => e.branch_id === selectedBranch);
    }
    
    return result;
  }, [employees, searchQuery, selectedBranch]);

  // Get calendar days for heatmap
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Process attendance data into daily map
  const dailyAttendanceMap = useMemo(() => {
    if (!attendanceData) return new Map<string, DailyAttendance>();
    
    const map = new Map<string, DailyAttendance>();
    const today = new Date();
    
    calendarDays.forEach(day => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayLogs = attendanceData.filter(log => 
        format(parseISO(log.server_time), "yyyy-MM-dd") === dateStr
      );
      
      const checkIn = dayLogs.find(log => log.event_type === "check_in");
      const checkOut = dayLogs.find(log => log.event_type === "check_out");
      
      let status: DailyAttendance['status'] = 'absent';
      
      if (day > today) {
        status = 'future';
      } else if (isWeekend(day)) {
        status = checkIn ? 'present' : 'weekend';
      } else if (checkIn) {
        // Check if late (after 09:00)
        const checkInTime = parseISO(checkIn.server_time);
        const checkInHour = checkInTime.getHours();
        status = checkInHour >= 9 ? 'late' : 'present';
      }
      
      map.set(dateStr, {
        date: dateStr,
        status,
        check_in: checkIn?.server_time,
        check_out: checkOut?.server_time,
        work_hours: checkIn && checkOut 
          ? (parseISO(checkOut.server_time).getTime() - parseISO(checkIn.server_time).getTime()) / (1000 * 60 * 60)
          : undefined,
        is_overtime: checkIn?.is_overtime || checkOut?.is_overtime,
      });
    });
    
    return map;
  }, [attendanceData, calendarDays]);

  // Create payroll period
  const createPeriodMutation = useMutation({
    mutationFn: async () => {
      const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");
      const periodName = format(currentMonth, "MMMM yyyy", { locale: th });
      
      const { data, error } = await supabase
        .from("payroll_periods")
        .insert({
          name: periodName,
          start_date: startDate,
          end_date: endDate,
          cutoff_day: parseInt(newPeriodCutoffDay),
          status: "draft",
          total_employees: employees?.length || 0,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("สร้างรอบเงินเดือนสำเร็จ");
      setIsCreatePeriodOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payroll-period"] });
    },
    onError: (error) => {
      toast.error("เกิดข้อผิดพลาด: " + error.message);
    },
  });

  // Calculate payroll for period
  const calculatePayrollMutation = useMutation({
    mutationFn: async () => {
      if (!currentPeriod || !employees) return;
      
      const startDate = currentPeriod.start_date;
      const endDate = currentPeriod.end_date;
      
      for (const emp of employees) {
        // Fetch attendance logs for this employee
        const { data: logs } = await supabase
          .from("attendance_logs")
          .select("*")
          .eq("employee_id", emp.id)
          .gte("server_time", startDate)
          .lte("server_time", endDate + "T23:59:59");
        
        // Calculate metrics
        const checkIns = logs?.filter(l => l.event_type === "check_in") || [];
        const checkOuts = logs?.filter(l => l.event_type === "check_out") || [];
        
        const actualWorkDays = new Set(checkIns.map(l => format(parseISO(l.server_time), "yyyy-MM-dd"))).size;
        const totalOTHours = logs?.reduce((sum, l) => sum + (l.overtime_hours || 0), 0) || 0;
        const lateCount = checkIns.filter(l => {
          const hour = parseISO(l.server_time).getHours();
          return hour >= 9;
        }).length;
        
        // Calculate total work hours
        let totalWorkHours = 0;
        checkIns.forEach(checkIn => {
          const checkInDate = format(parseISO(checkIn.server_time), "yyyy-MM-dd");
          const matchingCheckOut = checkOuts.find(co => 
            format(parseISO(co.server_time), "yyyy-MM-dd") === checkInDate
          );
          if (matchingCheckOut) {
            const hours = (parseISO(matchingCheckOut.server_time).getTime() - parseISO(checkIn.server_time).getTime()) / (1000 * 60 * 60);
            totalWorkHours += Math.min(hours, 12); // Cap at 12 hours
          }
        });
        
        // Get payroll settings
        const payrollSettings = (emp as any).employee_payroll_settings?.[0];
        const payType = payrollSettings?.pay_type || 'salary';
        const baseSalary = payrollSettings?.salary_per_month || emp.salary_per_month || 0;
        const hourlyRate = payrollSettings?.hourly_rate || 0;
        
        // Calculate scheduled work days (weekdays in period)
        const periodStart = parseISO(startDate);
        const periodEnd = parseISO(endDate);
        const periodDays = eachDayOfInterval({ start: periodStart, end: periodEnd });
        const scheduledWorkDays = periodDays.filter(d => !isWeekend(d)).length;
        
        // Calculate pay
        let grossPay = 0;
        if (payType === 'salary') {
          const dailyRate = baseSalary / scheduledWorkDays;
          grossPay = dailyRate * actualWorkDays;
        } else {
          grossPay = hourlyRate * totalWorkHours;
        }
        
        // Calculate OT pay
        const otRate = emp.ot_rate_multiplier || 1.5;
        const hourlyPay = baseSalary / scheduledWorkDays / 8;
        const otPay = totalOTHours * hourlyPay * otRate;
        grossPay += otPay;
        
        // Calculate deductions
        const deductions: any[] = [];
        let totalDeductions = 0;
        
        if (payrollSettings?.has_social_security) {
          const ssAmount = Math.min(grossPay * (payrollSettings?.social_security_rate || 0.05), payrollSettings?.social_security_cap || 750);
          deductions.push({ name: 'ประกันสังคม', amount: ssAmount, type: 'percentage' });
          totalDeductions += ssAmount;
        }
        
        if (payrollSettings?.has_withholding_tax && payrollSettings?.withholding_tax_rate > 0) {
          const taxAmount = grossPay * payrollSettings.withholding_tax_rate;
          deductions.push({ name: 'ภาษีหัก ณ ที่จ่าย', amount: taxAmount, type: 'percentage' });
          totalDeductions += taxAmount;
        }
        
        // Custom deductions
        (payrollSettings?.custom_deductions || []).forEach((d: any) => {
          const amount = d.type === 'percentage' ? grossPay * (d.value / 100) : d.value;
          deductions.push({ name: d.name, amount, type: d.type });
          totalDeductions += amount;
        });
        
        // Calculate allowances
        const allowances: any[] = [];
        let totalAllowances = 0;
        
        if (payrollSettings?.has_transportation) {
          allowances.push({ name: 'ค่าเดินทาง', amount: payrollSettings.transportation_allowance, type: 'fixed' });
          totalAllowances += payrollSettings.transportation_allowance;
        }
        
        // Custom allowances
        (payrollSettings?.custom_allowances || []).forEach((a: any) => {
          const amount = a.type === 'percentage' ? grossPay * (a.value / 100) : a.value;
          allowances.push({ name: a.name, amount, type: a.type });
          totalAllowances += amount;
        });
        
        const netPay = grossPay + totalAllowances - totalDeductions;
        
        // Upsert payroll record
        await supabase
          .from("payroll_records")
          .upsert({
            employee_id: emp.id,
            period_id: currentPeriod.id,
            pay_type: payType,
            scheduled_work_days: scheduledWorkDays,
            actual_work_days: actualWorkDays,
            total_work_hours: totalWorkHours,
            late_count: lateCount,
            late_minutes: 0,
            absent_days: scheduledWorkDays - actualWorkDays,
            leave_days: 0,
            early_leave_count: 0,
            ot_hours: totalOTHours,
            ot_pay: otPay,
            base_salary: baseSalary,
            gross_pay: grossPay,
            deductions,
            allowances,
            total_deductions: totalDeductions,
            total_allowances: totalAllowances,
            net_pay: netPay,
            status: 'draft',
          }, { onConflict: 'employee_id,period_id' });
      }
      
      // Update period totals
      const { data: records } = await supabase
        .from("payroll_records")
        .select("gross_pay, net_pay")
        .eq("period_id", currentPeriod.id);
      
      const totalGross = records?.reduce((s, r) => s + (r.gross_pay || 0), 0) || 0;
      const totalNet = records?.reduce((s, r) => s + (r.net_pay || 0), 0) || 0;
      
      await supabase
        .from("payroll_periods")
        .update({
          total_employees: employees.length,
          total_gross_pay: totalGross,
          total_net_pay: totalNet,
          status: 'processing',
          processed_at: new Date().toISOString(),
        })
        .eq("id", currentPeriod.id);
    },
    onSuccess: () => {
      toast.success("คำนวณ Payroll สำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-period"] });
    },
    onError: (error) => {
      toast.error("เกิดข้อผิดพลาด: " + error.message);
    },
  });

  // Export to CSV
  const handleExport = () => {
    if (!payrollRecords?.length) {
      toast.error("ไม่มีข้อมูลให้ Export");
      return;
    }
    
    const headers = ["รหัส", "ชื่อ", "สาขา", "ประเภท", "วันทำงาน", "ชม.รวม", "สาย", "ขาด", "OT ชม.", "เงินเดือน", "OT", "เบี้ยเลี้ยง", "หัก", "สุทธิ"];
    const rows = payrollRecords.map(r => [
      r.employee?.code,
      r.employee?.full_name,
      r.employee?.branches?.name || "-",
      r.pay_type === 'salary' ? 'เงินเดือน' : 'รายชั่วโมง',
      r.actual_work_days,
      r.total_work_hours.toFixed(2),
      r.late_count,
      r.absent_days,
      r.ot_hours.toFixed(2),
      r.base_salary.toFixed(2),
      r.ot_pay.toFixed(2),
      r.total_allowances.toFixed(2),
      r.total_deductions.toFixed(2),
      r.net_pay.toFixed(2),
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll_${format(currentMonth, "yyyy-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success("Export สำเร็จ");
  };

  const getStatusIcon = (status: DailyAttendance['status']) => {
    switch (status) {
      case 'present': return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'late': return <AlertCircle className="h-3 w-3 text-yellow-500" />;
      case 'absent': return <XCircle className="h-3 w-3 text-red-500" />;
      case 'leave': return <Calendar className="h-3 w-3 text-blue-500" />;
      case 'weekend': return <span className="text-muted-foreground text-[10px]">-</span>;
      case 'future': return <span className="text-muted-foreground text-[10px]">•</span>;
      default: return null;
    }
  };

  const getStatusBg = (status: DailyAttendance['status']) => {
    switch (status) {
      case 'present': return 'bg-green-100 dark:bg-green-900/30';
      case 'late': return 'bg-yellow-100 dark:bg-yellow-900/30';
      case 'absent': return 'bg-red-100 dark:bg-red-900/30';
      case 'leave': return 'bg-blue-100 dark:bg-blue-900/30';
      case 'weekend': return 'bg-muted/50';
      case 'future': return 'bg-muted/30';
      default: return '';
    }
  };

  const isLoading = isPeriodLoading || isEmployeesLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <DollarSign className="h-8 w-8 text-primary" />
            Payroll Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            จัดการเงินเดือนและสรุปการทำงานพนักงาน
          </p>
        </div>
        
        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[150px]">
            <div className="font-medium">{format(currentMonth, "MMMM yyyy", { locale: th })}</div>
            {currentPeriod && (
              <Badge variant={currentPeriod.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                {currentPeriod.status === 'draft' ? 'ร่าง' : currentPeriod.status === 'processing' ? 'กำลังประมวลผล' : currentPeriod.status === 'completed' ? 'เสร็จสิ้น' : 'จ่ายแล้ว'}
              </Badge>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">รวมสุทธิ</p>
                <p className="text-xl font-bold">฿{payrollSummary.totalNet.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">พนักงาน</p>
                <p className="text-xl font-bold">{payrollSummary.employeeCount} คน</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">OT รวม</p>
                <p className="text-xl font-bold">{payrollSummary.totalOTHours.toFixed(1)} ชม.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">หักรวม</p>
                <p className="text-xl font-bold">฿{payrollSummary.totalDeductions.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาพนักงาน..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[150px]">
              <Building className="h-4 w-4 mr-2" />
              <SelectValue placeholder="สาขา" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสาขา</SelectItem>
              {branches?.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
          {!currentPeriod ? (
            <Dialog open={isCreatePeriodOpen} onOpenChange={setIsCreatePeriodOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  สร้างรอบเงินเดือน
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>สร้างรอบเงินเดือนใหม่</DialogTitle>
                  <DialogDescription>
                    สร้างรอบเงินเดือนสำหรับ {format(currentMonth, "MMMM yyyy", { locale: th })}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>วันตัดรอบ</Label>
                    <Select value={newPeriodCutoffDay} onValueChange={setNewPeriodCutoffDay}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={day.toString()}>
                            วันที่ {day} ของทุกเดือน
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={() => createPeriodMutation.mutate()} 
                    className="w-full"
                    disabled={createPeriodMutation.isPending}
                  >
                    {createPeriodMutation.isPending ? "กำลังสร้าง..." : "สร้างรอบเงินเดือน"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <>
              <Button 
                variant="outline" 
                onClick={() => calculatePayrollMutation.mutate()}
                disabled={calculatePayrollMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${calculatePayrollMutation.isPending ? 'animate-spin' : ''}`} />
                คำนวณใหม่
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              รายชื่อพนักงาน
            </CardTitle>
            <CardDescription>
              {filteredEmployees.length} พนักงาน | คลิกเพื่อดูรายละเอียด
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3,4,5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <table className="w-full">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left p-3 font-medium">พนักงาน</th>
                      <th className="text-center p-3 font-medium">วันมา</th>
                      <th className="text-center p-3 font-medium">OT</th>
                      <th className="text-right p-3 font-medium">เงินได้</th>
                      <th className="text-right p-3 font-medium">หัก</th>
                      <th className="text-right p-3 font-medium">สุทธิ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredEmployees.map((emp) => {
                      const record = payrollRecords?.find(r => r.employee_id === emp.id);
                      const isSelected = selectedEmployee === emp.id;
                      
                      return (
                        <tr 
                          key={emp.id}
                          className={`hover:bg-muted/50 cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                          onClick={() => setSelectedEmployee(isSelected ? null : emp.id)}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                {emp.full_name.charAt(0)}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{emp.full_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {emp.code} • {(emp as any).branches?.name || '-'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant="outline" className="text-xs">
                              {record?.actual_work_days || 0}/{record?.scheduled_work_days || '-'}
                            </Badge>
                          </td>
                          <td className="p-3 text-center text-sm">
                            {record?.ot_hours?.toFixed(1) || 0} ชม.
                          </td>
                          <td className="p-3 text-right text-sm font-medium text-green-600">
                            ฿{(record?.gross_pay || 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right text-sm text-red-600">
                            -฿{(record?.total_deductions || 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right">
                            <span className="font-bold text-sm">
                              ฿{(record?.net_pay || 0).toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Calendar Heatmap & Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {selectedEmployee 
                ? `${employees?.find(e => e.id === selectedEmployee)?.full_name || 'พนักงาน'}`
                : 'เลือกพนักงานเพื่อดูปฏิทิน'}
            </CardTitle>
            <CardDescription>
              {selectedEmployee ? 'ข้อมูลการทำงานรายวัน' : 'คลิกที่รายชื่อด้านซ้าย'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedEmployee ? (
              <div className="space-y-4">
                {/* Calendar Grid */}
                <div className="space-y-2">
                  <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                    {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d) => (
                      <div key={d} className="p-1">{d}</div>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1">
                    {/* Empty cells for days before month start */}
                    {Array.from({ length: getDay(startOfMonth(currentMonth)) }).map((_, i) => (
                      <div key={`empty-${i}`} className="aspect-square" />
                    ))}
                    
                    {calendarDays.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const attendance = dailyAttendanceMap.get(dateStr);
                      const status = attendance?.status || 'future';
                      
                      return (
                        <Tooltip key={dateStr}>
                          <TooltipTrigger asChild>
                            <div 
                              className={`aspect-square flex flex-col items-center justify-center rounded-md text-xs cursor-default transition-colors ${getStatusBg(status)}`}
                            >
                              <span className="font-medium">{format(day, "d")}</span>
                              {getStatusIcon(status)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs space-y-1">
                              <div className="font-medium">{format(day, "d MMMM yyyy", { locale: th })}</div>
                              {attendance?.check_in && (
                                <div>เข้างาน: {format(parseISO(attendance.check_in), "HH:mm")}</div>
                              )}
                              {attendance?.check_out && (
                                <div>ออกงาน: {format(parseISO(attendance.check_out), "HH:mm")}</div>
                              )}
                              {attendance?.work_hours && (
                                <div>รวม: {attendance.work_hours.toFixed(1)} ชม.</div>
                              )}
                              {attendance?.is_overtime && (
                                <Badge variant="secondary" className="text-[10px]">OT</Badge>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 text-xs pt-2 border-t">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" /> มา
                  </div>
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-yellow-500" /> สาย
                  </div>
                  <div className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" /> ขาด
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-blue-500" /> ลา
                  </div>
                </div>

                {/* Summary Stats */}
                {payrollRecords && (() => {
                  const record = payrollRecords.find(r => r.employee_id === selectedEmployee);
                  if (!record) return null;
                  
                  return (
                    <div className="space-y-2 pt-4 border-t">
                      <h4 className="font-medium text-sm">สรุปการทำงาน</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">วันทำงาน:</span>
                          <span>{record.actual_work_days}/{record.scheduled_work_days}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">มาสาย:</span>
                          <span className="text-yellow-600">{record.late_count} ครั้ง</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ขาด:</span>
                          <span className="text-red-600">{record.absent_days} วัน</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">OT:</span>
                          <span className="text-orange-600">{record.ot_hours.toFixed(1)} ชม.</span>
                        </div>
                      </div>
                      
                      <div className="space-y-1 pt-2 border-t">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">เงินเดือน:</span>
                          <span>฿{record.base_salary.toLocaleString()}</span>
                        </div>
                        {record.ot_pay > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">OT:</span>
                            <span className="text-green-600">+฿{record.ot_pay.toLocaleString()}</span>
                          </div>
                        )}
                        {record.total_allowances > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">เบี้ยเลี้ยง:</span>
                            <span className="text-green-600">+฿{record.total_allowances.toLocaleString()}</span>
                          </div>
                        )}
                        {record.total_deductions > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">หักรวม:</span>
                            <span className="text-red-600">-฿{record.total_deductions.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold pt-1 border-t">
                          <span>สุทธิ:</span>
                          <span className="text-primary">฿{record.net_pay.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>เลือกพนักงานจากรายการด้านซ้าย</p>
                <p className="text-sm">เพื่อดูปฏิทินการทำงานและรายละเอียด</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}