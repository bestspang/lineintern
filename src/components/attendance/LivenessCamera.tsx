import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Check, X, Eye, MoveHorizontal } from "lucide-react";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>("");
  
  // Liveness detection state
  const [currentChallenge, setCurrentChallenge] = useState<Challenge>("turn_right");
  const [challengeCompleted, setChallengeCompleted] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [headPosition, setHeadPosition] = useState<"center" | "left" | "right">("center");
  
  // 2-Step Challenge states
  const [challengeStep, setChallengeStep] = useState<1 | 2>(1);
  const [step1Completed, setStep1Completed] = useState(false);
  const [step2Challenge, setStep2Challenge] = useState<"blink" | "turn_left">("blink");
  
  // Center face detection states
  const [waitingForCenter, setWaitingForCenter] = useState(false);
  const [centerHoldTimer, setCenterHoldTimer] = useState(0);
  const centerStartTimeRef = useRef<number | null>(null);
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
        
        // 2-Step Challenge Setup
        // Step 1: Always turn_right
        setCurrentChallenge("turn_right");
        livenessDataRef.current.challenge = "หันขวา → ";
        
        // Step 2: Random between blink or turn_left
        const step2Options: ("blink" | "turn_left")[] = ["blink", "turn_left"];
        const selectedStep2 = step2Options[Math.floor(Math.random() * 2)];
        setStep2Challenge(selectedStep2);
        livenessDataRef.current.challenge += selectedStep2 === "blink" ? "กระพริบตา" : "หันซ้าย";
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

  // Switch to center face phase after challenge
  useEffect(() => {
    if (challengeCompleted && !waitingForCenter) {
      setWaitingForCenter(true);
    }
  }, [challengeCompleted, waitingForCenter]);

  // Detect center hold for 3 seconds with strict face validation
  useEffect(() => {
    if (!waitingForCenter || !faceLandmarker || !videoRef.current) {
      centerStartTimeRef.current = null;
      setCenterHoldTimer(0);
      return;
    }

    let animationId: number;
    
    const checkCenterHold = () => {
      // Check if face is truly straight (strict validation)
      const video = videoRef.current;
      if (!video || video.readyState !== 4) {
        animationId = requestAnimationFrame(checkCenterHold);
        return;
      }

      try {
        const result = faceLandmarker.detectForVideo(video, Date.now());
        
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          const landmarks = result.faceLandmarks[0];
          
          // Check if face is straight on both X and Y axis
          const noseTip = landmarks[1];
          const leftCheek = landmarks[234];
          const rightCheek = landmarks[454];
          const foreheadTop = landmarks[10];
          const chin = landmarks[152];
          
          // X-axis (left-right)
          const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
          const noseOffsetX = noseTip.x - (leftCheek.x + rightCheek.x) / 2;
          const normalizedOffsetX = noseOffsetX / faceWidth;
          
          // Y-axis (up-down)
          const faceHeight = Math.abs(chin.y - foreheadTop.y);
          const noseOffsetY = noseTip.y - (foreheadTop.y + chin.y) / 2;
          const normalizedOffsetY = noseOffsetY / faceHeight;
          
          // Strict center detection: ±0.08 on both axes
          const isFacingStraight = Math.abs(normalizedOffsetX) < 0.08 && Math.abs(normalizedOffsetY) < 0.08;
          
          if (isFacingStraight) {
            if (centerStartTimeRef.current === null) {
              centerStartTimeRef.current = Date.now();
            }
            
            const elapsed = Date.now() - centerStartTimeRef.current;
            const secondsHeld = Math.floor(elapsed / 1000) + 1;
            
            setCenterHoldTimer(Math.min(secondsHeld, 3));
            
            if (elapsed >= 3000) {
              capturePhoto();
              return;
            }
          } else {
            // Reset if face is not straight
            centerStartTimeRef.current = null;
            setCenterHoldTimer(0);
          }
        }
      } catch (err) {
        console.error("Center hold check error:", err);
      }
      
      animationId = requestAnimationFrame(checkCenterHold);
    };
    
    animationId = requestAnimationFrame(checkCenterHold);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [waitingForCenter, faceLandmarker]);

  // Process video frames
  useEffect(() => {
    if (!faceLandmarker || !videoRef.current || !stream) return;

    let animationId: number;
    let lastVideoTime = -1;

    const processFrame = async () => {
      const video = videoRef.current;
      if (!video || video.readyState !== 4) {
        animationId = requestAnimationFrame(processFrame);
        return;
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
          detectLiveness(result);
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

    // Blink detection - only during step 2 if challenge is blink
    if (!challengeCompleted && challengeStep === 2 && currentChallenge === "blink") {
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

      // Stricter threshold for blink detection
      const isEyeClosed = avgEAR < 0.18;

      // Detect blink (eye closed then opened)
      if (lastEyeStateRef.current && isEyeClosed) {
        lastEyeStateRef.current = false;
      } else if (!lastEyeStateRef.current && !isEyeClosed) {
        setBlinkCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 2) {
            livenessDataRef.current.blinked = true;
            setChallengeCompleted(true);
          }
          return newCount;
        });
        lastEyeStateRef.current = true;
      }
    }

    // Head turn detection - stricter thresholds (±0.25)
    const noseTip = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
    const noseOffsetFromCenter = noseTip.x - (leftCheek.x + rightCheek.x) / 2;
    const normalizedOffset = noseOffsetFromCenter / faceWidth;

    if (normalizedOffset < -0.25) {
      setHeadPosition("left");
      // Step 2: turn_left
      if (!challengeCompleted && challengeStep === 2 && currentChallenge === "turn_left") {
        livenessDataRef.current.headTurned = true;
        setChallengeCompleted(true);
      }
    } else if (normalizedOffset > 0.25) {
      setHeadPosition("right");
      // Step 1: turn_right (must complete before step 2)
      if (!step1Completed && challengeStep === 1 && currentChallenge === "turn_right") {
        setStep1Completed(true);
        setChallengeStep(2);
        setCurrentChallenge(step2Challenge);
        livenessDataRef.current.headTurned = true;
      }
    } else {
      setHeadPosition("center");
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

  // Capture photo
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Cannot get canvas context");
      
      // Mirror the captured image
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            livenessDataRef.current.timestamp = Date.now();
            onCapture(blob, livenessDataRef.current);
          }
        },
        "image/jpeg",
        0.9
      );
    } catch (err) {
      console.error("Capture error:", err);
      setError("Failed to capture photo");
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
              {/* Progress Indicator */}
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={step1Completed ? "default" : challengeStep === 1 ? "secondary" : "outline"}>
                  {step1Completed ? "✓" : "1"} หันขวา
                </Badge>
                <div className="h-px flex-1 bg-border"></div>
                <Badge variant={challengeCompleted ? "default" : challengeStep === 2 ? "secondary" : "outline"}>
                  {challengeCompleted ? "✓" : "2"} {step2Challenge === "blink" ? "กระพริบ" : "หันซ้าย"}
                </Badge>
                <div className="h-px flex-1 bg-border"></div>
                <Badge variant={waitingForCenter ? "secondary" : "outline"}>
                  3 ทำหน้าตรง
                </Badge>
              </div>

              {/* Challenge Instructions */}
              <div className="bg-primary/10 p-6 rounded-lg border-2 border-primary/20">
                <div className="flex flex-col items-center gap-4">
                  {!challengeCompleted ? (
                    <>
                      <ChallengeIcon className="h-12 w-12 text-primary" />
                      
                      <div className="text-sm font-medium text-muted-foreground">
                        ขั้นตอนที่ {challengeStep} / 2
                      </div>
                      
                      <div className="font-bold text-2xl sm:text-3xl text-center text-primary">
                        {challengeStep === 1 ? "หันหน้าไปทางขวา" : 
                         currentChallenge === "blink" ? "กระพริบตา 2 ครั้ง" : "หันหน้าไปทางซ้าย"}
                      </div>
                      
                      {challengeStep === 1 && (
                        <div className="text-base text-muted-foreground">
                          ตำแหน่งหัว: {headPosition === "right" ? "✓ ขวา (ถูกต้อง)" : 
                                     headPosition === "left" ? "ซ้าย (ไม่ถูกต้อง)" : "กลาง"}
                        </div>
                      )}
                      
                      {challengeStep === 2 && currentChallenge === "blink" && (
                        <div className="text-base text-muted-foreground">
                          ตรวจพบ: {blinkCount} / 2 ครั้ง
                        </div>
                      )}
                      
                      {challengeStep === 2 && currentChallenge === "turn_left" && (
                        <div className="text-base text-muted-foreground">
                          ตำแหน่งหัว: {headPosition === "left" ? "✓ ซ้าย (ถูกต้อง)" : 
                                     headPosition === "right" ? "ขวา (ไม่ถูกต้อง)" : "กลาง"}
                        </div>
                      )}
                      
                      <Badge variant="secondary" className="px-4 py-2 text-base">
                        กำลังดำเนินการ
                      </Badge>
                    </>
                  ) : waitingForCenter ? (
                    <>
                      <Camera className="h-12 w-12 text-primary" />
                      <div className="font-bold text-2xl sm:text-3xl text-center text-primary">
                        กรุณาทำหน้าตรง
                      </div>
                      
                      {centerHoldTimer > 0 ? (
                        <div className="text-6xl font-bold text-green-600 animate-pulse">
                          {4 - centerHoldTimer}
                        </div>
                      ) : (
                        <div className="text-base text-muted-foreground">
                          ทำหน้าตรงและนิ่งค้างไว้ 3 วินาที
                        </div>
                      )}
                      
                      <Badge 
                        variant={centerHoldTimer > 0 ? "default" : "secondary"} 
                        className="gap-2 px-4 py-2 text-base"
                      >
                        {centerHoldTimer > 0 ? (
                          <>
                            <Check className="h-4 w-4" />
                            กำลังนับ... {centerHoldTimer}/3
                          </>
                        ) : (
                          "รอทำหน้าตรง"
                        )}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <Camera className="h-12 w-12 text-primary animate-pulse" />
                      <div className="font-bold text-2xl sm:text-3xl text-center text-primary">
                        กำลังถ่ายรูป...
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Video Feed */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover scale-x-[-1]"
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Face detection overlay */}
                {!faceLandmarker && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                    กำลังโหลดระบบตรวจจับใบหน้า...
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={onCancel}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  ยกเลิก
                </Button>
                {isProcessing ? (
                  <Button disabled className="flex-1">
                    <Camera className="h-4 w-4 mr-2" />
                    กำลังถ่ายรูป...
                  </Button>
                ) : waitingForCenter ? (
                  <Button disabled className="flex-1 opacity-50">
                    <Camera className="h-4 w-4 mr-2" />
                    รอทำหน้าตรง...
                  </Button>
                ) : challengeCompleted ? (
                  <Button disabled className="flex-1">
                    <Check className="h-4 w-4 mr-2" />
                    เสร็จสิ้น
                  </Button>
                ) : (
                  <Button disabled className="flex-1 opacity-50">
                    รอการยืนยัน...
                  </Button>
                )}
              </div>

              {/* Tips */}
              <div className="text-sm text-muted-foreground space-y-1 bg-muted/50 p-4 rounded-lg">
                <p>💡 <strong>คำแนะนำ:</strong></p>
                <p>• <strong>ขั้นตอนที่ 1:</strong> หันหน้าไปทางขวาให้ชัดเจน</p>
                <p>• <strong>ขั้นตอนที่ 2:</strong> {step2Challenge === "blink" ? "กระพริบตา 2 ครั้ง" : "หันหน้าไปทางซ้ายให้ชัดเจน"}</p>
                <p>• <strong>ขั้นตอนที่ 3:</strong> ทำหน้าตรงและนิ่งค้างไว้ 3 วินาที</p>
                <p>• ตรวจสอบว่าแสงสว่างเพียงพอและใบหน้าอยู่ตรงกลาง</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
