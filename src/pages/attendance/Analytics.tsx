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
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Attendance Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Insights and trends from attendance data
          </p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]">
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Check-Ins</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCheckIns}</div>
            <p className="text-xs text-muted-foreground">
              {totalCheckOuts} check-outs recorded
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueEmployees}</div>
            <p className="text-xs text-muted-foreground">
              Unique employees tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged Events</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{flaggedCount}</div>
            <p className="text-xs text-muted-foreground">
              {totalCheckIns > 0 ? Math.round((flaggedCount / totalCheckIns) * 100) : 0}% of total check-ins
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Daily Check-Ins</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dailyTrend ? Math.round(totalCheckIns / dailyTrend.length) : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Per day average
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="hours">Peak Hours</TabsTrigger>
          <TabsTrigger value="late">Late Patterns</TabsTrigger>
          <TabsTrigger value="branches">Branch Comparison</TabsTrigger>
        </TabsList>

        {/* Daily Trends */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Attendance Trend</CardTitle>
              <CardDescription>
                Check-ins and check-outs over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
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
            <CardHeader>
              <CardTitle>Peak Check-In Hours</CardTitle>
              <CardDescription>
                Distribution of check-ins throughout the day
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={peakHours}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" className="text-xs" />
                  <YAxis className="text-xs" />
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
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Late Arrivals by Branch</CardTitle>
                <CardDescription>
                  Percentage of late check-ins per branch
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
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
              <CardHeader>
                <CardTitle>Flagged Reasons</CardTitle>
                <CardDescription>
                  Distribution of attendance flags
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
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
            <CardHeader>
              <CardTitle>Late Arrival Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {lateByBranch?.map((branch, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{branch.branch}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-muted-foreground">
                        {branch.late} / {branch.total} late
                      </div>
                      <div className="w-32 bg-muted rounded-full h-2">
                        <div 
                          className="bg-destructive h-2 rounded-full transition-all"
                          style={{ width: `${branch.latePercentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">
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
            <CardHeader>
              <CardTitle>Branch Performance Comparison</CardTitle>
              <CardDescription>
                Check-ins and flagged events by branch
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={branchComparison}>
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
                  <Legend />
                  <Bar dataKey="checkIns" fill="hsl(var(--chart-1))" name="Check-Ins" />
                  <Bar dataKey="flagged" fill="hsl(var(--destructive))" name="Flagged" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {branchComparison?.map((branch, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="text-base">{branch.branch}</CardTitle>
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
