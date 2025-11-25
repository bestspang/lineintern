import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, FileText, AlertTriangle, Eye, Clock } from 'lucide-react';
import { format, differenceInHours, differenceInMinutes } from 'date-fns';
import AttendanceLogFilters from '@/components/attendance/AttendanceLogFilters';
import AttendanceLogDetail from '@/components/attendance/AttendanceLogDetail';
import AttendanceLogExport from '@/components/attendance/AttendanceLogExport';

export default function AttendanceLogs() {
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [employeeId, setEmployeeId] = useState('all');
  const [branchId, setBranchId] = useState('all');
  const [eventType, setEventType] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Fetch employees for filter
  const { data: employees } = useQuery({
    queryKey: ['employees-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch branches for filter
  const { data: branches } = useQuery({
    queryKey: ['branches-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Build query with filters
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['attendance-logs', dateFrom, dateTo, employeeId, branchId, eventType, status, page],
    queryFn: async () => {
      let query = supabase
        .from('attendance_logs')
        .select(`
          *,
          employee:employees(full_name),
          branch:branches(name),
          work_session:work_sessions!checkout_log_id(actual_start_time)
        `, { count: 'exact' })
        .order('server_time', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (dateFrom) {
        query = query.gte('server_time', dateFrom.toISOString());
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('server_time', endOfDay.toISOString());
      }
      if (employeeId !== 'all') {
        query = query.eq('employee_id', employeeId);
      }
      if (branchId !== 'all') {
        query = query.eq('branch_id', branchId);
      }
      if (eventType !== 'all') {
        query = query.eq('event_type', eventType);
      }
      if (status === 'flagged') {
        query = query.eq('is_flagged', true);
      } else if (status === 'normal') {
        query = query.eq('is_flagged', false);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data, count };
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('attendance-logs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_logs',
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const handleReset = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setEmployeeId('all');
    setBranchId('all');
    setEventType('all');
    setStatus('all');
    setPage(0);
  };

  const handleViewDetail = (log: any) => {
    setSelectedLog(log);
    setDetailOpen(true);
  };

  const formatTimeWithRelative = (log: any) => {
    const serverTime = new Date(log.server_time);
    const isCheckout = log.event_type === 'check_out';
    const workSession = log.work_session?.[0];
    
    // Check if checkout is next day (early morning 00:00-06:00)
    const isNextDay = isCheckout && serverTime.getHours() >= 0 && serverTime.getHours() < 6;
    
    // Calculate relative time for checkout
    let relativeTime = '';
    if (isCheckout && workSession?.actual_start_time) {
      const startTime = new Date(workSession.actual_start_time);
      const hours = differenceInHours(serverTime, startTime);
      const minutes = differenceInMinutes(serverTime, startTime) % 60;
      
      if (hours > 0) {
        relativeTime = `${hours}h ${minutes}m after check-in`;
      } else {
        relativeTime = `${minutes}m after check-in`;
      }
    }
    
    return {
      display: format(serverTime, 'MMM dd, HH:mm'),
      full: format(serverTime, 'yyyy-MM-dd HH:mm:ss zzz'),
      isNextDay,
      relativeTime
    };
  };

  if (isLoading && !logs) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalPages = logs?.count ? Math.ceil(logs.count / pageSize) : 0;

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Attendance Logs</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">View and filter attendance records</p>
        </div>
        <AttendanceLogExport 
          logs={logs?.data || []} 
          filters={{ dateFrom, dateTo, employeeId, branchId, eventType, status }}
        />
      </div>

      <AttendanceLogFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        employeeId={employeeId}
        branchId={branchId}
        eventType={eventType}
        status={status}
        employees={employees || []}
        branches={branches || []}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onEmployeeChange={setEmployeeId}
        onBranchChange={setBranchId}
        onEventTypeChange={setEventType}
        onStatusChange={setStatus}
        onReset={handleReset}
      />

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            Logs ({logs?.count || 0})
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Recent attendance check-ins and check-outs
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px] text-xs sm:text-sm py-2">Employee</TableHead>
                  <TableHead className="text-xs sm:text-sm py-2">Event</TableHead>
                  <TableHead className="hidden sm:table-cell text-xs sm:text-sm py-2">Branch</TableHead>
                  <TableHead className="text-xs sm:text-sm py-2">Time</TableHead>
                  <TableHead className="hidden md:table-cell text-xs sm:text-sm py-2">Source</TableHead>
                  <TableHead className="text-xs sm:text-sm py-2">Status</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm py-2">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs?.data?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium text-sm py-2">{log.employee?.full_name}</TableCell>
                    <TableCell className="py-2">
                      <div className="flex gap-1">
                        <Badge variant={log.event_type === 'check_in' ? 'default' : 'secondary'} className="h-4 sm:h-5 text-[10px] sm:text-xs">
                          {log.event_type === 'check_in' ? 'In' : 'Out'}
                        </Badge>
                        {log.is_remote_checkin && (
                          <Badge variant="outline" className="h-4 sm:h-5 text-[10px] sm:text-xs">
                            🌐
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm py-2">{log.branch?.name || '-'}</TableCell>
                    <TableCell className="text-xs sm:text-sm py-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1 whitespace-nowrap">
                                {formatTimeWithRelative(log).display}
                                {formatTimeWithRelative(log).isNextDay && (
                                  <Badge variant="secondary" className="h-4 text-[9px] px-1">
                                    Day +1
                                  </Badge>
                                )}
                              </div>
                              {formatTimeWithRelative(log).relativeTime && (
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  {formatTimeWithRelative(log).relativeTime}
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{formatTimeWithRelative(log).full}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="hidden md:table-cell capitalize text-sm py-2">{log.source}</TableCell>
                    <TableCell className="py-2">
                      {log.is_flagged ? (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit h-4 sm:h-5 text-[10px] sm:text-xs">
                          <AlertTriangle className="h-2 w-2 sm:h-3 sm:w-3" />
                          Flag
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-4 sm:h-5 text-[10px] sm:text-xs">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 sm:h-8 sm:w-8"
                        onClick={() => handleViewDetail(log)}
                      >
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-4 px-4 sm:px-0">
              <div className="text-xs sm:text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="flex-1 sm:flex-none text-xs sm:text-sm"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                  className="flex-1 sm:flex-none text-xs sm:text-sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AttendanceLogDetail
        log={selectedLog}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
