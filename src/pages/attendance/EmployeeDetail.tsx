import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import LocationHeatmap from '@/components/attendance/LocationHeatmap';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from 'recharts';

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
          branch:branches!branch_id(id, name, address)
        `)
        .eq('id', id)
        .maybeSingle();
      
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
        .maybeSingle();
      
      if (error) throw error;
      return data; // Returns null if not found
    },
    enabled: !!employee?.line_user_id
  });

  const { data: attendanceLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['employee-attendance-logs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*, branch:branches!branch_id(name)')
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

  const { data: chartData } = useQuery({
    queryKey: ['employee-chart-data', id],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      const { data: logs, error } = await supabase
        .from('attendance_logs')
        .select('event_type, server_time, is_flagged')
        .eq('employee_id', id)
        .gte('server_time', thirtyDaysAgo.toISOString())
        .order('server_time', { ascending: true });
      
      if (error) throw error;

      // Create daily data for the last 30 days
      const days = eachDayOfInterval({
        start: thirtyDaysAgo,
        end: new Date()
      });

      const dailyData = days.map(day => {
        const dayStart = startOfDay(day);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const dayLogs = logs.filter(log => {
          const logDate = new Date(log.server_time);
          return logDate >= dayStart && logDate <= dayEnd;
        });

        const checkIns = dayLogs.filter(l => l.event_type === 'check_in').length;
        const checkOuts = dayLogs.filter(l => l.event_type === 'check_out').length;
        const flagged = dayLogs.filter(l => l.is_flagged).length;

        return {
          date: format(day, 'MMM dd'),
          fullDate: format(day, 'yyyy-MM-dd'),
          checkIns,
          checkOuts,
          flagged,
          total: dayLogs.length,
          attended: checkIns > 0 ? 1 : 0
        };
      });

      // Calculate weekly attendance rate
      const weeklyData: { week: string; rate: number; days: number }[] = [];
      for (let i = 0; i < dailyData.length; i += 7) {
        const weekSlice = dailyData.slice(i, i + 7);
        const attended = weekSlice.filter(d => d.attended > 0).length;
        const rate = (attended / weekSlice.length) * 100;
        weeklyData.push({
          week: `Week ${Math.floor(i / 7) + 1}`,
          rate: Math.round(rate),
          days: attended
        });
      }

      return { dailyData, weeklyData };
    }
  });

  // Fetch location data for heatmap (last 90 days)
  const { data: locationData } = useQuery({
    queryKey: ['employee-locations', id],
    queryFn: async () => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data, error } = await supabase
        .from('attendance_logs')
        .select(`
          latitude,
          longitude,
          server_time,
          event_type,
          is_remote_checkin,
          branch:branches!branch_id(name)
        `)
        .eq('employee_id', id)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .gte('server_time', ninetyDaysAgo.toISOString())
        .order('server_time', { ascending: false });

      if (error) throw error;
      
      return data.map(log => ({
        latitude: log.latitude!,
        longitude: log.longitude!,
        timestamp: log.server_time,
        eventType: log.event_type,
        branchName: log.branch?.name,
        isRemote: log.is_remote_checkin || false
      }));
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
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/attendance/employees')}>
          <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
          <span className="text-xs sm:text-sm">Back</span>
        </Button>
      </div>

      {/* Employee Info Card */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-2xl">{employee.full_name}</CardTitle>
                <CardDescription className="text-xs sm:text-base mt-1">
                  Employee Code: {employee.code}
                </CardDescription>
              </div>
            </div>
            <Badge variant={employee.is_active ? 'default' : 'secondary'} className="h-5 sm:h-6 text-xs sm:text-sm">
              {employee.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:pt-6 sm:pb-3 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Check-ins (30d)</p>
                <p className="text-xl sm:text-2xl font-bold">{stats?.checkIns || 0}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />
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

      {/* Location Heatmap */}
      {locationData && locationData.length > 0 && (
        <LocationHeatmap
          employeeId={id!}
          employeeName={employee.full_name}
          locations={locationData}
        />
      )}

      {/* Charts */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
            Attendance Analytics
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Visual representation of attendance patterns over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="daily" className="text-xs sm:text-sm px-2 sm:px-3">Daily</TabsTrigger>
              <TabsTrigger value="comparison" className="text-xs sm:text-sm px-2 sm:px-3">Compare</TabsTrigger>
              <TabsTrigger value="weekly" className="text-xs sm:text-sm px-2 sm:px-3">Weekly</TabsTrigger>
            </TabsList>
            
            <TabsContent value="daily" className="space-y-4">
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData?.dailyData || []}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="total" 
                      stroke="hsl(var(--primary))" 
                      fillOpacity={1} 
                      fill="url(#colorTotal)"
                      name="Total Events"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="comparison" className="space-y-4">
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData?.dailyData || []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="checkIns" fill="hsl(142 76% 36%)" name="Check-ins" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="checkOuts" fill="hsl(217 91% 60%)" name="Check-outs" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="flagged" fill="hsl(25 95% 53%)" name="Flagged" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="weekly" className="space-y-4">
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData?.weeklyData || []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="week" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      domain={[0, 100]}
                      label={{ value: 'Attendance Rate (%)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="rate" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3}
                      dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Attendance Rate (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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
