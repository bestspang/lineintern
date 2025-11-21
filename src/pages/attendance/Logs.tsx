import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default function AttendanceLogs() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['attendance-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*, employee:employees(full_name), branch:branches(name)')
        .order('server_time', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Attendance Logs
          </CardTitle>
          <CardDescription>
            View recent attendance check-ins and check-outs
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map((log) => (
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
