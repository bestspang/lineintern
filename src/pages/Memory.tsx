import { useState } from 'react';
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
  Brain
} from 'lucide-react';

export default function Memory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('by-group');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMemory, setEditingMemory] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
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
        <div className="text-center py-12 text-muted-foreground">
          <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No memories found</p>
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="by-group">By Group</TabsTrigger>
              <TabsTrigger value="by-user">By User</TabsTrigger>
              <TabsTrigger value="global">Global</TabsTrigger>
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
