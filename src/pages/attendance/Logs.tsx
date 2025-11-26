import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AttendanceLogFilters from '@/components/attendance/AttendanceLogFilters';
import AttendanceLogDetail from '@/components/attendance/AttendanceLogDetail';
import AttendanceLogExport from '@/components/attendance/AttendanceLogExport';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { CheckCircle2, XCircle, AlertTriangle, MapPin, Camera, RefreshCw, Clock } from 'lucide-react';

export default function AttendanceLogs() {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [employeeId, setEmployeeId] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');
  const [eventType, setEventType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Fetch employees for filter
  const { data: employees } = useQuery({
    queryKey: ['employees-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, code, full_name')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch branches for filter (exclude deleted)
  const { data: branches } = useQuery({
    queryKey: ['branches-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Build query with filters
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['attendance-logs', dateFrom, dateTo, employeeId, branchId, eventType, status, page],
    queryFn: async () => {
      const dateFromStr = dateFrom ? format(dateFrom, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      const dateToStr = dateTo ? format(dateTo, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      
      let query = supabase
        .from('attendance_logs')
        .select(`
          *,
          employees!attendance_logs_employee_id_fkey (
            id, code, full_name
          ),
          branch:branches!attendance_logs_branch_id_fkey (
            id, name
          )
        `, { count: 'exact' })
        .gte('server_time', `${dateFromStr}T00:00:00`)
        .lte('server_time', `${dateToStr}T23:59:59`)
        .order('server_time', { ascending: false });

      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      if (eventType) {
        query = query.eq('event_type', eventType);
      }

      if (status === 'flagged') {
        query = query.eq('is_flagged', true);
      } else if (status === 'normal') {
        query = query.eq('is_flagged', false);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      return { logs: data, count };
    },
  });

  const totalPages = Math.ceil((logs?.count || 0) / pageSize);

  const handleReset = () => {
    setDateFrom(new Date());
    setDateTo(new Date());
    setEmployeeId('');
    setBranchId('');
    setEventType('');
    setStatus('');
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Attendance Logs</h1>
          <p className="text-muted-foreground mt-1">
            ประวัติการเข้า-ออกงานทั้งหมด
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <AttendanceLogExport 
            logs={logs?.logs || []}
            filters={{
              dateFrom,
              dateTo,
              employeeId,
              branchId,
              eventType,
              status
            }}
          />
        </div>
      </div>

      {/* Filters */}
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

      {/* Results Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              แสดง {logs?.logs?.length || 0} รายการ จากทั้งหมด {logs?.count || 0} รายการ
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <div className="grid gap-4">
        {logs?.logs?.map((log) => {
          const employee = log.employees;
          const branch = log.branch;
          const isCheckIn = log.event_type === 'check_in';

          return (
            <Card 
              key={log.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                log.is_flagged ? 'border-orange-500/50 bg-orange-50/5' : ''
              }`}
              onClick={() => setSelectedLog(log)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    {/* Header Row */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {isCheckIn ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-lg">
                          {employee?.full_name || 'Unknown'} ({employee?.code || 'N/A'})
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {branch?.name || 'No Branch'}
                        </div>
                      </div>
                      <Badge variant={isCheckIn ? 'default' : 'secondary'}>
                        {isCheckIn ? 'CHECK IN' : 'CHECK OUT'}
                      </Badge>
                    </div>

                    {/* Details Row */}
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span>{formatInTimeZone(new Date(log.server_time), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss')}</span>
                      </div>
                      {log.latitude && log.longitude && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {log.latitude.toFixed(6)}, {log.longitude.toFixed(6)}
                          </span>
                        </div>
                      )}
                      {log.photo_url && (
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">มีรูปภาพ</span>
                        </div>
                      )}
                      {log.source && (
                        <Badge variant="outline" className="text-xs">
                          {log.source}
                        </Badge>
                      )}
                    </div>

                    {/* Flags & Warnings */}
                    {log.is_flagged && (
                      <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-950/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
                        <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-orange-800 dark:text-orange-200">
                            Flagged for Review
                          </div>
                          <div className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                            {log.flag_reason || 'Reason not specified'}
                          </div>
                          {log.fraud_score && log.fraud_score > 0 && (
                            <Badge variant="destructive" className="mt-2 text-xs">
                              Fraud Score: {log.fraud_score}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {logs?.logs?.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No attendance logs found for selected filters</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-4">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {selectedLog && (
        <AttendanceLogDetail
          log={selectedLog}
          open={!!selectedLog}
          onOpenChange={(open) => !open && setSelectedLog(null)}
        />
      )}
    </div>
  );
}
