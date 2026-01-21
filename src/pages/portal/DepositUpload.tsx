import { useState, useRef, useCallback, useEffect } from "react";
import { usePortal } from "@/contexts/PortalContext";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Upload, CheckCircle2, AlertCircle, Loader2, User, FileText, ArrowRight, ArrowLeft, RefreshCw, Sparkles, Edit3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { portalApi } from "@/lib/portal-api";
import { toast } from "sonner";
import LivenessCamera, { LivenessData } from "@/components/attendance/LivenessCamera";
import { formatBangkokISODate } from "@/lib/timezone";

type Step = 'face' | 'slip' | 'preview' | 'complete';

interface ExtractedData {
  amount?: number;
  account_number?: string;
  bank_name?: string;
  bank_branch?: string;
  deposit_date?: string;
  reference_number?: string;
  confidence?: number;
}

interface ManualData {
  amount: string;
  account_number: string;
  bank_name: string;
  reference_number: string;
}

export default function DepositUpload() {
  const { employee, locale, loading: portalLoading } = usePortal();
  const [step, setStep] = useState<Step>('face');
  const [facePhoto, setFacePhoto] = useState<string | null>(null);
  const [livenessData, setLivenessData] = useState<any>(null);
  const [slipPhoto, setSlipPhoto] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [manualData, setManualData] = useState<ManualData>({
    amount: '',
    account_number: '',
    bank_name: '',
    reference_number: ''
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [todayDeposit, setTodayDeposit] = useState<any>(null);
  const [checkingDeposit, setCheckingDeposit] = useState(true);
  const [todayHolidayIds, setTodayHolidayIds] = useState<string[]>([]);
  const slipInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ⚠️ TIMEZONE: Use Bangkok date - NEVER use toISOString().split('T')[0]
  const today = formatBangkokISODate(new Date());

  // Check if already submitted today via portal API (bypasses RLS)
  useEffect(() => {
    async function checkTodayDeposit() {
      if (!employee?.id) {
        setCheckingDeposit(false);
        return;
      }

      try {
        const { data } = await portalApi({
          endpoint: 'check-today-deposit',
          employee_id: employee.id
        });
        setTodayDeposit(data);
      } catch (error) {
        console.error("Error checking deposit:", error);
      } finally {
        setCheckingDeposit(false);
      }
    }

    checkTodayDeposit();
  }, [employee?.id]);

  // Fetch today's holidays for special day quotes
  useEffect(() => {
    const fetchTodayHolidays = async () => {
      try {
        const { data } = await supabase
          .from('holidays')
          .select('id')
          .eq('date', today);
        
        if (data) {
          setTodayHolidayIds(data.map(h => h.id));
        }
      } catch (err) {
        console.warn('Failed to fetch holidays:', err);
      }
    };
    
    fetchTodayHolidays();
  }, [today]);

  // Handle face verification complete - receives Blob from LivenessCamera
  const handleFaceVerified = useCallback((blob: Blob, liveness: LivenessData) => {
    // Convert blob to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      setFacePhoto(reader.result as string);
      setLivenessData(liveness);
      setStep('slip');
    };
    reader.readAsDataURL(blob);
  }, []);

  // Handle slip photo capture
  const handleSlipCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSlipPhoto(reader.result as string);
        setStep('preview');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Start camera for slip photo
  const startSlipCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1280, height: 720 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("ไม่สามารถเปิดกล้องได้");
    }
  }, []);

  // Capture slip from camera
  const captureSlipFromCamera = useCallback(() => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setSlipPhoto(dataUrl);
        setStep('preview');
        
        // Stop camera
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      }
    }
  }, []);

  // Stop camera on unmount or step change
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Extract data from slip using AI
  const handleExtract = async () => {
    if (!slipPhoto) return;

    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('deposit-submit', {
        body: {
          slipPhotoBase64: slipPhoto,
          extract_only: true
        }
      });

      if (error) throw error;
      if (data.extractedData) {
        setExtractedData(data.extractedData);
        // Pre-fill manual fields
        setManualData({
          amount: data.extractedData.amount?.toString() || '',
          account_number: data.extractedData.account_number || '',
          bank_name: data.extractedData.bank_name || '',
          reference_number: data.extractedData.reference_number || ''
        });
      }
    } catch (error) {
      console.error("Extract error:", error);
      toast.error("ไม่สามารถสกัดข้อมูลได้ กรุณากรอกด้วยตนเอง");
    } finally {
      setIsExtracting(false);
    }
  };

  // Submit deposit
  const handleSubmit = async () => {
    if (!employee || !slipPhoto) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('deposit-submit', {
        body: {
          employeeId: employee.id,
          branchId: employee.branch_id,
          depositDate: today,
          facePhotoBase64: facePhoto,
          slipPhotoBase64: slipPhoto,
          livenessData,
          manualData: {
            amount: manualData.amount ? parseFloat(manualData.amount.replace(/,/g, '')) : null,
            account_number: manualData.account_number || null,
            bank_name: manualData.bank_name || null,
            reference_number: manualData.reference_number || null
          }
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setExtractedData(data.extractedData);
      setStep('complete');
      toast.success("อัพโหลดใบฝากเงินสำเร็จ");
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setStep('face');
    setFacePhoto(null);
    setLivenessData(null);
    setSlipPhoto(null);
    setExtractedData(null);
  };

  // Format currency
  const formatCurrency = (amount?: number) => {
    if (!amount) return "-";
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
  };

  if (portalLoading || checkingDeposit) {
    return (
      <PortalLayout>
        <div className="space-y-4 p-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </PortalLayout>
    );
  }

  // Already submitted today
  if (todayDeposit) {
    return (
      <PortalLayout>
        <div className="p-4 space-y-4">
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {locale === 'th' 
                ? `สาขานี้ได้อัพโหลดใบฝากเงินวันนี้แล้ว โดย ${todayDeposit.employees?.full_name}`
                : `This branch has already submitted a deposit today by ${todayDeposit.employees?.full_name}`
              }
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {locale === 'th' ? "ข้อมูลการฝากเงินวันนี้" : "Today's Deposit Info"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ยอดฝาก:</span>
                <span className="font-semibold">{formatCurrency(todayDeposit.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">เลขบัญชี:</span>
                <span>{todayDeposit.account_number || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">เลขอ้างอิง:</span>
                <span>{todayDeposit.reference_number || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">สถานะ:</span>
                <Badge variant={todayDeposit.status === 'verified' ? 'default' : 'secondary'}>
                  {todayDeposit.status === 'verified' ? 'ตรวจสอบแล้ว' : 
                   todayDeposit.status === 'rejected' ? 'ถูกปฏิเสธ' : 'รอตรวจสอบ'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </PortalLayout>
    );
  }

  return (
    <>
      {/* Step 1: Face Verification - Full screen overlay */}
      {step === 'face' && (
        <LivenessCamera
          onCapture={handleFaceVerified}
          onCancel={() => window.history.back()}
          eventType="deposit"
          employeeBirthDate={employee?.birth_date?.slice(5)}
          todayHolidayIds={todayHolidayIds}
        />
      )}

      {/* Other steps in PortalLayout */}
      {step !== 'face' && (
        <PortalLayout>
          <div className="p-4 space-y-4">
            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className={`flex items-center gap-1 ${step === 'slip' ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm bg-green-500 text-white`}>
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <span className="text-xs hidden sm:inline">ยืนยันตัวตน</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className={`flex items-center gap-1 ${step === 'slip' ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  step === 'slip' ? 'bg-primary text-primary-foreground' : 
                  ['preview', 'complete'].includes(step) ? 'bg-green-500 text-white' : 'bg-muted'
                }`}>
                  {['preview', 'complete'].includes(step) ? <CheckCircle2 className="h-4 w-4" /> : '2'}
                </div>
                <span className="text-xs hidden sm:inline">ถ่ายใบฝาก</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className={`flex items-center gap-1 ${step === 'preview' ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  step === 'preview' ? 'bg-primary text-primary-foreground' : 
                  step === 'complete' ? 'bg-green-500 text-white' : 'bg-muted'
                }`}>
                  {step === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : '3'}
                </div>
                <span className="text-xs hidden sm:inline">ยืนยัน</span>
              </div>
            </div>

        {/* Step 2: Slip Photo */}
        {step === 'slip' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                ถ่ายรูปใบฝากเงิน
              </CardTitle>
              <CardDescription>
                ถ่ายรูปใบฝากเงินให้ชัดเจน เห็นจำนวนเงินและเลขอ้างอิง
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  className="h-24 flex-col gap-2"
                  onClick={() => slipInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-sm">เลือกจากคลัง</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-24 flex-col gap-2"
                  onClick={startSlipCamera}
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-sm">ถ่ายรูป</span>
                </Button>
              </div>

              <input
                ref={slipInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSlipCapture}
              />

              {/* Camera preview */}
              {streamRef.current && (
                <div className="relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full rounded-lg"
                  />
                  <Button 
                    className="absolute bottom-4 left-1/2 -translate-x-1/2"
                    onClick={captureSlipFromCamera}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    ถ่าย
                  </Button>
                </div>
              )}

              <Button 
                variant="ghost" 
                className="w-full"
                onClick={() => setStep('face')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                กลับ
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Preview & Submit */}
        {step === 'preview' && slipPhoto && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Edit3 className="h-5 w-5" />
                ตรวจสอบและยืนยัน
              </CardTitle>
              <CardDescription>
                ตรวจสอบข้อมูลและแก้ไขหากจำเป็น
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Slip Image */}
              <div className="rounded-lg overflow-hidden border max-h-48 overflow-y-auto">
                <img src={slipPhoto} alt="Deposit slip" className="w-full" />
              </div>

              {/* AI Extract Button */}
              {!extractedData && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleExtract}
                  disabled={isExtracting}
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      กำลังอ่านข้อมูล...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      อ่านข้อมูลอัตโนมัติ (AI)
                    </>
                  )}
                </Button>
              )}

              {/* Confidence Warning */}
              {extractedData && extractedData.confidence !== undefined && extractedData.confidence < 0.7 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    ความมั่นใจต่ำ ({Math.round((extractedData.confidence || 0) * 100)}%) กรุณาตรวจสอบข้อมูลให้ถูกต้อง
                  </AlertDescription>
                </Alert>
              )}

              {/* Editable Fields */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="amount">ยอดฝาก (บาท) *</Label>
                  <Input
                    id="amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="เช่น 1,050.00"
                    value={manualData.amount}
                    onChange={(e) => setManualData(prev => ({ ...prev, amount: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account_number">เลขบัญชี</Label>
                  <Input
                    id="account_number"
                    type="text"
                    placeholder="เช่น 194-1-73100-3"
                    value={manualData.account_number}
                    onChange={(e) => setManualData(prev => ({ ...prev, account_number: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bank_name">ธนาคาร</Label>
                  <Input
                    id="bank_name"
                    type="text"
                    placeholder="เช่น กสิกรไทย"
                    value={manualData.bank_name}
                    onChange={(e) => setManualData(prev => ({ ...prev, bank_name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reference_number">เลขอ้างอิง</Label>
                  <Input
                    id="reference_number"
                    type="text"
                    placeholder="เช่น 9635136"
                    value={manualData.reference_number}
                    onChange={(e) => setManualData(prev => ({ ...prev, reference_number: e.target.value }))}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setSlipPhoto(null);
                    setExtractedData(null);
                    setManualData({ amount: '', account_number: '', bank_name: '', reference_number: '' });
                    setStep('slip');
                  }}
                  disabled={isSubmitting || isExtracting}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  ถ่ายใหม่
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={isSubmitting || isExtracting || !manualData.amount}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      กำลังส่ง...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      ส่งใบฝากเงิน
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-green-600">อัพโหลดสำเร็จ!</CardTitle>
              <CardDescription>
                ข้อมูลถูกส่งไปยังผู้บริหารเรียบร้อยแล้ว
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {extractedData && (
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <h4 className="font-medium">ข้อมูลที่สกัดได้:</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">ยอดฝาก:</span>
                    <span className="font-medium">{formatCurrency(extractedData.amount)}</span>
                    <span className="text-muted-foreground">เลขบัญชี:</span>
                    <span>{extractedData.account_number || '-'}</span>
                    <span className="text-muted-foreground">ธนาคาร:</span>
                    <span>{extractedData.bank_name || '-'}</span>
                    <span className="text-muted-foreground">เลขอ้างอิง:</span>
                    <span>{extractedData.reference_number || '-'}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
          </div>
        </PortalLayout>
      )}
    </>
  );
}