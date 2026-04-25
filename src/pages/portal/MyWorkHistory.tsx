import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Clock, LogIn, LogOut, AlertCircle, Calendar, 
  XCircle, ClockIcon, CalendarX, MapPin, Check, X 
} from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { format, parseISO } from 'date-fns';
import { formatBangkokTime, formatBangkokISODate, getBangkokHoursMinutes } from '@/lib/timezone';
import { th, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import { isCheckInType } from '@/lib/portal-attendance';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AttendanceLog {
  id: string;
  event_type: string;
  server_time: string;
  is_flagged: boolean;
  flag_reason: string | null;
  is_overtime: boolean;
  source: string | null;
}

interface DailyStats {
  totalDays: number;
  onTime: number;
  late: number;
  avgCheckIn: string;
}

interface PendingOTRequest {
  id: string;
  request_date: string;
  estimated_hours: number;
  reason: string;
  status: string;
  created_at: string;
}

interface PendingDayOffRequest {
  id: string;
  day_off_date: string;
  reason: string;
  status: string;
  created_at: string;
}

interface RemoteCheckoutRequest {
  id: string;
  request_date: string;
  latitude: number;
  longitude: number;
  distance_from_branch: number;
  reason: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
}

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
}

export default function MyWorkHistory() {
  const { employee, locale } = usePortal();
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Pending requests state
  const [pendingOT, setPendingOT] = useState<PendingOTRequest[]>([]);
  const [pendingDayOff, setPendingDayOff] = useState<PendingDayOffRequest[]>([]);
  const [remoteCheckouts, setRemoteCheckouts] = useState<RemoteCheckoutRequest[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Cancel dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; type: 'ot' | 'dayoff' | 'leave'; label: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!employee?.id) return;

    const { data, error } = await portalApi<AttendanceLog[]>({
      endpoint: 'attendance-history',
      employee_id: employee.id,
      params: { days: 30 }
    });

    if (!error && data) {
      setLogs(data);

      // Calculate stats
      const checkIns = data.filter(l => isCheckInType(l.event_type));
      const uniqueDays = new Set(checkIns.map(l => formatBangkokISODate(l.server_time)));
      const flaggedCount = checkIns.filter(l => l.is_flagged).length;

      // Calculate average check-in time using Bangkok timezone
      const checkInHours = checkIns.map(l => {
        const bangkokTime = getBangkokHoursMinutes(l.server_time);
        if (!bangkokTime) return 0;
        return bangkokTime.hours + bangkokTime.minutes / 60;
      });
      const avgHour = checkInHours.length > 0
        ? checkInHours.reduce((a, b) => a + b, 0) / checkInHours.length
        : 0;
      const avgHours = Math.floor(avgHour);
      const avgMins = Math.round((avgHour - avgHours) * 60);

      setStats({
        totalDays: uniqueDays.size,
        onTime: checkIns.length - flaggedCount,
        late: flaggedCount,
        avgCheckIn: `${avgHours.toString().padStart(2, '0')}:${avgMins.toString().padStart(2, '0')}`,
      });
    }
    setLoading(false);
  }, [employee?.id]);

  const fetchPendingRequests = useCallback(async () => {
    if (!employee?.id) return;
    setLoadingRequests(true);

    const [otResult, dayOffResult, remoteResult, leaveResult] = await Promise.all([
      portalApi<PendingOTRequest[]>({
        endpoint: 'my-pending-ot-requests',
        employee_id: employee.id,
      }),
      portalApi<PendingDayOffRequest[]>({
        endpoint: 'my-pending-dayoff-requests',
        employee_id: employee.id,
      }),
      portalApi<RemoteCheckoutRequest[]>({
        endpoint: 'my-remote-checkout-requests',
        employee_id: employee.id,
        params: { limit: 10 }
      }),
      portalApi<LeaveRequest[]>({
        endpoint: 'my-leave-requests',
        employee_id: employee.id,
        params: { limit: 10 }
      }),
    ]);

    if (!otResult.error && otResult.data) setPendingOT(otResult.data);
    if (!dayOffResult.error && dayOffResult.data) setPendingDayOff(dayOffResult.data);
    if (!remoteResult.error && remoteResult.data) setRemoteCheckouts(remoteResult.data);
    if (!leaveResult.error && leaveResult.data) setLeaveRequests(leaveResult.data);
    
    setLoadingRequests(false);
  }, [employee?.id]);

  useEffect(() => {
    fetchHistory();
    fetchPendingRequests();
  }, [fetchHistory, fetchPendingRequests]);

  const handleCancelRequest = async () => {
    if (!cancelTarget || !employee?.id) return;
    setCancelling(true);

    // Use different endpoint for leave vs OT/dayoff
    const endpoint = cancelTarget.type === 'leave' ? 'cancel-leave-request' : 'cancel-my-request';
    const params = cancelTarget.type === 'leave' 
      ? { requestId: cancelTarget.id, reason: 'Cancelled by employee via Portal' }
      : { requestId: cancelTarget.id, requestType: cancelTarget.type, reason: 'Cancelled by employee via Portal' };

    const { data, error } = await portalApi<{ success: boolean }>({
      endpoint,
      employee_id: employee.id,
      params
    });

    if (error || !data?.success) {
      toast.error(locale === 'th' ? 'ไม่สามารถยกเลิกได้' : 'Failed to cancel');
    } else {
      toast.success(locale === 'th' ? 'ยกเลิกเรียบร้อย' : 'Cancelled successfully');
      fetchPendingRequests();
    }

    setCancelling(false);
    setCancelDialogOpen(false);
    setCancelTarget(null);
  };

  const openCancelDialog = (id: string, type: 'ot' | 'dayoff' | 'leave', label: string) => {
    setCancelTarget({ id, type, label });
    setCancelDialogOpen(true);
  };

  // Filter pending leave requests
  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');

  // Group logs by date using Bangkok timezone
  const groupedLogs = logs.reduce((acc, log) => {
    const date = formatBangkokISODate(log.server_time);
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {} as Record<string, AttendanceLog[]>);

  const dateLocale = locale === 'th' ? th : enUS;

  const hasPendingRequests = pendingOT.length > 0 || pendingDayOff.length > 0 || pendingLeaves.length > 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  // Executive: Skip attendance tracking
  if (employee?.skip_attendance_tracking) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">
            {locale === 'th' ? '📋 ประวัติการทำงาน' : '📋 Work History'}
          </h1>
        </div>
        <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          <CardContent className="p-6 text-center">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-80" />
            <h2 className="text-xl font-bold mb-2">
              {locale === 'th' ? '👔 คุณไม่ต้อง Track Attendance' : '👔 You are exempt from attendance tracking'}
            </h2>
            <p className="opacity-90 text-sm">
              {locale === 'th'
                ? 'บัญชีของคุณถูกตั้งค่าเป็นผู้บริหาร ไม่จำเป็นต้องลงเวลาทำงาน'
                : 'Your account is set as executive and does not require attendance tracking.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '📋 ประวัติการทำงาน' : '📋 Work History'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? '30 วันล่าสุด' : 'Last 30 days'}
        </p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Calendar className="h-6 w-6 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{stats.totalDays}</p>
              <p className="text-xs text-muted-foreground">
                {locale === 'th' ? 'วันที่เข้างาน' : 'Days Worked'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto text-emerald-500 mb-2" />
              <p className="text-2xl font-bold">{stats.avgCheckIn}</p>
              <p className="text-xs text-muted-foreground">
                {locale === 'th' ? 'เช็คอินเฉลี่ย' : 'Avg Check-in'}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.onTime}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {locale === 'th' ? 'ตรงเวลา' : 'On Time'}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.late}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {locale === 'th' ? 'มาสาย' : 'Late'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending Requests Section */}
      {!loadingRequests && hasPendingRequests && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-amber-500" />
              {locale === 'th' ? 'คำขอที่รออนุมัติ' : 'Pending Requests'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Pending OT */}
            {pendingOT.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-3">
                  <ClockIcon className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="font-medium text-sm">
                      OT: {format(parseISO(req.request_date), 'd MMM', { locale: dateLocale })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {req.estimated_hours} {locale === 'th' ? 'ชม.' : 'hrs'} - {req.reason}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => openCancelDialog(req.id, 'ot', `OT ${format(parseISO(req.request_date), 'd MMM')}`)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                </Button>
              </div>
            ))}

            {/* Pending Day-Off */}
            {pendingDayOff.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <CalendarX className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-sm">
                      {locale === 'th' ? 'วันหยุด:' : 'Day Off:'} {format(parseISO(req.day_off_date), 'd MMM', { locale: dateLocale })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {req.reason}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => openCancelDialog(req.id, 'dayoff', `Day Off ${format(parseISO(req.day_off_date), 'd MMM')}`)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                </Button>
              </div>
            ))}

            {/* Pending Leave Requests */}
            {pendingLeaves.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-violet-500" />
                  <div>
                    <p className="font-medium text-sm">
                      {locale === 'th' ? 'ลางาน:' : 'Leave:'} {format(parseISO(req.start_date), 'd MMM', { locale: dateLocale })}
                      {req.start_date !== req.end_date && ` - ${format(parseISO(req.end_date), 'd MMM', { locale: dateLocale })}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {req.leave_type} - {req.reason}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => openCancelDialog(req.id, 'leave', `Leave ${format(parseISO(req.start_date), 'd MMM')}`)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Remote Checkout History */}
      {!loadingRequests && remoteCheckouts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-5 w-5 text-purple-500" />
              {locale === 'th' ? 'ประวัติ Remote Checkout' : 'Remote Checkout History'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {remoteCheckouts.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">
                      {format(parseISO(req.request_date), 'd MMM yyyy', { locale: dateLocale })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {req.reason} • {Math.round(req.distance_from_branch)}m away
                    </p>
                  </div>
                </div>
                <Badge
                  variant={req.status === 'approved' ? 'default' : req.status === 'rejected' ? 'destructive' : 'secondary'}
                  className={
                    req.status === 'approved' 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                      : req.status === 'rejected'
                      ? ''
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  }
                >
                  {req.status === 'approved' && <Check className="h-3 w-3 mr-1" />}
                  {req.status === 'rejected' && <X className="h-3 w-3 mr-1" />}
                  {req.status === 'approved' 
                    ? (locale === 'th' ? 'อนุมัติ' : 'Approved')
                    : req.status === 'rejected'
                    ? (locale === 'th' ? 'ปฏิเสธ' : 'Rejected')
                    : (locale === 'th' ? 'รออนุมัติ' : 'Pending')}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Attendance Timeline */}
      <div className="space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          {locale === 'th' ? 'รายการล่าสุด' : 'Recent Activity'}
        </h2>

        {Object.keys(groupedLogs).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ไม่มีประวัติการเข้างาน' : 'No attendance history'}
              </p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedLogs).slice(0, 10).map(([date, dayLogs]) => (
            <Card key={date}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium">
                    {format(parseISO(date), 'EEE, d MMM', { locale: dateLocale })}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {dayLogs.length} {locale === 'th' ? 'รายการ' : 'entries'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {dayLogs.map((log) => {
                    const isCheckIn = isCheckInType(log.event_type);

                    return (
                      <div key={log.id} className="flex items-center gap-3 text-sm">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                          isCheckIn
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {isCheckIn ? (
                            <LogIn className="h-4 w-4" />
                          ) : (
                            <LogOut className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1">
                          <span className="font-medium">
                            {isCheckIn
                              ? (locale === 'th' ? 'เช็คอิน' : 'Check In')
                              : (locale === 'th' ? 'เช็คเอาท์' : 'Check Out')}
                          </span>
                          {log.is_overtime && (
                            <Badge variant="secondary" className="ml-2 text-xs bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                              OT
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground">
                          {formatBangkokTime(log.server_time).slice(0, 5)}
                        </span>
                        {log.is_flagged && (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {locale === 'th' ? 'ยืนยันการยกเลิก?' : 'Confirm Cancellation?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {locale === 'th'
                ? `คุณต้องการยกเลิกคำขอ ${cancelTarget?.label} หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`
                : `Do you want to cancel the request for ${cancelTarget?.label}? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              {locale === 'th' ? 'ไม่' : 'No'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelRequest}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling
                ? (locale === 'th' ? 'กำลังยกเลิก...' : 'Cancelling...')
                : (locale === 'th' ? 'ยืนยันยกเลิก' : 'Yes, Cancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
