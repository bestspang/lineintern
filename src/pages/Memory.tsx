import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { 
  Pin, 
  PinOff, 
  Edit, 
  Trash2, 
  Plus, 
  Search,
  Brain,
  Clock,
  Users,
  User,
  Network,
  LayoutGrid
} from 'lucide-react';
import { RelationshipCard } from '@/components/social-intelligence/RelationshipCard';
import { UserProfileCard } from '@/components/social-intelligence/UserProfileCard';
import { RelationshipGraph } from '@/components/social-intelligence/RelationshipGraph';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Memory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('by-group');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMemory, setEditingMemory] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [timelineScope, setTimelineScope] = useState<'all' | 'group' | 'user'>('all');
  const [timelineGroupId, setTimelineGroupId] = useState<string>('');
  const [timelineUserId, setTimelineUserId] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedSocialGroupId, setSelectedSocialGroupId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'graph' | 'cards'>('graph');
  
  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .order('display_name');
      if (error) throw error;
      return data;
    },
  });
  
  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['memory-by-group'] });
      queryClient.invalidateQueries({ queryKey: ['memory-by-user'] });
      queryClient.invalidateQueries({ queryKey: ['memory-global'] });
      queryClient.invalidateQueries({ queryKey: ['memory-timeline'] });
      setLastUpdated(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, [queryClient]);
  
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('display_name');
      if (error) throw error;
      return data;
    },
  });
  
  // Fetch relationships for social intelligence tab
  const { data: relationships } = useQuery({
    queryKey: ['relationships', selectedSocialGroupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_relationships')
        .select(`
          *,
          user_a:users!user_relationships_user_a_id_fkey(id, display_name, avatar_url),
          user_b:users!user_relationships_user_b_id_fkey(id, display_name, avatar_url),
          group:groups(id, display_name)
        `)
        .eq('group_id', selectedSocialGroupId)
        .order('confidence_score', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSocialGroupId
  });

  // Fetch user profiles for social intelligence tab
  const { data: userProfiles } = useQuery({
    queryKey: ['user-profiles', selectedSocialGroupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          *,
          user:users(id, display_name, avatar_url),
          group:groups(id, display_name)
        `)
        .eq('group_id', selectedSocialGroupId)
        .order('observation_count', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSocialGroupId
  });
  
  // Process relationship type distribution data
  const relationshipTypeData = relationships ? 
    Object.entries(
      relationships.reduce((acc: Record<string, number>, rel) => {
        const type = rel.relationship_type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {})
    ).map(([type, count]) => ({
      type: type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' '),
      count
    }))
    : [];
  
  // Fetch timeline data
  const { data: timelineData } = useQuery({
    queryKey: ['memory-timeline', timelineScope, timelineGroupId, timelineUserId],
    queryFn: async () => {
      let query = supabase
        .from('memory_items')
        .select('id, scope, category, created_at, updated_at, last_used_at, importance_score')
        .eq('is_deleted', false);
      
      if (timelineScope === 'group' && timelineGroupId) {
        query = query.eq('group_id', timelineGroupId);
      } else if (timelineScope === 'user' && timelineUserId) {
        query = query.eq('user_id', timelineUserId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Process data for timeline charts
      const now = new Date();
      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (29 - i));
        return date.toISOString().split('T')[0];
      });
      
      // Group by date
      const createdByDate: Record<string, number> = {};
      const updatedByDate: Record<string, number> = {};
      const usedByDate: Record<string, number> = {};
      
      data?.forEach((memory) => {
        const createdDate = memory.created_at.split('T')[0];
        const updatedDate = memory.updated_at.split('T')[0];
        const usedDate = memory.last_used_at?.split('T')[0];
        
        createdByDate[createdDate] = (createdByDate[createdDate] || 0) + 1;
        updatedByDate[updatedDate] = (updatedByDate[updatedDate] || 0) + 1;
        if (usedDate) {
          usedByDate[usedDate] = (usedByDate[usedDate] || 0) + 1;
        }
      });
      
      const activityData = last30Days.map((date) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        created: createdByDate[date] || 0,
        updated: updatedByDate[date] || 0,
        used: usedByDate[date] || 0,
      }));
      
      // Category distribution
      const categoryCount: Record<string, number> = {};
      data?.forEach((memory) => {
        categoryCount[memory.category] = (categoryCount[memory.category] || 0) + 1;
      });
      
      const categoryData = Object.entries(categoryCount).map(([category, count]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1),
        count,
      }));
      
      // Recent activity (last 10 memories by activity)
      const recentActivity = data
        ?.map((m) => ({
          ...m,
          lastActivity: m.last_used_at || m.updated_at,
        }))
        .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
        .slice(0, 10);
      
      return {
        activityData,
        categoryData,
        recentActivity,
        totalMemories: data?.length || 0,
        avgImportance: data?.length 
          ? (data.reduce((sum, m) => sum + m.importance_score, 0) / data.length).toFixed(2)
          : '0',
      };
    },
  });

  const { data: memories, isLoading } = useQuery({
    queryKey: ['memories', activeTab, selectedGroupId, selectedUserId, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('memory_items')
        .select(`
          *,
          user:users(id, display_name, avatar_url),
          group:groups(id, display_name)
        `)
        .eq('is_deleted', false);
      
      if (activeTab === 'by-group' && selectedGroupId) {
        query = query.eq('scope', 'group').eq('group_id', selectedGroupId);
      } else if (activeTab === 'by-user' && selectedUserId) {
        query = query.eq('scope', 'user').eq('user_id', selectedUserId);
      } else if (activeTab === 'global') {
        query = query.eq('scope', 'global');
      } else {
        return [];
      }
      
      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);
      }
      
      query = query.order('pinned', { ascending: false })
                   .order('importance_score', { ascending: false })
                   .order('created_at', { ascending: false });
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: (activeTab === 'by-group' && !!selectedGroupId) ||
             (activeTab === 'by-user' && !!selectedUserId) ||
             activeTab === 'global'
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('memory_items')
        .update({ is_deleted: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      toast({ title: 'Memory deleted' });
    },
  });
  
  const pinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from('memory_items')
        .update({ pinned })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      toast({ title: variables.pinned ? 'Memory pinned' : 'Memory unpinned' });
    },
  });
  
  const saveMutation = useMutation({
    mutationFn: async (memory: any) => {
      if (memory.id) {
        const { error } = await supabase
          .from('memory_items')
          .update({
            title: memory.title,
            content: memory.content,
            category: memory.category,
            importance_score: parseFloat(memory.importance_score),
            pinned: memory.pinned
          })
          .eq('id', memory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('memory_items')
          .insert({
            scope: memory.scope,
            user_id: memory.user_id || null,
            group_id: memory.group_id || null,
            category: memory.category,
            title: memory.title,
            content: memory.content,
            importance_score: parseFloat(memory.importance_score),
            source_type: 'manual',
            pinned: memory.pinned || false
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      setIsDialogOpen(false);
      setEditingMemory(null);
      toast({ title: editingMemory?.id ? 'Memory updated' : 'Memory created' });
    },
  });
  
  const renderMemoryTable = () => {
    if (!memories || memories.length === 0) {
      return (
        <div className="text-center py-12">
          <Brain className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
          <p className="text-lg text-muted-foreground mb-2">No memories yet</p>
          <p className="text-sm text-muted-foreground">
            Keep chatting in LINE and memories will appear automatically.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Memories are extracted from meaningful conversations (preferences, facts, events).
          </p>
        </div>
      );
    }
    
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Content</TableHead>
            <TableHead>Importance</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {memories.map((memory) => (
            <TableRow key={memory.id}>
              <TableCell>
                <Badge variant="outline">{memory.category}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {memory.pinned && <Pin className="w-3 h-3 text-primary" />}
                  <span className="font-medium">{memory.title}</span>
                </div>
              </TableCell>
              <TableCell className="max-w-md truncate">{memory.content}</TableCell>
              <TableCell>
                <Badge variant={memory.importance_score > 0.7 ? 'default' : 'secondary'}>
                  {(memory.importance_score * 100).toFixed(0)}%
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {memory.last_used_at 
                  ? formatDistanceToNow(new Date(memory.last_used_at), { addSuffix: true })
                  : 'Never'}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => pinMutation.mutate({ id: memory.id, pinned: !memory.pinned })}
                  >
                    {memory.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditingMemory(memory);
                      setIsDialogOpen(true);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(memory.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="w-8 h-8" />
            Memory Bot
          </h1>
          <p className="text-muted-foreground">Manage what the bot remembers about users and groups</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
          <Button onClick={() => {
            setEditingMemory({
              scope: activeTab === 'global' ? 'global' : activeTab === 'by-group' ? 'group' : 'user',
              group_id: selectedGroupId,
              user_id: selectedUserId,
              category: 'meta',
              importance_score: 0.5,
              pinned: false
            });
            setIsDialogOpen(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Memory
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="by-group">By Group</TabsTrigger>
              <TabsTrigger value="by-user">By User</TabsTrigger>
              <TabsTrigger value="global">Global</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="social">Social Intelligence</TabsTrigger>
            </TabsList>
            
            <TabsContent value="by-group" className="space-y-4">
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a group..." />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedGroupId && renderMemoryTable()}
            </TabsContent>
            
            <TabsContent value="by-user" className="space-y-4">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedUserId && renderMemoryTable()}
            </TabsContent>
            
            <TabsContent value="global" className="space-y-4">
              {renderMemoryTable()}
            </TabsContent>
            
            <TabsContent value="timeline" className="space-y-6">
              {/* Timeline Scope Selector */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label>View Timeline For</Label>
                  <Select value={timelineScope} onValueChange={(val: any) => setTimelineScope(val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Memories</SelectItem>
                      <SelectItem value="group">Specific Group</SelectItem>
                      <SelectItem value="user">Specific User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {timelineScope === 'group' && (
                  <div className="flex-1">
                    <Label>Select Group</Label>
                    <Select value={timelineGroupId} onValueChange={setTimelineGroupId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a group..." />
                      </SelectTrigger>
                      <SelectContent>
                        {groups?.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {timelineScope === 'user' && (
                  <div className="flex-1">
                    <Label>Select User</Label>
                    <Select value={timelineUserId} onValueChange={setTimelineUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {users?.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Total Memories</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{timelineData?.totalMemories || 0}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Avg. Importance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{timelineData?.avgImportance || '0'}</div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Activity Timeline Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Memory Activity (Last 30 Days)
                  </CardTitle>
                  <CardDescription>
                    Track when memories are created, updated, and used
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timelineData?.activityData || []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                        }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="created" 
                        stroke="hsl(var(--primary))" 
                        name="Created"
                        strokeWidth={2}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="updated" 
                        stroke="hsl(var(--chart-2))" 
                        name="Updated"
                        strokeWidth={2}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="used" 
                        stroke="hsl(var(--chart-3))" 
                        name="Used"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              {/* Category Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Memory Distribution by Category</CardTitle>
                  <CardDescription>
                    Breakdown of memory types
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={timelineData?.categoryData || []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="category"
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                        }}
                      />
                      <Bar 
                        dataKey="count" 
                        fill="hsl(var(--primary))"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              {/* Recent Activity List */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Memory Activity</CardTitle>
                  <CardDescription>
                    Most recently created, updated, or used memories
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {timelineData?.recentActivity && timelineData.recentActivity.length > 0 ? (
                    <div className="space-y-3">
                      {timelineData.recentActivity.map((memory: any) => (
                        <div 
                          key={memory.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {memory.category}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {memory.scope}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(memory.lastActivity), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      No recent activity
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="social" className="space-y-6">
              {/* Group Selector */}
              <Select value={selectedSocialGroupId} onValueChange={setSelectedSocialGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a group to view social dynamics..." />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedSocialGroupId ? (
                <>
                  {/* Stats Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Relationships</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{relationships?.length || 0}</div>
                        <p className="text-xs text-muted-foreground">Detected connections</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {relationships?.length 
                            ? ((relationships.reduce((sum, r) => sum + (r.confidence_score || 0), 0) / relationships.length) * 100).toFixed(0) + '%'
                            : '0%'
                          }
                        </div>
                        <p className="text-xs text-muted-foreground">Learning certainty</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">User Profiles</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{userProfiles?.length || 0}</div>
                        <p className="text-xs text-muted-foreground">Observed users</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Observations</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {userProfiles?.reduce((sum, p) => sum + (p.observation_count || 0), 0) || 0}
                        </div>
                        <p className="text-xs text-muted-foreground">Data points</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Main Content: Network Graph + Cards Toggle */}
                  <div className="space-y-4">
                    {/* View Mode Toggle */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Relationship Visualization</h3>
                      <div className="flex gap-2">
                        <Button
                          variant={viewMode === 'graph' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setViewMode('graph')}
                        >
                          <Network className="w-4 h-4 mr-2" />
                          Graph
                        </Button>
                        <Button
                          variant={viewMode === 'cards' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setViewMode('cards')}
                        >
                          <LayoutGrid className="w-4 h-4 mr-2" />
                          Cards
                        </Button>
                      </div>
                    </div>

                    {/* Network Graph View */}
                    {viewMode === 'graph' && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Relationship Network</CardTitle>
                          <CardDescription>
                            Interactive visualization of connections between users
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {relationships && relationships.length > 0 ? (
                            <RelationshipGraph relationships={relationships} />
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                              <p>No relationships detected yet</p>
                              <p className="text-xs mt-1">
                                The bot needs more conversations to learn relationships
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Cards View */}
                    {viewMode === 'cards' && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column: Relationships */}
                        <div className="space-y-4">
                          <Card>
                            <CardHeader>
                              <CardTitle>Relationship Network</CardTitle>
                              <CardDescription>
                                Detected connections between users in this group
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              {relationships && relationships.length > 0 ? (
                                <div className="space-y-4">
                                  {relationships.map(rel => (
                                    <RelationshipCard key={rel.id} relationship={rel} />
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                  <p>No relationships detected yet</p>
                                  <p className="text-xs mt-1">
                                    The bot needs more conversations to learn relationships
                                  </p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                        
                        {/* Right Column: User Profiles */}
                        <div className="space-y-4">
                          <Card>
                            <CardHeader>
                              <CardTitle>User Profiles</CardTitle>
                              <CardDescription>
                                AI-learned personality and preferences
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              {userProfiles && userProfiles.length > 0 ? (
                                <div className="space-y-4">
                                  {userProfiles.map(profile => (
                                    <UserProfileCard key={profile.id} profile={profile} />
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                  <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                  <p>No user profiles yet</p>
                                  <p className="text-xs mt-1">
                                    The bot will learn about users as they interact
                                  </p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Relationship Type Distribution Chart */}
                  {relationshipTypeData.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Relationship Type Distribution</CardTitle>
                        <CardDescription>
                          Breakdown of relationship types in this group
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={relationshipTypeData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="type"
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                            />
                            <YAxis 
                              tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '6px',
                              }}
                            />
                            <Bar 
                              dataKey="count" 
                              fill="hsl(var(--primary))"
                              radius={[8, 8, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Select a Group</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose a group above to see the social dynamics and relationships
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingMemory?.id ? 'Edit Memory' : 'Create Memory'}</DialogTitle>
            <DialogDescription>
              {editingMemory?.id ? 'Update the memory details' : 'Add a new memory for the bot'}
            </DialogDescription>
          </DialogHeader>
          
          {editingMemory && (
            <div className="space-y-4">
              <div>
                <Label>Category</Label>
                <Select 
                  value={editingMemory.category} 
                  onValueChange={(val) => setEditingMemory({...editingMemory, category: val})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trait">Trait</SelectItem>
                    <SelectItem value="preference">Preference</SelectItem>
                    <SelectItem value="topic">Topic</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="context">Context</SelectItem>
                    <SelectItem value="relationship">Relationship</SelectItem>
                    <SelectItem value="meta">Meta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Title (10-120 chars)</Label>
                <Input
                  value={editingMemory.title || ''}
                  onChange={(e) => setEditingMemory({...editingMemory, title: e.target.value})}
                  placeholder="Short summary of the memory"
                />
              </div>
              
              <div>
                <Label>Content (20-500 chars)</Label>
                <Textarea
                  value={editingMemory.content || ''}
                  onChange={(e) => setEditingMemory({...editingMemory, content: e.target.value})}
                  placeholder="Detailed description of what to remember"
                  rows={4}
                />
              </div>
              
              <div>
                <Label>Importance Score (0.0 - 1.0)</Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={editingMemory.importance_score || 0.5}
                  onChange={(e) => setEditingMemory({...editingMemory, importance_score: e.target.value})}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingMemory.pinned || false}
                  onChange={(e) => setEditingMemory({...editingMemory, pinned: e.target.checked})}
                  id="pinned"
                />
                <Label htmlFor="pinned">Pin this memory (never auto-delete)</Label>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(editingMemory)}>
              {editingMemory?.id ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
