import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Coins, ArrowLeft, RotateCcw, Sparkles, History } from 'lucide-react';
import { Link } from 'react-router-dom';

type Phase = 'idle' | 'spinning' | 'reveal';

interface Prize {
  name: string;
  name_th: string | null;
  icon: string;
  type: string;
  value: number;
  rarity: string;
}

interface GachaItem {
  id: string;
  prize_name: string;
  prize_name_th: string | null;
  prize_icon: string;
  prize_type: string;
  prize_value: number;
  weight: number;
  rarity: string;
}

const rarityStyles: Record<string, { border: string; glow: string; bg: string }> = {
  common: { border: 'border-muted-foreground/30', glow: '', bg: 'bg-muted' },
  rare: { border: 'border-blue-400', glow: 'shadow-[0_0_20px_rgba(59,130,246,0.3)]', bg: 'bg-blue-50' },
  epic: { border: 'border-purple-400', glow: 'shadow-[0_0_30px_rgba(147,51,234,0.4)]', bg: 'bg-purple-50' },
  legendary: { border: 'border-yellow-400', glow: 'shadow-[0_0_40px_rgba(234,179,8,0.5)]', bg: 'bg-yellow-50' },
};

export default function GachaBox() {
  const { employee, locale } = usePortal();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const [spinIndex, setSpinIndex] = useState(0);
  const spinRef = useRef<number | null>(null);
  const spinStartRef = useRef<number>(0);

  // Find gacha reward
  const { data: gachaReward } = useQuery({
    queryKey: ['gacha-reward'],
    queryFn: async () => {
      if (!employee?.id) return null;
      const { data, error } = await portalApi<any[]>({
        endpoint: 'rewards-list',
        employee_id: employee.id,
      });
      if (error) throw error;
      // Find reward with name containing "Gacha" (case insensitive)
      return data?.find((r: any) => r.name.toLowerCase().includes('gacha')) || null;
    },
    enabled: !!employee?.id,
  });

  // Get gacha items for display
  const { data: gachaItems = [] } = useQuery({
    queryKey: ['gacha-display-items', gachaReward?.id],
    queryFn: async () => {
      if (!gachaReward?.id || !employee?.id) return [];
      const { data, error } = await portalApi<GachaItem[]>({
        endpoint: 'gacha-items',
        employee_id: employee.id,
        params: { reward_id: gachaReward.id },
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!gachaReward?.id && !!employee?.id,
  });

  // Get balance
  const { data: happyPoints } = useQuery({
    queryKey: ['my-happy-points', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return null;
      const { data, error } = await portalApi<any>({
        endpoint: 'my-points-balance',
        employee_id: employee.id,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id,
  });

  // Daily pull count
  const { data: dailyCount } = useQuery({
    queryKey: ['gacha-daily-count', employee?.id, gachaReward?.id],
    queryFn: async () => {
      if (!employee?.id || !gachaReward?.id) return null;
      const { data, error } = await portalApi<{ pulls_today: number; daily_limit: number | null }>({
        endpoint: 'gacha-daily-count',
        employee_id: employee.id,
        params: { reward_id: gachaReward.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id && !!gachaReward?.id,
  });

  const balance = newBalance ?? happyPoints?.point_balance ?? happyPoints?.current_balance ?? 0;
  const canAfford = gachaReward ? balance >= gachaReward.point_cost : false;
  const dailyLimitReached = dailyCount?.daily_limit ? (dailyCount.pulls_today >= dailyCount.daily_limit) : false;

  const pullMutation = useMutation({
    mutationFn: async () => {
      if (!employee?.id || !gachaReward?.id) throw new Error('Gacha reward not found');
      const { data, error } = await portalApi<any>({
        endpoint: 'gacha-pull',
        employee_id: employee.id,
        params: { reward_id: gachaReward.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Pull failed');
      return data;
    },
    onSuccess: (data) => {
      setWonPrize(data.prize);
      setNewBalance(data.new_balance);
      // Start spin animation, reveal after 3s
      startSpin();
      setTimeout(() => {
        stopSpin();
        setPhase('reveal');
        // Haptic feedback on mobile
        if (navigator.vibrate) {
          const pattern = data.prize.rarity === 'legendary' ? [100, 50, 100, 50, 200] :
                          data.prize.rarity === 'epic' ? [100, 50, 100] : [50];
          navigator.vibrate(pattern);
        }
        queryClient.invalidateQueries({ queryKey: ['my-happy-points'] });
        queryClient.invalidateQueries({ queryKey: ['my-bag-items'] });
        queryClient.invalidateQueries({ queryKey: ['my-bag-count'] });
        queryClient.invalidateQueries({ queryKey: ['gacha-daily-count'] });
      }, 3000);
    },
    onError: (error) => {
      setPhase('idle');
      toast({ title: locale === 'th' ? 'เกิดข้อผิดพลาด' : 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const startSpin = useCallback(() => {
    setPhase('spinning');
    spinStartRef.current = Date.now();
    let frame = 0;
    const animate = () => {
      const elapsed = Date.now() - spinStartRef.current;
      // Speed decreases over 3 seconds
      const speed = Math.max(1, 20 - (elapsed / 3000) * 19);
      frame++;
      if (frame % Math.round(speed) === 0) {
        setSpinIndex((prev) => (prev + 1) % Math.max(gachaItems.length, 1));
      }
      spinRef.current = requestAnimationFrame(animate);
    };
    spinRef.current = requestAnimationFrame(animate);
  }, [gachaItems.length]);

  const stopSpin = useCallback(() => {
    if (spinRef.current) {
      cancelAnimationFrame(spinRef.current);
      spinRef.current = null;
    }
  }, []);

  useEffect(() => () => stopSpin(), [stopSpin]);

  const handlePull = () => {
    if (!canAfford || dailyLimitReached || pullMutation.isPending || phase !== 'idle') return;
    setWonPrize(null);
    pullMutation.mutate();
  };

  const handleReset = () => {
    setPhase('idle');
    setWonPrize(null);
  };

  if (!gachaReward) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const currentDisplayItem = gachaItems[spinIndex % Math.max(gachaItems.length, 1)];
  const rStyle = wonPrize ? rarityStyles[wonPrize.rarity] || rarityStyles.common : rarityStyles.common;

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/portal/rewards">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {locale === 'th' ? 'กลับ' : 'Back'}
          </Link>
        </Button>
        <Badge variant="secondary" className="text-lg gap-1 px-3">
          <Coins className="h-4 w-4 text-yellow-500" />
          {balance.toLocaleString()}
        </Badge>
      </div>

      {/* Gacha Box Card */}
      <Card className="overflow-hidden">
        <CardContent className="py-6 text-center">
          {phase === 'idle' && (
            <div className="space-y-4 animate-fade-in">
              <div className="relative inline-block">
                <span className="text-7xl animate-bounce inline-block">{gachaReward.icon || '🎲'}</span>
                <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-yellow-400 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold">
                {locale === 'th' ? gachaReward.name_th || gachaReward.name : gachaReward.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {locale === 'th' 
                  ? gachaReward.description_th || gachaReward.description || 'กดสุ่มเพื่อลุ้นรางวัล!'
                  : gachaReward.description || 'Pull to win a random prize!'}
              </p>
              <Button
                size="lg"
                onClick={handlePull}
                disabled={!canAfford || dailyLimitReached || pullMutation.isPending}
                className="text-lg px-8 py-6 gap-2"
              >
                <Coins className="h-5 w-5" />
                {locale === 'th' ? `สุ่มเลย! (${gachaReward.point_cost} pts)` : `Pull! (${gachaReward.point_cost} pts)`}
              </Button>
              {dailyLimitReached && (
                <p className="text-sm text-destructive">
                  {locale === 'th' 
                    ? `สุ่มครบ ${dailyCount?.daily_limit} ครั้งแล้ววันนี้` 
                    : `Daily limit reached (${dailyCount?.daily_limit} pulls/day)`}
                </p>
              )}
              {!canAfford && !dailyLimitReached && (
                <p className="text-sm text-destructive">
                  {locale === 'th' ? 'แต้มไม่พอ' : 'Not enough points'}
                </p>
              )}
              {dailyCount?.daily_limit && !dailyLimitReached && (
                <p className="text-xs text-muted-foreground">
                  {locale === 'th' 
                    ? `สุ่มแล้ว ${dailyCount.pulls_today}/${dailyCount.daily_limit} ครั้งวันนี้` 
                    : `${dailyCount.pulls_today}/${dailyCount.daily_limit} pulls today`}
                </p>
              )}
              <Button asChild variant="ghost" size="sm" className="gap-1">
                <Link to="/portal/gacha-history">
                  <History className="h-4 w-4" />
                  {locale === 'th' ? 'ประวัติการสุ่ม' : 'Pull History'}
                </Link>
              </Button>
            </div>
          )}

          {phase === 'spinning' && currentDisplayItem && (
            <div className="space-y-4 py-8">
              <p className="text-sm text-muted-foreground animate-pulse">
                {locale === 'th' ? '🎰 กำลังสุ่ม...' : '🎰 Spinning...'}
              </p>
              <div className="h-32 flex items-center justify-center">
                <div className="text-center transition-all duration-75">
                  <span className="text-6xl block">{currentDisplayItem.prize_icon}</span>
                  <p className="text-sm font-medium mt-2">
                    {locale === 'th' ? currentDisplayItem.prize_name_th || currentDisplayItem.prize_name : currentDisplayItem.prize_name}
                  </p>
                </div>
              </div>
              <div className="flex justify-center gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-2 w-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {phase === 'reveal' && wonPrize && (
            <div className={`space-y-4 py-6 animate-scale-in ${wonPrize.rarity === 'legendary' ? 'animate-[shake_0.3s_ease-in-out_2]' : ''}`}>
              {/* Confetti for epic/legendary */}
              {(wonPrize.rarity === 'epic' || wonPrize.rarity === 'legendary') && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {Array.from({ length: wonPrize.rarity === 'legendary' ? 30 : 15 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-2 h-2 rounded-full"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `-5%`,
                        backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][i % 6],
                        animation: `fall ${2 + Math.random() * 2}s linear ${Math.random() * 0.5}s forwards`,
                      }}
                    />
                  ))}
                </div>
              )}

              <div className={`inline-block p-6 rounded-2xl border-2 ${rStyle.border} ${rStyle.glow} ${rStyle.bg}`}>
                <span className="text-7xl block">{wonPrize.icon}</span>
              </div>

              <div>
                <Badge className={rarityStyles[wonPrize.rarity]?.bg || ''}>
                  {wonPrize.rarity.toUpperCase()}
                </Badge>
              </div>

              <h2 className="text-xl font-bold">
                {locale === 'th' ? wonPrize.name_th || wonPrize.name : wonPrize.name}
              </h2>

              {wonPrize.type === 'points' && wonPrize.value > 0 && (
                <p className="text-lg text-green-600 font-semibold">
                  +{wonPrize.value} {locale === 'th' ? 'แต้ม!' : 'points!'}
                </p>
              )}
              {wonPrize.type === 'reward' && (
                <p className="text-sm text-muted-foreground">
                  {locale === 'th' ? '🎒 เก็บในกระเป๋าแล้ว!' : '🎒 Added to your bag!'}
                </p>
              )}
              {wonPrize.type === 'nothing' && (
                <p className="text-sm text-muted-foreground">
                  {locale === 'th' ? '😅 เอาใจไปก่อนนะ ลองใหม่อีกที!' : '😅 Better luck next time!'}
                </p>
              )}

              <div className="flex justify-center gap-3 pt-2">
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  {locale === 'th' ? 'สุ่มอีก' : 'Pull Again'}
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/portal/rewards">
                    {locale === 'th' ? 'กลับร้านค้า' : 'Back to Shop'}
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prize Pool Preview (idle only) */}
      {phase === 'idle' && gachaItems.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h3 className="font-semibold text-sm mb-3">
              {locale === 'th' ? '🎁 รางวัลที่สุ่มได้' : '🎁 Prize Pool'}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {gachaItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                  <span className="text-lg">{item.prize_icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-xs">
                      {locale === 'th' ? item.prize_name_th || item.prize_name : item.prize_name}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${rarityStyles[item.rarity]?.bg || ''}`}>
                    {item.rarity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CSS for confetti animation */}
      <style>{`
        @keyframes fall {
          to {
            transform: translateY(500px) rotate(720deg);
            opacity: 0;
          }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
