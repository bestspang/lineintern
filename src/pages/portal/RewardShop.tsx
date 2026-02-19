import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Gift, Coins, ShieldCheck, Clock, Backpack } from 'lucide-react';
import { Link } from 'react-router-dom';

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

interface PointsBalance {
  point_balance?: number;
  current_balance?: number;
  total_earned?: number;
  current_streak?: number;
}

export default function RewardShop() {
  const { employee, locale } = usePortal();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [useChoice, setUseChoice] = useState<'use_now' | 'bag'>('use_now');

  const { data: happyPoints } = useQuery({
    queryKey: ['my-happy-points', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return null;
      const { data, error } = await portalApi<PointsBalance>({
        endpoint: 'my-points-balance',
        employee_id: employee.id
      });
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id,
  });

  const { data: bagCount } = useQuery({
    queryKey: ['my-bag-count', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return 0;
      const { count, error } = await supabase
        .from('employee_bag_items')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', employee.id)
        .eq('status', 'active');
      if (error) return 0;
      return count || 0;
    },
    enabled: !!employee?.id,
  });

  const { data: rewards, isLoading } = useQuery({
    queryKey: ['available-rewards'],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data, error } = await portalApi<Reward[]>({
        endpoint: 'rewards-list',
        employee_id: employee.id
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
  });

  const redeemMutation = useMutation({
    mutationFn: async ({ rewardId, toBag }: { rewardId: string; toBag: boolean }) => {
      const action = toBag ? 'redeem_to_bag' : 'redeem';
      const response = await supabase.functions.invoke('point-redemption', {
        body: {
          action,
          employee_id: employee?.id,
          reward_id: rewardId,
        },
      });
      
      if (response.error) throw new Error(response.error.message);
      if (!response.data.success) throw new Error(response.data.error || 'Redemption failed');
      
      return { ...response.data, toBag };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-happy-points'] });
      queryClient.invalidateQueries({ queryKey: ['available-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['my-bag-items'] });
      queryClient.invalidateQueries({ queryKey: ['my-bag-count'] });
      
      if (data.toBag) {
        toast({
          title: locale === 'th' ? '🎒 เก็บในกระเป๋าแล้ว!' : '🎒 Saved to Bag!',
          description: locale === 'th' ? 'ไปดูในกระเป๋าของฉัน' : 'Check it in My Bag',
        });
      } else {
        toast({
          title: locale === 'th' ? '🎉 แลกรางวัลสำเร็จ!' : '🎉 Reward Redeemed!',
          description: data.requires_approval 
            ? (locale === 'th' ? 'รอการอนุมัติจากผู้จัดการ' : 'Waiting for manager approval')
            : (locale === 'th' ? 'สามารถใช้งานได้ทันที' : 'You can use it now!'),
        });
      }
      setSelectedReward(null);
    },
    onError: (error) => {
      toast({
        title: locale === 'th' ? 'เกิดข้อผิดพลาด' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const balance = happyPoints?.point_balance || happyPoints?.current_balance || 0;

  const groupedRewards = rewards?.reduce((acc, reward) => {
    if (!acc[reward.category]) acc[reward.category] = [];
    acc[reward.category].push(reward);
    return acc;
  }, {} as Record<string, Reward[]>) || {};

  const categoryLabels: Record<string, { th: string; en: string }> = {
    micro: { th: '🎲 รางวัลย่อย', en: '🎲 Micro Rewards' },
    perk: { th: '🛋️ สวัสดิการ', en: '🛋️ Workplace Perks' },
    legendary: { th: '🏆 รางวัลใหญ่', en: '🏆 Legendary Rewards' },
  };

  const handleConfirm = () => {
    if (!selectedReward) return;
    const useMode = selectedReward.use_mode || 'use_now';
    const toBag = useMode === 'bag_only' || (useMode === 'choose' && useChoice === 'bag');
    redeemMutation.mutate({ rewardId: selectedReward.id, toBag });
  };

  const handleSelectReward = (reward: Reward) => {
    setSelectedReward(reward);
    // Default choice based on use_mode
    if (reward.use_mode === 'bag_only') {
      setUseChoice('bag');
    } else {
      setUseChoice('use_now');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          {locale === 'th' ? 'ร้านค้ารางวัล' : 'Reward Shop'}
        </h1>
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon" className="relative">
            <Link to="/portal/my-bag">
              <Backpack className="h-5 w-5 text-primary" />
              {(bagCount ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                  {bagCount}
                </span>
              )}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon">
            <Link to="/portal/my-points">
              <Coins className="h-5 w-5 text-yellow-500" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Balance */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {locale === 'th' ? 'แต้มของคุณ' : 'Your Points'}
            </span>
            <Badge variant="secondary" className="text-lg gap-1 px-3">
              <Coins className="h-4 w-4 text-yellow-500" />
              {balance.toLocaleString()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Rewards by Category */}
      {['micro', 'perk', 'legendary'].map((category) => {
        const categoryRewards = groupedRewards[category];
        if (!categoryRewards?.length) return null;

        return (
          <div key={category} className="space-y-3">
            <h2 className="font-semibold text-sm">
              {locale === 'th' ? categoryLabels[category]?.th : categoryLabels[category]?.en}
            </h2>
            <div className="grid gap-3">
              {categoryRewards.map((reward) => {
                const canAfford = balance >= reward.point_cost;
                const outOfStock = reward.stock_limit && reward.stock_used >= reward.stock_limit;

                return (
                  <Card 
                    key={reward.id} 
                    className={`transition-all ${canAfford && !outOfStock ? 'hover:shadow-md cursor-pointer' : 'opacity-60'}`}
                    onClick={() => canAfford && !outOfStock && handleSelectReward(reward)}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{reward.icon || '🎁'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm">
                                {locale === 'th' ? reward.name_th || reward.name : reward.name}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {locale === 'th' ? reward.description_th || reward.description : reward.description}
                              </p>
                            </div>
                            <Badge variant={canAfford ? 'default' : 'secondary'} className="gap-1 shrink-0">
                              <Coins className="h-3 w-3" />
                              {reward.point_cost}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            {reward.use_mode === 'bag_only' && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Backpack className="h-3 w-3" />
                                {locale === 'th' ? 'เก็บอย่างเดียว' : 'Bag only'}
                              </Badge>
                            )}
                            {reward.use_mode === 'choose' && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Backpack className="h-3 w-3" />
                                {locale === 'th' ? 'เก็บได้' : 'Can store'}
                              </Badge>
                            )}
                            {reward.requires_approval && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                {locale === 'th' ? 'ต้องอนุมัติ' : 'Approval'}
                              </Badge>
                            )}
                            {reward.cooldown_days > 0 && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Clock className="h-3 w-3" />
                                {reward.cooldown_days}d
                              </Badge>
                            )}
                            {outOfStock && (
                              <Badge variant="destructive" className="text-xs">
                                {locale === 'th' ? 'หมด' : 'Out of stock'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Confirm Dialog */}
      <Dialog open={!!selectedReward} onOpenChange={() => setSelectedReward(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{selectedReward?.icon}</span>
              {locale === 'th' ? selectedReward?.name_th || selectedReward?.name : selectedReward?.name}
            </DialogTitle>
            <DialogDescription>
              {locale === 'th' ? selectedReward?.description_th || selectedReward?.description : selectedReward?.description}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span>{locale === 'th' ? 'ราคา' : 'Cost'}</span>
              <Badge className="gap-1">
                <Coins className="h-4 w-4" />
                {selectedReward?.point_cost}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span>{locale === 'th' ? 'แต้มคงเหลือหลังแลก' : 'Balance After'}</span>
              <span className="font-medium">{(balance - (selectedReward?.point_cost || 0)).toLocaleString()}</span>
            </div>

            {/* Use mode choice */}
            {selectedReward?.use_mode === 'choose' && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {locale === 'th' ? 'คุณต้องการ...' : 'What would you like to do?'}
                </Label>
                <RadioGroup value={useChoice} onValueChange={(v) => setUseChoice(v as 'use_now' | 'bag')}>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border cursor-pointer hover:bg-muted" onClick={() => setUseChoice('use_now')}>
                    <RadioGroupItem value="use_now" id="use_now" />
                    <Label htmlFor="use_now" className="cursor-pointer flex-1">
                      <p className="font-medium">{locale === 'th' ? '⚡ ใช้เลย' : '⚡ Use Now'}</p>
                      <p className="text-xs text-muted-foreground">{locale === 'th' ? 'เปิดใช้ทันที' : 'Activate immediately'}</p>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border cursor-pointer hover:bg-muted" onClick={() => setUseChoice('bag')}>
                    <RadioGroupItem value="bag" id="bag" />
                    <Label htmlFor="bag" className="cursor-pointer flex-1">
                      <p className="font-medium">{locale === 'th' ? '🎒 เก็บในกระเป๋า' : '🎒 Save to Bag'}</p>
                      <p className="text-xs text-muted-foreground">{locale === 'th' ? 'เก็บไว้ใช้ทีหลัง' : 'Store for later use'}</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {selectedReward?.use_mode === 'bag_only' && (
              <div className="p-3 bg-muted rounded-lg text-sm flex items-center gap-2">
                <Backpack className="h-4 w-4 text-primary" />
                {locale === 'th'
                  ? 'ไอเทมนี้จะถูกเก็บในกระเป๋าของคุณ'
                  : 'This item will be stored in your bag'}
              </div>
            )}

            {selectedReward?.requires_approval && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <ShieldCheck className="h-4 w-4 inline mr-1" />
                {locale === 'th' 
                  ? 'รางวัลนี้ต้องรอการอนุมัติจากผู้จัดการ' 
                  : 'This reward requires manager approval'}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReward(null)}>
              {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={redeemMutation.isPending}
            >
              {redeemMutation.isPending 
                ? (locale === 'th' ? 'กำลังแลก...' : 'Redeeming...') 
                : (locale === 'th' ? 'ยืนยันแลกรางวัล' : 'Confirm Redemption')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}