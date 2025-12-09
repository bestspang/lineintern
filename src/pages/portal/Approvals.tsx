import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Calendar, ChevronRight, ClipboardList } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';

interface PendingCounts {
  ot: number;
  leave: number;
  earlyLeave: number;
}

export default function Approvals() {
  const navigate = useNavigate();
  const { employee, locale, isManager, isAdmin } = usePortal();
  const [counts, setCounts] = useState<PendingCounts>({ ot: 0, leave: 0, earlyLeave: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      if (!employee?.id) return;

      // Build query based on role
      // Admin: see all, Manager: see only their branch
      let otCount = 0;
      let leaveCount = 0;
      let earlyLeaveCount = 0;

      if (isAdmin) {
        // Admin sees all pending requests
        const [otRes, leaveRes, earlyRes] = await Promise.all([
          supabase
            .from('overtime_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('leave_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('early_leave_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
        ]);
        otCount = otRes.count || 0;
        leaveCount = leaveRes.count || 0;
        earlyLeaveCount = earlyRes.count || 0;
      } else if (isManager && employee.branch_id) {
        // Manager sees only their branch's requests
        // Need to join with employees table to filter by branch
        const [otRes, leaveRes, earlyRes] = await Promise.all([
          supabase
            .from('overtime_requests')
            .select('id, employee:employees!inner(branch_id)', { count: 'exact', head: true })
            .eq('status', 'pending')
            .eq('employee.branch_id', employee.branch_id),
          supabase
            .from('leave_requests')
            .select('id, employee:employees!inner(branch_id)', { count: 'exact', head: true })
            .eq('status', 'pending')
            .eq('employee.branch_id', employee.branch_id),
          supabase
            .from('early_leave_requests')
            .select('id, employee:employees!inner(branch_id)', { count: 'exact', head: true })
            .eq('status', 'pending')
            .eq('employee.branch_id', employee.branch_id),
        ]);
        otCount = otRes.count || 0;
        leaveCount = leaveRes.count || 0;
        earlyLeaveCount = earlyRes.count || 0;
      }

      setCounts({
        ot: otCount,
        leave: leaveCount,
        earlyLeave: earlyLeaveCount,
      });
      setLoading(false);
    };

    fetchCounts();
  }, [employee?.id, employee?.branch_id, isAdmin, isManager]);

  const totalPending = counts.ot + counts.leave + counts.earlyLeave;

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
