import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, MapPin, Clock, User, Building, CheckCircle, XCircle, Loader2, Shield, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import LivenessCamera, { LivenessData } from '@/components/attendance/LivenessCamera';
import { queueAttendanceSubmission, processPendingSubmissions, isOnline } from '@/lib/offline-queue';

export default function Attendance() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string>('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [tokenData, setTokenData] = useState<any>(null);
  const [error, setError] = useState<string>('');
  
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [location, setLocation] = useState<{lat: number; lon: number} | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [livenessData, setLivenessData] = useState<LivenessData | null>(null);
  
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  
  const [showLivenessCamera, setShowLivenessCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Early leave request state
  const [showEarlyLeaveDialog, setShowEarlyLeaveDialog] = useState(false);
  const [earlyLeaveType, setEarlyLeaveType] = useState<string>('');
  const [earlyLeaveReason, setEarlyLeaveReason] = useState<string>('');
  const [earlyLeaveSubmitting, setEarlyLeaveSubmitting] = useState(false);

  // OT request state
  const [showOTRequestDialog, setShowOTRequestDialog] = useState(false);
  const [otReason, setOTReason] = useState<string>('');
  const [estimatedEndTime, setEstimatedEndTime] = useState<string>('');
  const [otRequestSubmitting, setOTRequestSubmitting] = useState(false);

  // Remote checkout request state
  const [showRemoteCheckoutDialog, setShowRemoteCheckoutDialog] = useState(false);
  const [remoteCheckoutReason, setRemoteCheckoutReason] = useState<string>('');
  const [remoteCheckoutSubmitting, setRemoteCheckoutSubmitting] = useState(false);
  const [remoteCheckoutData, setRemoteCheckoutData] = useState<{
    distance: number;
    allowed_radius: number;
    branch_name: string;
    branch_id: string;
    latitude: number;
    longitude: number;
  } | null>(null);

  // Today's holidays for cute quotes context
  const [todayHolidayIds, setTodayHolidayIds] = useState<string[]>([]);


  useEffect(() => {
    const token = searchParams.get('t');
    if (!token) {
      setError('No token provided');
      setLoading(false);
      return;
    }
    
    validateToken(token);

    // Fetch today's holidays for cute quotes
    const fetchTodayHolidays = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/holidays?date=eq.${today}&select=id`,
          {
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            }
          }
        );
        if (response.ok) {
          const data = await response.json();
          setTodayHolidayIds(data.map((h: { id: string }) => h.id));
        }
      } catch (err) {
        console.warn('Failed to fetch holidays:', err);
      }
    };
    fetchTodayHolidays();

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOffline(false);
      // Try to process pending submissions
      processPendingSubmissions().then(({ processed }) => {
        if (processed > 0) {
          toast({
            title: 'คิวที่รอส่งสำเร็จแล้ว',
            description: `ส่งข้อมูลที่รออยู่จำนวน ${processed} รายการสำเร็จ`,
          });
        }
      });
    };
    
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [searchParams, toast]);

  const validateToken = async (token: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attendance-validate-token?t=${token}`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          }
        }
      );

      const data = await response.json();
      
      if (!response.ok || !data.valid) {
        setError(data.error || 'Invalid token');
        setLoading(false);
        return;
      }

      setTokenData(data);
      
      // Auto-request location if required
      if (data.settings?.require_location) {
        requestLocation();
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Validation error:', err);
      setError('Failed to validate token');
      setLoading(false);
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
        setLocationError('');
      },
      (error) => {
        setLocationError(`Location error: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const startCamera = () => {
    setShowLivenessCamera(true);
  };

  const handleLivenessCapture = (blob: Blob, liveness: LivenessData) => {
    const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(blob));
    setLivenessData(liveness);
    setShowLivenessCamera(false);
    
    toast({
      title: 'ถ่ายรูปสำเร็จ',
      description: 'ยืนยันใบหน้าเรียบร้อยแล้ว',
    });
  };

  const handleLivenessCancel = () => {
    setShowLivenessCamera(false);
  };

  const handleSubmit = async () => {
    if (!tokenData) return;

    // Validate required fields
    if (tokenData.settings?.require_photo && !photo) {
      toast({
        title: 'Photo Required',
        description: 'Please take a photo to continue',
        variant: 'destructive'
      });
      return;
    }

    if (tokenData.settings?.require_location && !location) {
      toast({
        title: 'Location Required',
        description: 'Please allow location access to continue',
        variant: 'destructive'
      });
      return;
    }

    // Check if this is a checkout and if employee might be leaving early
    if (tokenData.token?.type === 'check_out') {
      try {
        // Call a lightweight check to see if hours are sufficient
        const checkResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attendance-submit`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              token: tokenData.token.id,
              check_only: true
            })
          }
        );

        const checkResult = await checkResponse.json();
        
        // If hours are insufficient, show early leave dialog
        if (checkResult.hours_insufficient) {
          setShowEarlyLeaveDialog(true);
          return;
        }
      } catch (err) {
        console.error('Hours check error:', err);
        // Continue with normal checkout if check fails
      }
    }

    // Proceed with normal checkout/checkin
    await submitAttendance();
  };

  const submitAttendanceWithRetry = async (attempt: number = 1): Promise<void> => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second base delay

    if (!tokenData) return;

    try {
      setSubmitting(true);
      setSubmitProgress(attempt > 1 ? `กำลังลองใหม่ครั้งที่ ${attempt}...` : 'กำลังเตรียมข้อมูล...');

      const formData = new FormData();
      formData.append('token', tokenData.token.id);
      formData.append('latitude', location?.lat.toString() || '');
      formData.append('longitude', location?.lon.toString() || '');
      formData.append('deviceTime', new Date().toISOString());
      formData.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
      formData.append('deviceInfo', JSON.stringify({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        livenessVerified: !!livenessData,
        livenessChallenge: livenessData?.challenge || 'none',
      }));
      
      if (photo) {
        setSubmitProgress('กำลังอัพโหลดรูปภาพ...');
        formData.append('photo', photo);
      }
      
      if (livenessData) {
        formData.append('livenessData', JSON.stringify(livenessData));
      }

      // Check if offline before attempting
      if (!isOnline()) {
        setSubmitProgress('ไม่มีอินเทอร์เน็ต กำลังบันทึกลงคิว...');
        await queueAttendanceSubmission(tokenData.token.id, formData);
        
        toast({
          title: 'บันทึกลงคิวแล้ว',
          description: 'จะส่งอัตโนมัติเมื่อมีอินเทอร์เน็ต',
        });
        
        setSubmitted(true);
        setSubmitResult({
          log: {
            server_time: new Date().toISOString(),
            is_flagged: false
          },
          queued: true
        });
        return;
      }

      setSubmitProgress('กำลังส่งข้อมูล...');
      
      // Add timeout to fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attendance-submit`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: formData,
            signal: controller.signal
          }
        );

        clearTimeout(timeoutId);

        const result = await response.json();

        // Handle 403 OT approval required - token is NOT consumed
        if (response.status === 403 && result.requires_ot_approval) {
          setSubmitting(false);
          setSubmitProgress('');
          
          toast({
            title: '⚠️ ต้องขออนุมัติ OT ก่อน',
            description: `คุณทำงานเกิน ${result.overtime_hours?.toFixed(1) || ''} ชั่วโมง กรุณาขอ OT ใน LINE แล้วกดลิงค์เดิมได้เลย`,
            variant: 'destructive',
            duration: 15000,
          });
          
          // Show OT request dialog
          setShowOTRequestDialog(true);
          return;
        }

        // Handle 403 Outside Geofence - remote checkout required
        if (response.status === 403 && result.code === 'OUTSIDE_GEOFENCE') {
          setSubmitting(false);
          setSubmitProgress('');
          
          // Store geofence data for the dialog
          setRemoteCheckoutData({
            distance: Math.round(result.distance || 0),
            allowed_radius: result.allowed_radius || 0,
            branch_name: result.branch_name || tokenData?.branch?.name || '',
            branch_id: result.branch_id || tokenData?.branch?.id || '',
            latitude: location?.lat || 0,
            longitude: location?.lon || 0
          });
          
          // Show remote checkout dialog
          setShowRemoteCheckoutDialog(true);
          return;
        }

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Submission failed');
        }

        setSubmitProgress('สำเร็จ!');
        setSubmitResult(result);
        setSubmitted(true);
        
        toast({
          title: 'บันทึกการเข้างานสำเร็จ',
          description: 'บันทึกเวลาเข้า-ออกงานเรียบร้อยแล้ว',
        });

      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }

    } catch (err) {
      console.error(`Submit error (attempt ${attempt}):`, err);
      
      // Check if it's a network error or timeout
      const isNetworkError = err instanceof TypeError || 
                            (err instanceof Error && err.name === 'AbortError') ||
                            (err instanceof Error && err.message.includes('fetch'));
      
      // Retry logic
      if (isNetworkError && attempt < MAX_RETRIES) {
        toast({
          title: 'เกิดข้อผิดพลาด',
          description: `กำลังลองใหม่... (ครั้งที่ ${attempt}/${MAX_RETRIES})`,
        });
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        return submitAttendanceWithRetry(attempt + 1);
      }
      
      // If all retries failed or non-network error, queue it
      if (isNetworkError) {
        toast({
          title: 'ไม่สามารถเชื่อมต่อได้',
          description: 'บันทึกข้อมูลลงคิวแล้ว จะส่งอัตโนมัติภายหลัง',
          variant: 'default'
        });
        
        const formData = new FormData();
        formData.append('token', tokenData.token.id);
        formData.append('latitude', location?.lat.toString() || '');
        formData.append('longitude', location?.lon.toString() || '');
        formData.append('deviceTime', new Date().toISOString());
        if (photo) formData.append('photo', photo);
        if (livenessData) formData.append('livenessData', JSON.stringify(livenessData));
        
        await queueAttendanceSubmission(tokenData.token.id, formData);
        
        setSubmitted(true);
        setSubmitResult({ queued: true, log: { server_time: new Date().toISOString() } });
      } else {
        // Show clear error message for non-network errors
        const errorMessage = err instanceof Error ? err.message : 'การส่งข้อมูลล้มเหลว';
        toast({
          title: 'เกิดข้อผิดพลาด',
          description: errorMessage,
          variant: 'destructive'
        });
      }
    } finally {
      setSubmitting(false);
      setSubmitProgress('');
    }
  };

  const submitAttendance = async () => {
    await submitAttendanceWithRetry(1);
  };

  const handleOTRequest = async () => {
    if (!otReason.trim() || !estimatedEndTime) {
      toast({
        title: 'กรอกข้อมูลให้ครบ',
        description: 'กรุณากรอกเหตุผลและเวลาที่คาดว่าจะเลิกงาน',
        variant: 'destructive'
      });
      return;
    }

    try {
      setOTRequestSubmitting(true);

      // Calculate estimated hours from current time to end time
      const now = new Date();
      const [hours, minutes] = estimatedEndTime.split(':').map(Number);
      const endTime = new Date();
      endTime.setHours(hours, minutes, 0, 0);
      
      // If end time is before now, assume next day
      if (endTime < now) {
        endTime.setDate(endTime.getDate() + 1);
      }

      const estimatedHours = Math.max(0, (endTime.getTime() - now.getTime()) / (1000 * 60 * 60));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/overtime-request`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            employee_id: tokenData.employee.id,
            reason: otReason,
            estimated_hours: parseFloat(estimatedHours.toFixed(1)),
            request_method: 'webapp'
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit OT request');
      }

      setShowOTRequestDialog(false);
      setOTReason('');
      setEstimatedEndTime('');

      toast({
        title: 'ส่งคำขอ OT สำเร็จ',
        description: 'รอการอนุมัติจากหัวหน้า'
      });

    } catch (err) {
      console.error('OT request error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to submit OT request',
        variant: 'destructive'
      });
    } finally {
      setOTRequestSubmitting(false);
    }
  };

  const handleEarlyLeaveRequest = async () => {
    if (!earlyLeaveType || !earlyLeaveReason.trim()) {
      toast({
        title: 'กรอกข้อมูลให้ครบ',
        description: 'กรุณาเลือกประเภทและระบุเหตุผล',
        variant: 'destructive'
      });
      return;
    }

    try {
      setEarlyLeaveSubmitting(true);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/early-checkout-request`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            employee_id: tokenData.employee.id,
            leave_type: earlyLeaveType,
            leave_reason: earlyLeaveReason
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit early leave request');
      }

      setShowEarlyLeaveDialog(false);
      setSubmitted(true);
      setSubmitResult({
        log: {
          server_time: new Date().toISOString(),
          is_flagged: false
        },
        early_leave: true,
        hours_worked: result.hours_worked,
        required_hours: result.required_hours
      });

      toast({
        title: 'ส่งคำขอออกงานก่อนเวลาแล้ว',
        description: 'รอการอนุมัติจากหัวหน้า'
      });

    } catch (err) {
      console.error('Early leave request error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to submit request',
        variant: 'destructive'
      });
    } finally {
      setEarlyLeaveSubmitting(false);
    }
  };

  const handleRemoteCheckoutRequest = async () => {
    if (!remoteCheckoutReason.trim() || !remoteCheckoutData) {
      toast({
        title: 'กรอกข้อมูลให้ครบ',
        description: 'กรุณาระบุเหตุผลในการขอ checkout นอกสถานที่',
        variant: 'destructive'
      });
      return;
    }

    try {
      setRemoteCheckoutSubmitting(true);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/remote-checkout-request`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            employee_id: tokenData.employee.id,
            latitude: remoteCheckoutData.latitude,
            longitude: remoteCheckoutData.longitude,
            distance_from_branch: remoteCheckoutData.distance,
            branch_id: remoteCheckoutData.branch_id,
            reason: remoteCheckoutReason
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit remote checkout request');
      }

      setShowRemoteCheckoutDialog(false);
      setRemoteCheckoutReason('');
      setRemoteCheckoutData(null);
      setSubmitted(true);
      setSubmitResult({
        log: {
          server_time: new Date().toISOString(),
          is_flagged: false
        },
        remote_checkout_pending: true,
        request_id: result.request_id
      });

      toast({
        title: '✅ ส่งคำขอ Checkout นอกสถานที่สำเร็จ',
        description: 'รอการอนุมัติจากหัวหน้างาน'
      });

    } catch (err) {
      console.error('Remote checkout request error:', err);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: err instanceof Error ? err.message : 'Failed to submit request',
        variant: 'destructive'
      });
    } finally {
      setRemoteCheckoutSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Validating...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Improved error messages
  const getErrorMessage = (error: string) => {
    const errorMap: Record<string, { title: string; description: string; action: string }> = {
      'token_expired': {
        title: 'ลิงก์หมดอายุแล้ว',
        description: 'ลิงก์นี้ถูกใช้งานมากกว่า 10 นาทีแล้ว เพื่อความปลอดภัยจึงหมดอายุแล้วค่ะ',
        action: 'กรุณาขอลิงก์ใหม่จาก LINE Bot โดยพิมพ์ "checkin" หรือ "checkout"'
      },
      'token_used': {
        title: 'ลิงก์ถูกใช้แล้ว',
        description: 'ลิงก์นี้ถูกใช้งานไปแล้ว ไม่สามารถใช้ซ้ำได้',
        action: 'หากต้องการบันทึกเวลาใหม่ กรุณาขอลิงก์ใหม่จาก LINE Bot'
      },
      'employee_inactive': {
        title: 'บัญชีไม่ Active',
        description: 'บัญชีพนักงานของคุณไม่ได้เปิดใช้งาน',
        action: 'กรุณาติดต่อฝ่ายทรัพยากรบุคคลเพื่อเปิดใช้งานบัญชี'
      },
      'No token provided': {
        title: 'ไม่มีลิงก์',
        description: 'ไม่พบข้อมูลการยืนยันตัวตน',
        action: 'กรุณาขอลิงก์จาก LINE Bot'
      }
    };

    return errorMap[error] || {
      title: 'เกิดข้อผิดพลาด',
      description: error,
      action: 'กรุณาลองใหม่อีกครั้ง หรือติดต่อฝ่ายทรัพยากรบุคคล'
    };
  };

  if (error) {
    const errorInfo = getErrorMessage(error);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-destructive/5 to-destructive/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive text-lg sm:text-xl">
              <XCircle className="h-5 w-5 sm:h-6 sm:w-6" />
              {errorInfo.title}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {errorInfo.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert>
              <AlertDescription className="text-xs sm:text-sm">
                💡 {errorInfo.action}
              </AlertDescription>
            </Alert>
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">คำสั่งที่ใช้ได้:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li><code className="bg-muted px-1 py-0.5 rounded">checkin</code> หรือ <code className="bg-muted px-1 py-0.5 rounded">เช็คอิน</code> - สำหรับเข้างาน</li>
                <li><code className="bg-muted px-1 py-0.5 rounded">checkout</code> หรือ <code className="bg-muted px-1 py-0.5 rounded">เช็คเอาต์</code> - สำหรับออกงาน</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted && submitResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950 dark:to-emerald-950 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400 text-lg sm:text-xl">
              <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6" />
              {submitResult.queued ? 'บันทึกลงคิวแล้ว' : (submitResult.early_leave ? 'ส่งคำขอแล้ว' : 'Success!')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {submitResult.queued 
                ? 'ข้อมูลจะถูกส่งอัตโนมัติเมื่อมีอินเทอร์เน็ต'
                : (submitResult.early_leave 
                  ? 'คำขอออกงานก่อนเวลาถูกส่งไปยังหัวหน้าแล้ว'
                  : 'Your attendance has been recorded')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                <span className="text-xs sm:text-sm">
                  {new Date(submitResult.log.server_time).toLocaleString('th-TH', {
                    timeZone: 'Asia/Bangkok'
                  })}
                </span>
              </div>

              {submitResult.early_leave && (
                <Alert>
                  <AlertDescription className="text-xs sm:text-sm">
                    ⏰ ทำงานมา: {submitResult.hours_worked?.toFixed(1)} / {submitResult.required_hours} ชั่วโมง
                    <br />
                    รอการอนุมัติจากหัวหน้า...
                  </AlertDescription>
                </Alert>
              )}

              {submitResult.remote_checkout_pending && (
                <Alert className="bg-orange-50 dark:bg-orange-950/20 border-orange-200">
                  <MapPin className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-xs sm:text-sm">
                    📍 คำขอ Checkout นอกสถานที่ถูกส่งแล้ว
                    <br />
                    รอการอนุมัติจากหัวหน้า - เมื่ออนุมัติแล้วระบบจะ checkout ให้อัตโนมัติ
                  </AlertDescription>
                </Alert>
              )}
              
              {submitResult.log.is_flagged && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs sm:text-sm">
                    ⚠️ {submitResult.log.flag_reason}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground">
              You can close this page now. A confirmation has been sent to your LINE.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const actionText = tokenData?.token?.type === 'check_in' ? 'Check In' : 'Check Out';
  const canSubmit = 
    (!tokenData?.settings?.require_photo || photo) &&
    (!tokenData?.settings?.require_location || location);

  // Check if employee can request OT (checked in and past shift end time)
  const canRequestOT = tokenData?.token?.type === 'check_in' && (() => {
    const now = new Date();
    const shiftEndTime = tokenData?.employee?.shift_end_time;
    if (shiftEndTime) {
      const [hour, min] = shiftEndTime.split(':').map(Number);
      const endTime = new Date();
      endTime.setHours(hour, min, 0, 0);
      return now > endTime; // Past shift end time
    }
    return false;
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 p-3 sm:p-4 pb-16 sm:pb-20">
      <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
        
        {/* Offline Indicator */}
        {isOffline && (
          <Alert variant="destructive" className="bg-destructive/10">
            <WifiOff className="h-4 w-4" />
            <AlertDescription className="text-sm">
              ไม่มีการเชื่อมต่ออินเทอร์เน็ต - ข้อมูลจะถูกบันทึกลงคิวและส่งอัตโนมัติเมื่อกลับมาออนไลน์
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Building className="h-4 w-4 sm:h-5 sm:w-5" />
              {actionText}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Complete the steps below to record your attendance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                <span className="font-medium text-sm sm:text-base">{tokenData?.employee?.full_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Building className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                <span className="text-xs sm:text-sm">{tokenData?.branch?.name || 'N/A'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* OT Request Alert (if past shift end time and checked in) */}
        {canRequestOT && (
          <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <Clock className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-blue-900 dark:text-blue-100">
                    ⏰ คุณทำงานเกินเวลาแล้ว
                  </div>
                  <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    ต้องการขออนุมัติ OT หรือไม่?
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowOTRequestDialog(true)}
                  className="shrink-0"
                >
                  ขออนุมัติ OT
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Hours-Based Time Restriction Alert */}
        {tokenData?.employee?.working_time_type === 'hours_based' && 
         tokenData?.employee?.allowed_work_start_time && 
         tokenData?.employee?.allowed_work_end_time && (
          <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <Clock className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm space-y-1">
              <div className="font-semibold text-amber-900 dark:text-amber-100">
                ⏰ ช่วงเวลาที่อนุญาตให้ check-in:
              </div>
              <div className="text-amber-700 dark:text-amber-300">
                {tokenData.employee.allowed_work_start_time.substring(0,5)} - {tokenData.employee.allowed_work_end_time.substring(0,5)} น.
              </div>
              <div className="text-xs text-muted-foreground">
                คุณจะสามารถนับชั่วโมงได้เฉพาะในช่วงเวลานี้เท่านั้น
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Photo Section */}
        {tokenData?.settings?.require_photo && (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                <Camera className="h-3 w-3 sm:h-4 sm:w-4" />
                Photo {tokenData?.settings?.require_photo && <span className="text-destructive">*</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
              {!photo && (
                <div className="space-y-3">
                  <div className="bg-primary/10 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Shield className="h-4 w-4 text-primary" />
                      <span className="font-medium">เปิดใช้งานการยืนยันใบหน้า</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      คุณจะต้องทำตามคำสั่งง่ายๆ เพื่อยืนยันว่าเป็นคนจริง
                    </p>
                  </div>
                  <Button onClick={startCamera} className="w-full text-sm sm:text-base h-9 sm:h-10">
                    <Camera className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    เริ่มการตรวจสอบใบหน้า
                  </Button>
                </div>
              )}

              {photoPreview && (
                <div className="space-y-2">
                  <div className="relative">
                    <img src={photoPreview} alt="Preview" className="w-full rounded-lg" />
                    {livenessData && (
                      <div className="absolute top-2 right-2">
                      <Badge variant="default" className="gap-1 bg-green-600">
                        <Shield className="h-3 w-3" />
                        ยืนยันแล้ว
                      </Badge>
                      </div>
                    )}
                  </div>
                  {livenessData && (
                    <div className="text-xs text-muted-foreground bg-green-50 dark:bg-green-950 p-2 rounded">
                      ✓ ยืนยันใบหน้าสำเร็จ: {livenessData.challenge}
                    </div>
                  )}
                  <Button 
                    onClick={() => {
                      setPhoto(null);
                      setPhotoPreview('');
                      setLivenessData(null);
                    }} 
                    variant="outline" 
                    className="w-full text-sm sm:text-base h-9 sm:h-10"
                  >
                    ถ่ายรูปใหม่
                  </Button>
                </div>
              )}

              <canvas ref={canvasRef} className="hidden" />
            </CardContent>
          </Card>
        )}

        {/* Location Section */}
        {tokenData?.settings?.require_location && (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
                Location {tokenData?.settings?.require_location && <span className="text-destructive">*</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
              {!location && (
                <Button onClick={requestLocation} variant="outline" className="w-full text-sm sm:text-base h-9 sm:h-10">
                  <MapPin className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Get Location
                </Button>
              )}

              {location && (
                <Alert>
                  <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
                  <AlertDescription className="text-xs sm:text-sm">
                    Location captured: {location.lat.toFixed(6)}, {location.lon.toFixed(6)}
                  </AlertDescription>
                </Alert>
              )}

              {locationError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs sm:text-sm">{locationError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        <Button 
          onClick={handleSubmit} 
          disabled={!canSubmit || submitting}
          className="w-full h-11 sm:h-12 text-base sm:text-lg relative"
          size="lg"
        >
          {submitting ? (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{submitProgress || 'กำลังส่ง...'}</span>
              </div>
            </div>
          ) : (
            `Submit ${actionText}`
          )}
        </Button>

        <p className="text-[10px] sm:text-xs text-center text-muted-foreground">
          This link expires at {new Date(tokenData?.token?.expires_at).toLocaleTimeString('th-TH', {
            timeZone: 'Asia/Bangkok',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </div>

      {/* Liveness Camera Modal */}
      {showLivenessCamera && (
        <LivenessCamera
          onCapture={handleLivenessCapture}
          onCancel={handleLivenessCancel}
          eventType={tokenData?.token?.type as 'check_in' | 'check_out'}
          employeeBirthDate={tokenData?.employee?.birth_date?.slice(5)} // 'MM-DD' format
          todayHolidayIds={todayHolidayIds}
        />
      )}

      {/* Early Leave Request Dialog */}
      <Dialog open={showEarlyLeaveDialog} onOpenChange={setShowEarlyLeaveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              ออกงานก่อนเวลา
            </DialogTitle>
            <DialogDescription>
              คุณยังทำงานไม่ครบตามที่กำหนด กรุณาระบุเหตุผล
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="leave-type">ประเภท *</Label>
              <Select value={earlyLeaveType} onValueChange={setEarlyLeaveType}>
                <SelectTrigger id="leave-type">
                  <SelectValue placeholder="เลือกประเภท" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sick">🤒 ป่วย (Sick Leave)</SelectItem>
                  <SelectItem value="personal">📝 ธุระส่วนตัว (Personal)</SelectItem>
                  <SelectItem value="vacation">🏖️ ลาพักร้อน (Vacation)</SelectItem>
                  <SelectItem value="emergency">🚨 เหตุฉุกเฉิน (Emergency)</SelectItem>
                  <SelectItem value="other">❓ อื่นๆ (Other)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="leave-reason">เหตุผล *</Label>
              <Textarea
                id="leave-reason"
                placeholder="กรุณาระบุเหตุผลในการขอออกงานก่อนเวลา..."
                value={earlyLeaveReason}
                onChange={(e) => setEarlyLeaveReason(e.target.value)}
                className="min-h-[100px]"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {earlyLeaveReason.length}/500 ตัวอักษร
              </p>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                คำขอจะถูกส่งไปยังหัวหน้าเพื่อพิจารณา คุณจะได้รับการแจ้งเตือนเมื่อมีการอนุมัติ
              </AlertDescription>
            </Alert>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowEarlyLeaveDialog(false);
                setEarlyLeaveType('');
                setEarlyLeaveReason('');
              }}
              disabled={earlyLeaveSubmitting}
              className="flex-1"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleEarlyLeaveRequest}
              disabled={earlyLeaveSubmitting || !earlyLeaveType || !earlyLeaveReason.trim()}
              className="flex-1"
            >
              {earlyLeaveSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  กำลังส่ง...
                </>
              ) : (
                'ส่งคำขอ'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* OT Request Dialog */}
      <Dialog open={showOTRequestDialog} onOpenChange={setShowOTRequestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              ขออนุมัติ OT
            </DialogTitle>
            <DialogDescription>
              กรุณากรอกรายละเอียดเพื่อขออนุมัติทำงานล่วงเวลา
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ot-reason">เหตุผล *</Label>
              <Textarea
                id="ot-reason"
                placeholder="เช่น: งานยังไม่เสร็จ, มีงานด่วน, ต้องติดตามลูกค้า..."
                value={otReason}
                onChange={(e) => setOTReason(e.target.value)}
                className="min-h-[100px]"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {otReason.length}/500 ตัวอักษร
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimated-time">คาดว่าจะเลิกงานเมื่อไหร่ *</Label>
              <input
                id="estimated-time"
                type="time"
                value={estimatedEndTime}
                onChange={(e) => setEstimatedEndTime(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                เลือกเวลาที่คาดว่าจะเลิกงาน
              </p>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                คำขอจะถูกส่งไปยังหัวหน้าเพื่อพิจารณา คุณจะได้รับการแจ้งเตือนเมื่อมีการอนุมัติ
              </AlertDescription>
            </Alert>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowOTRequestDialog(false);
                setOTReason('');
                setEstimatedEndTime('');
              }}
              disabled={otRequestSubmitting}
              className="flex-1"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleOTRequest}
              disabled={otRequestSubmitting || !otReason.trim() || !estimatedEndTime}
              className="flex-1"
            >
              {otRequestSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  กำลังส่ง...
                </>
              ) : (
                'ส่งคำขอ OT'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remote Checkout Request Dialog */}
      <Dialog open={showRemoteCheckoutDialog} onOpenChange={setShowRemoteCheckoutDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-orange-500" />
              ขอ Checkout นอกสถานที่
            </DialogTitle>
            <DialogDescription>
              คุณอยู่นอกพื้นที่ที่กำหนด กรุณาระบุเหตุผล
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {remoteCheckoutData && (
              <Alert className="bg-orange-50 dark:bg-orange-950/20 border-orange-200">
                <MapPin className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-sm">
                  <div><strong>สาขา:</strong> {remoteCheckoutData.branch_name}</div>
                  <div><strong>ระยะห่าง:</strong> {remoteCheckoutData.distance} เมตร</div>
                  <div><strong>อนุญาตภายใน:</strong> {remoteCheckoutData.allowed_radius} เมตร</div>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="remote-reason">เหตุผล *</Label>
              <Textarea
                id="remote-reason"
                placeholder="เช่น: ไปพบลูกค้า, ออกไปซื้อของให้ร้าน, ธุระด่วน..."
                value={remoteCheckoutReason}
                onChange={(e) => setRemoteCheckoutReason(e.target.value)}
                className="min-h-[100px]"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {remoteCheckoutReason.length}/500 ตัวอักษร
              </p>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                คำขอจะถูกส่งไปยังหัวหน้าเพื่อพิจารณา เมื่ออนุมัติแล้วระบบจะ checkout ให้อัตโนมัติ
              </AlertDescription>
            </Alert>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowRemoteCheckoutDialog(false);
                setRemoteCheckoutReason('');
                setRemoteCheckoutData(null);
              }}
              disabled={remoteCheckoutSubmitting}
              className="flex-1"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleRemoteCheckoutRequest}
              disabled={remoteCheckoutSubmitting || !remoteCheckoutReason.trim()}
              className="flex-1"
            >
              {remoteCheckoutSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  กำลังส่ง...
                </>
              ) : (
                'ส่งคำขอ'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
