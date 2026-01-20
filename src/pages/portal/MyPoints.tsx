import { useQuery } from '@tanstack/react-query';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Flame, Coins, TrendingUp, Heart, Gift, ArrowUpCircle, ArrowDownCircle, Clock, MessageSquare, Star, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

// Type for point rules from database
interface PointRulesMap {
  [key: string]: { points: number; conditions?: any };
}

export default function MyPoints() {
  const { employee, locale } = usePortal();

  const { data: happyPoints, isLoading } = useQuery({
    queryKey: ['my-happy-points', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return null;
      const { data, error } = await portalApi({
        endpoint: 'my-points',
        employee_id: employee.id
      });
      
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id,
  });

  // Fetch point rules for dynamic values
  const { data: pointRules } = useQuery({
    queryKey: ['point-rules-summary'],
    queryFn: async () => {
      if (!employee?.id) return null;
      const { data, error } = await portalApi({
        endpoint: 'point-rules-summary',
        employee_id: employee.id
      });
      if (error) throw error;
      return data as PointRulesMap;
    },
    enabled: !!employee?.id,
  });

  const { data: recentTransactions } = useQuery({
    queryKey: ['my-recent-transactions', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data, error } = await portalApi({
        endpoint: 'my-transactions',
        employee_id: employee.id,
        params: { limit: 10 }
      });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
  });

  const { data: pendingRedemptions } = useQuery({
    queryKey: ['my-pending-redemptions', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data, error } = await portalApi({
        endpoint: 'my-pending-redemptions',
        employee_id: employee.id
      });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const dailyProgress = ((happyPoints?.daily_response_score || 0) / 20) * 100;

  return (
    <div className="space-y-4">
      {/* Main Balance Card */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardHeader className="pb-2">
          <CardDescription>{locale === 'th' ? 'แต้มของฉัน' : 'My Points'}</CardDescription>
          <CardTitle className="text-4xl flex items-center gap-3">
            <Coins className="h-8 w-8 text-yellow-500" />
            {happyPoints?.point_balance?.toLocaleString() || 0}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-green-600">
              <ArrowUpCircle className="h-4 w-4" />
              <span>+{happyPoints?.total_earned?.toLocaleString() || 0}</span>
            </div>
            <div className="flex items-center gap-1 text-orange-600">
              <ArrowDownCircle className="h-4 w-4" />
              <span>-{happyPoints?.total_spent?.toLocaleString() || 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Streak Shield Card */}
      {(happyPoints?.streak_shields || 0) > 0 && (
        <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-500" />
                <span className="font-medium">
                  {locale === 'th' ? 'โล่ป้องกัน Streak' : 'Streak Shields'}
                </span>
              </div>
              <Badge variant="secondary" className="text-lg px-3">
                {happyPoints.streak_shields}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 pl-7">
              {locale === 'th' 
                ? 'จะใช้อัตโนมัติเมื่อคุณมาสายหรือขาดงาน'
                : 'Will auto-activate when you check in late or miss work'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-5 w-5 text-orange-500" />
              <span className="text-sm text-muted-foreground">Streak</span>
            </div>
            <p className="text-2xl font-bold">{happyPoints?.current_punctuality_streak || 0}</p>
            <p className="text-xs text-muted-foreground">
              Best: {happyPoints?.longest_punctuality_streak || 0} days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="h-5 w-5 text-red-500" />
              <span className="text-sm text-muted-foreground">Health HP</span>
            </div>
            <p className="text-2xl font-bold">{happyPoints?.monthly_health_bonus || 0}</p>
            <p className="text-xs text-muted-foreground">
              {locale === 'th' ? 'โบนัสสุขภาพ' : 'Monthly bonus'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* How to Earn Points */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            {locale === 'th' ? 'วิธีการได้แต้ม' : 'How to Earn Points'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Attendance Section */}
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              {locale === 'th' ? 'การเข้างาน' : 'Attendance'}
            </h4>
            <div className="grid grid-cols-1 gap-2 text-sm pl-6">
              <div className="flex justify-between">
                <span className="text-muted-foreground">🕐 {locale === 'th' ? 'มาตรงเวลา' : 'On-time check-in'}</span>
                <Badge variant="outline" className="text-green-600">+{pointRules?.punctuality?.points || 10}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">✅ {locale === 'th' ? 'ยืนยันตัวตนสำเร็จ' : 'Identity verified'}</span>
                <Badge variant="outline" className="text-green-600">+{pointRules?.integrity?.points || 5}</Badge>
              </div>
            </div>
          </div>
          
          {/* Response Section */}
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              {locale === 'th' ? 'การตอบกลับ (สูงสุด 20/วัน)' : 'Responses (Max 20/day)'}
            </h4>
            <div className="grid grid-cols-1 gap-2 text-sm pl-6">
              <div className="flex justify-between">
                <span className="text-muted-foreground">🏆 {locale === 'th' ? 'ตอบเร็ว + มีเนื้อหา' : 'Fast + detailed'}</span>
                <Badge variant="outline" className="text-green-600">+{pointRules?.response_fast_detailed?.points || 8}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">👍 {locale === 'th' ? 'ตอบเร็ว' : 'Fast response'}</span>
                <Badge variant="outline" className="text-green-600">+{pointRules?.response_fast?.points || 3}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">⏰ {locale === 'th' ? 'ตอบช้าแต่ละเอียด' : 'Late but detailed'}</span>
                <Badge variant="outline" className="text-green-600">+{pointRules?.response_late_detailed?.points || 2}</Badge>
              </div>
            </div>
          </div>
          
          {/* Streak Bonus Section */}
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              {locale === 'th' ? 'โบนัส Streak' : 'Streak Bonus'}
            </h4>
            <div className="grid grid-cols-1 gap-2 text-sm pl-6">
              <div className="flex justify-between">
                <span className="text-muted-foreground">🔥 {locale === 'th' ? 'มาตรงเวลา 5 วันติด' : '5-day on-time streak'}</span>
                <Badge variant="outline" className="text-green-600">+{pointRules?.streak_weekly?.points || 50}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">🏆 {locale === 'th' ? 'มาตรงเวลาทั้งเดือน' : 'Perfect month'}</span>
                <Badge variant="outline" className="text-green-600">+{pointRules?.streak_monthly?.points || 100}</Badge>
              </div>
            </div>
          </div>
          
          {/* Health Bonus Section */}
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Heart className="h-4 w-4 text-red-500" />
              {locale === 'th' ? 'โบนัสสุขภาพ' : 'Health Bonus'}
            </h4>
            <div className="grid grid-cols-1 gap-2 text-sm pl-6">
              <div className="flex justify-between">
                <span className="text-muted-foreground">💚 {locale === 'th' ? 'เริ่มต้นทุกเดือน' : 'Monthly base'}</span>
                <Badge variant="outline" className="text-green-600">+{pointRules?.health_monthly?.points || 100}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">😷 {locale === 'th' ? 'ลาป่วยไม่มีใบรับรอง' : 'Sick leave (no cert)'}</span>
                <Badge variant="outline" className="text-orange-600">-{Math.abs(pointRules?.health_deduct_no_cert?.points || 30)}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">🏥 {locale === 'th' ? 'ลาป่วยมีใบรับรอง' : 'Sick leave (with cert)'}</span>
                <Badge variant="outline" className="text-orange-600">-{Math.abs(pointRules?.health_deduct_with_cert?.points || 5)}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {locale === 'th' ? 'ความคืบหน้าวันนี้' : "Today's Progress"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{locale === 'th' ? 'คะแนนตอบกลับ' : 'Response Score'}</span>
              <span className="font-medium">{happyPoints?.daily_response_score || 0}/20</span>
            </div>
            <Progress value={dailyProgress} className="h-3" />
            {dailyProgress >= 100 && (
              <Badge className="bg-green-500">
                {locale === 'th' ? '🎉 เต็มแล้ว! Grade S' : '🎉 Full! Grade S'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pending Redemptions */}
      {pendingRedemptions && pendingRedemptions.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-yellow-700">
              <Gift className="h-4 w-4" />
              {locale === 'th' ? 'รอการอนุมัติ' : 'Pending Approvals'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingRedemptions.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span>{r.point_rewards?.icon} {locale === 'th' ? r.point_rewards?.name_th : r.point_rewards?.name}</span>
                  <Badge variant="outline" className="text-yellow-700">{r.point_cost} pts</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" className="h-auto py-4">
          <Link to="/portal/rewards">
            <div className="text-center">
              <Gift className="h-6 w-6 mx-auto mb-1 text-primary" />
              <span className="text-sm">{locale === 'th' ? 'แลกรางวัล' : 'Rewards'}</span>
            </div>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto py-4">
          <Link to="/portal/my-redemptions">
            <div className="text-center">
              <Trophy className="h-6 w-6 mx-auto mb-1 text-yellow-500" />
              <span className="text-sm">{locale === 'th' ? 'ประวัติแลก' : 'History'}</span>
            </div>
          </Link>
        </Button>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {locale === 'th' ? 'ธุรกรรมล่าสุด' : 'Recent Transactions'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentTransactions?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {locale === 'th' ? 'ยังไม่มีธุรกรรม' : 'No transactions yet'}
              </p>
            )}
            {recentTransactions?.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium">{t.description || t.category}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(t.created_at), 'dd/MM HH:mm')}
                  </p>
                </div>
                <span className={`font-medium ${t.amount > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
