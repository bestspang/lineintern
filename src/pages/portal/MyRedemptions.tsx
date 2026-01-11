import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { usePortal } from '@/contexts/PortalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, ArrowLeft, Clock, CheckCircle, XCircle, Gift, Coins } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

interface Redemption {
  id: string;
  point_cost: number;
  status: string;
  created_at: string;
  approved_at: string | null;
  used_at: string | null;
  expires_at: string | null;
  notes: string | null;
  point_rewards: {
    name: string;
    name_th: string | null;
    icon: string | null;
  };
}

export default function MyRedemptions() {
  const { employee, locale } = usePortal();

  // Fetch redemptions via portal API (bypasses RLS)
  const { data: redemptions, isLoading } = useQuery({
    queryKey: ['my-redemptions', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data, error } = await portalApi<Redemption[]>({
        endpoint: 'my-redemptions-list',
        employee_id: employee.id
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
  });

  const pendingRedemptions = redemptions?.filter(r => r.status === 'pending') || [];
  const approvedRedemptions = redemptions?.filter(r => r.status === 'approved') || [];
  const usedRedemptions = redemptions?.filter(r => r.status === 'used') || [];
  const otherRedemptions = redemptions?.filter(r => ['cancelled', 'expired'].includes(r.status)) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{locale === 'th' ? 'รอ' : 'Pending'}</Badge>;
      case 'approved':
        return <Badge className="bg-green-500 gap-1"><CheckCircle className="h-3 w-3" />{locale === 'th' ? 'อนุมัติ' : 'Approved'}</Badge>;
      case 'used':
        return <Badge variant="outline" className="gap-1"><Gift className="h-3 w-3" />{locale === 'th' ? 'ใช้แล้ว' : 'Used'}</Badge>;
      case 'cancelled':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{locale === 'th' ? 'ยกเลิก' : 'Cancelled'}</Badge>;
      case 'expired':
        return <Badge variant="secondary" className="text-muted-foreground gap-1"><Clock className="h-3 w-3" />{locale === 'th' ? 'หมดอายุ' : 'Expired'}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const RedemptionCard = ({ redemption }: { redemption: Redemption }) => (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{redemption.point_rewards?.icon || '🎁'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">
                  {locale === 'th' ? redemption.point_rewards?.name_th || redemption.point_rewards?.name : redemption.point_rewards?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(redemption.created_at), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
              {getStatusBadge(redemption.status)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="gap-1 text-xs">
                <Coins className="h-3 w-3" />
                {redemption.point_cost}
              </Badge>
              {redemption.expires_at && redemption.status === 'approved' && (
                <span className="text-xs text-muted-foreground">
                  {locale === 'th' ? 'หมดอายุ' : 'Expires'}: {format(new Date(redemption.expires_at), 'dd/MM/yyyy')}
                </span>
              )}
            </div>
            {redemption.notes && (
              <p className="text-xs text-muted-foreground mt-2 italic">"{redemption.notes}"</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
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
            <Trophy className="h-5 w-5 text-yellow-500" />
            {locale === 'th' ? 'ประวัติการแลกรางวัล' : 'Redemption History'}
          </h1>
        </div>
      </div>

      {redemptions?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {locale === 'th' ? 'ยังไม่มีประวัติการแลกรางวัล' : 'No redemption history yet'}
            </p>
            <Button asChild className="mt-4">
              <Link to="/portal/rewards">
                {locale === 'th' ? 'ไปแลกรางวัล' : 'Browse Rewards'}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="pending" className="text-xs">
              {locale === 'th' ? 'รออนุมัติ' : 'Pending'} ({pendingRedemptions.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="text-xs">
              {locale === 'th' ? 'พร้อมใช้' : 'Ready'} ({approvedRedemptions.length})
            </TabsTrigger>
            <TabsTrigger value="used" className="text-xs">
              {locale === 'th' ? 'ใช้แล้ว' : 'Used'} ({usedRedemptions.length})
            </TabsTrigger>
            <TabsTrigger value="other" className="text-xs">
              {locale === 'th' ? 'อื่นๆ' : 'Other'} ({otherRedemptions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-3 mt-4">
            {pendingRedemptions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {locale === 'th' ? 'ไม่มีรายการรออนุมัติ' : 'No pending redemptions'}
              </p>
            ) : (
              pendingRedemptions.map(r => <RedemptionCard key={r.id} redemption={r} />)
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-3 mt-4">
            {approvedRedemptions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {locale === 'th' ? 'ไม่มีรางวัลพร้อมใช้งาน' : 'No approved rewards ready'}
              </p>
            ) : (
              approvedRedemptions.map(r => <RedemptionCard key={r.id} redemption={r} />)
            )}
          </TabsContent>

          <TabsContent value="used" className="space-y-3 mt-4">
            {usedRedemptions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {locale === 'th' ? 'ยังไม่มีรางวัลที่ใช้แล้ว' : 'No used rewards yet'}
              </p>
            ) : (
              usedRedemptions.map(r => <RedemptionCard key={r.id} redemption={r} />)
            )}
          </TabsContent>

          <TabsContent value="other" className="space-y-3 mt-4">
            {otherRedemptions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {locale === 'th' ? 'ไม่มีรายการอื่นๆ' : 'No other redemptions'}
              </p>
            ) : (
              otherRedemptions.map(r => <RedemptionCard key={r.id} redemption={r} />)
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
