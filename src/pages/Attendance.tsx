import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, MapPin, Clock, User, Building, CheckCircle, XCircle, Loader2, Shield } from 'lucide-react';
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

export default function Attendance() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    const token = searchParams.get('t');
    if (!token) {
      setError('No token provided');
      setLoading(false);
      return;
    }
    
    validateToken(token);
  }, [searchParams]);

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

  const submitAttendance = async () => {
    if (!tokenData) return;

    try {
      setSubmitting(true);

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
        formData.append('photo', photo);
      }
      
      if (livenessData) {
        formData.append('livenessData', JSON.stringify(livenessData));
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attendance-submit`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: formData
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Submission failed');
      }

      setSubmitResult(result);
      setSubmitted(true);
      
      toast({
        title: 'Success!',
        description: 'Attendance recorded successfully',
      });

    } catch (err) {
      console.error('Submit error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to submit',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-destructive/5 to-destructive/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-6 w-6" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <p className="mt-4 text-sm text-muted-foreground">
              Please request a new link from the LINE bot.
            </p>
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
              {submitResult.early_leave ? 'ส่งคำขอแล้ว' : 'Success!'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {submitResult.early_leave 
                ? 'คำขอออกงานก่อนเวลาถูกส่งไปยังหัวหน้าแล้ว'
                : 'Your attendance has been recorded'}
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 p-3 sm:p-4 pb-16 sm:pb-20">
      <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
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
          className="w-full h-11 sm:h-12 text-base sm:text-lg"
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
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
    </div>
  );
}
