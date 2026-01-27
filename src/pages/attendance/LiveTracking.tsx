/**
 * ⚠️ CRITICAL LIVE TRACKING PAGE - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This page provides real-time monitoring of currently checked-in employees.
 * 
 * INVARIANTS:
 * 1. All date queries MUST include timezone offset (+07:00) for Bangkok time
 * 2. Expected check-out calculation uses shift_end_time with proper timezone handling
 * 3. RefetchInterval is set to 30000ms (30s) for live tracking
 * 4. OT status check uses otApprovedMap from approved overtime requests
 * 
 * COMMON BUGS TO AVOID:
 * - Using ${today}T00:00:00 without +07:00 causes timezone boundary issues
 * - Modifying shift_end_time parsing breaks expected checkout calculation
 * - Changing realtime subscription breaks live updates
 * 
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * [ ] All .gte() and .lte() queries include +07:00 timezone offset
 * [ ] shift_end_time parsing uses +07:00 offset (line ~172)
 * [ ] RefetchInterval values are preserved
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
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Clock, Users, TrendingUp, Calendar, LogOut, AlertCircle, Plus, X } from 'lucide-react';
import { format, addMinutes, differenceInMinutes } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { useToast } from '@/hooks/use-toast';
import { useAdminRole } from '@/hooks/useAdminRole';

const BANGKOK_TZ = 'Asia/Bangkok';

interface CheckedInEmployee {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  branch_name: string;
  check_in_time: string;
  working_time_type: string;
  shift_end_time: string | null;
  hours_per_day: number | null;
  break_hours: number | null;
  expected_check_out: string;
  time_until_checkout: number;
  is_remote_checkin: boolean;
  working_minutes_elapsed: number;
  // Work Summary features
  auto_checkout_grace_period_minutes: number;
  net_work_minutes: number;
  progress_percent: number;
  auto_checkout_at: string;
  grace_expiring_soon: boolean;
}

export default function LiveTracking() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<CheckedInEmployee | null>(null);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // OT Grant Dialog State
  const [isOTDialogOpen, setIsOTDialogOpen] = useState(false);
  const [selectedEmployeeForOT, setSelectedEmployeeForOT] = useState<CheckedInEmployee | null>(null);
  const [otHours, setOTHours] = useState<number>(2);
  const [otReason, setOTReason] = useState('');
  
  // Cancel OT Dialog State
  const [isCancelOTDialogOpen, setIsCancelOTDialogOpen] = useState(false);
  const [employeeToCancel, setEmployeeToCancel] = useState<CheckedInEmployee | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  
  const { toast } = useToast();
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Fetch approved OT requests for today
  const { data: approvedOTRequests, refetch: refetchOT } = useQuery({
    queryKey: ['approved-ot-requests-today'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('overtime_requests')
        .select('id, employee_id, estimated_hours, reason')
        .eq('status', 'approved')
        .eq('request_date', today);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000, // Critical: Live tracking needs frequent updates
  });

  // Create a map for quick lookup
  const otApprovedMap = new Map(
    approvedOTRequests?.map(req => [req.employee_id, req]) || []
  );

  const { data: checkedInEmployees, refetch } = useQuery({
    queryKey: ['checked-in-employees'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Get all check-ins for today
      const { data: checkIns, error: checkInError } = await supabase
        .from('attendance_logs')
        .select(`
          employee_id,
          server_time,
          is_remote_checkin,
          employees (
            id,
            code,
            full_name,
            working_time_type,
            shift_end_time,
            hours_per_day,
            break_hours,
            auto_checkout_grace_period_minutes,
            branch:branches!employees_branch_id_fkey (
              name
            )
          )
        `)
        .eq('event_type', 'check_in')
        .gte('server_time', `${today}T00:00:00+07:00`)
        .lte('server_time', `${today}T23:59:59+07:00`)
        .order('server_time', { ascending: true });

      if (checkInError) throw checkInError;

      // Get all check-outs for today with timestamps
      const { data: checkOuts, error: checkOutError } = await supabase
        .from('attendance_logs')
        .select('employee_id, server_time')
        .eq('event_type', 'check_out')
        .gte('server_time', `${today}T00:00:00+07:00`)
        .lte('server_time', `${today}T23:59:59+07:00`);

      if (checkOutError) throw checkOutError;

      // Create map of employee_id to their latest check-out time
      const latestCheckOutMap = new Map<string, Date>();
      checkOuts?.forEach(co => {
        const currentTime = latestCheckOutMap.get(co.employee_id);
        const newTime = new Date(co.server_time);
        if (!currentTime || newTime > currentTime) {
          latestCheckOutMap.set(co.employee_id, newTime);
        }
      });

      // Group by employee_id and get only the LATEST check-in for each employee
      const latestCheckInMap = new Map();
      checkIns?.forEach(checkIn => {
        const currentLatest = latestCheckInMap.get(checkIn.employee_id);
        const checkInTime = new Date(checkIn.server_time);
        
        if (!currentLatest || checkInTime > new Date(currentLatest.server_time)) {
          latestCheckInMap.set(checkIn.employee_id, checkIn);
        }
      });

      // Convert Map to Array
      const latestCheckIns = Array.from(latestCheckInMap.values());

      // Filter to only employees who:
      // 1. Haven't checked out yet today, OR
      // 2. Their latest check-in is after their latest check-out
      const currentlyCheckedIn = latestCheckIns.filter(checkIn => {
        const latestCheckOut = latestCheckOutMap.get(checkIn.employee_id);
        if (!latestCheckOut) return true; // No check-out yet
        
        const checkInTime = new Date(checkIn.server_time);
        return checkInTime > latestCheckOut; // Check-in after check-out
      });

      // Calculate expected check-out times
      // FIX: Use proper Bangkok timezone handling for shift_end_time
      const result: CheckedInEmployee[] = currentlyCheckedIn.map(checkIn => {
        const employee = checkIn.employees;
        const checkInTime = new Date(checkIn.server_time);
        let expectedCheckOut: Date;

        if (employee.working_time_type === 'hours_based') {
          // Calculate based on check-in time + hours + break
          const hoursPerDay = employee.hours_per_day || 8;
          const breakHours = employee.break_hours || 0;
          const totalMinutes = (hoursPerDay + breakHours) * 60;
          expectedCheckOut = addMinutes(checkInTime, totalMinutes);
        } else {
          // time_based employees: use shift_end_time
          if (employee.shift_end_time) {
            // Get the Bangkok date string from check-in time
            const bangkokDateStr = formatInTimeZone(checkInTime, BANGKOK_TZ, 'yyyy-MM-dd');
            
            // Create ISO string with Bangkok timezone offset (+07:00)
            // This ensures correct parsing regardless of browser timezone
            const shiftEndISO = `${bangkokDateStr}T${employee.shift_end_time}+07:00`;
            expectedCheckOut = new Date(shiftEndISO);
            
            // If shift end is before check-in time, assume next day
            if (expectedCheckOut < checkInTime) {
              expectedCheckOut = addMinutes(expectedCheckOut, 24 * 60);
            }
          } else {
            expectedCheckOut = addMinutes(checkInTime, 8 * 60); // Default 8 hours
          }
        }

        const timeUntilCheckout = differenceInMinutes(expectedCheckOut, new Date());
        const workingMinutesElapsed = differenceInMinutes(new Date(), checkInTime);

        // Work Summary calculations
        const breakMinutes = (employee.break_hours || 0) * 60;
        const netWorkMinutes = Math.max(0, workingMinutesElapsed - breakMinutes);
        const targetMinutes = (employee.hours_per_day || 8) * 60;
        const progressPercent = Math.min(100, (netWorkMinutes / targetMinutes) * 100);
        
        const gracePeriod = employee.auto_checkout_grace_period_minutes || 60;
        const autoCheckoutAt = addMinutes(expectedCheckOut, gracePeriod);
        const graceExpiringSoon = differenceInMinutes(autoCheckoutAt, new Date()) < 15 && 
                                  differenceInMinutes(autoCheckoutAt, new Date()) > 0;

        return {
          employee_id: employee.id,
          employee_name: employee.full_name,
          employee_code: employee.code,
          branch_name: employee.branch?.name || 'N/A',
          check_in_time: checkIn.server_time,
          working_time_type: employee.working_time_type || 'time_based',
          shift_end_time: employee.shift_end_time,
          hours_per_day: employee.hours_per_day,
          break_hours: employee.break_hours,
          expected_check_out: expectedCheckOut.toISOString(),
          time_until_checkout: timeUntilCheckout,
          is_remote_checkin: checkIn.is_remote_checkin || false,
          working_minutes_elapsed: workingMinutesElapsed,
          // Work Summary fields
          auto_checkout_grace_period_minutes: gracePeriod,
          net_work_minutes: netWorkMinutes,
          progress_percent: progressPercent,
          auto_checkout_at: autoCheckoutAt.toISOString(),
          grace_expiring_soon: graceExpiringSoon,
        };
      });

      return result;
    },
    refetchInterval: 30000, // Critical: Live attendance status
  });

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
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to check out employee',
        variant: 'destructive',
      });
    },
  });

  // Instant OT Grant mutation
  const grantOTMutation = useMutation({
    mutationFn: async ({ employeeId, hours, reason }: { employeeId: string; hours: number; reason: string }) => {
      const { data, error } = await supabase.functions.invoke('instant-ot-grant', {
        body: { employee_id: employeeId, hours, reason },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to grant OT');
      
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'สำเร็จ',
        description: data.message || `ให้ OT ${otHours} ชม. เรียบร้อย - พนักงานจะได้รับแจ้งเตือนทาง LINE`,
      });
      setIsOTDialogOpen(false);
      setSelectedEmployeeForOT(null);
      setOTHours(2);
      setOTReason('');
      refetchOT();
      queryClient.invalidateQueries({ queryKey: ['approved-ot-requests-today'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to grant OT',
        variant: 'destructive',
      });
    },
  });

  // Cancel OT mutation
  const cancelOTMutation = useMutation({
    mutationFn: async ({ employeeId, reason }: { employeeId: string; reason: string }) => {
      const { data, error } = await supabase.functions.invoke('cancel-ot', {
        body: { employee_id: employeeId, reason },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to cancel OT');
      
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'สำเร็จ',
        description: data.message || 'ยกเลิก OT เรียบร้อย',
      });
      setIsCancelOTDialogOpen(false);
      setEmployeeToCancel(null);
      setCancelReason('');
      refetchOT();
      queryClient.invalidateQueries({ queryKey: ['approved-ot-requests-today'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel OT',
        variant: 'destructive',
      });
    },
  });

  const handleCheckoutClick = (employee: CheckedInEmployee) => {
    setSelectedEmployee(employee);
    setIsDialogOpen(true);
  };

  const handleConfirmCheckout = () => {
    if (selectedEmployee) {
      adminCheckout.mutate({
        employeeId: selectedEmployee.employee_id,
        notes: checkoutNotes || undefined,
      });
    }
  };

  const handleGrantOTClick = (employee: CheckedInEmployee) => {
    setSelectedEmployeeForOT(employee);
    setOTHours(2);
    setOTReason('');
    setIsOTDialogOpen(true);
  };

  const handleConfirmGrantOT = () => {
    if (selectedEmployeeForOT && otHours > 0) {
      grantOTMutation.mutate({
        employeeId: selectedEmployeeForOT.employee_id,
        hours: otHours,
        reason: otReason || 'Admin granted OT',
      });
    }
  };

  const handleCancelOTClick = (employee: CheckedInEmployee) => {
    setEmployeeToCancel(employee);
    setCancelReason('');
    setIsCancelOTDialogOpen(true);
  };

  const handleConfirmCancelOT = () => {
    if (employeeToCancel) {
      cancelOTMutation.mutate({
        employeeId: employeeToCancel.employee_id,
        reason: cancelReason || 'ยกเลิกโดย Admin',
      });
    }
  };

  // Real-time subscription for attendance_logs
  useEffect(() => {
    const channel = supabase
      .channel('attendance-logs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_logs'
        },
        (payload) => {
          console.log('Attendance log change detected:', payload);
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  // Real-time subscription for overtime_requests
  useEffect(() => {
    const channel = supabase
      .channel('overtime-requests-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'overtime_requests'
        },
        () => {
          refetchOT();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchOT]);

  const stats = {
    total: checkedInEmployees?.length || 0,
    leavingSoon: checkedInEmployees?.filter(e => e.time_until_checkout > 0 && e.time_until_checkout <= 60).length || 0,
    overtime: checkedInEmployees?.filter(e => e.time_until_checkout < 0).length || 0,
  };

  const getStatusBadge = (minutesUntilCheckout: number, employeeId: string) => {
    const hasApprovedOT = otApprovedMap.has(employeeId);
    
    if (hasApprovedOT && minutesUntilCheckout < 0) {
      return (
        <div className="flex gap-2 flex-wrap">
          <Badge className="bg-green-500 hover:bg-green-600">✅ OT Approved</Badge>
          <Badge variant="destructive">Working OT</Badge>
        </div>
      );
    } else if (hasApprovedOT) {
      return <Badge className="bg-green-500 hover:bg-green-600">✅ OT Approved</Badge>;
    } else if (minutesUntilCheckout < 0) {
      return <Badge variant="destructive">⚠️ Overtime (Unapproved)</Badge>;
    } else if (minutesUntilCheckout <= 60) {
      return <Badge className="bg-orange-500">Leaving Soon</Badge>;
    } else {
      return <Badge variant="default">On Time</Badge>;
    }
  };

  const formatTimeRemaining = (minutes: number) => {
    if (minutes < 0) {
      const absMinutes = Math.abs(minutes);
      const hours = Math.floor(absMinutes / 60);
      const mins = absMinutes % 60;
      return hours > 0 ? `-${hours}h ${mins}m` : `-${mins}m`;
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatWorkingHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Live Tracking</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Real-time employee attendance monitoring
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {format(currentTime, 'HH:mm:ss')}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Currently Checked In</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              Active employees on site
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leaving Soon</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.leavingSoon}</div>
            <p className="text-xs text-muted-foreground">
              Within next hour
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overtime</CardTitle>
            <TrendingUp className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.overtime}</div>
            <p className="text-xs text-muted-foreground">
              Past expected checkout
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Employee List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Checked In Employees
          </CardTitle>
          <CardDescription>
            Live updates • Last refreshed: {format(currentTime, 'HH:mm:ss')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checkedInEmployees && checkedInEmployees.length > 0 ? (
            <div className="space-y-4">
              {checkedInEmployees
                .sort((a, b) => a.time_until_checkout - b.time_until_checkout)
                .map((employee) => {
                  const hasApprovedOT = otApprovedMap.has(employee.employee_id);
                  const approvedOTData = otApprovedMap.get(employee.employee_id);
                  
                  return (
                    <div
                      key={employee.employee_id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {employee.employee_name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm sm:text-base truncate">
                              {employee.employee_name}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {employee.employee_code}
                            </Badge>
                            {employee.is_remote_checkin && (
                              <Badge variant="outline" className="text-xs">
                                🌐 Remote
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-muted-foreground">
                            <span>🏢 {employee.branch_name}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>
                              📥 Check-in: {format(new Date(employee.check_in_time), 'HH:mm')}
                            </span>
                            <span className="hidden sm:inline">•</span>
                            <span className="font-medium text-primary">
                              ⏱️ Working: {formatWorkingHours(employee.working_minutes_elapsed)}
                            </span>
                            {employee.working_time_type === 'hours_based' && (
                              <>
                                <span className="hidden sm:inline">•</span>
                                <span className="text-muted-foreground">
                                  📋 {employee.hours_per_day}h/day + {employee.break_hours}h break
                                </span>
                              </>
                            )}
                          </div>
                          
                          {/* Progress Bar - Work Summary Feature */}
                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">
                                ทำงานสุทธิ: {Math.floor(employee.net_work_minutes / 60)}h {employee.net_work_minutes % 60}m / {employee.hours_per_day || 8}h
                              </span>
                              <span className="font-medium">{Math.floor(employee.progress_percent)}%</span>
                            </div>
                            <Progress 
                              value={employee.progress_percent} 
                              className={`h-2 ${employee.progress_percent >= 100 ? '[&>div]:bg-green-500' : ''}`}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-2">
                          {getStatusBadge(employee.time_until_checkout, employee.employee_id)}
                          
                          {/* Show approved OT hours */}
                          {hasApprovedOT && approvedOTData && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              🕐 OT: {approvedOTData.estimated_hours}h
                            </Badge>
                          )}
                          
                          <div className="text-right">
                            <div className="text-sm font-semibold">
                              {format(new Date(employee.expected_check_out), 'HH:mm')}
                            </div>
                            <div className={`text-xs ${
                              employee.time_until_checkout < 0 
                                ? 'text-destructive font-semibold'
                                : employee.time_until_checkout <= 60
                                ? 'text-orange-500 font-semibold'
                                : 'text-muted-foreground'
                            }`}>
                              {employee.time_until_checkout < 0 ? 'OT ' : ''}
                              {formatTimeRemaining(employee.time_until_checkout)}
                            </div>
                          </div>
                          
                          {/* Auto Checkout Time */}
                          <div className="text-xs text-muted-foreground">
                            ⏰ Auto: {format(new Date(employee.auto_checkout_at), 'HH:mm')}
                          </div>
                          
                          {/* Grace Expiring Warning */}
                          {employee.grace_expiring_soon && (
                            <Badge variant="destructive" className="text-xs animate-pulse">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              ใกล้ Auto Checkout!
                            </Badge>
                          )}
                        </div>
                        
                        {/* Admin Action Buttons */}
                        {isAdmin && (
                          <div className="flex flex-col gap-2">
                            {/* Grant OT / Cancel OT Button */}
                            {hasApprovedOT ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-orange-600 border-orange-300 hover:bg-orange-50"
                                onClick={() => handleCancelOTClick(employee)}
                                disabled={cancelOTMutation.isPending}
                              >
                                <X className="h-4 w-4 mr-1" />
                                ยกเลิก OT
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-300 hover:bg-green-50"
                                onClick={() => handleGrantOTClick(employee)}
                                disabled={grantOTMutation.isPending}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                ให้ OT
                              </Button>
                            )}
                            
                            {/* Check Out Button */}
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
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No employees checked in at the moment</p>
            </div>
          )}
        </CardContent>
      </Card>

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
                  <span className="font-semibold">{selectedEmployee.employee_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Code:</span>
                  <Badge variant="outline">{selectedEmployee.employee_code}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Check-in Time:</span>
                  <span className="text-sm">{format(new Date(selectedEmployee.check_in_time), 'HH:mm')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Hours Worked:</span>
                  <span className="text-sm font-semibold">
                    {formatTimeRemaining(differenceInMinutes(new Date(), new Date(selectedEmployee.check_in_time)))}
                  </span>
                </div>
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

      {/* Grant OT Dialog */}
      <Dialog open={isOTDialogOpen} onOpenChange={setIsOTDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🕐 ให้ OT ทันที</DialogTitle>
            <DialogDescription>
              อนุมัติ OT ให้พนักงานที่กำลังทำงานอยู่ - พนักงานจะได้รับแจ้งเตือนทาง LINE
            </DialogDescription>
          </DialogHeader>
          
          {selectedEmployeeForOT && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">พนักงาน:</span>
                  <span className="font-semibold">{selectedEmployeeForOT.employee_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">รหัส:</span>
                  <Badge variant="outline">{selectedEmployeeForOT.employee_code}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">เวลา Check-out ปกติ:</span>
                  <span className="text-sm">{format(new Date(selectedEmployeeForOT.expected_check_out), 'HH:mm')}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Label>จำนวนชั่วโมง OT</Label>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4].map((h) => (
                    <Button
                      key={h}
                      type="button"
                      size="sm"
                      variant={otHours === h ? 'default' : 'outline'}
                      onClick={() => setOTHours(h)}
                    >
                      {h} ชม.
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={otHours}
                    onChange={(e) => setOTHours(parseFloat(e.target.value) || 2)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">ชั่วโมง (0.5 - 8)</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ot-reason">เหตุผล (ไม่บังคับ)</Label>
                <Textarea
                  id="ot-reason"
                  placeholder="เช่น งานด่วนจากลูกค้า, ปิดงาน Project..."
                  value={otReason}
                  onChange={(e) => setOTReason(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                <p className="text-green-800">
                  ✅ พนักงานจะสามารถทำงานต่อได้อีก <strong>{otHours} ชั่วโมง</strong> จากเวลา checkout ปกติ
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOTDialogOpen(false)} disabled={grantOTMutation.isPending}>
              ยกเลิก
            </Button>
            <Button 
              onClick={handleConfirmGrantOT} 
              disabled={grantOTMutation.isPending || otHours < 0.5}
              className="bg-green-600 hover:bg-green-700"
            >
              {grantOTMutation.isPending ? 'กำลังดำเนินการ...' : `ให้ OT ${otHours} ชม.`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel OT Dialog */}
      <Dialog open={isCancelOTDialogOpen} onOpenChange={setIsCancelOTDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⚠️ ยกเลิก OT</DialogTitle>
            <DialogDescription>
              ยืนยันการยกเลิก OT - พนักงานจะได้รับแจ้งเตือนทาง LINE
            </DialogDescription>
          </DialogHeader>
          
          {employeeToCancel && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">พนักงาน:</span>
                  <span className="font-semibold">{employeeToCancel.employee_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">รหัส:</span>
                  <Badge variant="outline">{employeeToCancel.employee_code}</Badge>
                </div>
                {otApprovedMap.get(employeeToCancel.employee_id) && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">OT ที่อนุมัติ:</span>
                    <Badge className="bg-green-500">
                      {otApprovedMap.get(employeeToCancel.employee_id)?.estimated_hours} ชม.
                    </Badge>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cancel-reason">เหตุผลที่ยกเลิก (ไม่บังคับ)</Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="เช่น งานเสร็จเร็วกว่าที่คาด, เปลี่ยนแผน..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm">
                <p className="text-orange-800">
                  ⚠️ หลังยกเลิก พนักงานจะต้อง checkout ตามเวลาปกติ
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelOTDialogOpen(false)} disabled={cancelOTMutation.isPending}>
              ยกเลิก
            </Button>
            <Button 
              onClick={handleConfirmCancelOT} 
              disabled={cancelOTMutation.isPending}
              variant="destructive"
            >
              {cancelOTMutation.isPending ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิก OT'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
