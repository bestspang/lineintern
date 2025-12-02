/**
 * ⚠️ CRITICAL PAYROLL CALCULATION - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This file handles payroll calculations, deductions, allowances, and LINE notifications.
 * Changes here directly affect employee salary calculations.
 * 
 * INVARIANTS:
 * 1. All monetary values use DECIMAL with proper rounding
 * 2. Social security capped at 750 THB (5% of 15,000 base)
 * 3. Work hours must be non-negative (negative = invalid checkout pairing)
 * 4. OT calculation uses employee's ot_rate_multiplier (default 1.5x)
 * 5. Late detection uses work_schedules.start_time, not hardcoded 09:00
 * 
 * COMMON BUGS TO AVOID:
 * - Division by zero in hourly rate calculation (check hoursPerDay > 0)
 * - Negative net pay (should clamp to 0 minimum)
 * - Wrong timezone in attendance date comparison (use UTC consistently)
 * - Duplicate payroll records (check existing before insert)
 * 
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * □ Monetary calculations preserve precision?
 * □ Social security cap applied correctly?
 * □ Leave days calculated using work_schedules, not hardcoded Mon-Fri?
 * □ Late detection uses employee's scheduled start time?
 * □ LINE notification format matches expected output?
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Building,
  Edit,
  Send,
  Printer
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDay, parseISO, isWeekend, addMonths, subMonths, differenceInDays, max, min } from "date-fns";
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
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PayrollRecord | null>(null);
  const [editDeductions, setEditDeductions] = useState<any[]>([]);
  const [editAllowances, setEditAllowances] = useState<any[]>([]);
  
  // LINE notification state
  const [sendLineNotification, setSendLineNotification] = useState(true);

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

  // Fetch work schedules for selected employee
  const { data: selectedEmployeeSchedules } = useQuery({
    queryKey: ["employee-work-schedules", selectedEmployee],
    queryFn: async () => {
      if (!selectedEmployee) return null;
      
      const { data, error } = await supabase
        .from("work_schedules")
        .select("*")
        .eq("employee_id", selectedEmployee);
      
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

  // Process attendance data into daily map (using work_schedules for late detection)
  const dailyAttendanceMap = useMemo(() => {
    if (!attendanceData) return new Map<string, DailyAttendance>();
    
    const map = new Map<string, DailyAttendance>();
    const today = new Date();
    
    // Build schedule map from work_schedules
    const workingDaysSet = new Set<number>(
      selectedEmployeeSchedules?.filter(s => s.is_working_day).map(s => s.day_of_week) || 
      [1, 2, 3, 4, 5] // Default Mon-Fri
    );
    const scheduleMap = new Map<number, { start_time: string | null; end_time: string | null }>(
      selectedEmployeeSchedules?.map(s => [s.day_of_week, { start_time: s.start_time, end_time: s.end_time }]) || []
    );
    
    calendarDays.forEach(day => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayOfWeek = getDay(day);
      const isWorkingDay = workingDaysSet.has(dayOfWeek);
      const dayLogs = attendanceData.filter(log => 
        format(parseISO(log.server_time), "yyyy-MM-dd") === dateStr
      );
      
      const checkIn = dayLogs.find(log => log.event_type === "check_in");
      const checkOut = dayLogs.find(log => log.event_type === "check_out");
      
      let status: DailyAttendance['status'] = 'absent';
      
      if (day > today) {
        status = 'future';
      } else if (!isWorkingDay) {
        status = checkIn ? 'present' : 'weekend';
      } else if (checkIn) {
        // Check if late using work_schedules start_time
        const checkInTime = parseISO(checkIn.server_time);
        const schedule = scheduleMap.get(dayOfWeek);
        const startTime = schedule?.start_time || '09:00';
        const [startHour, startMinute] = startTime.split(':').map(Number);
        
        const checkInHour = checkInTime.getHours();
        const checkInMinute = checkInTime.getMinutes();
        
        const isLate = (checkInHour > startHour) || (checkInHour === startHour && checkInMinute > startMinute);
        status = isLate ? 'late' : 'present';
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
  }, [attendanceData, calendarDays, selectedEmployeeSchedules]);

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
        
        // Fetch work schedules for this employee
        const { data: workSchedules } = await supabase
          .from("work_schedules")
          .select("*")
          .eq("employee_id", emp.id);
        
        // Create working days set from work_schedules (default Mon-Fri if no schedules)
        const workingDaysSet = new Set<number>(
          workSchedules?.filter(s => s.is_working_day).map(s => s.day_of_week) || 
          [1, 2, 3, 4, 5] // Default: Monday to Friday
        );
        
        // Create schedule map for start times
        const scheduleMap = new Map<number, { start_time: string | null; end_time: string | null }>(
          workSchedules?.map(s => [s.day_of_week, { start_time: s.start_time, end_time: s.end_time }]) || []
        );
        
        // Calculate metrics
        const checkIns = logs?.filter(l => l.event_type === "check_in") || [];
        const checkOuts = logs?.filter(l => l.event_type === "check_out") || [];
        
        const actualWorkDays = new Set(checkIns.map(l => format(parseISO(l.server_time), "yyyy-MM-dd"))).size;
        const totalOTHours = logs?.reduce((sum, l) => sum + (l.overtime_hours || 0), 0) || 0;
        
        // Late detection using work_schedules start_time + calculate late_minutes
        let lateCount = 0;
        let totalLateMinutes = 0;
        checkIns.forEach(l => {
          const checkInDate = parseISO(l.server_time);
          const dayOfWeek = getDay(checkInDate);
          const schedule = scheduleMap.get(dayOfWeek);
          
          // If no schedule, use default 09:00
          const startTime = schedule?.start_time || '09:00';
          const [startHour, startMinute] = startTime.split(':').map(Number);
          
          const checkInHour = checkInDate.getHours();
          const checkInMinute = checkInDate.getMinutes();
          
          // Calculate expected minutes from midnight
          const expectedMinutes = startHour * 60 + startMinute;
          const actualMinutes = checkInHour * 60 + checkInMinute;
          
          // If late, add to count and minutes
          if (actualMinutes > expectedMinutes) {
            lateCount++;
            totalLateMinutes += (actualMinutes - expectedMinutes);
          }
        });
        
        // Fetch approved leave requests for this employee in period
        const { data: leaveRequests } = await supabase
          .from("leave_requests")
          .select("*")
          .eq("employee_id", emp.id)
          .eq("status", "approved")
          .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);
        
        // Calculate total leave days (overlap with current period)
        let leaveDays = 0;
        (leaveRequests || []).forEach(lr => {
          const leaveStart = parseISO(lr.start_date);
          const leaveEnd = parseISO(lr.end_date);
          const periodStart = parseISO(startDate);
          const periodEnd = parseISO(endDate);
          
          // Calculate overlap
          const overlapStart = leaveStart > periodStart ? leaveStart : periodStart;
          const overlapEnd = leaveEnd < periodEnd ? leaveEnd : periodEnd;
          
          if (overlapStart <= overlapEnd) {
            // Count only working days in the overlap
            const overlapDays = eachDayOfInterval({ start: overlapStart, end: overlapEnd });
            const workingLeaveDays = overlapDays.filter(d => workingDaysSet.has(getDay(d))).length;
            leaveDays += workingLeaveDays;
          }
        });
        
        // Fetch approved early leave requests
        const { data: earlyLeaveRequests } = await supabase
          .from("early_leave_requests")
          .select("*")
          .eq("employee_id", emp.id)
          .eq("status", "approved")
          .gte("request_date", startDate)
          .lte("request_date", endDate);
        
        const earlyLeaveCount = earlyLeaveRequests?.length || 0;
        
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
        
        // Calculate scheduled work days using actual work_schedules
        const periodStart = parseISO(startDate);
        const periodEnd = parseISO(endDate);
        const periodDays = eachDayOfInterval({ start: periodStart, end: periodEnd });
        const scheduledWorkDays = periodDays.filter(d => workingDaysSet.has(getDay(d))).length;
        
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
        
        // Calculate absent days (scheduled - actual - leave)
        const absentDays = Math.max(0, scheduledWorkDays - actualWorkDays - leaveDays);
        
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
            late_minutes: totalLateMinutes,
            absent_days: absentDays,
            leave_days: leaveDays,
            early_leave_count: earlyLeaveCount,
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

  // Approve and lock payroll period
  const approvePeriodMutation = useMutation({
    mutationFn: async () => {
      if (!currentPeriod) return;
      
      const { error } = await supabase
        .from("payroll_periods")
        .update({ 
          status: 'completed', 
          processed_at: new Date().toISOString() 
        })
        .eq("id", currentPeriod.id);
      
      if (error) throw error;
      
      // Also update all payroll records to completed
      await supabase
        .from("payroll_records")
        .update({ status: 'completed' })
        .eq("period_id", currentPeriod.id);
      
      // Send LINE notifications if enabled
      if (sendLineNotification) {
        await sendLineNotifications();
      }
    },
    onSuccess: () => {
      toast.success("อนุมัติรอบเงินเดือนสำเร็จ" + (sendLineNotification ? " และส่งแจ้งเตือน LINE แล้ว" : ""));
      queryClient.invalidateQueries({ queryKey: ["payroll-period"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
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
    
    const headers = ["รหัส", "ชื่อ", "สาขา", "ประเภท", "วันทำงาน", "ชม.รวม", "สาย(ครั้ง)", "สาย(นาที)", "วันลา", "ออกก่อน", "ขาด", "OT ชม.", "เงินเดือน", "OT", "เบี้ยเลี้ยง", "หัก", "สุทธิ"];
    const rows = payrollRecords.map(r => [
      r.employee?.code,
      r.employee?.full_name,
      r.employee?.branches?.name || "-",
      r.pay_type === 'salary' ? 'เงินเดือน' : 'รายชั่วโมง',
      r.actual_work_days,
      r.total_work_hours.toFixed(2),
      r.late_count,
      r.late_minutes || 0,
      r.leave_days || 0,
      r.early_leave_count || 0,
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

  // Update payroll record (inline edit)
  const updateRecordMutation = useMutation({
    mutationFn: async ({ recordId, deductions, allowances }: { recordId: string; deductions: any[]; allowances: any[] }) => {
      const totalDeductions = deductions.reduce((sum, d) => sum + (d.amount || 0), 0);
      const totalAllowances = allowances.reduce((sum, a) => sum + (a.amount || 0), 0);
      
      // Get current record
      const { data: currentRecord } = await supabase
        .from("payroll_records")
        .select("gross_pay")
        .eq("id", recordId)
        .single();
      
      const netPay = (currentRecord?.gross_pay || 0) + totalAllowances - totalDeductions;
      
      const { error } = await supabase
        .from("payroll_records")
        .update({
          deductions,
          allowances,
          total_deductions: totalDeductions,
          total_allowances: totalAllowances,
          net_pay: netPay,
        })
        .eq("id", recordId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("บันทึกการแก้ไขสำเร็จ");
      setEditDialogOpen(false);
      setEditingRecord(null);
      queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
    },
    onError: (error) => {
      toast.error("เกิดข้อผิดพลาด: " + error.message);
    },
  });

  // Open edit dialog
  const handleOpenEdit = (record: PayrollRecord) => {
    setEditingRecord(record);
    setEditDeductions([...(record.deductions || [])]);
    setEditAllowances([...(record.allowances || [])]);
    setEditDialogOpen(true);
  };

  // Generate and download payslip
  const handleDownloadPayslip = async (employeeId: string) => {
    if (!currentPeriod) return;
    
    try {
      toast.loading("กำลังสร้างสลิป...", { id: "payslip" });
      
      const { data, error } = await supabase.functions.invoke('payslip-generator', {
        body: { employee_id: employeeId, period_id: currentPeriod.id }
      });
      
      if (error) throw error;
      
      // Open HTML in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(data.html);
        printWindow.document.close();
        printWindow.print();
      }
      
      toast.success("สร้างสลิปสำเร็จ", { id: "payslip" });
    } catch (error: any) {
      toast.error("เกิดข้อผิดพลาด: " + error.message, { id: "payslip" });
    }
  };

  // Bank format options
  const [selectedBankFormat, setSelectedBankFormat] = useState<string>("generic");

  // Bank Transfer Export with format options
  const handleBankTransferExport = (bankFormat: string = selectedBankFormat) => {
    if (!payrollRecords?.length) {
      toast.error("ไม่มีข้อมูลให้ Export");
      return;
    }
    
    // Fetch employee bank info
    const employeeIds = payrollRecords.map(r => r.employee_id);
    
    supabase
      .from("employees")
      .select("id, full_name, bank_name, bank_account_number, bank_branch")
      .in("id", employeeIds)
      .then(({ data: empData }) => {
        const empMap = new Map(empData?.map(e => [e.id, e]) || []);
        const totalAmount = payrollRecords.reduce((sum, r) => sum + (r.net_pay || 0), 0);
        
        let content = "";
        let filename = "";
        
        switch (bankFormat) {
          case "scb": {
            // SCB Direct format
            const header = `HDR,${format(new Date(), "yyyyMMdd")},${payrollRecords.length},${totalAmount.toFixed(2)}`;
            const rows = payrollRecords.map((r, index) => {
              const emp = empMap.get(r.employee_id);
              return `DTL,${String(index + 1).padStart(6, '0')},${emp?.bank_account_number || ''},${emp?.full_name || ''},${r.net_pay.toFixed(2)},SAL`;
            });
            content = [header, ...rows].join("\n");
            filename = `scb_transfer_${format(currentMonth, "yyyyMM")}.txt`;
            break;
          }
          case "kbank": {
            // KBank format
            const rows = payrollRecords.map(r => {
              const emp = empMap.get(r.employee_id);
              const accNo = (emp?.bank_account_number || '').replace(/-/g, '').padEnd(10, ' ');
              const amount = r.net_pay.toFixed(2).padStart(13, '0');
              const name = (emp?.full_name || '').substring(0, 50).padEnd(50, ' ');
              return `${accNo}${amount}${name}`;
            });
            content = rows.join("\n");
            filename = `kbank_transfer_${format(currentMonth, "yyyyMM")}.txt`;
            break;
          }
          case "bbl": {
            // Bangkok Bank format
            const header = "H,SALARY," + format(new Date(), "dd/MM/yyyy") + "," + payrollRecords.length;
            const rows = payrollRecords.map((r, index) => {
              const emp = empMap.get(r.employee_id);
              return `D,${index + 1},${emp?.bank_account_number || ''},${emp?.full_name || ''},${r.net_pay.toFixed(2)}`;
            });
            const footer = `T,${totalAmount.toFixed(2)}`;
            content = [header, ...rows, footer].join("\n");
            filename = `bbl_transfer_${format(currentMonth, "yyyyMM")}.txt`;
            break;
          }
          default: {
            // Generic CSV
            const headers = ["ลำดับ", "ชื่อ-นามสกุล", "ธนาคาร", "เลขบัญชี", "สาขา", "จำนวนเงิน"];
            const rows = payrollRecords.map((r, index) => {
              const emp = empMap.get(r.employee_id);
              return [
                index + 1,
                emp?.full_name || r.employee?.full_name,
                emp?.bank_name || "-",
                emp?.bank_account_number || "-",
                emp?.bank_branch || "-",
                r.net_pay.toFixed(2),
              ];
            });
            rows.push(["", "", "", "", "รวมทั้งหมด", totalAmount.toFixed(2)]);
            content = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            filename = `bank_transfer_${format(currentMonth, "yyyy-MM")}.csv`;
          }
        }
        
        const blob = new Blob([content], { type: bankFormat === "generic" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        toast.success(`Export ${bankFormat.toUpperCase()} สำเร็จ`);
      });
  };

  // Send LINE notifications via secure edge function
  const sendLineNotifications = async () => {
    if (!payrollRecords?.length || !currentPeriod) return;
    
    try {
      toast.loading("กำลังส่งแจ้งเตือน LINE...", { id: "line-notify" });
      
      const { data, error } = await supabase.functions.invoke('payroll-notification', {
        body: {
          action: 'send_payroll_notification',
          period_id: currentPeriod.id,
          employee_ids: payrollRecords.map(r => r.employee_id),
        }
      });
      
      if (error) {
        console.error("LINE notification error:", error);
        toast.error("เกิดข้อผิดพลาดในการส่งแจ้งเตือน", { id: "line-notify" });
        return;
      }
      
      const results = data?.results;
      if (results) {
        toast.success(`ส่งแจ้งเตือนสำเร็จ ${results.sent} คน (ข้าม ${results.skipped}, ล้มเหลว ${results.failed})`, { id: "line-notify" });
      } else {
        toast.success("ส่งแจ้งเตือนสำเร็จ", { id: "line-notify" });
      }
    } catch (err) {
      console.error("Error sending LINE notifications:", err);
      toast.error("เกิดข้อผิดพลาดในการส่งแจ้งเตือน", { id: "line-notify" });
    }
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
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <DollarSign className="h-8 w-8 text-primary" />
              Payroll Dashboard
            </h1>
            <Link to="/attendance/payroll/ytd">
              <Button variant="outline" size="sm">
                <TrendingUp className="h-4 w-4 mr-2" />
                Year-to-Date
              </Button>
            </Link>
          </div>
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

      {/* Warning when no period */}
      {!currentPeriod && !isPeriodLoading && (
        <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/30">
                <AlertCircle className="h-8 w-8 text-orange-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100 mb-2">
                  ยังไม่มีรอบเงินเดือนสำหรับเดือนนี้
                </h3>
                <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
                  คุณต้องสร้างรอบเงินเดือนสำหรับ {format(currentMonth, "MMMM yyyy", { locale: th })} ก่อนจึงจะสามารถคำนวณและจัดการเงินเดือนได้
                </p>
                <Dialog open={isCreatePeriodOpen} onOpenChange={setIsCreatePeriodOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="bg-orange-600 hover:bg-orange-700">
                      <Plus className="h-5 w-5 mr-2" />
                      สร้างรอบเงินเดือนทันที
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
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions Bar */}
      {currentPeriod && (
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
            <Button 
              variant="outline" 
              onClick={() => calculatePayrollMutation.mutate()}
              disabled={calculatePayrollMutation.isPending || currentPeriod?.status === 'completed'}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${calculatePayrollMutation.isPending ? 'animate-spin' : ''}`} />
              คำนวณใหม่
            </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <div className="flex gap-1">
                <Select value={selectedBankFormat} onValueChange={setSelectedBankFormat}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generic">CSV</SelectItem>
                    <SelectItem value="scb">SCB</SelectItem>
                    <SelectItem value="kbank">KBank</SelectItem>
                    <SelectItem value="bbl">BBL</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => handleBankTransferExport()}>
                  <FileText className="h-4 w-4 mr-2" />
                  Bank
                </Button>
              </div>
            {currentPeriod.status !== 'completed' && (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={sendLineNotification}
                    onChange={(e) => setSendLineNotification(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Send className="h-3 w-3" />
                  แจ้ง LINE
                </label>
                <Button 
                  onClick={() => approvePeriodMutation.mutate()}
                  disabled={approvePeriodMutation.isPending || !payrollRecords?.length}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {approvePeriodMutation.isPending ? "กำลังอนุมัติ..." : "อนุมัติและล็อค"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      {currentPeriod && (
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
                      <th className="text-center p-3 font-medium">สาย</th>
                      <th className="text-center p-3 font-medium">ลา/ออกก่อน</th>
                      <th className="text-center p-3 font-medium">OT</th>
                      <th className="text-right p-3 font-medium">เงินได้</th>
                      <th className="text-right p-3 font-medium">หัก</th>
                      <th className="text-right p-3 font-medium">สุทธิ</th>
                      <th className="text-center p-3 font-medium w-[100px]">จัดการ</th>
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
                          <td className="p-3 text-center">
                            {(record?.late_count || 0) > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                      {record?.late_count}ครั้ง
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>สายรวม {record?.late_minutes || 0} นาที</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {(record?.leave_days || 0) > 0 && (
                                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  ลา {record?.leave_days}
                                </Badge>
                              )}
                              {(record?.early_leave_count || 0) > 0 && (
                                <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                  ก่อน {record?.early_leave_count}
                                </Badge>
                              )}
                              {!(record?.leave_days || 0) && !(record?.early_leave_count || 0) && (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </div>
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
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {record && (
                                <>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenEdit(record);
                                          }}
                                          disabled={currentPeriod?.status === 'completed'}
                                        >
                                          <Edit className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>แก้ไข</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDownloadPayslip(emp.id);
                                          }}
                                        >
                                          <Printer className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>พิมพ์สลิป</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              )}
                            </div>
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
      )}

      {/* Inline Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>แก้ไขรายการหัก/เบี้ยเลี้ยง</DialogTitle>
            <DialogDescription>
              {editingRecord?.employee?.full_name} - แก้ไขรายการแล้วกดบันทึก
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Deductions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">รายการหัก</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditDeductions([...editDeductions, { name: '', amount: 0 }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> เพิ่ม
                </Button>
              </div>
              {editDeductions.map((item, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Input
                    placeholder="ชื่อรายการ"
                    value={item.name}
                    onChange={(e) => {
                      const updated = [...editDeductions];
                      updated[index].name = e.target.value;
                      setEditDeductions(updated);
                    }}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="จำนวน"
                    value={item.amount}
                    onChange={(e) => {
                      const updated = [...editDeductions];
                      updated[index].amount = parseFloat(e.target.value) || 0;
                      setEditDeductions(updated);
                    }}
                    className="w-24"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditDeductions(editDeductions.filter((_, i) => i !== index))}
                  >
                    <XCircle className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Allowances */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">เบี้ยเลี้ยง</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditAllowances([...editAllowances, { name: '', amount: 0 }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> เพิ่ม
                </Button>
              </div>
              {editAllowances.map((item, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Input
                    placeholder="ชื่อรายการ"
                    value={item.name}
                    onChange={(e) => {
                      const updated = [...editAllowances];
                      updated[index].name = e.target.value;
                      setEditAllowances(updated);
                    }}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="จำนวน"
                    value={item.amount}
                    onChange={(e) => {
                      const updated = [...editAllowances];
                      updated[index].amount = parseFloat(e.target.value) || 0;
                      setEditAllowances(updated);
                    }}
                    className="w-24"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditAllowances(editAllowances.filter((_, i) => i !== index))}
                  >
                    <XCircle className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                ยกเลิก
              </Button>
              <Button
                onClick={() => {
                  if (editingRecord) {
                    updateRecordMutation.mutate({
                      recordId: editingRecord.id,
                      deductions: editDeductions,
                      allowances: editAllowances,
                    });
                  }
                }}
                disabled={updateRecordMutation.isPending}
              >
                {updateRecordMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}