import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, AlertTriangle, Eye } from 'lucide-react';
import { format } from 'date-fns';
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
        .select('*, employee:employees(full_name), branch:branches(name)', { count: 'exact' })
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

  if (isLoading && !logs) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalPages = logs?.count ? Math.ceil(logs.count / pageSize) : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Attendance Logs</h1>
          <p className="text-muted-foreground">View and filter attendance records</p>
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Logs ({logs?.count || 0} records)
          </CardTitle>
          <CardDescription>
            Recent attendance check-ins and check-outs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.data?.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.employee?.full_name}</TableCell>
                  <TableCell>
                    <Badge variant={log.event_type === 'check_in' ? 'default' : 'secondary'}>
                      {log.event_type === 'check_in' ? 'Check In' : 'Check Out'}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.branch?.name || '-'}</TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(log.server_time), 'MMM dd, HH:mm')}
                  </TableCell>
                  <TableCell className="capitalize">{log.source}</TableCell>
                  <TableCell>
                    {log.is_flagged ? (
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                        <AlertTriangle className="h-3 w-3" />
                        Flagged
                      </Badge>
                    ) : (
                      <Badge variant="outline">OK</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewDetail(log)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
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
