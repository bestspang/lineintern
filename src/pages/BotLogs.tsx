import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, MessageSquare, Bell, AlertTriangle, FileText, Settings, CheckCircle2, XCircle, Clock } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

interface BotLog {
  id: string;
  destination_type: 'group' | 'dm' | 'user_push';
  destination_id: string;
  destination_name: string | null;
  message_text: string;
  message_type: 'ai_reply' | 'notification' | 'reminder' | 'summary' | 'warning' | 'system';
  triggered_by: 'webhook' | 'cron' | 'manual' | 'postback' | null;
  command_type: string | null;
  edge_function_name: string;
  delivery_status: 'sent' | 'failed' | 'pending';
  error_message: string | null;
  sent_at: string;
}

const MESSAGE_TYPE_ICONS = {
  ai_reply: MessageSquare,
  notification: Bell,
  reminder: Clock,
  summary: FileText,
  warning: AlertTriangle,
  system: Settings,
};

const MESSAGE_TYPE_COLORS = {
  ai_reply: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  notification: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  reminder: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  summary: "bg-green-500/10 text-green-500 border-green-500/20",
  warning: "bg-red-500/10 text-red-500 border-red-500/20",
  system: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const DESTINATION_TYPE_LABELS = {
  group: "Group",
  dm: "DM",
  user_push: "Push",
};

export default function BotLogs() {
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageTypeFilter, setMessageTypeFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("all");
  const [edgeFunctionFilter, setEdgeFunctionFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
    failed: 0,
    ai_replies: 0,
    notifications: 0,
  });

  useEffect(() => {
    fetchLogs();
  }, [messageTypeFilter, destinationFilter, edgeFunctionFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("bot_message_logs")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(100);

      if (messageTypeFilter !== "all") {
        query = query.eq("message_type", messageTypeFilter);
      }

      if (destinationFilter !== "all") {
        query = query.eq("destination_type", destinationFilter);
      }

      if (edgeFunctionFilter !== "all") {
        query = query.eq("edge_function_name", edgeFunctionFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setLogs((data || []) as BotLog[]);

      // Calculate stats
      const total = data?.length || 0;
      const sent = data?.filter(log => log.delivery_status === 'sent').length || 0;
      const failed = data?.filter(log => log.delivery_status === 'failed').length || 0;
      const ai_replies = data?.filter(log => log.message_type === 'ai_reply').length || 0;
      const notifications = data?.filter(log => log.message_type === 'notification' || log.message_type === 'reminder').length || 0;

      setStats({ total, sent, failed, ai_replies, notifications });
    } catch (error) {
      console.error("Error fetching bot logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatBangkokTime = (timestamp: string) => {
    const bangkokTime = toZonedTime(new Date(timestamp), "Asia/Bangkok");
    return format(bangkokTime, "dd MMM yyyy HH:mm:ss");
  };

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.message_text.toLowerCase().includes(query) ||
      log.destination_name?.toLowerCase().includes(query) ||
      log.edge_function_name.toLowerCase().includes(query)
    );
  });

  const StatCard = ({ icon: Icon, label, value, color }: any) => (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Bot className="w-8 h-8 text-primary" />
              Bot Message Logs
            </h1>
            <p className="text-muted-foreground mt-1">
              Track all messages sent by the bot across different channels
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <StatCard
            icon={MessageSquare}
            label="Total Messages"
            value={stats.total}
            color="bg-blue-500/10 text-blue-500"
          />
          <StatCard
            icon={CheckCircle2}
            label="Sent"
            value={stats.sent}
            color="bg-green-500/10 text-green-500"
          />
          <StatCard
            icon={XCircle}
            label="Failed"
            value={stats.failed}
            color="bg-red-500/10 text-red-500"
          />
          <StatCard
            icon={MessageSquare}
            label="AI Replies"
            value={stats.ai_replies}
            color="bg-purple-500/10 text-purple-500"
          />
          <StatCard
            icon={Bell}
            label="Notifications"
            value={stats.notifications}
            color="bg-orange-500/10 text-orange-500"
          />
        </div>

        {/* Filters */}
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Message Type</label>
                <Select value={messageTypeFilter} onValueChange={setMessageTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="ai_reply">AI Reply</SelectItem>
                    <SelectItem value="notification">Notification</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                    <SelectItem value="summary">Summary</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Destination</label>
                <Select value={destinationFilter} onValueChange={setDestinationFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Destinations</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                    <SelectItem value="dm">DM</SelectItem>
                    <SelectItem value="user_push">Push</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Edge Function</label>
                <Select value={edgeFunctionFilter} onValueChange={setEdgeFunctionFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Functions</SelectItem>
                    <SelectItem value="line-webhook">line-webhook</SelectItem>
                    <SelectItem value="attendance-reminder">attendance-reminder</SelectItem>
                    <SelectItem value="work-reminder">work-reminder</SelectItem>
                    <SelectItem value="work-summary">work-summary</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Search</label>
                <Input
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs List */}
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recent Messages ({filteredLogs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No logs found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLogs.map((log) => {
                  const Icon = MESSAGE_TYPE_ICONS[log.message_type];
                  const colorClass = MESSAGE_TYPE_COLORS[log.message_type];

                  return (
                    <div
                      key={log.id}
                      className="p-4 border border-border/40 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <Badge variant="outline" className={colorClass}>
                            {log.message_type}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {DESTINATION_TYPE_LABELS[log.destination_type]}
                          </Badge>
                          <span className="text-sm font-medium truncate">
                            {log.destination_name || log.destination_id}
                          </span>
                          {log.delivery_status === 'failed' && (
                            <Badge variant="destructive">Failed</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatBangkokTime(log.sent_at)}
                        </span>
                      </div>

                      <p className="text-sm text-foreground/90 mb-2 line-clamp-2">
                        {log.message_text}
                      </p>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>📍 {log.edge_function_name}</span>
                        {log.triggered_by && <span>⚡ {log.triggered_by}</span>}
                        {log.command_type && <span>💬 {log.command_type}</span>}
                      </div>

                      {log.error_message && (
                        <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                          {log.error_message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
