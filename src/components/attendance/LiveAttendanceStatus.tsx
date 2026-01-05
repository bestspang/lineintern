import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, Clock, UserCheck, UserX, Building2, Loader2 } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';

interface EmployeeStatus {
  employee_id: string;
  employee: {
    full_name: string;
    code: string;
    branch_id: string;
  };
  branch: {
    name: string;
  } | null;
  currentStatus: 'working' | 'off' | null;
  checkIns: any[];
  checkOuts: any[];
  totalMinutes: number;
  lastCheckIn?: string;
  lastCheckOut?: string;
}

export default function LiveAttendanceStatus() {
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const { data: todayStatus, isLoading, refetch } = useQuery({
    queryKey: ['live-attendance-status'],
    queryFn: async () => {
      // Get today's date in Bangkok timezone
      const todayBangkok = formatInTimeZone(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');

      // Fetch all employees
      const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('id, full_name, code, branch_id, branches!branch_id(name)')
        .eq('is_active', true)
        .order('full_name');

      if (empError) throw empError;

      // Fetch today's work sessions (using work_date which is already in Bangkok timezone)
      const { data: sessions, error: sessionsError } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('work_date', todayBangkok)
        .order('actual_start_time', { ascending: true });

      if (sessionsError) throw sessionsError;

      // Fallback: Fetch today's attendance_logs for employees without work_sessions
      const todayStart = `${todayBangkok}T00:00:00+07:00`;
      const todayEnd = `${todayBangkok}T23:59:59+07:00`;
      
      const { data: attendanceLogs, error: logsError } = await supabase
        .from('attendance_logs')
        .select('*')
        .gte('server_time', todayStart)
        .lte('server_time', todayEnd)
        .order('server_time', { ascending: true });

      if (logsError) console.error('Attendance logs fetch error:', logsError);

      // Calculate status for each employee
      const employeeStatusMap: Record<string, EmployeeStatus> = {};

      employees?.forEach(emp => {
        employeeStatusMap[emp.id] = {
          employee_id: emp.id,
          employee: {
            full_name: emp.full_name,
            code: emp.code,
            branch_id: emp.branch_id
          },
          branch: emp.branches as any,
          currentStatus: null,
          checkIns: [],
          checkOuts: [],
          totalMinutes: 0
        };
      });

      // Process work sessions
      sessions?.forEach(session => {
        if (!employeeStatusMap[session.employee_id]) return;

        const emp = employeeStatusMap[session.employee_id];
        
        // Set check-in/out times
        emp.lastCheckIn = session.actual_start_time;
        emp.lastCheckOut = session.actual_end_time;
        
        // Set current status based on session status
        if (session.status === 'active') {
          emp.currentStatus = 'working';
        } else if (session.status === 'closed' || session.status === 'auto_closed') {
          emp.currentStatus = 'off';
        }
        
        // Use net_work_minutes from work_sessions (already calculated)
        emp.totalMinutes = session.net_work_minutes || 0;
      });

      // Fallback: Process attendance_logs for employees without work_sessions
      attendanceLogs?.forEach(log => {
        if (!employeeStatusMap[log.employee_id]) return;
        
        const emp = employeeStatusMap[log.employee_id];
        
        // Only process if no work_session data exists for this employee
        if (emp.currentStatus !== null) return;
        
        if (log.event_type === 'check_in') {
          emp.lastCheckIn = log.server_time;
          emp.currentStatus = 'working';
        } else if (log.event_type === 'check_out') {
          emp.lastCheckOut = log.server_time;
          emp.currentStatus = 'off';
          
          // Calculate hours from check-in to check-out
          if (emp.lastCheckIn) {
            const checkInTime = new Date(emp.lastCheckIn).getTime();
            const checkOutTime = new Date(log.server_time).getTime();
            emp.totalMinutes = Math.floor((checkOutTime - checkInTime) / (1000 * 60));
          }
        }
      });

      return Object.values(employeeStatusMap);
    },
    refetchInterval: 30000 // Auto-refresh every 30 seconds
  });

  // Real-time subscription for work_sessions
  useEffect(() => {
    const channel = supabase
      .channel('live-attendance-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE for work_sessions
          schema: 'public',
          table: 'work_sessions',
        },
        () => {
          refetch();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const workingCount = todayStatus?.filter(e => e.currentStatus === 'working').length || 0;
  const checkedOutCount = todayStatus?.filter(e => e.currentStatus === 'off').length || 0;
  const notArrivedCount = todayStatus?.filter(e => e.currentStatus === null).length || 0;
  const totalHoursToday = (todayStatus?.reduce((sum, e) => sum + e.totalMinutes, 0) || 0) / 60;

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Currently Working</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-green-600">
              {workingCount}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Active now
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Checked Out</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-blue-600">
              {checkedOutCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Finished work
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-gray-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Not Arrived</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-muted-foreground">
              {notArrivedCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Not yet checked in
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Hours Today</CardTitle>
            <Activity className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-purple-600">
              {totalHoursToday.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Hours worked
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live Status Table */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg">Employee Status</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Real-time attendance tracking • Last updated: {formatInTimeZone(lastUpdate, 'Asia/Bangkok', 'HH:mm:ss')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Employee</TableHead>
                  <TableHead className="min-w-[120px]">Status</TableHead>
                  <TableHead className="min-w-[100px]">Check-In</TableHead>
                  <TableHead className="min-w-[100px]">Check-Out</TableHead>
                  <TableHead className="min-w-[120px]">Hours Worked</TableHead>
                  <TableHead className="min-w-[120px]">Branch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todayStatus
                  ?.sort((a, b) => {
                    // Sort: working first, then off, then not arrived
                    const statusOrder = { working: 0, off: 1, null: 2 };
                    const aOrder = statusOrder[a.currentStatus as keyof typeof statusOrder];
                    const bOrder = statusOrder[b.currentStatus as keyof typeof statusOrder];
                    if (aOrder !== bOrder) return aOrder - bOrder;
                    return a.employee.full_name.localeCompare(b.employee.full_name);
                  })
                  .map(emp => (
                    <TableRow key={emp.employee_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {emp.employee.full_name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">{emp.employee.full_name}</div>
                            <div className="text-xs text-muted-foreground">{emp.employee.code}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {emp.currentStatus === 'working' && (
                          <Badge className="bg-green-600 hover:bg-green-700">
                            <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse mr-1"></span>
                            Working
                          </Badge>
                        )}
                        {emp.currentStatus === 'off' && (
                          <Badge variant="secondary">
                            Checked Out
                          </Badge>
                        )}
                        {emp.currentStatus === null && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Not Arrived
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {emp.lastCheckIn ? (
                          <div className="text-sm">
                            {formatInTimeZone(new Date(emp.lastCheckIn), 'Asia/Bangkok', 'HH:mm')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {emp.lastCheckOut ? (
                          <div className="text-sm">
                            {formatInTimeZone(new Date(emp.lastCheckOut), 'Asia/Bangkok', 'HH:mm')}
                          </div>
                        ) : emp.currentStatus === 'working' ? (
                          <Badge variant="outline" className="text-xs">
                            In Progress
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="font-medium text-sm">
                            {(emp.totalMinutes / 60).toFixed(2)} hrs
                          </div>
                          {emp.currentStatus === 'working' && (
                            <div className="text-xs text-muted-foreground">
                              (counting...)
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {emp.branch?.name || '-'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
