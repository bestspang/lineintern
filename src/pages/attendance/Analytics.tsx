import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, Clock, AlertTriangle, Users, Building2, BarChart3 } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function AttendanceAnalytics() {
  const [dateRange, setDateRange] = useState('7');

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, standard_start_time');
      if (error) throw error;
      return data;
    }
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['attendance-analytics', dateRange],
    queryFn: async () => {
      const days = parseInt(dateRange);
      const fromDate = startOfDay(subDays(new Date(), days));
      
      const { data, error } = await supabase
        .from('attendance_logs')
        .select(`
          *,
          employee:employees(full_name, branch_id),
          branch:branches(name, standard_start_time)
        `)
        .gte('server_time', fromDate.toISOString())
        .order('server_time', { ascending: true });
      
      if (error) throw error;
      return data;
    }
  });

  // Calculate metrics
  const totalCheckIns = logs?.filter(l => l.event_type === 'check_in').length || 0;
  const totalCheckOuts = logs?.filter(l => l.event_type === 'check_out').length || 0;
  const flaggedCount = logs?.filter(l => l.is_flagged).length || 0;
  const uniqueEmployees = new Set(logs?.map(l => l.employee_id)).size;

  // Daily trend data
  const dailyTrend = logs?.reduce((acc, log) => {
    const date = format(new Date(log.server_time), 'MMM dd');
    const existing = acc.find(d => d.date === date);
    
    if (existing) {
      if (log.event_type === 'check_in') existing.checkIns++;
      else existing.checkOuts++;
    } else {
      acc.push({
        date,
        checkIns: log.event_type === 'check_in' ? 1 : 0,
        checkOuts: log.event_type === 'check_out' ? 1 : 0
      });
    }
    return acc;
  }, [] as Array<{ date: string; checkIns: number; checkOuts: number }>);

  // Peak hours data (check-ins only)
  const peakHours = logs
    ?.filter(l => l.event_type === 'check_in')
    .reduce((acc, log) => {
      const hour = new Date(log.server_time).getHours();
      const hourLabel = `${hour.toString().padStart(2, '0')}:00`;
      const existing = acc.find(h => h.hour === hourLabel);
      
      if (existing) {
        existing.count++;
      } else {
        acc.push({ hour: hourLabel, count: 1 });
      }
      return acc;
    }, [] as Array<{ hour: string; count: number }>)
    .sort((a, b) => a.hour.localeCompare(b.hour));

  // Late arrivals by branch
  const lateByBranch = logs
    ?.filter(l => l.event_type === 'check_in')
    .reduce((acc, log) => {
      if (!log.branch?.standard_start_time || !log.branch?.name) return acc;
      
      const checkInTime = new Date(log.server_time);
      const [hours, minutes] = log.branch.standard_start_time.split(':');
      const standardTime = new Date(checkInTime);
      standardTime.setHours(parseInt(hours), parseInt(minutes), 0);
      
      const isLate = checkInTime > standardTime;
      const branchName = log.branch.name;
      
      const existing = acc.find(b => b.branch === branchName);
      if (existing) {
        existing.total++;
        if (isLate) existing.late++;
      } else {
        acc.push({
          branch: branchName,
          late: isLate ? 1 : 0,
          total: 1
        });
      }
      return acc;
    }, [] as Array<{ branch: string; late: number; total: number }>)
    .map(b => ({
      ...b,
      latePercentage: Math.round((b.late / b.total) * 100)
    }));

  // Branch comparison
  const branchComparison = logs?.reduce((acc, log) => {
    const branchName = log.branch?.name || 'Unknown';
    const existing = acc.find(b => b.branch === branchName);
    
    if (existing) {
      if (log.event_type === 'check_in') existing.checkIns++;
      if (log.is_flagged) existing.flagged++;
    } else {
      acc.push({
        branch: branchName,
        checkIns: log.event_type === 'check_in' ? 1 : 0,
        flagged: log.is_flagged ? 1 : 0
      });
    }
    return acc;
  }, [] as Array<{ branch: string; checkIns: number; flagged: number }>);

  // Flagged reasons pie chart
  const flaggedReasons = logs
    ?.filter(l => l.is_flagged && l.flag_reason)
    .reduce((acc, log) => {
      const reason = log.flag_reason?.split('/')[0].trim() || 'Other';
      const existing = acc.find(r => r.reason === reason);
      
      if (existing) {
        existing.count++;
      } else {
        acc.push({ reason, count: 1 });
      }
      return acc;
    }, [] as Array<{ reason: string; count: number }>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8" />
            Attendance Analytics
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Insights and trends from attendance data
          </p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-full sm:w-[180px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Check-Ins</CardTitle>
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{totalCheckIns}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {totalCheckOuts} check-outs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Employees</CardTitle>
            <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{uniqueEmployees}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Unique tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Flagged</CardTitle>
            <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-destructive">{flaggedCount}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {totalCheckIns > 0 ? Math.round((flaggedCount / totalCheckIns) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Avg Daily</CardTitle>
            <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">
              {dailyTrend ? Math.round(totalCheckIns / dailyTrend.length) : 0}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Per day
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="trends" className="text-xs sm:text-sm">Trends</TabsTrigger>
          <TabsTrigger value="hours" className="text-xs sm:text-sm hidden sm:inline-flex">Peak Hours</TabsTrigger>
          <TabsTrigger value="late" className="text-xs sm:text-sm">Late</TabsTrigger>
          <TabsTrigger value="branches" className="text-xs sm:text-sm hidden sm:inline-flex">Branches</TabsTrigger>
        </TabsList>

        {/* Daily Trends */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg md:text-xl">Daily Attendance Trend</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Check-ins and check-outs over time
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <ResponsiveContainer width="100%" height={250} className="sm:h-[300px] md:h-[400px]">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" style={{ fontSize: '11px' }} />
                  <YAxis style={{ fontSize: '11px' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="checkIns" 
                    stroke="hsl(var(--chart-1))" 
                    strokeWidth={2}
                    name="Check-Ins"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="checkOuts" 
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2}
                    name="Check-Outs"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Peak Hours */}
        <TabsContent value="hours" className="space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg md:text-xl">Peak Check-In Hours</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Distribution of check-ins throughout the day
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <ResponsiveContainer width="100%" height={250} className="sm:h-[300px] md:h-[400px]">
                <BarChart data={peakHours}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" style={{ fontSize: '11px' }} />
                  <YAxis style={{ fontSize: '11px' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-1))" name="Check-Ins" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Late Patterns */}
        <TabsContent value="late" className="space-y-4">
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Late Arrivals by Branch</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Percentage of late check-ins per branch
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <ResponsiveContainer width="100%" height={200} className="sm:h-[250px] md:h-[300px]">
                  <BarChart data={lateByBranch}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="branch" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                    <Bar dataKey="latePercentage" fill="hsl(var(--destructive))" name="Late %" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Flagged Reasons</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Distribution of attendance flags
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <ResponsiveContainer width="100%" height={200} className="sm:h-[250px] md:h-[300px]">
                  <PieChart>
                    <Pie
                      data={flaggedReasons}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ reason, percent }) => `${reason} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {flaggedReasons?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Late Arrival Details</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="space-y-3 sm:space-y-4">
                {lateByBranch?.map((branch, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                      <Building2 className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{branch.branch}</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 ml-5 sm:ml-0">
                      <div className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                        {branch.late} / {branch.total}
                      </div>
                      <div className="w-20 sm:w-32 bg-muted rounded-full h-2">
                        <div 
                          className="bg-destructive h-2 rounded-full transition-all"
                          style={{ width: `${branch.latePercentage}%` }}
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-medium w-8 sm:w-12 text-right">
                        {branch.latePercentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branch Comparison */}
        <TabsContent value="branches" className="space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg md:text-xl">Branch Performance</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Check-ins and flagged events by branch
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <ResponsiveContainer width="100%" height={250} className="sm:h-[300px] md:h-[400px]">
                <BarChart data={branchComparison}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="branch" style={{ fontSize: '11px' }} />
                  <YAxis style={{ fontSize: '11px' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="checkIns" fill="hsl(var(--chart-1))" name="Check-Ins" />
                  <Bar dataKey="flagged" fill="hsl(var(--destructive))" name="Flagged" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branchComparison?.map((branch, idx) => (
              <Card key={idx}>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-sm sm:text-base">{branch.branch}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Check-Ins</span>
                    <span className="text-lg font-bold">{branch.checkIns}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Flagged</span>
                    <span className="text-lg font-bold text-destructive">{branch.flagged}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Flag Rate</span>
                    <span className="text-sm font-medium">
                      {branch.checkIns > 0 ? Math.round((branch.flagged / branch.checkIns) * 100) : 0}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
