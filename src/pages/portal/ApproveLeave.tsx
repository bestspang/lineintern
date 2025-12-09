import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Check, X, Calendar } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { toast } from 'sonner';

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  total_days: number;
  created_at: string;
  employee: {
    id: string;
    full_name: string;
    code: string;
    branch: { name: string } | null;
  };
}

const leaveTypeLabels: Record<string, { th: string; en: string }> = {
  vacation: { th: 'ลาพักร้อน', en: 'Vacation' },
  sick: { th: 'ลาป่วย', en: 'Sick Leave' },
  personal: { th: 'ลากิจ', en: 'Personal' },
  other: { th: 'อื่นๆ', en: 'Other' },
};

export default function ApproveLeave() {
  const navigate = useNavigate();
  const { employee, locale } = usePortal();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('leave_requests')
      .select(`
        id, leave_type, start_date, end_date, reason, status, total_days, created_at,
        employee:employees!leave_requests_employee_id_fkey (
          id, full_name, code,
          branch:branches!employees_branch_id_fkey ( name )
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (!error && data) {
      setRequests(data as unknown as LeaveRequest[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApproval = async (requestId: string, approved: boolean) => {
    setProcessing(requestId);

    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: approved ? 'approved' : 'rejected',
          approved_at: new Date().toISOString(),
          approved_by_admin_id: employee?.id,
        })
        .eq('id', requestId);

      if (error) throw error;

      toast.success(
        approved 
          ? (locale === 'th' ? 'อนุมัติสำเร็จ' : 'Approved successfully')
          : (locale === 'th' ? 'ปฏิเสธสำเร็จ' : 'Rejected successfully')
      );
      fetchRequests();
    } catch (error) {
      console.error('Error updating request:', error);
      toast.error(locale === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred');
    } finally {
      setProcessing(null);
    }
  };

  const getLeaveTypeLabel = (type: string) => {
    return locale === 'th' 
      ? leaveTypeLabels[type]?.th || type
      : leaveTypeLabels[type]?.en || type;
  };

  const dateLocale = locale === 'th' ? th : enUS;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/approvals')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {locale === 'th' ? '🏖️ อนุมัติการลา' : '🏖️ Approve Leave'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {requests.length} {locale === 'th' ? 'รายการรออนุมัติ' : 'pending requests'}
          </p>
        </div>
      </div>

      {/* Request List */}
      {requests.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">
              {locale === 'th' ? 'ไม่มีคำขอลาที่รออนุมัติ' : 'No pending leave requests'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <Card key={req.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white font-bold">
                    {req.employee?.full_name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{req.employee?.full_name}</h3>
                      <Badge variant="outline" className="text-xs">{req.employee?.code}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {req.employee?.branch?.name || '-'}
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary">{getLeaveTypeLabel(req.leave_type)}</Badge>
                    <span className="text-sm font-medium">
                      {req.total_days} {locale === 'th' ? 'วัน' : 'days'}
                    </span>
                  </div>
                  <p className="text-sm font-medium mb-1">
                    {format(parseISO(req.start_date), 'd MMM', { locale: dateLocale })} - {format(parseISO(req.end_date), 'd MMM yyyy', { locale: dateLocale })}
                  </p>
                  <p className="text-sm text-muted-foreground">{req.reason}</p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleApproval(req.id, false)}
                    disabled={processing === req.id}
                  >
                    <X className="h-4 w-4 mr-1" />
                    {locale === 'th' ? 'ปฏิเสธ' : 'Reject'}
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleApproval(req.id, true)}
                    disabled={processing === req.id}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {locale === 'th' ? 'อนุมัติ' : 'Approve'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
