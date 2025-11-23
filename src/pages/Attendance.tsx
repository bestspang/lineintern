import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, MapPin, Clock, User, Building, CheckCircle, XCircle, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
      title: 'Photo Captured',
      description: 'Liveness verification completed successfully',
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
              Success!
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Your attendance has been recorded
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
                      <span className="font-medium">Liveness Verification Enabled</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      You'll need to complete a simple challenge to verify you're a real person
                    </p>
                  </div>
                  <Button onClick={startCamera} className="w-full text-sm sm:text-base h-9 sm:h-10">
                    <Camera className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    Start Liveness Check
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
                          Verified
                        </Badge>
                      </div>
                    )}
                  </div>
                  {livenessData && (
                    <div className="text-xs text-muted-foreground bg-green-50 dark:bg-green-950 p-2 rounded">
                      ✓ Liveness verified: {livenessData.challenge}
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
                    Retake Photo
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
    </div>
  );
}
