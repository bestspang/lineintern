import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Heart, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Flame,
  Ghost,
  Crown,
  UserMinus,
  Activity
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area 
} from "recharts";

import type { Json } from "@/integrations/supabase/types";

interface SentimentHistory {
  user_id: string;
  group_id: string;
  date: string;
  message_count: number;
  avg_sentiment: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  burnout_score: number;
  burnout_signals: Json;
  users?: {
    display_name: string;
    avatar_url: string | null;
  };
}

interface NetworkMetrics {
  user_id: string;
  network_role: string;
  degree_centrality: number;
  unique_contacts: number;
  total_interactions: number;
  users?: {
    display_name: string;
    avatar_url: string | null;
  };
}

interface TeamHealthDashboardProps {
  sentimentData: SentimentHistory[];
  networkData: NetworkMetrics[];
  burnoutRiskUsers: SentimentHistory[];
  influencers: NetworkMetrics[];
  outsiders: NetworkMetrics[];
  avgSentiment: number;
}

export function TeamHealthDashboard({
  sentimentData,
  networkData,
  burnoutRiskUsers,
  influencers,
  outsiders,
  avgSentiment,
}: TeamHealthDashboardProps) {
  // Aggregate sentiment by date for chart
  const sentimentByDate = sentimentData.reduce((acc, item) => {
    if (!acc[item.date]) {
      acc[item.date] = { date: item.date, totalSentiment: 0, count: 0, messages: 0 };
    }
    acc[item.date].totalSentiment += item.avg_sentiment;
    acc[item.date].count++;
    acc[item.date].messages += item.message_count;
    return acc;
  }, {} as Record<string, any>);
  
  const chartData = Object.values(sentimentByDate)
    .map((d: any) => ({
      date: new Date(d.date).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
      sentiment: Math.round((d.totalSentiment / d.count) * 100) / 100,
      messages: d.messages,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14); // Last 14 days
  
  const getHealthStatus = (sentiment: number): { label: string; color: string; icon: typeof Heart } => {
    if (sentiment > 0.3) return { label: "Healthy", color: "text-green-500", icon: Heart };
    if (sentiment > 0) return { label: "Stable", color: "text-blue-500", icon: Activity };
    if (sentiment > -0.3) return { label: "Caution", color: "text-yellow-500", icon: AlertTriangle };
    return { label: "At Risk", color: "text-red-500", icon: Flame };
  };
  
  const healthStatus = getHealthStatus(avgSentiment);
  const HealthIcon = healthStatus.icon;
  
  // Type-safe parser for burnout_signals from Json to string[]
  const parseBurnoutSignals = (signals: Json): string[] => {
    if (Array.isArray(signals)) {
      return signals.map(s => String(s));
    }
    if (typeof signals === 'string') {
      try {
        const parsed = JSON.parse(signals);
        return Array.isArray(parsed) ? parsed.map(s => String(s)) : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  
  const getBurnoutSignalLabel = (signal: string): string => {
    const labels: Record<string, string> = {
      high_negativity: "High Negativity",
      frequent_negative_messages: "Frequent Complaints",
      declining_engagement: "Declining Activity",
      low_engagement: "Low Engagement",
    };
    return labels[signal] || signal;
  };
  
  return (
    <div className="space-y-6">
      {/* Overall Health Score */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Team Sentiment</p>
                <div className="flex items-center gap-2 mt-1">
                  <HealthIcon className={`h-5 w-5 ${healthStatus.color}`} />
                  <span className={`text-2xl font-bold ${healthStatus.color}`}>
                    {healthStatus.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Score: {avgSentiment > 0 ? "+" : ""}{(avgSentiment * 100).toFixed(0)}%
                </p>
              </div>
              <div className={`p-3 rounded-full ${avgSentiment > 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                {avgSentiment > 0 ? (
                  <TrendingUp className={`h-6 w-6 ${avgSentiment > 0 ? "text-green-500" : "text-red-500"}`} />
                ) : (
                  <TrendingDown className={`h-6 w-6 ${avgSentiment > 0 ? "text-green-500" : "text-red-500"}`} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Burnout Risk</p>
                <p className="text-2xl font-bold text-orange-500">{burnoutRiskUsers.length}</p>
                <p className="text-xs text-muted-foreground mt-1">users at risk</p>
              </div>
              <div className="p-3 rounded-full bg-orange-500/10">
                <Flame className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Influencers</p>
                <p className="text-2xl font-bold text-purple-500">{influencers.length}</p>
                <p className="text-xs text-muted-foreground mt-1">team leaders</p>
              </div>
              <div className="p-3 rounded-full bg-purple-500/10">
                <Crown className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outsiders</p>
                <p className="text-2xl font-bold text-gray-500">{outsiders.length}</p>
                <p className="text-xs text-muted-foreground mt-1">need attention</p>
              </div>
              <div className="p-3 rounded-full bg-gray-500/10">
                <UserMinus className="h-6 w-6 text-gray-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Sentiment Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Sentiment & Activity Trend
          </CardTitle>
          <CardDescription>Team sentiment and message volume over time</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground">
              <p>No sentiment data available yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis 
                  yAxisId="sentiment"
                  domain={[-1, 1]} 
                  className="text-xs" 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`}
                />
                <YAxis 
                  yAxisId="messages"
                  orientation="right"
                  className="text-xs" 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: any, name: string) => {
                    if (name === "sentiment") return [`${value > 0 ? '+' : ''}${(value * 100).toFixed(0)}%`, "Sentiment"];
                    return [value, "Messages"];
                  }}
                />
                <Area
                  yAxisId="sentiment"
                  type="monotone"
                  dataKey="sentiment"
                  stroke="hsl(var(--primary))"
                  fill="url(#sentimentGradient)"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="messages"
                  type="monotone"
                  dataKey="messages"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      
      {/* Burnout Risk Users */}
      {burnoutRiskUsers.length > 0 && (
        <Card className="border-orange-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-500">
              <Flame className="h-5 w-5" />
              Burnout Risk Alert
            </CardTitle>
            <CardDescription>
              These team members may be experiencing burnout based on their communication patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {burnoutRiskUsers.slice(0, 5).map((user) => (
                <div key={user.user_id} className="flex items-center gap-3 p-3 rounded-lg border bg-orange-500/5">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.users?.avatar_url || undefined} />
                    <AvatarFallback>
                      {(user.users?.display_name || "U").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.users?.display_name || "Unknown"}</span>
                      <Badge variant="outline" className="text-orange-500 border-orange-500">
                        {Math.round(user.burnout_score * 100)}% Risk
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {parseBurnoutSignals(user.burnout_signals).map((signal, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {getBurnoutSignalLabel(signal)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Sentiment</div>
                    <div className={`font-medium ${user.avg_sentiment < 0 ? "text-red-500" : "text-green-500"}`}>
                      {user.avg_sentiment > 0 ? "+" : ""}{(user.avg_sentiment * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Network Roles Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Influencers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-500">
              <Crown className="h-5 w-5" />
              Team Influencers
            </CardTitle>
            <CardDescription>High-connectivity members who drive conversations</CardDescription>
          </CardHeader>
          <CardContent>
            {influencers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No influencers detected yet
              </p>
            ) : (
              <div className="space-y-2">
                {influencers.slice(0, 5).map((user) => (
                  <div key={user.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.users?.avatar_url || undefined} />
                      <AvatarFallback>
                        {(user.users?.display_name || "U").substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <span className="text-sm font-medium">{user.users?.display_name || "Unknown"}</span>
                      <div className="text-xs text-muted-foreground">
                        {user.unique_contacts} connections • {user.total_interactions} interactions
                      </div>
                    </div>
                    <Badge className="bg-purple-500/10 text-purple-500">
                      {Math.round(user.degree_centrality * 100)}%
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Outsiders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-500">
              <UserMinus className="h-5 w-5" />
              Needs Attention
            </CardTitle>
            <CardDescription>Low-connectivity members who may feel isolated</CardDescription>
          </CardHeader>
          <CardContent>
            {outsiders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No isolated members detected - great team cohesion!
              </p>
            ) : (
              <div className="space-y-2">
                {outsiders.slice(0, 5).map((user) => (
                  <div key={user.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.users?.avatar_url || undefined} />
                      <AvatarFallback>
                        {(user.users?.display_name || "U").substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <span className="text-sm font-medium">{user.users?.display_name || "Unknown"}</span>
                      <div className="text-xs text-muted-foreground">
                        {user.unique_contacts} connections • {user.total_interactions} interactions
                      </div>
                    </div>
                    <Badge variant="outline" className="text-gray-500">
                      {Math.round(user.degree_centrality * 100)}%
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
