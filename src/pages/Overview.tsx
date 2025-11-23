import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Users, CheckSquare, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Overview() {
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

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Recent Alerts</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Latest unresolved issues</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xs sm:text-sm text-muted-foreground">
              No alerts to display
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">System Status</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Bot health indicators</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm">Webhook Status</span>
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm">Database</span>
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm">LINE API</span>
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
