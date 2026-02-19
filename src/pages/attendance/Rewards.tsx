import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Gift, Plus, Pencil, Trash2, Coins, ShieldCheck, Package } from 'lucide-react';

interface Reward {
  id: string;
  name: string;
  name_th: string | null;
  description: string | null;
  description_th: string | null;
  point_cost: number;
  category: string;
  icon: string | null;
  is_active: boolean;
  requires_approval: boolean;
  stock_limit: number | null;
  stock_used: number;
  cooldown_days: number;
  use_mode: string;
}

export default function Rewards() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rewards, isLoading } = useQuery({
    queryKey: ['point-rewards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_rewards')
        .select('*')
        .order('point_cost', { ascending: true });
      
      if (error) throw error;
      return data as Reward[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (reward: Partial<Reward> & { id: string }) => {
      const { error } = await supabase
        .from('point_rewards')
        .update(reward)
        .eq('id', reward.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['point-rewards'] });
      toast({ title: 'Reward updated successfully' });
      setIsDialogOpen(false);
      setEditingReward(null);
    },
    onError: (error) => {
      toast({ title: 'Error updating reward', description: error.message, variant: 'destructive' });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (reward: Omit<Reward, 'id' | 'stock_used'>) => {
      const { error } = await supabase
        .from('point_rewards')
        .insert(reward);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['point-rewards'] });
      toast({ title: 'Reward created successfully' });
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Error creating reward', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('point_rewards')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['point-rewards'] });
      toast({ title: 'Reward deleted' });
    },
    onError: (error) => {
      toast({ title: 'Error deleting reward', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const reward = {
      name: formData.get('name') as string,
      name_th: formData.get('name_th') as string || null,
      description: formData.get('description') as string || null,
      description_th: formData.get('description_th') as string || null,
      point_cost: parseInt(formData.get('point_cost') as string),
      category: formData.get('category') as string,
      icon: formData.get('icon') as string || null,
      is_active: formData.get('is_active') === 'on',
      requires_approval: formData.get('requires_approval') === 'on',
      stock_limit: formData.get('stock_limit') ? parseInt(formData.get('stock_limit') as string) : null,
      cooldown_days: parseInt(formData.get('cooldown_days') as string) || 0,
      use_mode: formData.get('use_mode') as string || 'use_now',
    };

    if (editingReward) {
      updateMutation.mutate({ ...reward, id: editingReward.id });
    } else {
      createMutation.mutate(reward as any);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'micro': return 'bg-blue-100 text-blue-700';
      case 'perk': return 'bg-green-100 text-green-700';
      case 'legendary': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const groupedRewards = rewards?.reduce((acc, reward) => {
    if (!acc[reward.category]) acc[reward.category] = [];
    acc[reward.category].push(reward);
    return acc;
  }, {} as Record<string, Reward[]>) || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" />
            Reward Management
          </h1>
          <p className="text-muted-foreground">จัดการรางวัลที่สามารถแลกได้ด้วย Happy Points</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setEditingReward(null);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Reward
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingReward ? 'Edit Reward' : 'Create Reward'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name (EN)</Label>
                  <Input id="name" name="name" defaultValue={editingReward?.name} required />
                </div>
                <div>
                  <Label htmlFor="name_th">Name (TH)</Label>
                  <Input id="name_th" name="name_th" defaultValue={editingReward?.name_th || ''} />
                </div>
              </div>
              <div>
                <Label htmlFor="description">Description (EN)</Label>
                <Textarea id="description" name="description" defaultValue={editingReward?.description || ''} />
              </div>
              <div>
                <Label htmlFor="description_th">Description (TH)</Label>
                <Textarea id="description_th" name="description_th" defaultValue={editingReward?.description_th || ''} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="point_cost">Point Cost</Label>
                  <Input id="point_cost" name="point_cost" type="number" defaultValue={editingReward?.point_cost || 100} required />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select name="category" defaultValue={editingReward?.category || 'perk'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="micro">Micro (50-100 pts)</SelectItem>
                      <SelectItem value="perk">Perk (150-800 pts)</SelectItem>
                      <SelectItem value="legendary">Legendary (1000+ pts)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="icon">Icon Emoji</Label>
                  <Input id="icon" name="icon" defaultValue={editingReward?.icon || '🎁'} placeholder="🎁" />
                </div>
                <div>
                  <Label htmlFor="cooldown_days">Cooldown (days)</Label>
                  <Input id="cooldown_days" name="cooldown_days" type="number" defaultValue={editingReward?.cooldown_days || 0} />
                </div>
              </div>
              <div>
                <Label htmlFor="stock_limit">Stock Limit (empty = unlimited)</Label>
                <Input id="stock_limit" name="stock_limit" type="number" defaultValue={editingReward?.stock_limit || ''} />
              </div>
              <div>
                <Label htmlFor="use_mode">Use Mode</Label>
                <Select name="use_mode" defaultValue={editingReward?.use_mode || 'use_now'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="use_now">Use Now (ใช้ทันที)</SelectItem>
                    <SelectItem value="bag_only">Bag Only (เก็บอย่างเดียว)</SelectItem>
                    <SelectItem value="choose">Choose (ให้เลือก)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch id="is_active" name="is_active" defaultChecked={editingReward?.is_active ?? true} />
                  <Label htmlFor="is_active">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="requires_approval" name="requires_approval" defaultChecked={editingReward?.requires_approval ?? false} />
                  <Label htmlFor="requires_approval">Requires Approval</Label>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingReward ? 'Update Reward' : 'Create Reward'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : (
        Object.entries(groupedRewards).map(([category, categoryRewards]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge className={getCategoryColor(category)}>{category.toUpperCase()}</Badge>
                <span className="text-muted-foreground font-normal">({categoryRewards.length} rewards)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reward</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-center">Stock</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Approval</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryRewards.map((reward) => (
                    <TableRow key={reward.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{reward.icon || '🎁'}</span>
                          <div>
                            <p className="font-medium">{reward.name}</p>
                            <p className="text-xs text-muted-foreground">{reward.name_th}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="gap-1">
                          <Coins className="h-3 w-3" />
                          {reward.point_cost}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {reward.stock_limit ? (
                          <span className={reward.stock_used >= reward.stock_limit ? 'text-red-500' : ''}>
                            {reward.stock_used}/{reward.stock_limit}
                          </span>
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={reward.is_active ? 'default' : 'secondary'}>
                          {reward.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={reward.requires_approval}
                          onCheckedChange={(checked) => {
                            updateMutation.mutate({ 
                              id: reward.id, 
                              requires_approval: checked 
                            });
                          }}
                          disabled={updateMutation.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingReward(reward);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm('Delete this reward?')) {
                                deleteMutation.mutate(reward.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
