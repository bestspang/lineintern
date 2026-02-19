import { useQuery } from '@tanstack/react-query';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { formatBangkokDateTime } from '@/lib/timezone';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Dices, Coins } from 'lucide-react';
import { Link } from 'react-router-dom';

interface GachaTransaction {
  id: string;
  amount: number;
  description: string;
  balance_after: number;
  metadata: {
    reward_name?: string;
    reward_id?: string;
    prize_id?: string;
    prize_name?: string;
    rarity?: string;
  } | null;
  created_at: string;
}

const rarityColors: Record<string, string> = {
  common: 'bg-muted text-muted-foreground',
  rare: 'bg-blue-100 text-blue-700',
  epic: 'bg-purple-100 text-purple-700',
  legendary: 'bg-yellow-100 text-yellow-700',
};

// ⚠️ VERIFIED 2026-02-19: Gacha History page - DO NOT REFACTOR
export default function GachaHistory() {
  const { employee, locale } = usePortal();

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['gacha-history', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data, error } = await portalApi<GachaTransaction[]>({
        endpoint: 'gacha-history',
        employee_id: employee.id,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
  });

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/portal/gacha">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {locale === 'th' ? 'กลับ' : 'Back'}
          </Link>
        </Button>
        <h1 className="text-lg font-bold">
          {locale === 'th' ? '📜 ประวัติการสุ่ม' : '📜 Gacha History'}
        </h1>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {!isLoading && history.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Dices className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{locale === 'th' ? 'ยังไม่เคยสุ่ม' : 'No pulls yet'}</p>
            <p className="text-sm mt-1">
              {locale === 'th' ? 'ลองไปสุ่มดูสิ!' : 'Try your luck!'}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/portal/gacha">
                {locale === 'th' ? 'ไปสุ่มเลย' : 'Go to Gacha'}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {history.map((tx) => {
        const prizeName = tx.metadata?.prize_name || tx.metadata?.reward_name || '???';
        const rarity = tx.metadata?.rarity || 'common';

        return (
          <Card key={tx.id}>
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🎲</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{prizeName}</p>
                    <Badge className={`text-[10px] ${rarityColors[rarity] || rarityColors.common}`}>
                      {rarity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatBangkokDateTime(tx.created_at)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-destructive flex items-center gap-1">
                    <Coins className="h-3 w-3" />
                    {tx.amount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {locale === 'th' ? 'เหลือ' : 'bal'} {tx.balance_after}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
