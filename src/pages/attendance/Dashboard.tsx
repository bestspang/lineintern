/**
 * ⚠️ CRITICAL ATTENDANCE DASHBOARD - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This page displays real-time attendance status for all employees.
 * 
 * INVARIANTS:
 * 1. All date queries MUST include timezone offset (+07:00) for Bangkok time
 * 2. Grace period calculation uses attendanceSettings.grace_period_minutes
 * 3. Realtime subscription filters by today's date
 * 4. Admin checkout mutation calls admin-checkout edge function
 * 
 * COMMON BUGS TO AVOID:
 * - Using ${today}T00:00:00 without +07:00 causes timezone boundary issues
 * - Modifying grace period calculation affects late detection
 * - Changing realtime filter breaks live updates
 * 
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * [ ] All .gte() and .lte() queries include +07:00 timezone offset
 * [ ] Grace period logic is preserved
 * [ ] Realtime subscription channel is properly cleaned up
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, Clock, Users, Building2, AlertTriangle, TrendingUp, Calendar, LogOut, CalendarDays, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, differenceInMinutes } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { useAdminRole } from '@/hooks/useAdminRole';

const BANGKOK_TZ = 'Asia/Bangkok';

interface EmployeeStatus {
  id: string;
  full_name: string;
  code: string;
  branch_name: string;
  status: 'working' | 'checked_out' | 'not_arrived';
  check_in_time?: string;
  check_out_time?: string;
  minutes_worked: number;
  working_time_type: string;
  shift_start_time?: string;
}

export default function AttendanceDashboard() {
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeStatus | null>(null);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  // Setup realtime subscription for attendance logs
  // CRITICAL: Filter must include +07:00 timezone offset for Bangkok time
  useEffect(() => {
    const channel = supabase
      .channel('attendance-dashboard-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_logs',
          filter: `server_time=gte.${today}T00:00:00+07:00`,
        },
        (payload) => {
          console.log('Realtime attendance update:', payload);
          
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['attendance-logs-today'] });
          
          // Show toast notification for new check-ins/outs
          if (payload.eventType === 'INSERT') {
            const log = payload.new as any;
            if (log.event_type === 'check_in') {
              toast({
                title: '✅ New Check-in',
                description: 'An employee just checked in',
                duration: 3000,
              });
            } else if (log.event_type === 'check_out') {
              toast({
                title: '👋 Check-out',
                description: 'An employee just checked out',
                duration: 3000,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [today, queryClient, toast]);

  // Admin check-out mutation
  const adminCheckout = useMutation({
    mutationFn: async ({ employeeId, notes }: { employeeId: string; notes?: string }) => {
      const { data, error } = await supabase.functions.invoke('admin-checkout', {
        body: { employee_id: employeeId, notes },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to check out employee');
      
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Employee checked out successfully',
      });
      setIsDialogOpen(false);
      setSelectedEmployee(null);
      setCheckoutNotes('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to check out employee',
        variant: 'destructive',
      });
    },
  });

  const handleCheckoutClick = (employee: EmployeeStatus) => {
    setSelectedEmployee(employee);
    setIsDialogOpen(true);
  };

  const handleConfirmCheckout = () => {
    if (selectedEmployee) {
      adminCheckout.mutate({
        employeeId: selectedEmployee.id,
        notes: checkoutNotes || undefined,
      });
    }
  };

  // Fetch attendance settings for grace period
  const { data: attendanceSettings } = useQuery({
    queryKey: ['attendance-settings-grace'],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance_settings')
        .select('grace_period_minutes')
        .eq('scope', 'global')
        .maybeSingle();
      return data;
    },
  });

  const gracePeriodMinutes = attendanceSettings?.grace_period_minutes || 15;

  // Fetch active employees with branches
  const { data: employees, isLoading: employeesLoading, error: employeesError } = useQuery({
    queryKey: ['active-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(`
          id,
          code,
          full_name,
          working_time_type,
          shift_start_time,
          branch:branches (
            id,
            name
          )
        `)
        .eq('is_active', true);

      if (error) throw error;
      return data;
    },
  });

  // Fetch today's attendance logs
  const { data: attendanceLogs, isLoading: logsLoading, error: logsError, refetch } = useQuery({
    queryKey: ['attendance-logs-today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select(`
          id,
          employee_id,
          event_type,
          server_time,
          is_flagged,
          flag_reason,
          employees (
            id,
            code,
            full_name,
            working_time_type,
            shift_start_time,
            branch:branches (
              id,
              name
            )
          )
        `)
        .gte('server_time', `${today}T00:00:00+07:00`)
        .lte('server_time', `${today}T23:59:59+07:00`)
        .order('server_time', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch last 7 days trend
  const { data: weeklyTrend } = useQuery({
    queryKey: ['attendance-weekly-trend'],
    queryFn: async () => {
      const dates = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        return format(date, 'yyyy-MM-dd');
      });

      const results = await Promise.all(
        dates.map(async (date) => {
          const { data: checkIns } = await supabase
            .from('attendance_logs')
            .select('id, server_time, employee_id, employees!inner(working_time_type, shift_start_time)')
            .eq('event_type', 'check_in')
            .gte('server_time', `${date}T00:00:00+07:00`)
            .lte('server_time', `${date}T23:59:59+07:00`);

          let onTime = 0;
          let late = 0;

          checkIns?.forEach((log: any) => {
            const checkInTime = new Date(log.server_time);
            const employee = log.employees;

            if (employee.working_time_type === 'time_based' && employee.shift_start_time) {
              const [hour, minute] = employee.shift_start_time.split(':').map(Number);
              const shiftStart = new Date(checkInTime);
              shiftStart.setHours(hour, minute, 0, 0);
              
              // Add grace period
              const lateThreshold = new Date(shiftStart.getTime() + gracePeriodMinutes * 60000);

              if (checkInTime <= lateThreshold) {
                onTime++;
              } else {
                late++;
              }
            } else {
              onTime++;
            }
          });

          return {
            date: format(new Date(date), 'MMM dd'),
            onTime,
            late,
            total: onTime + late,
          };
        })
      );

      return results;
    },
  });

  // Fetch leave balances summary
  const { data: leaveBalances } = useQuery({
    queryKey: ['leave-balances-summary', new Date().getFullYear()],
    queryFn: async () => {
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from('leave_balances')
        .select('vacation_days_total, vacation_days_used, sick_days_total, sick_days_used, personal_days_total, personal_days_used')
        .eq('leave_year', currentYear);

      if (error) throw error;
      return data;
    },
  });

  // Calculate leave balance totals
  const leaveBalanceSummary = leaveBalances?.reduce(
    (acc, balance) => ({
      vacationRemaining: acc.vacationRemaining + ((balance.vacation_days_total || 0) - (balance.vacation_days_used || 0)),
      sickRemaining: acc.sickRemaining + ((balance.sick_days_total || 0) - (balance.sick_days_used || 0)),
      personalRemaining: acc.personalRemaining + ((balance.personal_days_total || 0) - (balance.personal_days_used || 0)),
      vacationTotal: acc.vacationTotal + (balance.vacation_days_total || 0),
      sickTotal: acc.sickTotal + (balance.sick_days_total || 0),
      personalTotal: acc.personalTotal + (balance.personal_days_total || 0),
    }),
    { vacationRemaining: 0, sickRemaining: 0, personalRemaining: 0, vacationTotal: 0, sickTotal: 0, personalTotal: 0 }
  ) || { vacationRemaining: 0, sickRemaining: 0, personalRemaining: 0, vacationTotal: 0, sickTotal: 0, personalTotal: 0 };

  // Calculate employee statuses
  // FIX: Sort logs by time and properly pair check-in/out
  const employeeStatuses: EmployeeStatus[] = employees?.map((emp) => {
    const empLogs = attendanceLogs?.filter((log) => log.employee_id === emp.id) || [];
    
    // Sort logs by time to properly pair check-in/out
    const sortedLogs = [...empLogs].sort((a, b) => 
      new Date(a.server_time).getTime() - new Date(b.server_time).getTime()
    );
    
    // Find first check-in of the day
    const checkIn = sortedLogs.find((log) => log.event_type === 'check_in');
    
    // Find check-out that comes AFTER the check-in (handles multiple pairs)
    const checkOut = checkIn 
      ? sortedLogs.find((log) => 
          log.event_type === 'check_out' && 
          new Date(log.server_time) > new Date(checkIn.server_time)
        )
      : undefined;

    let status: 'working' | 'checked_out' | 'not_arrived' = 'not_arrived';
    let minutesWorked = 0;

    if (checkIn && !checkOut) {
      status = 'working';
      minutesWorked = differenceInMinutes(new Date(), new Date(checkIn.server_time));
    } else if (checkIn && checkOut) {
      status = 'checked_out';
      minutesWorked = differenceInMinutes(new Date(checkOut.server_time), new Date(checkIn.server_time));
    }
    // Simplified: if no check-in, status stays 'not_arrived'

    return {
      id: emp.id,
      full_name: emp.full_name,
      code: emp.code,
      branch_name: emp.branch?.name || 'N/A',
      status,
      check_in_time: checkIn?.server_time,
      check_out_time: checkOut?.server_time,
      minutes_worked: minutesWorked,
      working_time_type: emp.working_time_type || 'time_based',
      shift_start_time: emp.shift_start_time,
    };
  }) || [];

  // Calculate attendance summary for today
  const attendanceStatus = {
    onTime: 0,
    late: 0,
    absent: 0,
  };

  const now = new Date();

  attendanceLogs?.forEach((log) => {
    if (log.event_type === 'check_in') {
      const employee = log.employees;
      const checkInTime = new Date(log.server_time);

      if (employee.working_time_type === 'time_based' && employee.shift_start_time) {
        const [hour, minute] = employee.shift_start_time.split(':').map(Number);
        const shiftStart = new Date(checkInTime);
        shiftStart.setHours(hour, minute, 0, 0);
        
        // Add grace period
        const lateThreshold = new Date(shiftStart.getTime() + gracePeriodMinutes * 60000);

        if (checkInTime <= lateThreshold) {
          attendanceStatus.onTime++;
        } else {
          attendanceStatus.late++;
        }
      } else {
        attendanceStatus.onTime++;
      }
    }
  });

  // Calculate absent: employees who should have arrived but haven't checked in
  const checkedInEmployeeIds = new Set(
    attendanceLogs?.filter((log) => log.event_type === 'check_in').map((log) => log.employee_id) || []
  );

  // FIX: Only count time_based employees as absent
  // hours_based employees have flexible schedules and should NOT be counted as absent
  let shouldHaveArrivedCount = 0;
  employees?.forEach(emp => {
    if (emp.working_time_type === 'time_based' && emp.shift_start_time) {
      const [hour, minute] = emp.shift_start_time.split(':').map(Number);
      const shiftStart = new Date();
      shiftStart.setHours(hour, minute, 0, 0);
      
      // If past shift start + grace period = should have arrived
      const shouldHaveArrived = new Date(shiftStart.getTime() + gracePeriodMinutes * 60000);
      if (now >= shouldHaveArrived && !checkedInEmployeeIds.has(emp.id)) {
        shouldHaveArrivedCount++;
      }
    }
    // REMOVED: hours_based employees are NOT counted as absent
    // They have flexible schedules and can check in anytime
  });

  attendanceStatus.absent = shouldHaveArrivedCount;

  // Calculate branch breakdown
  const branchStats = employees?.reduce((acc, emp) => {
    const branchName = emp.branch?.name || 'N/A';
    if (!acc[branchName]) {
      acc[branchName] = { total: 0, working: 0, checkedOut: 0, notArrived: 0 };
    }
    acc[branchName].total++;

    const empStatus = employeeStatuses.find((s) => s.id === emp.id);
    if (empStatus) {
      if (empStatus.status === 'working') acc[branchName].working++;
      else if (empStatus.status === 'checked_out') acc[branchName].checkedOut++;
      else acc[branchName].notArrived++;
    }

    return acc;
  }, {} as Record<string, { total: number; working: number; checkedOut: number; notArrived: number }>);

  const branchData = Object.entries(branchStats || {}).map(([name, stats]) => ({
    name,
    ...stats,
  }));

  // Flagged logs today
  const flaggedLogs = attendanceLogs?.filter((log) => log.is_flagged) || [];

  // Stats
  const stats = {
    working: employeeStatuses.filter((e) => e.status === 'working').length,
    checkedOut: employeeStatuses.filter((e) => e.status === 'checked_out').length,
    notArrived: employeeStatuses.filter((e) => e.status === 'not_arrived').length,
    totalEmployees: employees?.length || 0,
    totalHoursWorked: Math.round(employeeStatuses.reduce((sum, e) => sum + e.minutes_worked, 0) / 60),
  };

  const recentCheckIns = attendanceLogs?.filter((log) => log.event_type === 'check_in').slice(0, 5) || [];

  // Loading state
  if (employeesLoading || logsLoading) {
    return (
      <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Attendance Dashboard</h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-1">กำลังโหลดข้อมูล...</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Error state
  if (employeesError || logsError) {
    return (
      <div className="container mx-auto py-3 sm:py-6">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-muted-foreground mb-4">ไม่สามารถโหลดข้อมูลได้</p>
          <Button onClick={() => refetch()}>ลองอีกครั้ง</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Attendance Dashboard</h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-muted-foreground text-sm sm:text-base">
            ภาพรวมระบบเข้างาน • {format(new Date(), 'dd MMMM yyyy')}
          </p>
          <Badge variant="outline" className="text-xs">
            Grace Period: {gracePeriodMinutes} นาที
          </Badge>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">กำลังทำงาน</CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.working}</div>
            <p className="text-xs text-muted-foreground">Check-in แล้ว</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">เช็คเอาท์แล้ว</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.checkedOut}</div>
            <p className="text-xs text-muted-foreground">เสร็จงานแล้ว</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ยังไม่มา</CardTitle>
            <XCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.notArrived}</div>
            <p className="text-xs text-muted-foreground">รอเข้างาน</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">พนักงานทั้งหมด</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">คนทั้งหมด</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ชั่วโมงรวม</CardTitle>
            <Clock className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.totalHoursWorked}h</div>
            <p className="text-xs text-muted-foreground">วันนี้</p>
          </CardContent>
        </Card>
      </div>

      {/* Leave Balance Summary Widget */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            สรุปวันลาทั้งหมด
          </CardTitle>
          <CardDescription>วันลาคงเหลือของพนักงานทั้งหมด (ปี {new Date().getFullYear()})</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">วันลาพักร้อน</span>
                <Badge variant="secondary" className="text-xs">
                  {leaveBalanceSummary.vacationRemaining}/{leaveBalanceSummary.vacationTotal}
                </Badge>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {leaveBalanceSummary.vacationRemaining}
              </div>
              <p className="text-xs text-muted-foreground">วันคงเหลือ</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">วันลาป่วย</span>
                <Badge variant="secondary" className="text-xs">
                  {leaveBalanceSummary.sickRemaining}/{leaveBalanceSummary.sickTotal}
                </Badge>
              </div>
              <div className="text-2xl font-bold text-orange-600">
                {leaveBalanceSummary.sickRemaining}
              </div>
              <p className="text-xs text-muted-foreground">วันคงเหลือ</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">วันลากิจ</span>
                <Badge variant="secondary" className="text-xs">
                  {leaveBalanceSummary.personalRemaining}/{leaveBalanceSummary.personalTotal}
                </Badge>
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {leaveBalanceSummary.personalRemaining}
              </div>
              <p className="text-xs text-muted-foreground">วันคงเหลือ</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">วันลารวมทั้งหมด</span>
              <span className="font-semibold">
                {leaveBalanceSummary.vacationRemaining + leaveBalanceSummary.sickRemaining + leaveBalanceSummary.personalRemaining} วัน
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Today's Attendance Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              สรุปการเข้างานวันนี้
            </CardTitle>
            <CardDescription>เข้าตรงเวลา vs สาย vs ขาด</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={[
                  { name: 'เข้าตรงเวลา', value: attendanceStatus.onTime, fill: 'hsl(var(--chart-1))' },
                  { name: 'เข้าสาย', value: attendanceStatus.late, fill: 'hsl(var(--chart-2))' },
                  { name: 'ขาดงาน', value: attendanceStatus.absent, fill: 'hsl(var(--chart-3))' },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="fill" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{attendanceStatus.onTime}</div>
                <div className="text-xs text-muted-foreground">เข้าตรงเวลา</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{attendanceStatus.late}</div>
                <div className="text-xs text-muted-foreground">เข้าสาย</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{attendanceStatus.absent}</div>
                <div className="text-xs text-muted-foreground">ขาดงาน</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 7-Day Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              แนวโน้ม 7 วันล่าสุด
            </CardTitle>
            <CardDescription>สถิติการเข้างาน</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="onTime" stroke="hsl(var(--chart-1))" name="เข้าตรงเวลา" />
                <Line type="monotone" dataKey="late" stroke="hsl(var(--chart-2))" name="เข้าสาย" />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--chart-4))" name="ทั้งหมด" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Branch Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              สรุปแต่ละสาขา
            </CardTitle>
            <CardDescription>สถานะพนักงานแยกตามสาขา</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {branchData.map((branch) => (
                <div key={branch.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{branch.name}</span>
                    <span className="text-sm text-muted-foreground">{branch.total} คน</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-green-100 dark:bg-green-900/20 rounded px-2 py-1 text-center">
                      <div className="text-sm font-semibold text-green-700 dark:text-green-400">{branch.working}</div>
                      <div className="text-xs text-muted-foreground">ทำงาน</div>
                    </div>
                    <div className="flex-1 bg-blue-100 dark:bg-blue-900/20 rounded px-2 py-1 text-center">
                      <div className="text-sm font-semibold text-blue-700 dark:text-blue-400">{branch.checkedOut}</div>
                      <div className="text-xs text-muted-foreground">เช็คเอาท์</div>
                    </div>
                    <div className="flex-1 bg-orange-100 dark:bg-orange-900/20 rounded px-2 py-1 text-center">
                      <div className="text-sm font-semibold text-orange-700 dark:text-orange-400">{branch.notArrived}</div>
                      <div className="text-xs text-muted-foreground">ยังไม่มา</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Check-ins */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Check-in ล่าสุด
            </CardTitle>
            <CardDescription>5 รายการล่าสุด</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentCheckIns.map((log) => {
                const employee = log.employees;
                return (
                  <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {employee.full_name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{employee.full_name}</p>
                        {log.is_flagged && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Flag
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {employee.branch?.name} • {formatInTimeZone(new Date(log.server_time), BANGKOK_TZ, 'HH:mm')}
                      </p>
                    </div>
                  </div>
                );
              })}
              {recentCheckIns.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มี check-in วันนี้</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Flagged Logs */}
      {flaggedLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              รายการที่มีปัญหา ({flaggedLogs.length})
            </CardTitle>
            <CardDescription>Flagged logs ที่ต้องตรวจสอบ</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {flaggedLogs.map((log) => {
                const employee = log.employees;
                return (
                  <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-destructive/10 text-destructive text-xs font-semibold">
                        {employee.full_name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{employee.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {employee.branch?.name} • {formatInTimeZone(new Date(log.server_time), BANGKOK_TZ, 'HH:mm')} • {log.event_type}
                      </p>
                    </div>
                    <Badge variant="destructive" className="text-xs">
                      {log.flag_reason}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employee Status - Working Employees */}
      {isAdmin && employeeStatuses.filter((e) => e.status === 'working').length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              พนักงานที่กำลังทำงาน ({employeeStatuses.filter((e) => e.status === 'working').length})
            </CardTitle>
            <CardDescription>Admin: Click to check out employees</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {employeeStatuses
                .filter((e) => e.status === 'working')
                .map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {employee.full_name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate">{employee.full_name}</p>
                          <Badge variant="outline" className="text-xs">{employee.code}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>🏢 {employee.branch_name}</span>
                          {employee.check_in_time && (
                            <>
                              <span>•</span>
                              <span>📥 {formatInTimeZone(new Date(employee.check_in_time), BANGKOK_TZ, 'HH:mm')}</span>
                              <span>•</span>
                              <span>⏱️ {Math.floor(employee.minutes_worked / 60)}h {employee.minutes_worked % 60}m</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCheckoutClick(employee)}
                      disabled={adminCheckout.isPending}
                    >
                      <LogOut className="h-4 w-4 mr-1" />
                      Check Out
                    </Button>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check-out Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Check-Out</DialogTitle>
            <DialogDescription>
              Are you sure you want to check out this employee?
            </DialogDescription>
          </DialogHeader>
          
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Employee:</span>
                  <span className="font-semibold">{selectedEmployee.full_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Code:</span>
                  <Badge variant="outline">{selectedEmployee.code}</Badge>
                </div>
                {selectedEmployee.check_in_time && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Check-in Time:</span>
                      <span className="text-sm">{formatInTimeZone(new Date(selectedEmployee.check_in_time), BANGKOK_TZ, 'HH:mm')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Hours Worked:</span>
                      <span className="text-sm font-semibold">
                        {Math.floor(selectedEmployee.minutes_worked / 60)}h {selectedEmployee.minutes_worked % 60}m
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Reason for admin checkout..."
                  value={checkoutNotes}
                  onChange={(e) => setCheckoutNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={adminCheckout.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirmCheckout} disabled={adminCheckout.isPending}>
              {adminCheckout.isPending ? 'Checking out...' : 'Confirm Check-Out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
