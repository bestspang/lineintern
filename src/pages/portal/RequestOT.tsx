import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Send, CheckCircle, XCircle, Clock3 } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { format, parseISO } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatBangkokISODate, getBangkokNow } from '@/lib/timezone';

interface OTRequest {
  id: string;
  request_date: string;
  estimated_hours: number;
  reason: string;
  status: string;
  created_at: string;
}

export default function RequestOT() {
  const { employee, locale } = usePortal();
  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Use Bangkok timezone for default date
  const todayBangkok = formatBangkokISODate(new Date());
  
  const [formData, setFormData] = useState({
    request_date: todayBangkok,
    estimated_hours: '2',
    reason: '',
  });

  const fetchRequests = async () => {
    if (!employee?.id) return;

    const { data, error } = await portalApi<OTRequest[]>({
      endpoint: 'ot-requests',
      employee_id: employee.id,
      params: { limit: 10 }
    });

    if (!error && data) {
      setRequests(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [employee?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee?.id) return;

    if (!formData.reason.trim()) {
      toast.error(locale === 'th' ? 'กรุณาระบุเหตุผล' : 'Please enter a reason');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await portalApi({
        endpoint: 'submit-ot',
        employee_id: employee.id,
        params: {
          request_date: formData.request_date,
          estimated_hours: parseFloat(formData.estimated_hours),
          reason: formData.reason.trim(),
        }
      });

      if (error) throw error;

      toast.success(locale === 'th' ? 'ส่งคำขอ OT สำเร็จ' : 'OT request submitted');
      setFormData({ ...formData, reason: '' });
      fetchRequests();
    } catch (error) {
      console.error('Error submitting OT request:', error);
      toast.error(locale === 'th' ? 'เกิดข้อผิดพลาด' : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            {locale === 'th' ? 'อนุมัติ' : 'Approved'}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
            <XCircle className="h-3 w-3 mr-1" />
            {locale === 'th' ? 'ปฏิเสธ' : 'Rejected'}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
            <Clock3 className="h-3 w-3 mr-1" />
            {locale === 'th' ? 'รออนุมัติ' : 'Pending'}
          </Badge>
        );
    }
  };

  const dateLocale = locale === 'th' ? th : enUS;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '⏰ ขอทำ OT' : '⏰ Request OT'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? 'ส่งคำขอทำงานล่วงเวลา' : 'Submit overtime request'}
        </p>
      </div>

      {/* Request Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {locale === 'th' ? 'คำขอใหม่' : 'New Request'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{locale === 'th' ? 'วันที่ขอ OT' : 'OT Date'}</Label>
                <Input
                  type="date"
                  value={formData.request_date}
                  onChange={(e) => setFormData({ ...formData, request_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{locale === 'th' ? 'จำนวนชั่วโมง' : 'Hours'}</Label>
                <Input
                  type="number"
                  min="0.5"
                  max="12"
                  step="0.5"
                  value={formData.estimated_hours}
                  onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{locale === 'th' ? 'เหตุผล' : 'Reason'}</Label>
              <Textarea
                placeholder={locale === 'th' ? 'ระบุเหตุผลการขอ OT...' : 'Enter reason for OT...'}
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              <Send className="h-4 w-4 mr-2" />
              {submitting 
                ? (locale === 'th' ? 'กำลังส่ง...' : 'Submitting...') 
                : (locale === 'th' ? 'ส่งคำขอ' : 'Submit Request')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Request History */}
      <div className="space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          {locale === 'th' ? 'ประวัติคำขอ' : 'Request History'}
        </h2>

        {requests.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ยังไม่มีประวัติคำขอ OT' : 'No OT request history'}
              </p>
            </CardContent>
          </Card>
        ) : (
          requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">
                        {format(parseISO(req.request_date), 'd MMM yyyy', { locale: dateLocale })}
                      </span>
                      <Badge variant="outline">{req.estimated_hours} {locale === 'th' ? 'ชม.' : 'hrs'}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{req.reason}</p>
                  </div>
                  {getStatusBadge(req.status)}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
