import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Send, CheckCircle, XCircle, Clock3 } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { format, parseISO, differenceInDays } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatBangkokISODate } from '@/lib/timezone';

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  total_days: number;
  created_at: string;
}

const leaveTypes = [
  { value: 'vacation', labelTh: 'ลาพักร้อน', labelEn: 'Vacation' },
  { value: 'sick', labelTh: 'ลาป่วย', labelEn: 'Sick Leave' },
  { value: 'personal', labelTh: 'ลากิจ', labelEn: 'Personal' },
  { value: 'other', labelTh: 'อื่นๆ', labelEn: 'Other' },
];

export default function RequestLeave() {
  const { employee, locale } = usePortal();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Use Bangkok timezone for default dates
  const todayBangkok = formatBangkokISODate(new Date());
  
  const [formData, setFormData] = useState({
    leave_type: 'vacation',
    start_date: todayBangkok,
    end_date: todayBangkok,
    reason: '',
  });

  const fetchRequests = async () => {
    if (!employee?.id) return;

    const { data, error } = await portalApi<LeaveRequest[]>({
      endpoint: 'leave-requests',
      employee_id: employee.id
    });

    if (!error && data) {
      setRequests(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [employee?.id]);

  const calculateDays = () => {
    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    return Math.max(1, differenceInDays(end, start) + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee?.id) return;

    if (!formData.reason.trim()) {
      toast.error(locale === 'th' ? 'กรุณาระบุเหตุผล' : 'Please enter a reason');
      return;
    }

    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      toast.error(locale === 'th' ? 'วันที่สิ้นสุดต้องมากกว่าวันที่เริ่ม' : 'End date must be after start date');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await portalApi({
        endpoint: 'submit-leave',
        employee_id: employee.id,
        params: {
          leave_type: formData.leave_type,
          start_date: formData.start_date,
          end_date: formData.end_date,
          reason: formData.reason.trim(),
          total_days: calculateDays(),
          request_date: todayBangkok,
        }
      });

      if (error) throw error;

      toast.success(locale === 'th' ? 'ส่งคำขอลาสำเร็จ' : 'Leave request submitted');
      setFormData({ ...formData, reason: '' });
      fetchRequests();
    } catch (error) {
      console.error('Error submitting leave request:', error);
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

  const getLeaveTypeLabel = (value: string) => {
    const type = leaveTypes.find(t => t.value === value);
    return locale === 'th' ? type?.labelTh : type?.labelEn;
  };

  const dateLocale = locale === 'th' ? th : enUS;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '🏖️ ขอลางาน' : '🏖️ Request Leave'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? 'ส่งคำขอลางาน' : 'Submit leave request'}
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
            <div className="space-y-2">
              <Label>{locale === 'th' ? 'ประเภทการลา' : 'Leave Type'}</Label>
              <Select
                value={formData.leave_type}
                onValueChange={(value) => setFormData({ ...formData, leave_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {locale === 'th' ? type.labelTh : type.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{locale === 'th' ? 'วันที่เริ่ม' : 'Start Date'}</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{locale === 'th' ? 'วันที่สิ้นสุด' : 'End Date'}</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <span className="text-sm text-muted-foreground">{locale === 'th' ? 'จำนวนวัน: ' : 'Total days: '}</span>
              <span className="font-bold text-lg">{calculateDays()}</span>
              <span className="text-sm text-muted-foreground"> {locale === 'th' ? 'วัน' : 'days'}</span>
            </div>

            <div className="space-y-2">
              <Label>{locale === 'th' ? 'เหตุผล' : 'Reason'}</Label>
              <Textarea
                placeholder={locale === 'th' ? 'ระบุเหตุผลการลา...' : 'Enter reason for leave...'}
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
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ยังไม่มีประวัติคำขอลา' : 'No leave request history'}
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
                      <Badge variant="outline">{getLeaveTypeLabel(req.leave_type)}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {req.total_days} {locale === 'th' ? 'วัน' : 'days'}
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      {format(parseISO(req.start_date), 'd MMM', { locale: dateLocale })} - {format(parseISO(req.end_date), 'd MMM yyyy', { locale: dateLocale })}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{req.reason}</p>
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
