/**
 * ⚠️ CRITICAL HEALTH MONITORING PAGE - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This page displays real-time system health metrics for the LINE Intern system.
 * 
 * INVARIANTS:
 * 1. All date queries MUST include timezone offset (+07:00) for Bangkok time
 * 2. RefetchInterval is set to 30000ms (30s) for real-time monitoring
 * 3. Do NOT change the systemStatus calculation logic without testing
 * 
 * COMMON BUGS TO AVOID:
 * - Using ${today}T00:00:00 without +07:00 causes timezone boundary issues
 * - Changing refetchInterval too high causes stale data
 * - Modifying success rate thresholds affects system status display
 * 
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * [ ] All .gte() and .lte() queries include +07:00 timezone offset
 * [ ] RefetchInterval values are preserved
 * [ ] System status logic remains unchanged
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  MessageSquare, 
  Zap,
  Database,
  Server,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { isCheckInType, isCheckOutType } from '@/lib/portal-attendance';
import { formatBangkokISODate } from '@/lib/timezone';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  lastChecked: Date;
  message: string;
}

interface EdgeFunctionStat {
  name: string;
  totalCalls: number;
  successRate: number;
  avgResponseTime: number;
  lastError: string | null;
  lastErrorAt: Date | null;
}

export default function HealthMonitoring() {
  // Fetch bot message logs stats
  const { data: botStats, isLoading: botStatsLoading } = useQuery({
    queryKey: ['bot-message-stats'],
    queryFn: async () => {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: stats } = await supabase
        .from('bot_message_logs')
        .select('delivery_status, edge_function_name, sent_at, error_message')
        .gte('sent_at', last7d);

      if (!stats) return null;

      const last24hMessages = stats.filter(s => s.sent_at >= last24h);
      const successCount = last24hMessages.filter(s => s.delivery_status === 'sent').length;
      const failedCount = last24hMessages.filter(s => s.delivery_status === 'failed').length;

      // Group by edge function
      const functionStats: Record<string, { total: number; success: number; failed: number }> = {};
      stats.forEach(log => {
        if (!functionStats[log.edge_function_name]) {
          functionStats[log.edge_function_name] = { total: 0, success: 0, failed: 0 };
        }
        functionStats[log.edge_function_name].total++;
        if (log.delivery_status === 'sent') {
          functionStats[log.edge_function_name].success++;
        } else {
          functionStats[log.edge_function_name].failed++;
        }
      });

      // Recent errors
      const recentErrors = stats
        .filter(s => s.error_message)
        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
        .slice(0, 5);

      return {
        total24h: last24hMessages.length,
        successCount,
        failedCount,
        successRate: last24hMessages.length > 0 ? (successCount / last24hMessages.length) * 100 : 0,
        functionStats,
        recentErrors,
      };
    },
    refetchInterval: 30000, // Critical: Health monitoring needs frequent updates
  });

  // Fetch attendance system health
  const { data: attendanceHealth, isLoading: attendanceHealthLoading } = useQuery({
    queryKey: ['attendance-health'],
    queryFn: async () => {
      const today = formatBangkokISODate(new Date());
      
      // Check today's logs - CRITICAL: Must use +07:00 for Bangkok timezone
      const { data: todayLogs } = await supabase
        .from('attendance_logs')
        .select('id, event_type, is_flagged, fraud_score')
        .gte('server_time', `${today}T00:00:00+07:00`)
        .lte('server_time', `${today}T23:59:59+07:00`);

      // Check active employees
      const { data: employees } = await supabase
        .from('employees')
        .select('id, is_active')
        .eq('is_active', true);

      // Check pending tokens
      const { data: tokens } = await supabase
        .from('attendance_tokens')
        .select('id, status, created_at')
        .eq('status', 'pending')
        .gte('expires_at', new Date().toISOString());

      const checkIns = todayLogs?.filter(l => isCheckInType(l.event_type)).length || 0;
      const checkOuts = todayLogs?.filter(l => isCheckOutType(l.event_type)).length || 0;
      const flaggedLogs = todayLogs?.filter(l => l.is_flagged).length || 0;
      const highRiskLogs = todayLogs?.filter(l => (l.fraud_score || 0) >= 70).length || 0;

      return {
        totalEmployees: employees?.length || 0,
        todayCheckIns: checkIns,
        todayCheckOuts: checkOuts,
        flaggedLogs,
        highRiskLogs,
        pendingTokens: tokens?.length || 0,
      };
    },
    refetchInterval: 30000, // Critical: Attendance health monitoring
  });

  // Fetch database health
  const { data: dbHealth, isLoading: dbHealthLoading } = useQuery({
    queryKey: ['db-health'],
    queryFn: async () => {
      const start = Date.now();
      
      // Simple query to test database responsiveness
      const { error } = await supabase
        .from('app_settings')
        .select('id')
        .limit(1);
      
      const responseTime = Date.now() - start;
      
      return {
        status: error ? 'down' : responseTime < 500 ? 'healthy' : 'degraded',
        responseTime,
        message: error ? 'Database connection failed' : 'Database operational',
      };
    },
    refetchInterval: 30000, // Critical: Database health check
  });

  // Overall system status
  const systemStatus: SystemHealth = {
    status: 
      dbHealth?.status === 'down' ? 'down' :
      (botStats?.successRate || 100) < 80 ? 'degraded' :
      attendanceHealth?.highRiskLogs && attendanceHealth.highRiskLogs > 5 ? 'degraded' :
      'healthy',
    lastChecked: new Date(),
    message: 
      dbHealth?.status === 'down' ? 'Database connection issues detected' :
      (botStats?.successRate || 100) < 80 ? 'Low bot message delivery rate' :
      attendanceHealth?.highRiskLogs && attendanceHealth.highRiskLogs > 5 ? 'High fraud detection alerts' :
      'All systems operational',
  };

  if (botStatsLoading || attendanceHealthLoading || dbHealthLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="w-7 h-7" />
          System Health Monitoring
        </h1>
        <p className="text-muted-foreground mt-1">
          Real-time system status and performance metrics
        </p>
      </div>

      {/* Overall System Status */}
      <Card className={
        systemStatus.status === 'healthy' ? 'border-green-500/50' :
        systemStatus.status === 'degraded' ? 'border-yellow-500/50' :
        'border-red-500/50'
      }>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {systemStatus.status === 'healthy' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
              {systemStatus.status === 'degraded' && <AlertTriangle className="w-5 h-5 text-yellow-600" />}
              {systemStatus.status === 'down' && <XCircle className="w-5 h-5 text-red-600" />}
              System Status
            </span>
            <Badge 
              variant={
                systemStatus.status === 'healthy' ? 'default' :
                systemStatus.status === 'degraded' ? 'secondary' :
                'destructive'
              }
            >
              {systemStatus.status.toUpperCase()}
            </Badge>
          </CardTitle>
          <CardDescription>
            {systemStatus.message} • Last checked {formatDistanceToNow(systemStatus.lastChecked, { addSuffix: true })}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bot Messages (24h)</CardTitle>
            <MessageSquare className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{botStats?.total24h || 0}</div>
            <p className="text-xs text-muted-foreground">
              {botStats?.successRate.toFixed(1)}% success rate
            </p>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="text-green-600 border-green-600">
                ✓ {botStats?.successCount || 0}
              </Badge>
              <Badge variant="outline" className="text-red-600 border-red-600">
                ✗ {botStats?.failedCount || 0}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database Health</CardTitle>
            <Database className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dbHealth?.responseTime || 0}ms</div>
            <p className="text-xs text-muted-foreground">{dbHealth?.message}</p>
            <Badge 
              variant={dbHealth?.status === 'healthy' ? 'default' : 'destructive'}
              className="mt-2"
            >
              {dbHealth?.status.toUpperCase()}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attendance Today</CardTitle>
            <Clock className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attendanceHealth?.todayCheckIns || 0}</div>
            <p className="text-xs text-muted-foreground">
              {attendanceHealth?.todayCheckOuts || 0} check-outs
            </p>
            <Badge variant="outline" className="mt-2">
              {attendanceHealth?.totalEmployees || 0} employees
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {attendanceHealth?.flaggedLogs || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {attendanceHealth?.highRiskLogs || 0} high risk
            </p>
            <Badge 
              variant={
                (attendanceHealth?.highRiskLogs || 0) > 5 ? 'destructive' : 'outline'
              }
              className="mt-2"
            >
              {(attendanceHealth?.highRiskLogs || 0) > 5 ? 'ATTENTION NEEDED' : 'NORMAL'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Edge Functions Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            Edge Functions Performance (7 days)
          </CardTitle>
          <CardDescription>Message delivery by function</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {botStats && Object.entries(botStats.functionStats).map(([name, stats]) => (
              <div key={name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{name}</div>
                  <div className="text-sm text-muted-foreground">
                    {stats.total} total • {stats.success} success • {stats.failed} failed
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={stats.failed === 0 ? 'default' : 'secondary'}>
                    {((stats.success / stats.total) * 100).toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Errors */}
      {botStats && botStats.recentErrors.length > 0 && (
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              Recent Errors (Last 5)
            </CardTitle>
            <CardDescription>Most recent bot message delivery failures</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {botStats.recentErrors.map((error, idx) => (
                <div key={idx} className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{error.edge_function_name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {error.error_message}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(error.sent_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Tokens */}
      {attendanceHealth && attendanceHealth.pendingTokens > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Active Attendance Tokens
            </CardTitle>
            <CardDescription>Tokens waiting to be used</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{attendanceHealth.pendingTokens}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Pending check-in/check-out tokens
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
