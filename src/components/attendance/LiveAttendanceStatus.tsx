import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, Clock, UserCheck, UserX, Building2, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';

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
      const today = new Date();
      const fromDate = startOfDay(today);
      const toDate = endOfDay(today);

      // Fetch all employees
      const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('id, full_name, code, branch_id, branches(name)')
        .eq('is_active', true)
        .order('full_name');

      if (empError) throw empError;

      // Fetch today's logs
      const { data: logs, error: logsError } = await supabase
        .from('attendance_logs')
        .select('*')
        .gte('server_time', fromDate.toISOString())
        .lte('server_time', toDate.toISOString())
        .order('server_time', { ascending: true });

      if (logsError) throw logsError;

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

      // Process logs
      logs?.forEach(log => {
        if (!employeeStatusMap[log.employee_id]) return;

        const emp = employeeStatusMap[log.employee_id];
        
        if (log.event_type === 'check_in') {
          emp.checkIns.push(log);
          emp.currentStatus = 'working';
          emp.lastCheckIn = log.server_time;
        } else if (log.event_type === 'check_out') {
          emp.checkOuts.push(log);
          emp.currentStatus = 'off';
          emp.lastCheckOut = log.server_time;
        }
      });

      // Calculate total working hours
      Object.values(employeeStatusMap).forEach(emp => {
        let totalMinutes = 0;

        for (let i = 0; i < emp.checkIns.length; i++) {
          const checkIn = new Date(emp.checkIns[i].server_time);
          const checkOut = emp.checkOuts[i] 
            ? new Date(emp.checkOuts[i].server_time)
            : (emp.currentStatus === 'working' ? new Date() : null);

          if (checkOut) {
            totalMinutes += differenceInMinutes(checkOut, checkIn);
          }
        }

        emp.totalMinutes = totalMinutes;
      });

      return Object.values(employeeStatusMap);
    },
    refetchInterval: 30000 // Auto-refresh every 30 seconds
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('live-attendance-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_logs',
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
                Real-time attendance tracking • Last updated: {format(lastUpdate, 'HH:mm:ss')}
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
                            {format(new Date(emp.lastCheckIn), 'HH:mm')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {emp.lastCheckOut ? (
                          <div className="text-sm">
                            {format(new Date(emp.lastCheckOut), 'HH:mm')}
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
