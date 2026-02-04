import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { ArrowLeft, MapPin, Clock, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface RemoteCheckoutRequest {
  id: string;
  request_date: string;
  latitude: number;
  longitude: number;
  distance_from_branch: number;
  reason: string;
  status: string;
  created_at: string;
  employee: {
    id: string;
    full_name: string;
    code: string;
    branch_id: string;
    branch: { name: string } | null;
  };
}

export default function ApproveRemoteCheckout() {
  const navigate = useNavigate();
  const { employee, locale, isAdmin } = usePortal();
  const [requests, setRequests] = useState<RemoteCheckoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Rejection dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RemoteCheckoutRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchRequests = useCallback(async () => {
    if (!employee?.id) return;

    const { data, error } = await portalApi<RemoteCheckoutRequest[]>({
      endpoint: 'pending-remote-checkout-requests',
      employee_id: employee.id,
      params: {
        branchId: employee.branch_id,
        isAdmin: isAdmin
      }
    });

    if (!error && data) {
      setRequests(data);
    }
    setLoading(false);
  }, [employee?.id, employee?.branch_id, isAdmin]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (request: RemoteCheckoutRequest) => {
    if (!employee?.id) return;
    
    setProcessingId(request.id);
    
    // Optimistic update - remove from list immediately
    const previousRequests = [...requests];
    setRequests(prev => prev.filter(r => r.id !== request.id));
    
    const { data, error } = await portalApi({
      endpoint: 'approve-remote-checkout',
      employee_id: employee.id,
      params: {
        requestId: request.id,
        approved: true,
        approverEmployeeId: employee.id
      }
    });

    if (error) {
      // Rollback on error
      setRequests(previousRequests);
      toast.error(locale === 'th' ? 'ไม่สามารถอนุมัติได้' : 'Failed to approve');
    } else {
      const wasArchived = data?.was_archived;
      const message = wasArchived 
        ? (locale === 'th' ? '✅ Archive สำเร็จ! (มี checkout อยู่แล้ว)' : 'Archived! (checkout already exists)')
        : (locale === 'th' ? '✅ อนุมัติสำเร็จ! แจ้งพนักงานและ Admin แล้ว' : 'Approved! Notifications sent.');
      toast.success(message);
    }
    
    setProcessingId(null);
  };

  const openRejectDialog = (request: RemoteCheckoutRequest) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!employee?.id || !selectedRequest) return;
    
    setProcessingId(selectedRequest.id);
    setRejectDialogOpen(false);
    
    // Optimistic update - remove from list immediately
    const previousRequests = [...requests];
    setRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
    
    const { data, error } = await portalApi({
      endpoint: 'approve-remote-checkout',
      employee_id: employee.id,
      params: {
        requestId: selectedRequest.id,
        approved: false,
        approverEmployeeId: employee.id,
        rejectionReason: rejectionReason || 'ไม่ระบุเหตุผล'
      }
    });

    if (error) {
      // Rollback on error
      setRequests(previousRequests);
      toast.error(locale === 'th' ? 'ไม่สามารถปฏิเสธได้' : 'Failed to reject');
    } else {
      toast.success(locale === 'th' ? '❌ ปฏิเสธคำขอแล้ว แจ้ง Admin แล้ว' : 'Rejected! Admin notified.');
    }
    
    setProcessingId(null);
    setSelectedRequest(null);
  };

  const openGoogleMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/portal/approvals')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {locale === 'th' ? '📍 Checkout นอกสถานที่' : '📍 Remote Checkout'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === 'th' ? 'อนุมัติคำขอ checkout นอกพื้นที่' : 'Approve remote checkout requests'}
          </p>
        </div>
      </div>

      {requests.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              {locale === 'th' ? '🎉 ไม่มีคำขอที่รออนุมัติ' : '🎉 No pending requests'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {request.employee.full_name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {request.employee.code} • {request.employee.branch?.name}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    {locale === 'th' ? 'รออนุมัติ' : 'Pending'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Location Info */}
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {locale === 'th' ? 'ระยะห่าง:' : 'Distance:'}{' '}
                    <span className="font-medium text-destructive">
                      {Math.round(request.distance_from_branch || 0)} เมตร
                    </span>
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => openGoogleMaps(request.latitude, request.longitude)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {locale === 'th' ? 'ดูแผนที่' : 'Map'}
                  </Button>
                </div>

                {/* Time */}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(new Date(request.created_at), 'dd MMM yyyy HH:mm', { locale: th })}
                  </span>
                </div>

                {/* Reason */}
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm font-medium mb-1">
                    {locale === 'th' ? 'เหตุผล:' : 'Reason:'}
                  </p>
                  <p className="text-sm">{request.reason}</p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1"
                    onClick={() => handleApprove(request)}
                    disabled={processingId === request.id}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {locale === 'th' ? 'อนุมัติ' : 'Approve'}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => openRejectDialog(request)}
                    disabled={processingId === request.id}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    {locale === 'th' ? 'ปฏิเสธ' : 'Reject'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {locale === 'th' ? 'ปฏิเสธคำขอ' : 'Reject Request'}
            </DialogTitle>
            <DialogDescription>
              {locale === 'th' 
                ? `คุณกำลังปฏิเสธคำขอของ ${selectedRequest?.employee.full_name}`
                : `You are rejecting the request from ${selectedRequest?.employee.full_name}`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={locale === 'th' ? 'เหตุผลในการปฏิเสธ (ไม่บังคับ)' : 'Rejection reason (optional)'}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              {locale === 'th' ? 'ยืนยันปฏิเสธ' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
