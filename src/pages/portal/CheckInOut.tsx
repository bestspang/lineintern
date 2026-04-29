import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Clock, MapPin, History, AlertCircle, CheckCircle2, 
  LogIn, LogOut, Coffee, Calendar, Timer, Briefcase
} from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface AttendanceStatus {
  canCheckIn: boolean;
  canCheckOut: boolean;
  todayCheckIn: string | null;
  todayCheckOut: string | null;
  isWorking: boolean;
  minutesWorked: number | null;
  branchName: string | null;
  isOnLeave: boolean;
  leaveType: string | null;
  hasOT: boolean;
}

export default function CheckInOut() {
  const navigate = useNavigate();
  const { employee, locale, token } = usePortal();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false); // Prevents double-tap before React state flush
  const [error, setError] = useState<string | null>(null);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch attendance status
  const fetchAttendanceStatus = useCallback(async () => {
    if (!employee?.id) return;
    
    try {
      setLoading(true);
      setError(null);

      const { data, error: apiError } = await portalApi<AttendanceStatus>({
        endpoint: 'attendance-status',
        employee_id: employee.id
      });

      if (apiError) {
        throw apiError;
      }

      if (data) {
        setAttendanceStatus(data);
      }

    } catch (err) {
      console.error('[CheckInOut] Error fetching status:', err);
      setError(locale === 'th' ? 'ไม่สามารถโหลดข้อมูลได้' : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, [employee?.id, locale]);

  useEffect(() => {
    fetchAttendanceStatus();
    // Refresh every 30 seconds
    const refreshInterval = setInterval(fetchAttendanceStatus, 30000);
    return () => clearInterval(refreshInterval);
  }, [fetchAttendanceStatus]);

  const handleCheckInOut = async () => {
    if (!employee || !attendanceStatus) return;
    if (submitLockRef.current) return; // Hard double-tap guard
    submitLockRef.current = true;
    
    const action = attendanceStatus.canCheckIn ? 'check_in' : 'check_out';
    
    try {
      setSubmitting(true);
      
      // Create attendance token via portal API
      const { data, error } = await portalApi<{ token_id: string }>({
        endpoint: 'create-attendance-token',
        employee_id: employee.id,
        params: { type: action }
      });
      
      if (error || !data?.token_id) {
        toast.error(locale === 'th' 
          ? 'ไม่สามารถสร้างลิงก์ได้ กรุณาลองใหม่' 
          : 'Failed to create link. Please try again.');
        submitLockRef.current = false;
        return;
      }
      
      // Full page navigation to attendance page (outside portal routes)
      window.location.href = `/attendance?t=${data.token_id}`;
      
    } catch (err) {
      console.error('[CheckInOut] Error creating token:', err);
      toast.error(locale === 'th' 
        ? 'เกิดข้อผิดพลาด กรุณาลองใหม่' 
        : 'An error occurred. Please try again.');
      submitLockRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (locale === 'th') {
      return `${hours} ชม. ${mins} นาที`;
    }
    return `${hours}h ${mins}m`;
  };

  const formatTime = (date: Date) => {
    return format(date, 'HH:mm:ss');
  };

  const formatDate = (date: Date) => {
    if (locale === 'th') {
      return format(date, 'EEEE d MMMM yyyy', { locale: th });
    }
    return format(date, 'EEEE, MMMM d, yyyy');
  };

  const formatCheckTime = (isoString: string) => {
    return format(new Date(isoString), 'HH:mm');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  // Executive: Skip attendance tracking
  if (employee?.skip_attendance_tracking) {
    return (
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-6">
            <div className="text-center space-y-2">
              <Briefcase className="h-12 w-12 mx-auto mb-2 opacity-80" />
              <h2 className="text-xl font-bold">
                {locale === 'th' ? '👔 คุณไม่ต้อง Track Attendance' : '👔 You are exempt from attendance tracking'}
              </h2>
              <p className="opacity-90 text-sm">
                {locale === 'th' 
                  ? 'บัญชีของคุณถูกตั้งค่าเป็นผู้บริหาร ไม่จำเป็นต้องลงเวลาทำงาน'
                  : 'Your account is set as executive and does not require attendance tracking.'}
              </p>
            </div>
          </div>
        </Card>
        
        {/* Quick Actions for executives */}
        <div className="grid grid-cols-2 gap-3">
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/portal/request-ot')}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <Timer className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="font-medium text-sm">
                  {locale === 'th' ? 'ขอ OT' : 'Request OT'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'th' ? 'ทำงานล่วงเวลา' : 'Overtime work'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/portal/request-leave')}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-sm">
                  {locale === 'th' ? 'ลางาน' : 'Request Leave'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'th' ? 'ยื่นคำขอลา' : 'Submit request'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Time Card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6">
          <div className="text-center space-y-2">
            <p className="text-sm opacity-80">
              {formatDate(currentTime)}
            </p>
            <p className="text-5xl font-bold font-mono tracking-wider">
              {formatTime(currentTime)}
            </p>
            {attendanceStatus?.branchName && (
              <div className="flex items-center justify-center gap-1 text-sm opacity-80 mt-2">
                <MapPin className="h-4 w-4" />
                <span>{attendanceStatus.branchName}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Working Status Card */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Leave Status */}
          {attendanceStatus?.isOnLeave && (
            <Alert className="bg-amber-50 border-amber-200">
              <Coffee className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                {locale === 'th' 
                  ? `วันนี้เป็นวัน${attendanceStatus.leaveType === 'vacation' ? 'ลาพักร้อน' : attendanceStatus.leaveType === 'sick' ? 'ลาป่วย' : 'หยุด'}`
                  : `Today is ${attendanceStatus.leaveType || 'day off'}`}
              </AlertDescription>
            </Alert>
          )}

          {/* OT Status */}
          {attendanceStatus?.hasOT && (
            <Alert className="bg-blue-50 border-blue-200">
              <Timer className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                {locale === 'th' ? 'มีคำขอ OT ที่อนุมัติแล้ววันนี้' : 'You have approved OT today'}
              </AlertDescription>
            </Alert>
          )}

          {/* Working Duration */}
          <div className="text-center py-4">
            {attendanceStatus?.isWorking ? (
              <>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full mb-4">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  {locale === 'th' ? 'กำลังทำงาน' : 'Working'}
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-primary">
                    {attendanceStatus.minutesWorked !== null 
                      ? formatDuration(attendanceStatus.minutesWorked) 
                      : '--:--'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {locale === 'th' ? 'เวลาทำงานวันนี้' : 'Working time today'}
                  </p>
                </div>
                {attendanceStatus.todayCheckIn && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {locale === 'th' ? 'เช็คอินเมื่อ' : 'Checked in at'}: {formatCheckTime(attendanceStatus.todayCheckIn)}
                  </p>
                )}
              </>
            ) : attendanceStatus?.todayCheckOut ? (
              <>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted text-muted-foreground rounded-full mb-4">
                  <CheckCircle2 className="h-4 w-4" />
                  {locale === 'th' ? 'เสร็จงานแล้ว' : 'Finished work'}
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold">
                    {attendanceStatus.minutesWorked !== null 
                      ? formatDuration(attendanceStatus.minutesWorked) 
                      : '--:--'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {locale === 'th' ? 'เวลาทำงานวันนี้' : 'Today\'s work time'}
                  </p>
                </div>
                <div className="flex justify-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span>In: {formatCheckTime(attendanceStatus.todayCheckIn!)}</span>
                  <span>Out: {formatCheckTime(attendanceStatus.todayCheckOut)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted text-muted-foreground rounded-full mb-4">
                  <Clock className="h-4 w-4" />
                  {locale === 'th' ? 'ยังไม่ได้เช็คอิน' : 'Not checked in'}
                </div>
                <p className="text-muted-foreground">
                  {locale === 'th' 
                    ? 'กดปุ่มด้านล่างเพื่อเริ่มงาน'
                    : 'Press the button below to start work'}
                </p>
              </>
            )}
          </div>

          {/* Check-in/out Button */}
          {!attendanceStatus?.isOnLeave && (
            <Button
              size="lg"
              className={cn(
                'w-full py-6 text-lg font-semibold shadow-lg',
                attendanceStatus?.canCheckIn 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : attendanceStatus?.canCheckOut 
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-muted text-muted-foreground'
              )}
              disabled={submitting || (!attendanceStatus?.canCheckIn && !attendanceStatus?.canCheckOut)}
              onClick={handleCheckInOut}
            >
              {attendanceStatus?.canCheckIn ? (
                <>
                  <LogIn className="h-6 w-6 mr-2" />
                  {locale === 'th' ? 'เช็คอิน' : 'Check-in'}
                </>
              ) : attendanceStatus?.canCheckOut ? (
                <>
                  <LogOut className="h-6 w-6 mr-2" />
                  {locale === 'th' ? 'เช็คเอาท์' : 'Check-out'}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-6 w-6 mr-2" />
                  {locale === 'th' ? 'เสร็จสิ้นแล้ว' : 'Completed'}
                </>
              )}
            </Button>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/portal/my-history')}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <History className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {locale === 'th' ? 'ประวัติงาน' : 'Work History'}
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === 'th' ? 'ดูย้อนหลัง' : 'View records'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/portal/request-ot')}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Timer className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {locale === 'th' ? 'ขอ OT' : 'Request OT'}
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === 'th' ? 'ทำงานล่วงเวลา' : 'Overtime work'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <p className="text-center text-xs text-muted-foreground px-4">
        {locale === 'th' 
          ? '💡 สามารถเช็คอิน/เอาท์ผ่านคำสั่ง /checkin หรือ /checkout ใน LINE ได้'
          : '💡 You can also check-in/out using /checkin or /checkout commands in LINE'}
      </p>
    </div>
  );
}
