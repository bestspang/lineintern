import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Dices, Coins, Gift, Ghost } from 'lucide-react';

interface GachaItem {
  id: string;
  reward_id: string;
  prize_name: string;
  prize_name_th: string | null;
  prize_icon: string;
  prize_type: string;
  prize_value: number;
  prize_reward_id: string | null;
  weight: number;
  rarity: string;
  is_active: boolean;
}

interface Props {
  rewardId: string;
  rewardName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const rarityColors: Record<string, string> = {
  common: 'bg-muted text-muted-foreground',
  rare: 'bg-blue-100 text-blue-700',
  epic: 'bg-purple-100 text-purple-700',
  legendary: 'bg-yellow-100 text-yellow-700',
};

const typeIcons: Record<string, any> = {
  points: Coins,
  reward: Gift,
  nothing: Ghost,
};

export default function GachaBoxSettings({ rewardId, rewardName, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState<GachaItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['gacha-items', rewardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gacha_box_items')
        .select('*')
        .eq('reward_id', rewardId)
        .order('weight', { ascending: false });
      if (error) throw error;
      return data as GachaItem[];
    },
    enabled: open,
  });

  const { data: availableRewards = [] } = useQuery({
    queryKey: ['point-rewards-for-gacha'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_rewards')
        .select('id, name, name_th, icon')
        .eq('is_active', true)
        .neq('id', rewardId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: async (item: any) => {
      if (item.id) {
        const { id, ...updateData } = item;
        const { error } = await supabase.from('gacha_box_items').update(updateData).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('gacha_box_items').insert([{ ...item, reward_id: rewardId }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gacha-items', rewardId] });
      toast({ title: 'Prize saved' });
      setIsFormOpen(false);
      setEditingItem(null);
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gacha_box_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gacha-items', rewardId] });
      toast({ title: 'Prize deleted' });
    },
  });

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const item: any = {
      prize_name: fd.get('prize_name') as string,
      prize_name_th: (fd.get('prize_name_th') as string) || null,
      prize_icon: (fd.get('prize_icon') as string) || '🎁',
      prize_type: fd.get('prize_type') as string,
      prize_value: parseInt(fd.get('prize_value') as string) || 0,
      prize_reward_id: ((fd.get('prize_reward_id') as string) === 'none' ? null : (fd.get('prize_reward_id') as string)) || null,
      weight: parseInt(fd.get('weight') as string) || 10,
      rarity: fd.get('rarity') as string,
      is_active: fd.get('is_active') === 'on',
    };
    if (editingItem) item.id = editingItem.id;
    saveMutation.mutate(item);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] !grid !grid-rows-[auto_1fr] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dices className="h-5 w-5 text-primary" />
            Gacha Box Settings — {rewardName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-full pr-2">
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                {items.length} prizes · Total weight: {totalWeight}
              </span>
              <Button size="sm" onClick={() => { setEditingItem(null); setIsFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Prize
              </Button>
            </div>

            {/* Prize list */}
            {items.map((item) => {
              const pct = totalWeight > 0 ? ((item.weight / totalWeight) * 100).toFixed(1) : '0';
              const TypeIcon = typeIcons[item.prize_type] || Gift;
              return (
                <div key={item.id} className={`p-3 rounded-lg border ${!item.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{item.prize_icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{item.prize_name}</p>
                        <Badge className={rarityColors[item.rarity]}>{item.rarity}</Badge>
                        <Badge variant="outline" className="gap-1 text-xs">
                          <TypeIcon className="h-3 w-3" />
                          {item.prize_type}
                          {item.prize_type === 'points' && ` +${item.prize_value}`}
                        </Badge>
                      </div>
                      {item.prize_name_th && (
                        <p className="text-xs text-muted-foreground">{item.prize_name_th}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-primary">{pct}%</p>
                      <p className="text-xs text-muted-foreground">w:{item.weight}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setIsFormOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                        if (confirm('Delete this prize?')) deleteMutation.mutate(item.id);
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {/* Weight bar */}
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {items.length === 0 && !isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                <Dices className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No prizes configured yet</p>
                <p className="text-sm">Add prizes to make this gacha box work!</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Add/Edit Prize Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={(o) => { setIsFormOpen(o); if (!o) setEditingItem(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Prize' : 'Add Prize'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="prize_name">Name (EN)</Label>
                  <Input id="prize_name" name="prize_name" defaultValue={editingItem?.prize_name} required />
                </div>
                <div>
                  <Label htmlFor="prize_name_th">Name (TH)</Label>
                  <Input id="prize_name_th" name="prize_name_th" defaultValue={editingItem?.prize_name_th || ''} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="prize_icon">Icon</Label>
                  <Input id="prize_icon" name="prize_icon" defaultValue={editingItem?.prize_icon || '🎁'} />
                </div>
                <div>
                  <Label htmlFor="rarity">Rarity</Label>
                  <Select name="rarity" defaultValue={editingItem?.rarity || 'common'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="common">Common</SelectItem>
                      <SelectItem value="rare">Rare</SelectItem>
                      <SelectItem value="epic">Epic</SelectItem>
                      <SelectItem value="legendary">Legendary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="prize_type">Prize Type</Label>
                  <Select name="prize_type" defaultValue={editingItem?.prize_type || 'nothing'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="points">Points (คืนแต้ม)</SelectItem>
                      <SelectItem value="reward">Reward (ให้ item)</SelectItem>
                      <SelectItem value="nothing">Nothing (ปลอบใจ)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="prize_value">Point Value</Label>
                  <Input id="prize_value" name="prize_value" type="number" defaultValue={editingItem?.prize_value || 0} />
                </div>
              </div>
              <div>
                <Label htmlFor="prize_reward_id">Grant Reward (for type=reward)</Label>
                <Select name="prize_reward_id" defaultValue={editingItem?.prize_reward_id || 'none'}>
                  <SelectTrigger><SelectValue placeholder="Select reward..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {availableRewards.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.icon || '🎁'} {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="weight">Weight (น้ำหนักการสุ่ม)</Label>
                <Input id="weight" name="weight" type="number" min="1" defaultValue={editingItem?.weight || 10} required />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="is_active" name="is_active" defaultChecked={editingItem?.is_active ?? true} />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {editingItem ? 'Update' : 'Add'} Prize
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
