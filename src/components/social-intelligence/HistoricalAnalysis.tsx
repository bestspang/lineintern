import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarIcon, Play, Clock, TrendingUp, Ghost, Users, AlertTriangle, CheckCircle } from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";

interface HistoricalAnalysisProps {
  groups: any[];
  selectedGroupId: string;
}

export function HistoricalAnalysis({ groups, selectedGroupId }: HistoricalAnalysisProps) {
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 21),
    to: new Date(),
  });
  const [analysisGroupId, setAnalysisGroupId] = useState<string>(selectedGroupId);
  const [analysisUserId, setAnalysisUserId] = useState<string>("all");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);

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

  // Run backfill mutation
  const backfillMutation = useMutation({
    mutationFn: async (params: { startDate: string; endDate: string; groupId?: string; userId?: string; dryRun: boolean }) => {
      setIsRunning(true);
      setProgress(10);

      const { data, error } = await supabase.functions.invoke("response-analytics-backfill", {
        body: {
          startDate: params.startDate,
          endDate: params.endDate,
          groupId: params.groupId === "all" ? undefined : params.groupId,
          userId: params.userId === "all" ? undefined : params.userId,
          dryRun: params.dryRun,
        },
      });

      setProgress(100);

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setIsRunning(false);
      if (data.dryRun) {
        toast.info(`Dry run complete: Would update ${data.updatesCount} messages`, {
          description: `Work hours: ${data.stats.updatedWorkHours}, Response times: ${data.stats.updatedResponseTime}`,
        });
      } else {
        toast.success(`Backfill complete!`, {
          description: `Updated ${data.updatesCount} messages`,
        });
        queryClient.invalidateQueries({ queryKey: ["historical-analytics"] });
        queryClient.invalidateQueries({ queryKey: ["historical-sentiment"] });
        queryClient.invalidateQueries({ queryKey: ["response-analytics"] });
      }
    },
    onError: (error: any) => {
      setIsRunning(false);
      toast.error("Backfill failed", { description: error.message });
    },
  });

  const handleRunBackfill = (dryRun: boolean) => {
    backfillMutation.mutate({
      startDate: format(dateRange.from, "yyyy-MM-dd"),
      endDate: format(dateRange.to, "yyyy-MM-dd"),
      groupId: analysisGroupId,
      userId: analysisUserId,
      dryRun,
    });
  };

  // Aggregate data for charts
  const responseTimeChartData = (historicalData || []).reduce((acc: any[], item: any) => {
    const existing = acc.find((d) => d.date === item.date);
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
        date: item.date,
        workHours: item.avg_response_time_work_hours || 0,
        workCount: item.avg_response_time_work_hours ? 1 : 0,
        outsideHours: item.avg_response_time_outside_hours || 0,
        outsideCount: item.avg_response_time_outside_hours ? 1 : 0,
      });
    }
    return acc;
  }, []).map((d) => ({
    date: d.date,
    workHours: d.workCount > 0 ? Math.round(d.workHours / d.workCount / 60) : null,
    outsideHours: d.outsideCount > 0 ? Math.round(d.outsideHours / d.outsideCount / 60) : null,
  }));

  const sentimentChartData = (sentimentData || []).reduce((acc: any[], item: any) => {
    const existing = acc.find((d) => d.date === item.date);
    if (existing) {
      existing.totalSentiment += item.avg_sentiment || 0;
      existing.count++;
    } else {
      acc.push({
        date: item.date,
        totalSentiment: item.avg_sentiment || 0,
        count: 1,
      });
    }
    return acc;
  }, []).map((d) => ({
    date: d.date,
    sentiment: Math.round((d.totalSentiment / d.count) * 100) / 100,
  }));

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setDateRange({ from: range.from, to: range.to });
                      }
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Group Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Group</label>
              <Select value={analysisGroupId} onValueChange={setAnalysisGroupId}>
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

            {/* Actions */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Actions</label>
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleRunBackfill(true)}
                  variant="outline"
                  size="sm"
                  disabled={isRunning}
                >
                  Preview
                </Button>
                <Button 
                  onClick={() => handleRunBackfill(false)}
                  size="sm"
                  disabled={isRunning}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Run Backfill
                </Button>
              </div>
            </div>
          </div>

          {/* Progress */}
          {isRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </CardContent>
      </Card>

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
            <CardDescription>Average response time in minutes (work hours vs outside)</CardDescription>
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
                    tickFormatter={(value) => format(new Date(value), "MMM d")}
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
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="workHours" 
                    name="Work Hours"
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line 
                    type="monotone" 
                    dataKey="outsideHours" 
                    name="Outside Hours"
                    stroke="hsl(var(--secondary-foreground))" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
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
            <CardDescription>Daily average sentiment score (-1 to 1)</CardDescription>
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
                    tickFormatter={(value) => format(new Date(value), "MMM d")}
                  />
                  <YAxis 
                    domain={[-1, 1]}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
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
