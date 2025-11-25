import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Check, X, Eye, MoveHorizontal, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LivenessCameraProps {
  onCapture: (blob: Blob, livenessData: LivenessData) => void;
  onCancel: () => void;
}

export interface LivenessData {
  blinked: boolean;
  headTurned: boolean;
  challenge: string;
  timestamp: number;
}

type Challenge = "blink" | "turn_left" | "turn_right";

const CHALLENGES: { type: Challenge; text: string; icon: any }[] = [
  { type: "blink", text: "กระพริบตา 2 ครั้ง", icon: Eye },
  { type: "turn_left", text: "หันหน้าไปทางซ้าย", icon: MoveHorizontal },
  { type: "turn_right", text: "หันหน้าไปทางขวา", icon: MoveHorizontal },
];

export default function LivenessCamera({ onCapture, onCancel }: LivenessCameraProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>("");
  
  // New 3-stage flow state
  const [captureStage, setCaptureStage] = useState<'verify' | 'face_forward' | 'confirm'>('verify');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [faceDetectedStable, setFaceDetectedStable] = useState(0);
  
  // Liveness detection state
  const [currentChallenge, setCurrentChallenge] = useState<Challenge>("blink");
  const [challengeCompleted, setChallengeCompleted] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [headPosition, setHeadPosition] = useState<"center" | "left" | "right">("center");
  const lastEyeStateRef = useRef<boolean>(true); // true = open, false = closed
  const livenessDataRef = useRef<LivenessData>({
    blinked: false,
    headTurned: false,
    challenge: "",
    timestamp: Date.now(),
  });

  // Initialize MediaPipe Face Landmarker
  useEffect(() => {
    const initializeFaceLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
        
        setFaceLandmarker(landmarker);
      } catch (err) {
        console.error("Failed to initialize face landmarker:", err);
        setError("Failed to load face detection model");
      }
    };

    initializeFaceLandmarker();

    return () => {
      if (faceLandmarker) {
        faceLandmarker.close();
      }
    };
  }, []);

  // Start camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 1280, height: 720 },
          audio: false,
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }
        
        setStream(mediaStream);
        
        // Select random challenge
        const randomChallenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
        setCurrentChallenge(randomChallenge.type);
        livenessDataRef.current.challenge = randomChallenge.text;
      } catch (err) {
        console.error("Camera error:", err);
        setError("Cannot access camera. Please allow camera permission.");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Auto-navigate to face_forward stage when challenge completed
  useEffect(() => {
    if (challengeCompleted && captureStage === 'verify') {
      setCaptureStage('face_forward');
      setFaceDetectedStable(0); // Reset counter
      
      toast({
        title: '✅ ยืนยันตัวตนสำเร็จ',
        description: 'กรุณาหันหน้าตรงกล้องเพื่อถ่ายรูป',
      });
    }
  }, [challengeCompleted, captureStage]);


  // Process video frames
  useEffect(() => {
    if (!faceLandmarker || !videoRef.current || !stream) return;

    let animationId: number;
    let lastVideoTime = -1;

    const processFrame = async () => {
      const video = videoRef.current;
      
      // More flexible readyState check - allow readyState >= 2
      if (!video || video.readyState < 2) {
        animationId = requestAnimationFrame(processFrame);
        return;
      }
      
      // If video is partially ready (2 or 3), still try to process but log it
      if (video.readyState < 4) {
        console.log('⏳ Video partially ready, readyState:', video.readyState);
      }

      const currentTime = video.currentTime;
      if (currentTime === lastVideoTime) {
        animationId = requestAnimationFrame(processFrame);
        return;
      }
      lastVideoTime = currentTime;

      try {
        const result: FaceLandmarkerResult = faceLandmarker.detectForVideo(video, Date.now());
        
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          console.log('🎥 Frame processed, stage:', captureStage, 'readyState:', video.readyState);
          detectLiveness(result);
        } else {
          console.log('⚠️ No face detected, readyState:', video.readyState);
        }
      } catch (err) {
        console.error("Frame processing error:", err);
      }

      animationId = requestAnimationFrame(processFrame);
    };

    animationId = requestAnimationFrame(processFrame);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [faceLandmarker, stream]);

  // Detect liveness from face landmarks
  const detectLiveness = (result: FaceLandmarkerResult) => {
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return;

    const landmarks = result.faceLandmarks[0];

    // Stage 1: Verification challenges (do FIRST)
    if (captureStage === 'verify') {
      // Blink detection using Eye Aspect Ratio (EAR)
      const leftEyeTop = landmarks[159];
      const leftEyeBottom = landmarks[145];
      const leftEyeLeft = landmarks[33];
      const leftEyeRight = landmarks[133];

      const rightEyeTop = landmarks[386];
      const rightEyeBottom = landmarks[374];
      const rightEyeLeft = landmarks[362];
      const rightEyeRight = landmarks[263];

      const leftEAR = calculateEAR(leftEyeTop, leftEyeBottom, leftEyeLeft, leftEyeRight);
      const rightEAR = calculateEAR(rightEyeTop, rightEyeBottom, rightEyeLeft, rightEyeRight);
      const avgEAR = (leftEAR + rightEAR) / 2;

      const isEyeClosed = avgEAR < 0.25; // Increased from 0.2 to 0.25

      // Detect blink (eye closed then opened)
      if (lastEyeStateRef.current && isEyeClosed) {
        // Eye just closed
        lastEyeStateRef.current = false;
        console.log('👁️ Eye closed, EAR:', avgEAR.toFixed(3));
      } else if (!lastEyeStateRef.current && !isEyeClosed) {
        // Eye just opened - blink detected
        console.log('✅ Blink detected! Count:', blinkCount + 1);
        setBlinkCount(prev => {
          const newCount = prev + 1;
          if (currentChallenge === "blink" && newCount >= 2) {
            livenessDataRef.current.blinked = true;
            setChallengeCompleted(true);
          }
          return newCount;
        });
        lastEyeStateRef.current = true;
      }

      // Head turn detection using face center position
      const noseTip = landmarks[1];
      const leftCheek = landmarks[234];
      const rightCheek = landmarks[454];

      const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
      const noseOffsetFromCenter = noseTip.x - (leftCheek.x + rightCheek.x) / 2;
      const normalizedOffset = noseOffsetFromCenter / faceWidth;

      if (normalizedOffset < -0.15) {
        setHeadPosition("left");
        if (currentChallenge === "turn_left") {
          livenessDataRef.current.headTurned = true;
          setChallengeCompleted(true);
        }
      } else if (normalizedOffset > 0.15) {
        setHeadPosition("right");
        if (currentChallenge === "turn_right") {
          livenessDataRef.current.headTurned = true;
          setChallengeCompleted(true);
        }
      } else {
        setHeadPosition("center");
      }
      return;
    }

    // Stage 2: Detect face forward and auto-capture (AFTER verification)
    if (captureStage === 'face_forward') {
      const noseTip = landmarks[1];
      const leftCheek = landmarks[234];
      const rightCheek = landmarks[454];
      const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
      const noseOffsetFromCenter = noseTip.x - (leftCheek.x + rightCheek.x) / 2;
      const normalizedOffset = noseOffsetFromCenter / faceWidth;
      
      // Face is centered
      if (Math.abs(normalizedOffset) < 0.1) {
        setFaceDetectedStable(prev => {
          const newCount = prev + 1;
          // 90 frames (~3 seconds) of stable face forward
          if (newCount >= 90) {
            autoCaptureFaceForward();
            return 0;
          }
          return newCount;
        });
      } else {
        setFaceDetectedStable(0);
      }
    }
  };

  // Calculate Eye Aspect Ratio
  const calculateEAR = (
    top: { x: number; y: number; z: number },
    bottom: { x: number; y: number; z: number },
    left: { x: number; y: number; z: number },
    right: { x: number; y: number; z: number }
  ) => {
    const verticalDist = Math.sqrt(
      Math.pow(top.x - bottom.x, 2) + Math.pow(top.y - bottom.y, 2)
    );
    const horizontalDist = Math.sqrt(
      Math.pow(left.x - right.x, 2) + Math.pow(left.y - right.y, 2)
    );
    return verticalDist / horizontalDist;
  };

  // Auto-capture face forward photo
  const autoCaptureFaceForward = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Flip horizontally to un-mirror the captured image
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageDataUrl);
    
    // Move to confirm stage (verification already done)
    setCaptureStage('confirm');
    
    toast({
      title: '📸 ถ่ายรูปเรียบร้อย',
      description: 'กดยืนยันเพื่อ Check In',
    });
  };

  // Confirm and submit captured photo
  const handleConfirmAndCapture = async () => {
    if (!capturedImage) return;
    
    setIsProcessing(true);
    
    try {
      // Convert data URL to Blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      
      livenessDataRef.current.timestamp = Date.now();
      onCapture(blob, livenessDataRef.current);
    } catch (err) {
      console.error("Capture error:", err);
      setError("Failed to process photo");
      setIsProcessing(false);
    }
  };

  const currentChallengeInfo = CHALLENGES.find(c => c.type === currentChallenge)!;
  const ChallengeIcon = currentChallengeInfo.icon;

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            ตรวจสอบใบหน้า
          </CardTitle>
          <CardDescription>
            ทำตามคำแนะนำเพื่อยืนยันตัวตน
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
              {error}
            </div>
          ) : (
            <>
              {/* Stage 1: Verify with Challenge (FIRST) */}
              {captureStage === 'verify' && (
                <>
                  <div className="bg-primary/10 p-6 rounded-lg border-2 border-primary/20">
                    <div className="flex flex-col items-center gap-4">
                      <ChallengeIcon className="h-12 w-12 text-primary animate-pulse" />
                      
                      <div className="font-bold text-2xl sm:text-3xl text-center text-primary">
                        {currentChallengeInfo.text}
                      </div>

                      {currentChallenge === "blink" && (
                        <div className="text-base text-muted-foreground text-center">
                          จำนวนครั้งที่กระพริบ: <strong>{blinkCount}/2</strong>
                        </div>
                      )}

                      {(currentChallenge === "turn_left" || currentChallenge === "turn_right") && (
                        <div className="text-base text-muted-foreground text-center">
                          ตำแหน่งหัว: <Badge variant={headPosition === "center" ? "secondary" : "default"}>{headPosition}</Badge>
                        </div>
                      )}

                      {challengeCompleted && (
                        <Badge variant="default" className="text-lg py-2 px-4 bg-green-500">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          สำเร็จ
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Video Feed - Mirrored */}
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover scale-x-[-1]"
                      playsInline
                      muted
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* Debug Overlay with Retry */}
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs p-2 rounded">
                      Video: {videoRef.current?.readyState === 4 ? '✅ Ready' : `⏳ Loading (${videoRef.current?.readyState})`}
                      <br />
                      Stream: {stream ? '✅ Active' : '❌ Inactive'}
                      <br />
                      FaceLandmarker: {faceLandmarker ? '✅ Ready' : '❌ Not Ready'}
                      
                      {/* Retry button if stuck */}
                      {videoRef.current?.readyState !== 4 && stream && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2 text-xs"
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.load();
                              videoRef.current.play();
                            }
                          }}
                        >
                          🔄 รีโหลดวิดีโอ
                        </Button>
                      )}
                    </div>
                    
                    {!faceLandmarker && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                        กำลังโหลดระบบตรวจจับใบหน้า...
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    onClick={onCancel}
                    className="w-full"
                  >
                    ยกเลิก
                  </Button>
                </>
              )}

              {/* Stage 2: Face Forward (AFTER verification) */}
              {captureStage === 'face_forward' && (
                <>
                  <div className="bg-green-50 dark:bg-green-950 p-6 rounded-lg border-2 border-green-500/20">
                    <div className="flex flex-col items-center gap-4">
                      <CheckCircle className="h-12 w-12 text-green-500" />
                      <div className="font-bold text-2xl text-green-600 dark:text-green-400">
                        ✅ ยืนยันตัวตนสำเร็จ
                      </div>
                      <div className="text-base text-muted-foreground text-center">
                        กรุณา<strong>หันหน้าตรงกล้อง</strong>เพื่อถ่ายรูป
                        <br />
                        <span className="text-sm text-green-600 dark:text-green-400">
                          ระบบจะถ่ายอัตโนมัติใน 3 วินาที
                        </span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full transition-all duration-100"
                          style={{ width: `${(faceDetectedStable / 90) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Video Feed - Mirrored */}
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover scale-x-[-1]"
                      playsInline
                      muted
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {!faceLandmarker && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                        กำลังโหลดระบบตรวจจับใบหน้า...
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    onClick={onCancel}
                    className="w-full"
                  >
                    ยกเลิก
                  </Button>
                </>
              )}

              {/* Stage 3: Confirm */}
              {captureStage === 'confirm' && capturedImage && (
                <>
                  <div className="bg-green-50 dark:bg-green-950 p-6 rounded-lg border-2 border-green-500/20">
                    <div className="flex flex-col items-center gap-4">
                      <CheckCircle className="h-12 w-12 text-green-500" />
                      <div className="font-bold text-2xl text-green-600 dark:text-green-400">
                        ✅ ยืนยันตัวตนสำเร็จ
                      </div>
                    </div>
                  </div>
                  
                  {/* Show captured photo */}
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                    <img 
                      src={capturedImage} 
                      alt="Captured" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline"
                      onClick={onCancel}
                      disabled={isProcessing}
                      className="flex-1"
                    >
                      ยกเลิก
                    </Button>
                    <Button 
                      onClick={handleConfirmAndCapture}
                      disabled={isProcessing}
                      className="flex-1"
                      size="lg"
                    >
                      {isProcessing ? (
                        <>
                          <Camera className="h-5 w-5 mr-2" />
                          กำลังประมวลผล...
                        </>
                      ) : (
                        <>
                          <Check className="h-5 w-5 mr-2" />
                          ยืนยันและใช้รูปนี้
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}

              {/* Tips - Show only in stage 1 and 2 */}
              {captureStage !== 'confirm' && (
                <div className="text-sm text-muted-foreground space-y-1 bg-muted/50 p-4 rounded-lg">
                  <p>💡 <strong>คำแนะนำ:</strong></p>
                  <p>• ตรวจสอบว่าแสงสว่างเพียงพอและใบหน้าชัดเจน</p>
                  <p>• วางใบหน้าให้อยู่ตรงกลางกรอบ</p>
                  {captureStage === 'face_forward' && <p>• ยืนนิ่งเพื่อให้ระบบถ่ายรูปอัตโนมัติ</p>}
                  {captureStage === 'verify' && <p>• ทำตามคำสั่งให้ครบถ้วน</p>}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
