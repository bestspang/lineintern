import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Ghost, Clock, MessageCircle, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ResponseAnalytics {
  user_id: string;
  group_id: string;
  date: string;
  total_messages_sent: number;
  total_replies_received: number;
  avg_response_time_seconds: number | null;
  ghost_score: number;
  messages_during_work_hours: number;
  messages_outside_work_hours: number;
  users?: {
    display_name: string;
    avatar_url: string | null;
  };
}

interface GhostLeaderboardProps {
  data: ResponseAnalytics[];
  title?: string;
  showAll?: boolean;
}

export function GhostLeaderboard({ data, title = "Response Analytics", showAll = false }: GhostLeaderboardProps) {
  // Aggregate by user (get latest per user)
  const userMap = new Map<string, ResponseAnalytics>();
  for (const item of data) {
    const existing = userMap.get(item.user_id);
    if (!existing || new Date(item.date) > new Date(existing.date)) {
      userMap.set(item.user_id, item);
    }
  }
  
  const aggregatedData = Array.from(userMap.values())
    .sort((a, b) => b.ghost_score - a.ghost_score);
  
  const displayData = showAll ? aggregatedData : aggregatedData.slice(0, 10);
  
  const formatResponseTime = (seconds: number | null): string => {
    if (!seconds) return "N/A";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };
  
  const getGhostLevel = (score: number): { label: string; color: string; icon: typeof Ghost } => {
    if (score >= 0.7) return { label: "High Ghost", color: "text-red-500 bg-red-500/10", icon: Ghost };
    if (score >= 0.4) return { label: "Medium", color: "text-yellow-500 bg-yellow-500/10", icon: AlertTriangle };
    return { label: "Active", color: "text-green-500 bg-green-500/10", icon: MessageCircle };
  };
  
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ghost className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>Track response times and engagement</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Ghost className="h-12 w-12 mb-3 opacity-50" />
            <p>No response analytics data yet</p>
            <p className="text-xs mt-1">Data will appear as users interact</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ghost className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>
          Ghost Score measures response patterns (0 = very active, 1 = ghosting)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayData.map((item, index) => {
            const ghostLevel = getGhostLevel(item.ghost_score);
            const GhostIcon = ghostLevel.icon;
            const userName = item.users?.display_name || "Unknown User";
            const replyRate = item.total_messages_sent > 0 
              ? Math.round((item.total_replies_received / item.total_messages_sent) * 100)
              : 0;
            
            return (
              <div 
                key={item.user_id} 
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                {/* Rank */}
                <div className="flex-shrink-0 w-6 text-center">
                  <span className={`text-sm font-bold ${index < 3 ? "text-primary" : "text-muted-foreground"}`}>
                    {index + 1}
                  </span>
                </div>
                
                {/* Avatar */}
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={item.users?.avatar_url || undefined} />
                  <AvatarFallback>{userName.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                
                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{userName}</span>
                    <Badge variant="outline" className={ghostLevel.color}>
                      <GhostIcon className="h-3 w-3 mr-1" />
                      {ghostLevel.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          <span>{item.total_messages_sent} sent</span>
                        </TooltipTrigger>
                        <TooltipContent>Total messages sent</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatResponseTime(item.avg_response_time_seconds)}</span>
                        </TooltipTrigger>
                        <TooltipContent>Average response time</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          {replyRate >= 50 ? (
                            <TrendingUp className="h-3 w-3 text-green-500" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-red-500" />
                          )}
                          <span>{replyRate}% reply rate</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {item.total_replies_received} replies / {item.total_messages_sent} sent
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                
                {/* Ghost Score Bar */}
                <div className="flex-shrink-0 w-24">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Ghost</span>
                    <span className="font-medium">{Math.round(item.ghost_score * 100)}%</span>
                  </div>
                  <Progress 
                    value={item.ghost_score * 100} 
                    className={`h-2 ${item.ghost_score >= 0.7 ? "[&>div]:bg-red-500" : item.ghost_score >= 0.4 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Summary Stats */}
        <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-red-500">
              {aggregatedData.filter(d => d.ghost_score >= 0.7).length}
            </div>
            <div className="text-xs text-muted-foreground">High Ghost</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-500">
              {aggregatedData.filter(d => d.ghost_score >= 0.4 && d.ghost_score < 0.7).length}
            </div>
            <div className="text-xs text-muted-foreground">Medium</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-500">
              {aggregatedData.filter(d => d.ghost_score < 0.4).length}
            </div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
