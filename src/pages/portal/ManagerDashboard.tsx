import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Clock, Calendar, ClipboardList, Gift, Banknote, MapPin,
  ChevronRight, Users, UserCheck, UserX, LayoutDashboard,
  RefreshCw
} from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';

interface PendingCounts {
  ot: number;
  leave: number;
  earlyLeave: number;
  remoteCheckout: number;
  redemptions: number;
  deposits: number;
}

interface TeamSummary {
  totalEmployees: number;
  checkedIn: number;
  checkedOut: number;
  absent: number;
  onLeave: number;
  late: number;
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const { employee, locale, isAdmin } = usePortal();
  const [counts, setCounts] = useState<PendingCounts>({ ot: 0, leave: 0, earlyLeave: 0, remoteCheckout: 0, redemptions: 0, deposits: 0 });
  const [teamSummary, setTeamSummary] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const roleKey = employee?.role?.role_key?.toLowerCase() || '';

  const fetchData = useCallback(async () => {
    if (!employee?.id) return;

    const [countsResult, teamResult] = await Promise.all([
      portalApi<PendingCounts>({
        endpoint: 'approval-counts',
        employee_id: employee.id,
        params: { branchId: employee.branch_id, isAdmin }
      }),
      portalApi<TeamSummary>({
        endpoint: 'team-summary',
        employee_id: employee.id,
        params: { branchId: employee.branch_id }
      })
    ]);

    if (!countsResult.error && countsResult.data) setCounts(countsResult.data);
    if (!teamResult.error && teamResult.data) setTeamSummary(teamResult.data);
    setLoading(false);
  }, [employee?.id, employee?.branch_id, isAdmin]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const totalPending = counts.ot + counts.leave + counts.earlyLeave + counts.remoteCheckout + counts.redemptions + counts.deposits;

  const approvalItems = [
    { icon: Clock, label: 'คำขอ OT', labelEn: 'OT Requests', count: counts.ot, path: '/portal/approvals/ot', color: 'from-orange-500 to-orange-600' },
    { icon: Calendar, label: 'คำขอลางาน', labelEn: 'Leave Requests', count: counts.leave, path: '/portal/approvals/leave', color: 'from-violet-500 to-violet-600' },
    { icon: ClipboardList, label: 'ขอกลับก่อน', labelEn: 'Early Leave', count: counts.earlyLeave, path: '/portal/approvals/early-leave', color: 'from-amber-500 to-amber-600' },
    { icon: MapPin, label: 'Checkout นอกสถานที่', labelEn: 'Remote Checkout', count: counts.remoteCheckout, path: '/portal/approvals/remote-checkout', color: 'from-cyan-500 to-cyan-600' },
    ...(['admin', 'owner'].includes(roleKey) ? [{
      icon: Gift, label: 'แลกรางวัล', labelEn: 'Redemptions', count: counts.redemptions, path: '/portal/approve-redemptions', color: 'from-fuchsia-500 to-fuchsia-600'
    }] : []),
    ...(['manager', 'admin', 'owner'].includes(roleKey) ? [{
      icon: Banknote, label: 'ใบฝากเงิน', labelEn: 'Deposits', count: counts.deposits, path: '/portal/deposit-review-list', color: 'from-green-500 to-green-600'
    }] : []),
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6" />
            {locale === 'th' ? 'แดชบอร์ดหัวหน้า' : 'Manager Dashboard'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {locale === 'th' ? 'ภาพรวมทีมและคำขอที่รออนุมัติ' : 'Team overview & pending approvals'}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Total Pending Summary */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {locale === 'th' ? 'รอดำเนินการทั้งหมด' : 'Total Pending'}
              </p>
              <p className="text-3xl font-bold text-primary">
                {totalPending}
                <span className="text-lg font-normal text-muted-foreground ml-1">
                  {locale === 'th' ? 'รายการ' : 'items'}
                </span>
              </p>
            </div>
            <ClipboardList className="h-12 w-12 text-primary/30" />
          </div>
        </CardContent>
      </Card>

      {/* Team Attendance Overview */}
      {teamSummary && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
            {locale === 'th' ? 'สถานะทีมวันนี้' : "Today's Team Status"}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <UserCheck className="h-5 w-5 mx-auto text-green-500 mb-1" />
                <p className="text-2xl font-bold">{teamSummary.checkedIn}</p>
                <p className="text-xs text-muted-foreground">{locale === 'th' ? 'เช็คอิน' : 'Checked In'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <UserX className="h-5 w-5 mx-auto text-red-500 mb-1" />
                <p className="text-2xl font-bold">{teamSummary.absent}</p>
                <p className="text-xs text-muted-foreground">{locale === 'th' ? 'ขาดงาน' : 'Absent'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Users className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                <p className="text-2xl font-bold">{teamSummary.onLeave}</p>
                <p className="text-xs text-muted-foreground">{locale === 'th' ? 'ลางาน' : 'On Leave'}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Pending Approvals */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
          {locale === 'th' ? 'คำขอรออนุมัติ' : 'Pending Approvals'}
        </h3>
        {approvalItems.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.path}
              className="cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{locale === 'th' ? item.label : item.labelEn}</h3>
                  </div>
                  {item.count > 0 && (
                    <Badge className="bg-destructive text-destructive-foreground">
                      {item.count}
                    </Badge>
                  )}
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {totalPending === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">
                {locale === 'th' ? '🎉 ไม่มีคำขอที่รออนุมัติ' : '🎉 No pending requests'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Links */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
          {locale === 'th' ? 'ลิงก์ด่วน' : 'Quick Links'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate('/portal/team-summary')}>
            <Users className="h-5 w-5" />
            <span className="text-xs">{locale === 'th' ? 'สรุปทีม' : 'Team Summary'}</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate('/portal/approvals')}>
            <ClipboardList className="h-5 w-5" />
            <span className="text-xs">{locale === 'th' ? 'อนุมัติทั้งหมด' : 'All Approvals'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
