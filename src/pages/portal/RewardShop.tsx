import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Gift, Coins, ShieldCheck, Clock, ArrowLeft } from 'lucide-react';
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

  // Use portalApi for points balance
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

  // Use portalApi for rewards list
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

  // Redemption still uses edge function directly (has complex logic)
  const redeemMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const response = await supabase.functions.invoke('point-redemption', {
        body: {
          employee_id: employee?.id,
          reward_id: rewardId,
        },
      });
      
      if (response.error) throw new Error(response.error.message);
      if (!response.data.success) throw new Error(response.data.error || 'Redemption failed');
      
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-happy-points'] });
      queryClient.invalidateQueries({ queryKey: ['available-rewards'] });
      toast({
        title: locale === 'th' ? '🎉 แลกรางวัลสำเร็จ!' : '🎉 Reward Redeemed!',
        description: data.requires_approval 
          ? (locale === 'th' ? 'รอการอนุมัติจากผู้จัดการ' : 'Waiting for manager approval')
          : (locale === 'th' ? 'สามารถใช้งานได้ทันที' : 'You can use it now!'),
      });
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
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/portal/my-points">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {locale === 'th' ? 'ร้านค้ารางวัล' : 'Reward Shop'}
          </h1>
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
                    onClick={() => canAfford && !outOfStock && setSelectedReward(reward)}
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
            {selectedReward?.requires_approval && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
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
              onClick={() => selectedReward && redeemMutation.mutate(selectedReward.id)}
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
