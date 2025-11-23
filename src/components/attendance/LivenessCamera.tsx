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

  // Auto-capture when challenge completed
  useEffect(() => {
    if (challengeCompleted) {
      const timer = setTimeout(() => {
        capturePhoto();
      }, 800);
      
      return () => clearTimeout(timer);
    }
  }, [challengeCompleted]);

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

    const isEyeClosed = avgEAR < 0.2;

    // Detect blink (eye closed then opened)
    if (lastEyeStateRef.current && isEyeClosed) {
      // Eye just closed
      lastEyeStateRef.current = false;
    } else if (!lastEyeStateRef.current && !isEyeClosed) {
      // Eye just opened - blink detected
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
    if (!videoRef.current || !canvasRef.current || !challengeCompleted) return;

    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Cannot get canvas context");
      
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
              {/* Challenge Instructions */}
              <div className="bg-primary/10 p-6 rounded-lg border-2 border-primary/20">
                <div className="flex flex-col items-center gap-4">
                  <ChallengeIcon className="h-12 w-12 text-primary" />
                  
                  {/* Challenge Text - ขนาดใหญ่และชัดเจน */}
                  <div className="font-bold text-2xl sm:text-3xl text-center text-primary">
                    {currentChallengeInfo.text}
                  </div>
                  
                  {/* Progress Info */}
                  {currentChallenge === "blink" && (
                    <div className="text-base text-muted-foreground">
                      ตรวจพบ: {blinkCount} / 2 ครั้ง
                    </div>
                  )}
                  {currentChallenge.includes("turn") && (
                    <div className="text-base text-muted-foreground">
                      ตำแหน่งหัว: {headPosition === "center" ? "กลาง" : headPosition === "left" ? "ซ้าย" : "ขวา"}
                    </div>
                  )}
                  
                  {/* Status Badge */}
                  {challengeCompleted ? (
                    <Badge variant="default" className="gap-2 px-4 py-2 text-base">
                      <Check className="h-4 w-4" />
                      เสร็จสิ้น
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="px-4 py-2 text-base">
                      กำลังดำเนินการ
                    </Badge>
                  )}
                </div>
              </div>

              {/* Video Feed */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
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
                {challengeCompleted && isProcessing ? (
                  <Button disabled className="flex-1">
                    <Camera className="h-4 w-4 mr-2" />
                    กำลังถ่ายรูป...
                  </Button>
                ) : challengeCompleted ? (
                  <Button disabled className="flex-1">
                    <Check className="h-4 w-4 mr-2" />
                    กำลังประมวลผล...
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
                <p>• ตรวจสอบว่าแสงสว่างเพียงพอและใบหน้าชัดเจน</p>
                <p>• วางใบหน้าให้อยู่ตรงกลางกรอบ</p>
                <p>• ทำตามคำสั่งให้ครบถ้วน ระบบจะถ่ายรูปอัตโนมัติ</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
