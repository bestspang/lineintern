import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Gift, Check, X, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface Redemption {
  id: string;
  point_cost: number;
  status: string;
  created_at: string;
  notes: string | null;
  employee: {
    id: string;
    full_name: string;
    code: string | null;
  };
  reward: {
    id: string;
    name: string;
    name_th: string | null;
    icon: string | null;
  };
}

export default function ApproveRedemptions() {
  const navigate = useNavigate();
  const { employee, locale } = usePortal();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRedemption, setSelectedRedemption] = useState<Redemption | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRedemptions = useCallback(async () => {
    if (!employee?.id) {
      setLoading(false);
      return;
    }
    const { data, error } = await portalApi<Redemption[]>({
      endpoint: 'pending-redemptions',
      employee_id: employee.id,
    });

    if (error) {
      console.error('Error fetching redemptions:', error);
      toast.error(locale === 'th' ? 'โหลดข้อมูลไม่สำเร็จ' : 'Failed to load data');
    } else {
      setRedemptions(data || []);
    }
    setLoading(false);
  }, [employee?.id, locale]);

  useEffect(() => {
    fetchRedemptions();
  }, [fetchRedemptions]);

  const handleAction = async () => {
    if (!selectedRedemption || !actionType || !employee?.id) return;

    setProcessing(true);
    try {
      const { data, error } = await portalApi<any>({
        endpoint: actionType === 'approve' ? 'approve-redemption' : 'reject-redemption',
        employee_id: employee.id,
        params: {
          redemptionId: selectedRedemption.id,
          notes: actionType === 'approve' ? adminNotes || undefined : undefined,
          rejectionReason: actionType === 'reject' ? adminNotes || undefined : undefined,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Action failed');

      toast.success(
        actionType === 'approve'
          ? locale === 'th' ? 'อนุมัติสำเร็จ' : 'Approved successfully'
          : locale === 'th' ? 'ปฏิเสธสำเร็จ' : 'Rejected successfully'
      );

      setSelectedRedemption(null);
      setActionType(null);
      setAdminNotes('');
      fetchRedemptions();
    } catch (error) {
      console.error('Error updating redemption:', error);
      toast.error(locale === 'th' ? 'ดำเนินการไม่สำเร็จ' : 'Action failed');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/approvals')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {locale === 'th' ? '🎁 อนุมัติแลกรางวัล' : '🎁 Approve Redemptions'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === 'th' ? 'จัดการคำขอแลกรางวัล' : 'Manage reward redemption requests'}
          </p>
        </div>
      </div>

      {/* Pending List */}
      {redemptions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Gift className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {locale === 'th' ? 'ไม่มีคำขอที่รออนุมัติ' : 'No pending requests'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {redemptions.map((r) => (
            <Card key={r.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold">{r.employee.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {locale === 'th' ? r.reward.name_th || r.reward.name : r.reward.name}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary">{r.point_cost} pts</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), 'd MMM HH:mm', { locale: locale === 'th' ? th : undefined })}
                      </span>
                    </div>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground mt-2 italic">"{r.notes}"</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setSelectedRedemption(r);
                        setActionType('reject');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        setSelectedRedemption(r);
                        setActionType('approve');
                      }}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={!!selectedRedemption && !!actionType} onOpenChange={() => {
        setSelectedRedemption(null);
        setActionType(null);
        setAdminNotes('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve'
                ? locale === 'th' ? 'ยืนยันการอนุมัติ' : 'Confirm Approval'
                : locale === 'th' ? 'ยืนยันการปฏิเสธ' : 'Confirm Rejection'}
            </DialogTitle>
          </DialogHeader>
          {selectedRedemption && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-medium">{selectedRedemption.employee.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {locale === 'th'
                    ? selectedRedemption.reward.name_th || selectedRedemption.reward.name
                    : selectedRedemption.reward.name}
                </p>
                <Badge variant="secondary" className="mt-2">{selectedRedemption.point_cost} pts</Badge>
              </div>
              <Textarea
                placeholder={locale === 'th' ? 'หมายเหตุ (ถ้ามี)' : 'Notes (optional)'}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSelectedRedemption(null);
              setActionType(null);
              setAdminNotes('');
            }}>
              {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing}
              className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {processing
                ? locale === 'th' ? 'กำลังดำเนินการ...' : 'Processing...'
                : actionType === 'approve'
                  ? locale === 'th' ? 'อนุมัติ' : 'Approve'
                  : locale === 'th' ? 'ปฏิเสธ' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
