import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Brain, Database, TrendingUp, Users, Zap, Activity } from 'lucide-react';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))', 'hsl(var(--destructive))'];

export default function MemoryAnalytics() {
  const [timeRange, setTimeRange] = useState('7');

  // Memory Stats
  const { data: memoryStats } = useQuery({
    queryKey: ['memory-stats', timeRange],
    queryFn: async () => {
      const days = parseInt(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [workingRes, longTermRes, consolidatedRes, cognitiveProfilesRes, cognitiveRelationsRes] = await Promise.all([
        supabase.from('working_memory').select('id', { count: 'exact' }),
        supabase.from('memory_items').select('id', { count: 'exact' }).eq('is_deleted', false),
        supabase.from('memory_items').select('id', { count: 'exact' }).eq('is_deleted', false).gte('created_at', startDate.toISOString()),
        supabase.from('user_profiles').select('id', { count: 'exact' }),
        supabase.from('user_relationships').select('id', { count: 'exact' }),
      ]);

      return {
        workingMemories: workingRes.count || 0,
        longTermMemories: longTermRes.count || 0,
        consolidatedRecent: consolidatedRes.count || 0,
        cognitiveProfiles: cognitiveProfilesRes.count || 0,
        cognitiveRelationships: cognitiveRelationsRes.count || 0,
      };
    },
  });

  // Memory Strength Distribution
  const { data: strengthDistribution } = useQuery({
    queryKey: ['memory-strength-dist'],
    queryFn: async () => {
      const { data } = await supabase
        .from('memory_items')
        .select('memory_strength')
        .eq('is_deleted', false);

      const ranges = [
        { name: '0.0-0.2', min: 0, max: 0.2, count: 0 },
        { name: '0.2-0.4', min: 0.2, max: 0.4, count: 0 },
        { name: '0.4-0.6', min: 0.4, max: 0.6, count: 0 },
        { name: '0.6-0.8', min: 0.6, max: 0.8, count: 0 },
        { name: '0.8-1.0', min: 0.8, max: 1.0, count: 0 },
      ];

      data?.forEach(item => {
        const strength = item.memory_strength || 0;
        ranges.forEach(range => {
          if (strength >= range.min && strength < range.max) {
            range.count++;
          }
        });
      });

      return ranges;
    },
  });

  // Category Breakdown
  const { data: categoryBreakdown } = useQuery({
    queryKey: ['memory-categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('memory_items')
        .select('category')
        .eq('is_deleted', false);

      const categoryCounts = data?.reduce((acc: Record<string, number>, item) => {
        const cat = item.category || 'Unknown';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});

      return Object.entries(categoryCounts || {})
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
    },
  });

  // Memory Timeline (last 30 days)
  const { data: memoryTimeline } = useQuery({
    queryKey: ['memory-timeline'],
    queryFn: async () => {
      const days = 30;
      const timeline = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const [workingRes, longTermRes] = await Promise.all([
          supabase
            .from('working_memory')
            .select('id', { count: 'exact' })
            .gte('created_at', `${dateStr}T00:00:00`)
            .lt('created_at', `${dateStr}T23:59:59`),
          supabase
            .from('memory_items')
            .select('id', { count: 'exact' })
            .eq('is_deleted', false)
            .gte('created_at', `${dateStr}T00:00:00`)
            .lt('created_at', `${dateStr}T23:59:59`),
        ]);

        timeline.push({
          date: dateStr.slice(5), // MM-DD
          working: workingRes.count || 0,
          longTerm: longTermRes.count || 0,
        });
      }

      return timeline.filter((_, idx) => idx % Math.max(1, Math.floor(days / 10)) === 0); // Sample every N days
    },
  });

  // Top Groups by Memory Count
  const { data: topGroupsByMemory } = useQuery({
    queryKey: ['top-groups-memory'],
    queryFn: async () => {
      const { data } = await supabase
        .from('memory_items')
        .select('group_id, groups(display_name)')
        .eq('is_deleted', false)
        .not('group_id', 'is', null);

      const groupCounts = data?.reduce((acc: Record<string, { name: string; count: number }>, item) => {
        const groupName = (item.groups as any)?.display_name || 'Unknown';
        if (!acc[groupName]) {
          acc[groupName] = { name: groupName, count: 0 };
        }
        acc[groupName].count++;
        return acc;
      }, {});

      return Object.values(groupCounts || {})
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    },
  });

  // Consolidation Success Rate
  const consolidationRate = memoryStats
    ? memoryStats.consolidatedRecent > 0
      ? Math.round((memoryStats.consolidatedRecent / (memoryStats.workingMemories + memoryStats.consolidatedRecent)) * 100)
      : 0
    : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Memory System Analytics</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Performance metrics and cognitive processing statistics</p>
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

      {/* Key Metrics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Working Memory</CardTitle>
            <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{memoryStats?.workingMemories || 0}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Short-term memories active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Long-Term Memory</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memoryStats?.longTermMemories || 0}</div>
            <p className="text-xs text-muted-foreground">Consolidated memories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consolidation Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{consolidationRate}%</div>
            <p className="text-xs text-muted-foreground">Success in selected period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">User Profiles</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memoryStats?.cognitiveProfiles || 0}</div>
            <p className="text-xs text-muted-foreground">Cognitive profiles created</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Relationships</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memoryStats?.cognitiveRelationships || 0}</div>
            <p className="text-xs text-muted-foreground">User relationships detected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Memories</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memoryStats?.consolidatedRecent || 0}</div>
            <p className="text-xs text-muted-foreground">Created in selected period</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Memory Strength Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Memory Strength Distribution</CardTitle>
            <CardDescription>Distribution of memory retention scores</CardDescription>
          </CardHeader>
          <CardContent>
            {strengthDistribution && strengthDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
                <BarChart data={strengthDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: '11px' }} />
                  <YAxis tick={{ fontSize: '11px' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Memory Categories</CardTitle>
            <CardDescription>Top 6 categories by count</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryBreakdown && categoryBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="hsl(var(--primary))"
                    dataKey="value"
                  >
                    {categoryBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Memory Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Memory Creation Timeline (Last 30 Days)</CardTitle>
          <CardDescription>Working vs Long-term memory creation over time</CardDescription>
        </CardHeader>
        <CardContent>
          {memoryTimeline && memoryTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={memoryTimeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="working" stroke="hsl(var(--primary))" name="Working Memory" />
                <Line type="monotone" dataKey="longTerm" stroke="hsl(var(--secondary))" name="Long-Term Memory" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Groups by Memory */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 Groups by Memory Count</CardTitle>
          <CardDescription>Groups with most stored memories</CardDescription>
        </CardHeader>
        <CardContent>
          {topGroupsByMemory && topGroupsByMemory.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topGroupsByMemory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
