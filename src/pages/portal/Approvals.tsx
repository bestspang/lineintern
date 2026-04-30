import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Calendar, ChevronRight, ClipboardList, Gift, Banknote, MapPin } from 'lucide-react';
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

export default function Approvals() {
  const navigate = useNavigate();
  const { employee, locale, isManager, isAdmin } = usePortal();
  const [counts, setCounts] = useState<PendingCounts>({ ot: 0, leave: 0, earlyLeave: 0, remoteCheckout: 0, redemptions: 0, deposits: 0 });
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    if (!employee?.id) return;

    const { data, error } = await portalApi<PendingCounts>({
      endpoint: 'approval-counts',
      employee_id: employee.id,
      params: {
        branchId: employee.branch_id,
        isAdmin: isAdmin
      }
    });

    if (!error && data) {
      setCounts(data);
    }
    setLoading(false);
  }, [employee?.id, employee?.branch_id, isAdmin]);

  useEffect(() => {
    fetchCounts();
    
    // Refresh counts periodically (every 30 seconds)
    const interval = setInterval(fetchCounts, 30000);
    
    return () => clearInterval(interval);
  }, [fetchCounts]);

  const totalPending = counts.ot + counts.leave + counts.earlyLeave + counts.remoteCheckout + counts.redemptions + counts.deposits;

  const roleKey = employee?.role?.role_key?.toLowerCase() || '';

  const approvalItems = [
    {
      icon: Clock,
      label: locale === 'th' ? 'คำขอ OT' : 'OT Requests',
      count: counts.ot,
      path: '/portal/approvals/ot',
      color: 'from-orange-500 to-orange-600',
    },
    {
      icon: Calendar,
      label: locale === 'th' ? 'คำขอลางาน' : 'Leave Requests',
      count: counts.leave,
      path: '/portal/approvals/leave',
      color: 'from-violet-500 to-violet-600',
    },
    {
      icon: ClipboardList,
      label: locale === 'th' ? 'ขอกลับก่อน' : 'Early Leave',
      count: counts.earlyLeave,
      path: '/portal/approvals/early-leave',
      color: 'from-amber-500 to-amber-600',
    },
    {
      icon: MapPin,
      label: locale === 'th' ? 'Checkout นอกสถานที่' : 'Remote Checkout',
      count: counts.remoteCheckout,
      path: '/portal/approvals/remote-checkout',
      color: 'from-cyan-500 to-cyan-600',
    },
    // Admin/Owner only: Redemptions
    ...(['admin', 'owner'].includes(roleKey) ? [{
      icon: Gift,
      label: locale === 'th' ? 'แลกรางวัล' : 'Redemptions',
      count: counts.redemptions,
      path: '/portal/approve-redemptions',
      color: 'from-fuchsia-500 to-fuchsia-600',
    }] : []),
    // Manager/Admin/Owner: Deposits
    ...(['manager', 'admin', 'owner'].includes(roleKey) ? [{
      icon: Banknote,
      label: locale === 'th' ? 'ใบฝากเงิน' : 'Deposits',
      count: counts.deposits,
      path: '/portal/deposit-review-list',
      color: 'from-green-500 to-green-600',
    }] : []),
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '✅ อนุมัติคำขอ' : '✅ Approve Requests'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? 'จัดการคำขอที่รออนุมัติ' : 'Manage pending requests'}
        </p>
      </div>

      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {locale === 'th' ? 'รอดำเนินการ' : 'Pending'}
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

      {/* Approval Categories */}
      <div className="space-y-3">
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
                    <h3 className="font-semibold">{item.label}</h3>
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
      </div>

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
  );
}
