import { MemorySettings } from '@/components/MemorySettings';
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
  LayoutGrid,
  Settings as SettingsIcon
} from 'lucide-react';
import { RelationshipCard } from '@/components/social-intelligence/RelationshipCard';
import { UserProfileCard } from '@/components/social-intelligence/UserProfileCard';
import { RelationshipGraph } from '@/components/social-intelligence/RelationshipGraph';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Working Memory Table Component with "See More" button
function WorkingMemoryTable({ groupId, userId }: { groupId?: string; userId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const ITEMS_TO_SHOW = 5;
  
  const { data: workingMemories, isLoading } = useQuery({
    queryKey: ['working-memory', groupId, userId],
    queryFn: async () => {
      let query = supabase
        .from('working_memory')
        .select(`
          *,
          user:users(id, display_name),
          group:groups(id, display_name)
        `)
        .gt('expires_at', new Date().toISOString())
        .order('importance_score', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (groupId) {
        query = query.eq('group_id', groupId);
      }
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
  
  const promoteToLongTermMutation = useMutation({
    mutationFn: async (workingMemory: any) => {
      const { error: insertError } = await supabase
        .from('memory_items')
        .insert({
          scope: workingMemory.group_id ? 'group' : workingMemory.user_id ? 'user' : 'global',
          group_id: workingMemory.group_id,
          user_id: workingMemory.user_id,
          category: 'context',
          title: `Promoted: ${workingMemory.content.substring(0, 50)}`,
          content: workingMemory.content,
          importance_score: workingMemory.importance_score || 0.5,
          source_type: 'promoted',
          memory_strength: 1.0,
        });
      if (insertError) throw insertError;
      
      const { error: deleteError } = await supabase
        .from('working_memory')
        .delete()
        .eq('id', workingMemory.id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['working-memory'] });
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      toast({ title: 'Memory promoted to long-term' });
    },
  });
  
  const discardMemoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('working_memory')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['working-memory'] });
      toast({ title: 'Memory discarded' });
    },
  });
  
  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }
  
  if (!workingMemories || workingMemories.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
        <p className="text-lg text-muted-foreground mb-2">No working memories</p>
        <p className="text-sm text-muted-foreground">
          Working memories store recent decisions, tasks, and important context for 24 hours
        </p>
      </div>
    );
  }
  
  const displayedMemories = showAll ? workingMemories : workingMemories.slice(0, ITEMS_TO_SHOW);
  const remainingCount = workingMemories.length - ITEMS_TO_SHOW;
  
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[80px] text-xs sm:text-sm py-2">Type</TableHead>
              <TableHead className="min-w-[200px] text-xs sm:text-sm py-2">Content</TableHead>
              <TableHead className="hidden sm:table-cell text-xs sm:text-sm py-2">Importance</TableHead>
              <TableHead className="text-xs sm:text-sm py-2">Expires</TableHead>
              <TableHead className="hidden md:table-cell text-xs sm:text-sm py-2">Source</TableHead>
              <TableHead className="text-right text-xs sm:text-sm py-2">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedMemories.map((memory) => {
              const timeRemaining = new Date(memory.expires_at).getTime() - Date.now();
              const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
              const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
              
              return (
                <TableRow key={memory.id}>
                  <TableCell className="py-2">
                    <Badge variant="outline" className="h-4 sm:h-5 text-[10px] sm:text-xs">{memory.memory_type}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md py-2">
                    <div className="text-xs sm:text-sm" title={memory.content}>
                      {memory.content.length > 100 ? memory.content.substring(0, 100) + '...' : memory.content}
                    </div>
                    {memory.user && (
                      <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                        User: {memory.user.display_name}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell py-2">
                    <Badge variant={memory.importance_score > 0.7 ? 'default' : 'secondary'} className="h-4 sm:h-5 text-[10px] sm:text-xs">
                      {((memory.importance_score || 0) * 100).toFixed(0)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm py-2">
                    {timeRemaining > 0 ? (
                      <div className="text-muted-foreground">
                        {hoursRemaining > 0 && `${hoursRemaining}h `}
                        {minutesRemaining}m
                      </div>
                    ) : (
                      <Badge variant="destructive" className="h-4 sm:h-5 text-[10px] sm:text-xs">Expired</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs sm:text-sm text-muted-foreground py-2">
                    {memory.group?.display_name || 'Global'}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex gap-1 sm:gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
                        onClick={() => promoteToLongTermMutation.mutate(memory)}
                      >
                        <span className="hidden sm:inline">Promote</span>
                        <span className="sm:hidden">↑</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 sm:h-8 sm:w-8"
                        onClick={() => discardMemoryMutation.mutate(memory.id)}
                      >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      {/* See More / Show Less Button */}
      {workingMemories.length > ITEMS_TO_SHOW && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="text-xs"
          >
            {showAll ? 'Show Less' : `See More (${remainingCount} more)`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Memory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Master context state
  const [masterScope, setMasterScope] = useState<'group' | 'user' | 'global'>('group');
  const [masterGroupId, setMasterGroupId] = useState<string>('');
  const [masterUserId, setMasterUserId] = useState<string>('');
  
  // UI state
  const [activeTab, setActiveTab] = useState('memories');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMemory, setEditingMemory] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
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
  
  // Manual refresh function
  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['memories'] });
    queryClient.invalidateQueries({ queryKey: ['working-memory'] });
    queryClient.invalidateQueries({ queryKey: ['memory-stats'] });
    setLastUpdated(new Date());
    toast({ title: 'Refreshed memory data' });
  };

  // Manual consolidation trigger
  const consolidateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('memory-consolidator', {
        body: { trigger: 'manual', groupId: masterGroupId || null },
      });
      
      // Check both error object AND response data for errors
      if (error) throw new Error(error.message || 'Function invocation failed');
      if (data?.error) throw new Error(data.error);
      if (!data?.success && !data?.stats) throw new Error('Consolidation returned no data');
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      queryClient.invalidateQueries({ queryKey: ['working-memory'] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats'] });
      toast({ 
        title: 'Consolidation completed', 
        description: `Evaluated: ${data?.stats?.evaluated || 0}, Consolidated: ${data?.stats?.consolidated || 0}` 
      });
    },
    onError: (error) => {
      toast({ 
        title: 'Consolidation failed', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    },
  });

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      queryClient.invalidateQueries({ queryKey: ['working-memory'] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats'] });
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);
  
  // Fetch memory stats
  const { data: stats } = useQuery({
    queryKey: ['memory-stats', masterScope, masterGroupId, masterUserId],
    queryFn: async () => {
      let longTermQuery = supabase
        .from('memory_items')
        .select('importance_score', { count: 'exact' })
        .eq('is_deleted', false);
      
      let workingQuery = supabase
        .from('working_memory')
        .select('*', { count: 'exact' })
        .gt('expires_at', new Date().toISOString());
      
      if (masterScope === 'group' && masterGroupId) {
        longTermQuery = longTermQuery.eq('group_id', masterGroupId);
        workingQuery = workingQuery.eq('group_id', masterGroupId);
      } else if (masterScope === 'user' && masterUserId) {
        longTermQuery = longTermQuery.eq('user_id', masterUserId);
        workingQuery = workingQuery.eq('user_id', masterUserId);
      } else if (masterScope === 'global') {
        longTermQuery = longTermQuery.eq('scope', 'global');
      }
      
      const [longTermResult, workingResult] = await Promise.all([
        longTermQuery,
        workingQuery
      ]);
      
      if (longTermResult.error) throw longTermResult.error;
      if (workingResult.error) throw workingResult.error;
      
      const avgImportance = longTermResult.data && longTermResult.data.length > 0
        ? (longTermResult.data.reduce((sum, m) => sum + m.importance_score, 0) / longTermResult.data.length * 100).toFixed(0)
        : '0';
      
      return {
        longTermCount: longTermResult.count || 0,
        workingCount: workingResult.count || 0,
        avgImportance: avgImportance + '%',
      };
    },
  });
  
  // Fetch memories based on master context
  const { data: memories, isLoading } = useQuery({
    queryKey: ['memories', masterScope, masterGroupId, masterUserId, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('memory_items')
        .select(`
          *,
          user:users(id, display_name, avatar_url),
          group:groups(id, display_name)
        `)
        .eq('is_deleted', false);
      
      if (masterScope === 'group' && masterGroupId) {
        query = query.eq('scope', 'group').eq('group_id', masterGroupId);
      } else if (masterScope === 'user' && masterUserId) {
        query = query.eq('scope', 'user').eq('user_id', masterUserId);
      } else if (masterScope === 'global') {
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
    enabled: (masterScope === 'group' && !!masterGroupId) ||
             (masterScope === 'user' && !!masterUserId) ||
             masterScope === 'global'
  });
  
  // Fetch timeline data
  const { data: timelineData } = useQuery({
    queryKey: ['memory-timeline', masterScope, masterGroupId, masterUserId],
    queryFn: async () => {
      let query = supabase
        .from('memory_items')
        .select('id, scope, category, created_at, updated_at, last_used_at, importance_score')
        .eq('is_deleted', false);
      
      if (masterScope === 'group' && masterGroupId) {
        query = query.eq('group_id', masterGroupId);
      } else if (masterScope === 'user' && masterUserId) {
        query = query.eq('user_id', masterUserId);
      } else if (masterScope === 'global') {
        query = query.eq('scope', 'global');
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const now = new Date();
      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (29 - i));
        return date.toISOString().split('T')[0];
      });
      
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
        date: new Date(date).toLocaleDateString('th-TH', { month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' }),
        created: createdByDate[date] || 0,
        updated: updatedByDate[date] || 0,
        used: usedByDate[date] || 0,
      }));
      
      const categoryCount: Record<string, number> = {};
      data?.forEach((memory) => {
        categoryCount[memory.category] = (categoryCount[memory.category] || 0) + 1;
      });
      
      const categoryData = Object.entries(categoryCount).map(([category, count]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1),
        count,
      }));
      
      return { activityData, categoryData };
    },
  });
  
  // Fetch relationships for social intelligence tab
  const { data: relationships } = useQuery({
    queryKey: ['relationships', masterGroupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_relationships')
        .select(`
          *,
          user_a:users!user_relationships_user_a_id_fkey(id, display_name, avatar_url),
          user_b:users!user_relationships_user_b_id_fkey(id, display_name, avatar_url),
          group:groups(id, display_name)
        `)
        .eq('group_id', masterGroupId)
        .order('confidence_score', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: masterScope === 'group' && !!masterGroupId
  });

  const { data: userProfiles } = useQuery({
    queryKey: ['user-profiles', masterGroupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          *,
          user:users(id, display_name, avatar_url),
          group:groups(id, display_name)
        `)
        .eq('group_id', masterGroupId)
        .order('observation_count', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: masterScope === 'group' && !!masterGroupId
  });
  
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
  
  // State for "See More" in Long-Term Memory table
  const [showAllLongTerm, setShowAllLongTerm] = useState(false);
  const LONG_TERM_ITEMS_TO_SHOW = 5;
  
  const renderMemoryTable = () => {
    if (!memories || memories.length === 0) {
      return (
        <div className="text-center py-12">
          <Brain className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
          <p className="text-lg text-muted-foreground mb-2">No memories yet</p>
          <p className="text-sm text-muted-foreground">
            Keep chatting in LINE and memories will appear automatically.
          </p>
        </div>
      );
    }
    
    const displayedMemories = showAllLongTerm ? memories : memories.slice(0, LONG_TERM_ITEMS_TO_SHOW);
    const remainingCount = memories.length - LONG_TERM_ITEMS_TO_SHOW;
    
    return (
      <div className="space-y-3">
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
            {displayedMemories.map((memory) => (
              <TableRow key={memory.id}>
                <TableCell>
                  <Badge variant="outline">{memory.category}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {memory.pinned && <Pin className="w-3 h-3 text-primary" />}
                    <span className="font-medium" title={memory.title}>
                      {memory.title.length > 50 ? memory.title.substring(0, 50) + '...' : memory.title}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-md" title={memory.content}>
                  {memory.content.length > 100 ? memory.content.substring(0, 100) + '...' : memory.content}
                </TableCell>
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
        
        {/* See More / Show Less Button */}
        {memories.length > LONG_TERM_ITEMS_TO_SHOW && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllLongTerm(!showAllLongTerm)}
              className="text-xs"
            >
              {showAllLongTerm ? 'Show Less' : `See More (${remainingCount} more)`}
            </Button>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 sm:w-8 sm:h-8" />
            Memory Bot
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage business decisions, tasks, and context memory</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs sm:text-sm text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className="h-7 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
            onClick={handleManualRefresh}
          >
            <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">↻</span>
          </Button>
          <Button 
            variant="default" 
            size="sm"
            className="h-7 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
            onClick={() => consolidateMutation.mutate()}
            disabled={consolidateMutation.isPending}
          >
            <Brain className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            {consolidateMutation.isPending ? 'Running...' : 'Consolidate'}
          </Button>
          <Button 
            size="sm"
            className="h-7 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
            onClick={() => {
            setEditingMemory({
              scope: masterScope,
              group_id: masterScope === 'group' ? masterGroupId : null,
              user_id: masterScope === 'user' ? masterUserId : null,
              category: 'meta',
              importance_score: 0.5,
              pinned: false
            });
            setIsDialogOpen(true);
          }}>
            <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Add Memory</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>
      
      {/* Master Context Selector */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Context Selector</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Choose the scope to view memories</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1">
              <Label>Scope</Label>
              <Select value={masterScope} onValueChange={(val: any) => setMasterScope(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">Group</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {masterScope === 'group' && (
              <div className="flex-1">
                <Label>Select Group</Label>
                <Select value={masterGroupId} onValueChange={setMasterGroupId}>
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
            
            {masterScope === 'user' && (
              <div className="flex-1">
                <Label>Select User</Label>
                <Select value={masterUserId} onValueChange={setMasterUserId}>
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
        </CardContent>
      </Card>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{stats?.longTermCount || 0}</div>
            <p className="text-sm text-muted-foreground">Long-term Memories</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{stats?.workingCount || 0}</div>
            <p className="text-sm text-muted-foreground">Working Memories</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{stats?.avgImportance || '0%'}</div>
            <p className="text-sm text-muted-foreground">Avg Importance</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Search & Tabs */}
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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="memories">
                <Brain className="w-4 h-4 mr-2" />
                Memories
              </TabsTrigger>
              <TabsTrigger value="timeline">
                <Clock className="w-4 h-4 mr-2" />
                Timeline
              </TabsTrigger>
              {masterScope === 'group' && (
                <TabsTrigger value="social">
                  <Users className="w-4 h-4 mr-2" />
                  Social Intelligence
                </TabsTrigger>
              )}
              <TabsTrigger value="settings">
                <SettingsIcon className="w-4 h-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="memories" className="space-y-6">
              {/* Working Memory Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Working Memory (Short-Term)
                  </CardTitle>
                  <CardDescription>
                    Recent 24-hour memory capturing business decisions, task assignments, and important context. 
                    High-importance items (0.6+) are automatically consolidated to long-term every 10 minutes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <WorkingMemoryTable 
                    groupId={masterScope === 'group' ? masterGroupId : undefined}
                    userId={masterScope === 'user' ? masterUserId : undefined}
                  />
                </CardContent>
              </Card>
              
              {/* Long-term Memory Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5" />
                    Long-Term Memories
                  </CardTitle>
                  <CardDescription>
                    Consolidated knowledge from working memory: business decisions, SOPs, recurring tasks, and critical context
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="text-center py-8">Loading...</div>
                  ) : (
                    renderMemoryTable()
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="timeline" className="space-y-6">
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
            </TabsContent>
            
            <TabsContent value="social" className="space-y-6">
              {masterGroupId ? (
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
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Cards View */}
                  {viewMode === 'cards' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                      
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
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  )}
                  
                  {/* Relationship Type Distribution */}
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
                    Social Intelligence is only available for groups. Please select a group in the Context Selector above.
                  </p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="settings" className="space-y-4">
              <MemorySettings />
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
