import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, Play, Clock, TrendingUp, Ghost, Users, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";

interface HistoricalAnalysisProps {
  groups: any[];
  selectedGroupId: string;
}

type ViewMode = "day" | "week" | "month";

export function HistoricalAnalysis({ groups, selectedGroupId }: HistoricalAnalysisProps) {
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 21),
    to: new Date(),
  });
  const [analysisGroupId, setAnalysisGroupId] = useState<string>(selectedGroupId);
  const [analysisUserId, setAnalysisUserId] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Fetch users for the selected group
  const { data: users } = useQuery({
    queryKey: ["group-users", analysisGroupId],
    queryFn: async () => {
      if (analysisGroupId === "all") return [];
      
      const { data, error } = await supabase
        .from("group_members")
        .select("users!inner(id, display_name)")
        .eq("group_id", analysisGroupId)
        .is("left_at", null);
      
      if (error) throw error;
      return data?.map((m: any) => m.users) || [];
    },
    enabled: analysisGroupId !== "all",
  });

  // Fetch historical response analytics
  const { data: historicalData, isLoading: loadingHistory } = useQuery({
    queryKey: ["historical-analytics", analysisGroupId, analysisUserId, dateRange],
    queryFn: async () => {
      const startDate = format(dateRange.from, "yyyy-MM-dd");
      const endDate = format(dateRange.to, "yyyy-MM-dd");

      let query = supabase
        .from("response_analytics")
        .select("*, users!inner(display_name)")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (analysisGroupId !== "all") {
        query = query.eq("group_id", analysisGroupId);
      }
      if (analysisUserId !== "all") {
        query = query.eq("user_id", analysisUserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch historical sentiment data
  const { data: sentimentData, isLoading: loadingSentiment } = useQuery({
    queryKey: ["historical-sentiment", analysisGroupId, analysisUserId, dateRange],
    queryFn: async () => {
      const startDate = format(dateRange.from, "yyyy-MM-dd");
      const endDate = format(dateRange.to, "yyyy-MM-dd");

      let query = supabase
        .from("user_sentiment_history")
        .select("*, users!inner(display_name)")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (analysisGroupId !== "all") {
        query = query.eq("group_id", analysisGroupId);
      }
      if (analysisUserId !== "all") {
        query = query.eq("user_id", analysisUserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Run backfill with pagination support
  const runBackfillWithPagination = async (dryRun: boolean) => {
    setIsRunning(true);
    setProgress(5);
    setProgressMessage("Starting backfill...");

    const startDate = format(dateRange.from, "yyyy-MM-dd");
    const endDate = format(dateRange.to, "yyyy-MM-dd");
    
    let cursor: string | null = null;
    let totalUpdates = 0;
    let iteration = 0;
    const maxIterations = 20; // Safety limit
    
    try {
      do {
        iteration++;
        setProgressMessage(`Processing batch ${iteration}...`);
        setProgress(Math.min(10 + (iteration * 4), 90));
        
        const { data, error } = await supabase.functions.invoke("response-analytics-backfill", {
          body: {
            startDate,
            endDate,
            groupId: analysisGroupId === "all" ? undefined : analysisGroupId,
            userId: analysisUserId === "all" ? undefined : analysisUserId,
            dryRun,
            cursor,
            batchSize: 500,
          },
        });

        if (error) throw error;
        
        totalUpdates += data.updatesCount || 0;
        cursor = data.hasMore ? data.nextCursor : null;
        
        setProgressMessage(`Processed ${totalUpdates} updates...`);
        
      } while (cursor && iteration < maxIterations);

      setProgress(100);
      setProgressMessage("Complete!");
      
      if (dryRun) {
        toast.info(`Dry run complete: Would update ${totalUpdates} messages`);
      } else {
        toast.success(`Backfill complete! Updated ${totalUpdates} messages`);
        queryClient.invalidateQueries({ queryKey: ["historical-analytics"] });
        queryClient.invalidateQueries({ queryKey: ["historical-sentiment"] });
        queryClient.invalidateQueries({ queryKey: ["response-analytics"] });
      }
      
    } catch (error: any) {
      toast.error("Backfill failed", { description: error.message });
    } finally {
      setIsRunning(false);
      setTimeout(() => {
        setProgress(0);
        setProgressMessage("");
      }, 2000);
    }
  };

  // Helper function to get period key based on view mode
  const getPeriodKey = (dateStr: string, mode: ViewMode): string => {
    const date = new Date(dateStr);
    if (mode === "day") return dateStr;
    if (mode === "week") {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      return format(weekStart, "yyyy-MM-dd");
    }
    return format(startOfMonth(date), "yyyy-MM-01");
  };

  // Aggregate user stats for the table - now respects viewMode
  const userStats = useMemo(() => {
    if (!historicalData || analysisUserId !== "all" || analysisGroupId === "all") return [];
    
    const userMap = new Map<string, {
      userId: string;
      displayName: string;
      periodData: Map<string, {
        messages: number;
        workHours: number;
        workCount: number;
        outsideHours: number;
        outsideCount: number;
        ghost: number;
        ghostCount: number;
      }>;
    }>();
    
    historicalData.forEach((item: any) => {
      const userId = item.user_id;
      const periodKey = getPeriodKey(item.date, viewMode);
      
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          userId,
          displayName: item.users?.display_name || "Unknown",
          periodData: new Map(),
        });
      }
      
      const user = userMap.get(userId)!;
      
      if (!user.periodData.has(periodKey)) {
        user.periodData.set(periodKey, {
          messages: 0,
          workHours: 0,
          workCount: 0,
          outsideHours: 0,
          outsideCount: 0,
          ghost: 0,
          ghostCount: 0,
        });
      }
      
      const period = user.periodData.get(periodKey)!;
      period.messages += item.total_messages_sent || 0;
      
      if (item.avg_response_time_work_hours) {
        period.workHours += item.avg_response_time_work_hours;
        period.workCount++;
      }
      if (item.avg_response_time_outside_hours) {
        period.outsideHours += item.avg_response_time_outside_hours;
        period.outsideCount++;
      }
      if (item.ghost_score !== null && item.ghost_score !== undefined) {
        period.ghost += parseFloat(item.ghost_score);
        period.ghostCount++;
      }
    });
    
    // Use only the LATEST period's average (not averaging all periods)
    return Array.from(userMap.values()).map((u) => {
      const periods = Array.from(u.periodData.values());
      const totalMessages = periods.reduce((s, p) => s + p.messages, 0);
      
      // Find the latest period key (sorted chronologically)
      const sortedPeriodKeys = Array.from(u.periodData.keys()).sort();
      const latestPeriodKey = sortedPeriodKeys[sortedPeriodKeys.length - 1];
      const latestPeriod = u.periodData.get(latestPeriodKey);
      
      // Calculate average from latest period only
      let avgWorkSeconds: number | null = null;
      let avgOutsideSeconds: number | null = null;
      let avgGhost = 0;
      
      if (latestPeriod) {
        avgWorkSeconds = latestPeriod.workCount > 0 
          ? latestPeriod.workHours / latestPeriod.workCount 
          : null;
        avgOutsideSeconds = latestPeriod.outsideCount > 0 
          ? latestPeriod.outsideHours / latestPeriod.outsideCount 
          : null;
        avgGhost = latestPeriod.ghostCount > 0 
          ? latestPeriod.ghost / latestPeriod.ghostCount 
          : 0;
      }
      
      return {
        userId: u.userId,
        displayName: u.displayName,
        totalMessages,
        periodCount: periods.length,
        latestPeriod: latestPeriodKey || '-',
        avgWorkHours: avgWorkSeconds ? Math.round(avgWorkSeconds / 60) : null,
        avgOutsideHours: avgOutsideSeconds ? Math.round(avgOutsideSeconds / 60) : null,
        avgGhost: Math.round(avgGhost * 100),
      };
    }).sort((a, b) => b.totalMessages - a.totalMessages);
  }, [historicalData, analysisUserId, analysisGroupId, viewMode]);

  // Aggregate data for charts with view mode support
  const responseTimeChartData = useMemo(() => {
    const dailyData = (historicalData || []).reduce((acc: any[], item: any) => {
      const periodKey = getPeriodKey(item.date, viewMode);
      const existing = acc.find((d) => d.date === periodKey);
      
      if (existing) {
        if (item.avg_response_time_work_hours) {
          existing.workHours = (existing.workHours || 0) + item.avg_response_time_work_hours;
          existing.workCount = (existing.workCount || 0) + 1;
        }
        if (item.avg_response_time_outside_hours) {
          existing.outsideHours = (existing.outsideHours || 0) + item.avg_response_time_outside_hours;
          existing.outsideCount = (existing.outsideCount || 0) + 1;
        }
      } else {
        acc.push({
          date: periodKey,
          workHours: item.avg_response_time_work_hours || 0,
          workCount: item.avg_response_time_work_hours ? 1 : 0,
          outsideHours: item.avg_response_time_outside_hours || 0,
          outsideCount: item.avg_response_time_outside_hours ? 1 : 0,
        });
      }
      return acc;
    }, []);

    return dailyData.map((d) => ({
      date: d.date,
      workHours: d.workCount > 0 ? Math.round(d.workHours / d.workCount / 60) : null,
      outsideHours: d.outsideCount > 0 ? Math.round(d.outsideHours / d.outsideCount / 60) : null,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [historicalData, viewMode]);

  const sentimentChartData = useMemo(() => {
    const aggregated = (sentimentData || []).reduce((acc: any[], item: any) => {
      const periodKey = getPeriodKey(item.date, viewMode);
      const existing = acc.find((d) => d.date === periodKey);
      
      if (existing) {
        existing.totalSentiment += item.avg_sentiment || 0;
        existing.count++;
      } else {
        acc.push({
          date: periodKey,
          totalSentiment: item.avg_sentiment || 0,
          count: 1,
        });
      }
      return acc;
    }, []);

    return aggregated.map((d) => ({
      date: d.date,
      sentiment: Math.round((d.totalSentiment / d.count) * 100) / 100,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [sentimentData, viewMode]);

  // Format date label based on view mode
  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (viewMode === "day") return format(date, "MMM d");
    if (viewMode === "week") return `W${format(date, "w")}`;
    return format(date, "MMM yyyy");
  };

  // Calculate summary stats
  const totalMessages = historicalData?.reduce((sum, d: any) => sum + (d.total_messages_sent || 0), 0) || 0;
  const avgGhostScore = historicalData?.length 
    ? Math.round((historicalData.reduce((sum, d: any) => sum + (d.ghost_score || 0), 0) / historicalData.length) * 100)
    : 0;
  const avgSentiment = sentimentData?.length
    ? Math.round((sentimentData.reduce((sum, d: any) => sum + (d.avg_sentiment || 0), 0) / sentimentData.length) * 100) / 100
    : 0;
  const burnoutCount = sentimentData?.filter((d: any) => d.burnout_score >= 0.5).length || 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Historical Analysis
          </CardTitle>
          <CardDescription>
            Analyze response times and sentiment trends over time. Run backfill to recalculate historical data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setDateRange({ from: range.from, to: range.to });
                      }
                    }}
                    numberOfMonths={2}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Group Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Group</label>
              <Select value={analysisGroupId} onValueChange={(v) => {
                setAnalysisGroupId(v);
                setAnalysisUserId("all");
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* User Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">User</label>
              <Select value={analysisUserId} onValueChange={setAnalysisUserId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {(users || []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* View Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">View By</label>
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Actions</label>
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}
                  variant="outline"
                  size="sm"
                >
                  Last 7 Days
                </Button>
                <Button 
                  onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}
                  variant="outline"
                  size="sm"
                >
                  Last 30 Days
                </Button>
                <Button 
                  onClick={() => runBackfillWithPagination(true)}
                  variant="outline"
                  size="sm"
                  disabled={isRunning}
                >
                  Preview
                </Button>
                <Button 
                  onClick={() => runBackfillWithPagination(false)}
                  size="sm"
                  disabled={isRunning}
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Backfill
                </Button>
              </div>
            </div>
          </div>

          {/* Progress */}
          {isRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{progressMessage || "Processing..."}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* User List Table - Show when group is selected and showing all users */}
      {analysisGroupId !== "all" && analysisUserId === "all" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              User Response Times
            </CardTitle>
            <CardDescription>
              Click on a user to view their detailed analytics
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <Skeleton className="h-[200px] w-full" />
            ) : userStats.length === 0 ? (
              <div className="flex items-center justify-center h-[100px] text-muted-foreground">
                No user data available for this period.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead className="text-right">
                      {viewMode === "day" ? "Days" : viewMode === "week" ? "Weeks" : "Months"}
                    </TableHead>
                    <TableHead className="text-right">Work Hours (avg)</TableHead>
                    <TableHead className="text-right">Outside Hours (avg)</TableHead>
                    <TableHead className="text-right">Ghost Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userStats.map((user) => (
                    <TableRow 
                      key={user.userId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setAnalysisUserId(user.userId)}
                    >
                      <TableCell className="font-medium">{user.displayName}</TableCell>
                      <TableCell className="text-right">{user.totalMessages.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{user.periodCount}</TableCell>
                      <TableCell className="text-right">
                        {user.avgWorkHours !== null ? `${user.avgWorkHours} min` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.avgOutsideHours !== null ? `${user.avgOutsideHours} min` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={user.avgGhost > 50 ? "text-destructive" : "text-green-600"}>
                          {user.avgGhost}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalMessages.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Total Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Ghost className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{avgGhostScore}%</p>
                <p className="text-sm text-muted-foreground">Avg Ghost Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              {avgSentiment >= 0 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              )}
              <div>
                <p className="text-2xl font-bold">{avgSentiment.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Avg Sentiment</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{burnoutCount}</p>
                <p className="text-sm text-muted-foreground">Burnout Signals</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Response Time Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Response Time Trend
            </CardTitle>
            <CardDescription>
              Average response time in minutes ({viewMode === "day" ? "daily" : viewMode === "week" ? "weekly" : "monthly"})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <Skeleton className="h-[300px] w-full" />
            ) : responseTimeChartData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No response time data available. Run backfill to populate.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={responseTimeChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={formatDateLabel}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelFormatter={formatDateLabel}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="workHours" 
                    name="Work Hours"
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={viewMode !== "day"}
                    connectNulls
                  />
                  <Line 
                    type="monotone" 
                    dataKey="outsideHours" 
                    name="Outside Hours"
                    stroke="hsl(var(--secondary-foreground))" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={viewMode !== "day"}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Sentiment Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Sentiment Trend
            </CardTitle>
            <CardDescription>
              Average sentiment score ({viewMode === "day" ? "daily" : viewMode === "week" ? "weekly" : "monthly"})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSentiment ? (
              <Skeleton className="h-[300px] w-full" />
            ) : sentimentChartData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No sentiment data available. Run sentiment tracker to populate.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sentimentChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={formatDateLabel}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    domain={[-1, 1]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelFormatter={formatDateLabel}
                  />
                  <Bar 
                    dataKey="sentiment" 
                    name="Sentiment"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
