import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  ArrowLeft, 
  User, 
  Briefcase, 
  MapPin, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: employee, isLoading: employeeLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(`
          *,
          branch:branches(id, name, address)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    }
  });

  const { data: lineUser } = useQuery({
    queryKey: ['line-user', employee?.line_user_id],
    queryFn: async () => {
      if (!employee?.line_user_id) return null;
      const { data, error } = await supabase
        .from('users')
        .select('id, display_name, line_user_id, avatar_url')
        .eq('line_user_id', employee.line_user_id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.line_user_id
  });

  const { data: attendanceLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['employee-attendance-logs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*, branch:branches(name)')
        .eq('employee_id', id)
        .order('server_time', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    }
  });

  const { data: stats } = useQuery({
    queryKey: ['employee-stats', id],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentLogs, error } = await supabase
        .from('attendance_logs')
        .select('event_type, server_time, is_flagged')
        .eq('employee_id', id)
        .gte('server_time', thirtyDaysAgo.toISOString());
      
      if (error) throw error;

      const checkIns = recentLogs.filter(l => l.event_type === 'check_in').length;
      const checkOuts = recentLogs.filter(l => l.event_type === 'check_out').length;
      const flaggedCount = recentLogs.filter(l => l.is_flagged).length;
      const totalDays = recentLogs.filter(l => l.event_type === 'check_in').length;

      return {
        checkIns,
        checkOuts,
        flaggedCount,
        totalDays,
        attendanceRate: totalDays > 0 ? ((totalDays / 30) * 100).toFixed(1) : '0'
      };
    }
  });

  if (employeeLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Employee Not Found</h3>
              <p className="text-muted-foreground mb-4">The employee you're looking for doesn't exist.</p>
              <Button onClick={() => navigate('/attendance/employees')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Employees
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/attendance/employees')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Employee Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-8 w-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">{employee.full_name}</CardTitle>
                <CardDescription className="text-base mt-1">
                  Employee Code: {employee.code}
                </CardDescription>
              </div>
            </div>
            <Badge variant={employee.is_active ? 'default' : 'secondary'} className="text-sm">
              {employee.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Role</p>
                <p className="font-medium capitalize">{employee.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Branch</p>
                <p className="font-medium">{employee.branch?.name || 'Not Assigned'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">LINE Account</p>
                <p className="font-medium">
                  {lineUser ? lineUser.display_name : 'Not Linked'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Joined Date</p>
                <p className="font-medium">
                  {format(new Date(employee.created_at), 'MMM dd, yyyy')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Check-ins (30d)</p>
                <p className="text-2xl font-bold">{stats?.checkIns || 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Check-outs (30d)</p>
                <p className="text-2xl font-bold">{stats?.checkOuts || 0}</p>
              </div>
              <XCircle className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Flagged Events</p>
                <p className="text-2xl font-bold">{stats?.flaggedCount || 0}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Attendance Rate</p>
                <p className="text-2xl font-bold">{stats?.attendanceRate || 0}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance History */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance History</CardTitle>
          <CardDescription>Recent check-in and check-out records</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : attendanceLogs && attendanceLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {format(new Date(log.server_time), 'MMM dd, yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(log.server_time), 'HH:mm:ss')}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.event_type === 'check_in' ? 'default' : 'secondary'}>
                        {log.event_type === 'check_in' ? 'Check In' : 'Check Out'}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.branch?.name || '-'}</TableCell>
                    <TableCell className="capitalize">{log.source || 'webapp'}</TableCell>
                    <TableCell>
                      {log.is_flagged ? (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Flagged
                        </Badge>
                      ) : (
                        <Badge variant="outline">Normal</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No attendance records found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
