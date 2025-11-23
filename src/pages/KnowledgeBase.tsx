import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Pencil, Trash2, Globe, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function KnowledgeBase() {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    content: '',
    scope: 'global' as 'global' | 'group',
    group_id: null as string | null,
    is_active: true,
    tags: [] as string[]
  });

  const queryClient = useQueryClient();

  const { data: globalItems, isLoading: globalLoading } = useQuery({
    queryKey: ['knowledge', 'global', search],
    queryFn: async () => {
      let query = supabase
        .from('knowledge_items')
        .select('*')
        .eq('scope', 'global')
        .order('updated_at', { ascending: false });
      
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: groupItems, isLoading: groupLoading } = useQuery({
    queryKey: ['knowledge', 'group', search],
    queryFn: async () => {
      let query = supabase
        .from('knowledge_items')
        .select('*, groups(display_name)')
        .eq('scope', 'group')
        .order('updated_at', { ascending: false });
      
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .order('display_name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('knowledge_items').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      toast.success('Knowledge item created successfully');
      closeDialog();
    },
    onError: (error) => {
      toast.error('Failed to create knowledge item: ' + error.message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const { error } = await supabase.from('knowledge_items').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      toast.success('Knowledge item updated successfully');
      closeDialog();
    },
    onError: (error) => {
      toast.error('Failed to update knowledge item: ' + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('knowledge_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      toast.success('Knowledge item deleted successfully');
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    },
    onError: (error) => {
      toast.error('Failed to delete knowledge item: ' + error.message);
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('knowledge_items').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      toast.success('Knowledge item status updated');
    },
    onError: (error) => {
      toast.error('Failed to update status: ' + error.message);
    }
  });

  const openCreateDialog = () => {
    setEditingItem(null);
    setFormData({
      title: '',
      category: '',
      content: '',
      scope: 'global',
      group_id: null,
      is_active: true,
      tags: []
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: any) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      category: item.category,
      content: item.content,
      scope: item.scope,
      group_id: item.group_id,
      is_active: item.is_active,
      tags: item.tags || []
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (item: any) => {
    setItemToDelete(item);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      deleteMutation.mutate(itemToDelete.id);
    }
  };

  const renderTable = (items: any[] | undefined, isLoading: boolean) => {
    if (isLoading) {
      return (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }

    if (!items || items.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <p>No knowledge items found</p>
          <p className="text-sm mt-2">Click "Add Knowledge Item" to create one</p>
        </div>
      );
    }

    return (
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%] min-w-[200px]">Knowledge Item</TableHead>
              <TableHead className="w-[25%] min-w-[140px]">Scope</TableHead>
              <TableHead className="w-[20%]">Updated</TableHead>
              <TableHead className="w-[15%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium line-clamp-1 flex-1">{item.title}</p>
                      <Switch
                        checked={item.is_active}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: item.id, is_active: checked })}
                        className="scale-75"
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      {item.last_used_at && (
                        <span className="text-xs text-muted-foreground">
                          Used {formatDistanceToNow(new Date(item.last_used_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {item.scope === 'global' ? (
                      <>
                        <Globe className="h-3 w-3" />
                        Global
                      </>
                    ) : (
                      <>
                        <Users className="h-3 w-3" />
                        {item.groups?.display_name || 'Group'}
                      </>
                    )}
                  </Badge>
                </TableCell>
                <TableCell>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => openEditDialog(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">Manage FAQ and documentation snippets</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Knowledge Item
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Knowledge</CardTitle>
          <CardDescription>
            <Input
              placeholder="Search by title or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="global">
        <TabsList>
          <TabsTrigger value="global">Global Knowledge</TabsTrigger>
          <TabsTrigger value="group">Per-Group Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <Card>
            <CardHeader>
              <CardTitle>Global Knowledge Items</CardTitle>
              <CardDescription>Available to all groups</CardDescription>
            </CardHeader>
            <CardContent>
              {renderTable(globalItems, globalLoading)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="group">
          <Card>
            <CardHeader>
              <CardTitle>Group-Specific Knowledge</CardTitle>
              <CardDescription>Scoped to individual groups</CardDescription>
            </CardHeader>
            <CardContent>
              {renderTable(groupItems, groupLoading)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Knowledge Item' : 'Create Knowledge Item'}</DialogTitle>
              <DialogDescription>
                {editingItem ? 'Update the knowledge item details below' : 'Add a new knowledge item to the database'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., How to use Magic Mode"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Getting Started">Getting Started</SelectItem>
                    <SelectItem value="Commands">Commands</SelectItem>
                    <SelectItem value="Modes">Modes</SelectItem>
                    <SelectItem value="FAQ">FAQ</SelectItem>
                    <SelectItem value="Features">Features</SelectItem>
                    <SelectItem value="Safety">Safety</SelectItem>
                    <SelectItem value="Memory">Memory</SelectItem>
                    <SelectItem value="Personality">Personality</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Content * (Markdown supported)</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter content in markdown format..."
                  className="min-h-[200px] font-mono text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scope">Scope *</Label>
                  <Select
                    value={formData.scope}
                    onValueChange={(value: 'global' | 'group') => setFormData({ ...formData, scope: value, group_id: value === 'global' ? null : formData.group_id })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          Global
                        </div>
                      </SelectItem>
                      <SelectItem value="group">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Group-Specific
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.scope === 'group' && (
                  <div className="space-y-2">
                    <Label htmlFor="group">Group *</Label>
                    <Select
                      value={formData.group_id || ''}
                      onValueChange={(value) => setFormData({ ...formData, group_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select group" />
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags.join(', ')}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                  placeholder="e.g., magic, personality, ai"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{itemToDelete?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
