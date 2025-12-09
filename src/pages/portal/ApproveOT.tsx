import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Check, X, Clock } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { toast } from 'sonner';

interface OTRequest {
  id: string;
  request_date: string;
  estimated_hours: number;
  reason: string;
  status: string;
  created_at: string;
  employee: {
    id: string;
    full_name: string;
    code: string;
    branch_id: string | null;
    branch: { name: string } | null;
  };
}

export default function ApproveOT() {
  const navigate = useNavigate();
  const { employee, locale, isAdmin } = usePortal();
  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    // Build query - join with employees to get branch info
    let query = supabase
      .from('overtime_requests')
      .select(`
        id, request_date, estimated_hours, reason, status, created_at,
        employee:employees!overtime_requests_employee_id_fkey (
          id, full_name, code, branch_id,
          branch:branches!employees_branch_id_fkey ( name )
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    // Manager can only see their branch's requests
    if (!isAdmin && employee?.branch_id) {
      query = query.eq('employee.branch_id', employee.branch_id);
    }

    const { data, error } = await query;

    if (!error && data) {
      // Filter out any null employees (shouldn't happen but type safety)
      const validData = data.filter(d => d.employee !== null) as unknown as OTRequest[];
      setRequests(validData);
    }
    setLoading(false);
  }, [isAdmin, employee?.branch_id]);

  // Initial fetch + realtime subscription
  useEffect(() => {
    fetchRequests();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('overtime-requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'overtime_requests',
          filter: 'status=eq.pending'
        },
        () => {
          // Refetch on any change to pending requests
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRequests]);

  const handleApproval = async (requestId: string, approved: boolean) => {
    setProcessing(requestId);

    try {
      const { error } = await supabase
        .from('overtime_requests')
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
            {locale === 'th' ? '⏰ อนุมัติ OT' : '⏰ Approve OT'}
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
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">
              {locale === 'th' ? 'ไม่มีคำขอ OT ที่รออนุมัติ' : 'No pending OT requests'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <Card key={req.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold">
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
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {format(parseISO(req.request_date), 'EEE, d MMM yyyy', { locale: dateLocale })}
                    </span>
                    <Badge variant="secondary">
                      {req.estimated_hours} {locale === 'th' ? 'ชม.' : 'hrs'}
                    </Badge>
                  </div>
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
