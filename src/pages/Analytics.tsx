import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MessageSquare, Users, TrendingUp } from 'lucide-react';

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('7');

  const { data: stats } = useQuery({
    queryKey: ['analytics', timeRange],
    queryFn: async () => {
      const days = parseInt(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [messagesRes, groupsRes, alertsRes] = await Promise.all([
        supabase
          .from('messages')
          .select('id', { count: 'exact' })
          .gte('sent_at', startDate.toISOString()),
        supabase
          .from('groups')
          .select('id, status', { count: 'exact' })
          .eq('status', 'active'),
        supabase
          .from('alerts')
          .select('id', { count: 'exact' })
          .gte('created_at', startDate.toISOString()),
      ]);

      return {
        totalMessages: messagesRes.count || 0,
        activeGroups: groupsRes.count || 0,
        totalAlerts: alertsRes.count || 0,
        avgMessagesPerGroup: groupsRes.count ? Math.round((messagesRes.count || 0) / groupsRes.count) : 0,
      };
    },
  });

  const { data: topGroups } = useQuery({
    queryKey: ['top-groups', timeRange],
    queryFn: async () => {
      const days = parseInt(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('messages')
        .select('group_id, groups(display_name)')
        .gte('sent_at', startDate.toISOString());

      if (error) throw error;

      const groupCounts = data.reduce((acc: Record<string, { name: string; count: number }>, msg) => {
        const groupName = (msg.groups as any)?.display_name || 'Unknown';
        if (!acc[groupName]) {
          acc[groupName] = { name: groupName, count: 0 };
        }
        acc[groupName].count++;
        return acc;
      }, {});

      return Object.values(groupCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Bot activity and engagement metrics</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-full sm:w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Messages</CardTitle>
            <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{stats?.totalMessages || 0}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">In selected period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Active Groups</CardTitle>
            <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{stats?.activeGroups || 0}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Avg per Group</CardTitle>
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{stats?.avgMessagesPerGroup || 0}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Messages per group</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Alerts</CardTitle>
            <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{stats?.totalAlerts || 0}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">In selected period</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Top 5 Active Groups</CardTitle>
          <CardDescription className="text-xs sm:text-sm">By message count in selected period</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {topGroups && topGroups.length > 0 ? (
            <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
              <BarChart data={topGroups}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" style={{ fontSize: '11px' }} />
                <YAxis style={{ fontSize: '11px' }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 sm:py-12 text-muted-foreground">
              <p className="text-sm">No data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
