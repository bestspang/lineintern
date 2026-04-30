import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Users, CheckSquare, AlertTriangle, Receipt, Sparkles, Clock, Database, Wifi, Server } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatInTimeZone } from 'date-fns-tz';
import { th } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

export default function Overview() {
  const navigate = useNavigate();
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ['overview-stats'],
    queryFn: async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [groupsRes, messagesRes, tasksRes, alertsRes] = await Promise.all([
        supabase.from('groups').select('id, status', { count: 'exact' }),
        supabase.from('messages').select('id', { count: 'exact' }).gte('sent_at', yesterday.toISOString()),
        supabase.from('tasks').select('id', { count: 'exact' }).eq('status', 'pending').lte('due_at', now.toISOString()),
        supabase.from('alerts').select('id, severity', { count: 'exact' }).eq('resolved', false),
      ]);

      const activeGroups = groupsRes.data?.filter(g => g.status === 'active').length || 0;

      return {
        totalGroups: groupsRes.count || 0,
        activeGroups,
        messages24h: messagesRes.count || 0,
        tasksDueToday: tasksRes.count || 0,
        unresolvedAlerts: alertsRes.count || 0,
      };
    },
    refetchInterval: 60000, // Auto-refresh every 60 seconds
  });

  // Fetch receipt stats
  const { data: receiptStats, isLoading: receiptStatsLoading } = useQuery({
    queryKey: ['receipt-overview-stats'],
    queryFn: async (): Promise<{ totalReceipts: number; thisMonthReceipts: number; aiUsageThisMonth: number }> => {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Fetch counts separately
      const totalResult = await supabase
        .from('receipts')
        .select('*', { count: 'exact', head: true });

      const thisMonthResult = await supabase
        .from('receipts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thisMonthStart);

      // Count AI-extracted receipts - using filter instead of eq to avoid type depth issues
      const aiQuery = supabase.from('receipts').select('*', { count: 'exact', head: true });
      const aiExtractedResult = await aiQuery.filter('extraction_source', 'eq', 'ai').gte('created_at', thisMonthStart);

      return {
        totalReceipts: totalResult.count || 0,
        thisMonthReceipts: thisMonthResult.count || 0,
        aiUsageThisMonth: aiExtractedResult.count || 0,
      };
    },
    refetchInterval: 60000,
  });

  // Fetch recent unresolved alerts
  const { data: recentAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['recent-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('id, type, severity, summary, created_at, groups(display_name)')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  // ✅ NEW: Attendance System Health Check
  const { data: attendanceHealth, isLoading: attendanceHealthLoading } = useQuery({
    queryKey: ['attendance-system-health'],
    queryFn: async () => {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

      const [
        orphanedSessionsRes,
        expiredTokensRes,
        recentCheckInsRes,
        cronLogsRes,
      ] = await Promise.all([
        // Orphaned work_sessions (active > 24 hours)
        supabase
          .from('work_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .lt('actual_start_time', twentyFourHoursAgo),
        
        // Expired pending tokens
        supabase
          .from('attendance_tokens')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .lt('expires_at', now.toISOString()),
        
        // Recent check-ins (last hour)
        supabase
          .from('attendance_logs')
          .select('id', { count: 'exact', head: true })
          .gte('server_time', oneHourAgo),
        
        // Recent cron job logs (stale-session-cleaner)
        supabase
          .from('bot_message_logs')
          .select('id, sent_at, delivery_status')
          .eq('edge_function_name', 'stale-session-cleaner')
          .order('sent_at', { ascending: false })
          .limit(1),
      ]);

      return {
        orphanedSessions: orphanedSessionsRes.count || 0,
        expiredTokens: expiredTokensRes.count || 0,
        recentCheckIns: recentCheckInsRes.count || 0,
        lastCleanerRun: cronLogsRes.data?.[0]?.sent_at || null,
        cleanerStatus: cronLogsRes.data?.[0]?.delivery_status || 'unknown',
      };
    },
    refetchInterval: 60000,
  });

  // Check system health
  const { data: systemHealth, isLoading: healthLoading } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Check recent message delivery failures
      const { data: recentMessages, error: msgError } = await supabase
        .from('bot_message_logs')
        .select('delivery_status')
        .gte('sent_at', fiveMinutesAgo.toISOString())
        .order('sent_at', { ascending: false })
        .limit(20);

      if (msgError) {
        return {
          database: false,
          webhook: false,
          lineApi: false,
        };
      }

      const failedMessages = recentMessages?.filter(m => m.delivery_status === 'failed').length || 0;
      const totalMessages = recentMessages?.length || 0;
      const successRate = totalMessages > 0 ? ((totalMessages - failedMessages) / totalMessages) : 1;

      return {
        database: true, // If we got here, DB is working
        webhook: successRate > 0.8, // Webhook healthy if >80% success rate
        lineApi: successRate > 0.8, // LINE API healthy if >80% success rate
      };
    },
    refetchInterval: 30000, // Check health every 30 seconds
  });

  const statCards = [
    {
      title: 'Active Groups',
      value: stats?.activeGroups || 0,
      total: stats?.totalGroups || 0,
      icon: MessageSquare,
      description: 'Currently active',
    },
    {
      title: 'Messages (24h)',
      value: stats?.messages24h || 0,
      icon: Users,
      description: 'Last 24 hours',
    },
    {
      title: 'Tasks Due',
      value: stats?.tasksDueToday || 0,
      icon: CheckSquare,
      description: 'Due today',
    },
    {
      title: 'Unresolved Alerts',
      value: stats?.unresolvedAlerts || 0,
      icon: AlertTriangle,
      description: 'Needs attention',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">Quick health snapshot of your LINE bot</p>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              {isLoading ? (
                <Skeleton className="h-6 sm:h-8 w-12 sm:w-16" />
              ) : (
                <>
                  <div className="text-xl sm:text-2xl font-bold">
                    {stat.value}
                    {stat.total !== undefined && (
                      <span className="text-xs sm:text-sm text-muted-foreground ml-1">/ {stat.total}</span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{stat.description}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Receipt Stats Widget */}
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/receipts')}>
        <CardHeader className="p-4 sm:p-6 pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" />
            Receipt Statistics
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">AI receipt extraction usage</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {receiptStatsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-bold">{receiptStats?.totalReceipts || 0}</div>
                <p className="text-xs text-muted-foreground">Total Receipts</p>
              </div>
              <div>
                <div className="text-2xl font-bold">{receiptStats?.thisMonthReceipts || 0}</div>
                <p className="text-xs text-muted-foreground">This Month</p>
              </div>
              <div>
                <div className="text-2xl font-bold flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  {receiptStats?.aiUsageThisMonth || 0}
                </div>
                <p className="text-xs text-muted-foreground">AI Extractions</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ✅ NEW: Attendance System Health Card */}
      <Card>
        <CardHeader className="p-4 sm:p-6 pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-600" />
            Attendance System Health
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Session & token monitoring</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {attendanceHealthLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-2xl font-bold ${(attendanceHealth?.orphanedSessions || 0) > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {attendanceHealth?.orphanedSessions || 0}
                </div>
                <p className="text-xs text-muted-foreground">Orphaned Sessions</p>
                {(attendanceHealth?.orphanedSessions || 0) > 0 && (
                  <Badge variant="destructive" className="mt-1 text-[10px]">⚠️ Needs cleanup</Badge>
                )}
              </div>
              
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-2xl font-bold ${(attendanceHealth?.expiredTokens || 0) > 50 ? 'text-amber-600' : (attendanceHealth?.expiredTokens || 0) > 10 ? 'text-amber-500' : 'text-foreground'}`}>
                  {attendanceHealth?.expiredTokens || 0}
                </div>
                <p className="text-xs text-muted-foreground">Expired Tokens</p>
                {(attendanceHealth?.expiredTokens || 0) > 50 && (
                  <Badge variant="outline" className="mt-1 text-[10px] border-amber-500 text-amber-600">Awaiting cleanup</Badge>
                )}
              </div>
              
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">
                  {attendanceHealth?.recentCheckIns || 0}
                </div>
                <p className="text-xs text-muted-foreground">Check-ins (1h)</p>
              </div>
              
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {attendanceHealth?.lastCleanerRun 
                      ? formatInTimeZone(new Date(attendanceHealth.lastCleanerRun), 'Asia/Bangkok', 'dd/MM HH:mm', { locale: th })
                      : 'Never'
                    }
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Last Cleanup</p>
                <Badge 
                  variant={attendanceHealth?.cleanerStatus === 'success' ? 'default' : 'secondary'} 
                  className="mt-1 text-[10px]"
                >
                  {attendanceHealth?.cleanerStatus === 'success' ? '✓ OK' : attendanceHealth?.cleanerStatus || 'Unknown'}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Recent Alerts</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Latest unresolved issues</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {alertsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : recentAlerts && recentAlerts.length > 0 ? (
              <div className="space-y-3">
                {recentAlerts.map((alert) => (
                  <div key={alert.id} className="border-l-2 border-primary pl-3 py-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={alert.severity === 'high' ? 'destructive' : alert.severity === 'medium' ? 'default' : 'secondary'} className="text-[10px] sm:text-xs">
                            {alert.severity}
                          </Badge>
                          <span className="text-[10px] sm:text-xs text-muted-foreground">
                            {alert.type}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm line-clamp-2">{alert.summary}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatInTimeZone(new Date(alert.created_at), 'Asia/Bangkok', 'dd MMM yyyy HH:mm', { locale: th })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs sm:text-sm text-muted-foreground">
                ✅ No unresolved alerts
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">System Status</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Bot health indicators</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {healthLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm flex items-center gap-2">
                    <Wifi className="h-3 w-3" /> Webhook Status
                  </span>
                  <Badge variant={systemHealth?.webhook ? 'default' : 'destructive'} className="text-[10px]">
                    {systemHealth?.webhook ? '✓ Online' : '✗ Offline'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm flex items-center gap-2">
                    <Database className="h-3 w-3" /> Database
                  </span>
                  <Badge variant={systemHealth?.database ? 'default' : 'destructive'} className="text-[10px]">
                    {systemHealth?.database ? '✓ Connected' : '✗ Error'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm flex items-center gap-2">
                    <MessageSquare className="h-3 w-3" /> LINE API
                  </span>
                  <Badge variant={systemHealth?.lineApi ? 'default' : 'destructive'} className="text-[10px]">
                    {systemHealth?.lineApi ? '✓ Healthy' : '✗ Degraded'}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
