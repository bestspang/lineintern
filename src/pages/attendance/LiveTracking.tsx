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
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Clock, Users, TrendingUp, Calendar, LogOut } from 'lucide-react';
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
}

export default function LiveTracking() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<CheckedInEmployee | null>(null);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { isAdmin } = useAdminRole();

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Fetch approved OT requests for today
  const { data: approvedOTRequests } = useQuery({
    queryKey: ['approved-ot-requests-today'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('overtime_requests')
        .select('employee_id, estimated_hours, reason')
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
            branch:branches (
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
                .map((employee) => (
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
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end gap-2">
                        {getStatusBadge(employee.time_until_checkout, employee.employee_id)}
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
                      </div>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCheckoutClick(employee)}
                          disabled={adminCheckout.isPending}
                        >
                          <LogOut className="h-4 w-4 mr-1" />
                          Check Out
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
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
    </div>
  );
}