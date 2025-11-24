import { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle, Calendar, Clock, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function EmployeeHistory() {
  const [searchParams] = useSearchParams();
  const { id: employeeId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const tokenId = searchParams.get('token');
    
    const fetchHistory = async () => {
      try {
        // Token-based access (from LINE notifications)
        if (tokenId) {
          const { data: result, error: err } = await supabase.functions.invoke(
            'attendance-employee-history',
            {
              body: { tokenId },
            }
          );

          if (err) throw err;
          if (!result.valid) {
            setError(result.error || 'Invalid token');
            return;
          }

          setData(result);
        } 
        // ID-based access (from admin dashboard)
        else if (employeeId) {
          // Fetch employee data
          const { data: employee, error: empErr } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .single();

          if (empErr) throw empErr;

          // Fetch attendance logs from last 30 days
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const { data: logs, error: logsErr } = await supabase
            .from('attendance_logs')
            .select('*, branch:branches(name)')
            .eq('employee_id', employeeId)
            .gte('server_time', thirtyDaysAgo.toISOString())
            .order('server_time', { ascending: false });

          if (logsErr) throw logsErr;

          // Calculate statistics
          const checkIns = logs.filter(l => l.event_type === 'check_in');
          const uniqueDays = new Set(checkIns.map(l => l.server_time.split('T')[0])).size;
          const lateCount = checkIns.filter(l => l.is_flagged).length;
          
          const avgTime = checkIns.length > 0
            ? checkIns.reduce((sum, log) => {
                const time = new Date(log.server_time);
                return sum + time.getHours() * 60 + time.getMinutes();
              }, 0) / checkIns.length
            : 0;
          
          const avgHours = Math.floor(avgTime / 60);
          const avgMinutes = Math.floor(avgTime % 60);

          setData({
            employee,
            logs,
            statistics: {
              totalDays: uniqueDays,
              totalCheckIns: checkIns.length,
              lateCount,
              averageCheckInTime: `${String(avgHours).padStart(2, '0')}:${String(avgMinutes).padStart(2, '0')}`
            }
          });
        } else {
          setError('Invalid access link');
        }
      } catch (err: any) {
        console.error('Error fetching history:', err);
        setError(err.message || 'Failed to load attendance history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [searchParams, employeeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) return null;

  const { employee, logs, statistics } = data;

  return (
    <div className="container mx-auto py-4 sm:py-8 px-4 max-w-4xl space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold">Attendance History</h1>
        <p className="text-base sm:text-lg text-muted-foreground">{employee.full_name}</p>
        <p className="text-xs sm:text-sm text-muted-foreground">Employee Code: {employee.code}</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:pt-6 sm:pb-3 sm:px-6">
            <div className="text-center space-y-1 sm:space-y-2">
              <Calendar className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-primary" />
              <div className="text-xl sm:text-2xl font-bold">{statistics.totalDays}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Days Worked</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
              <div className="text-2xl font-bold">{statistics.totalCheckIns}</div>
              <p className="text-xs text-muted-foreground">Check-ins</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <AlertTriangle className="h-8 w-8 mx-auto text-yellow-500" />
              <div className="text-2xl font-bold">{statistics.lateCount}</div>
              <p className="text-xs text-muted-foreground">Late Arrivals</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <Clock className="h-8 w-8 mx-auto text-blue-500" />
              <div className="text-2xl font-bold">{statistics.averageCheckInTime}</div>
              <p className="text-xs text-muted-foreground">Avg Check-in</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recent Activity (Last 30 Days)
          </CardTitle>
          <CardDescription>
            Your attendance check-in and check-out records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {logs.map((log: any) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={log.event_type === 'check_in' ? 'default' : 'secondary'}>
                      {log.event_type === 'check_in' ? 'Check In' : 'Check Out'}
                    </Badge>
                    {log.is_flagged && (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Flagged
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {log.branch?.name || 'No branch'}
                  </p>
                  {log.is_flagged && log.flag_reason && (
                    <p className="text-xs text-destructive mt-1">{log.flag_reason}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-medium">{format(new Date(log.server_time), 'MMM dd, yyyy')}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(log.server_time), 'HH:mm:ss')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Footer Note */}
      <Alert>
        <AlertDescription className="text-center">
          This link is for one-time viewing only. Please save or screenshot this information if needed.
        </AlertDescription>
      </Alert>
    </div>
  );
}
