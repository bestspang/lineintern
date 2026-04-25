import { useEffect, useRef, useState, useCallback } from "react";
import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Check, X, Eye, MoveHorizontal, RefreshCw, AlertTriangle } from "lucide-react";
import { useCuteQuotes } from "@/hooks/useCuteQuotes";

interface LivenessCameraProps {
  onCapture: (blob: Blob, livenessData: LivenessData) => void;
  onCancel: () => void;
  eventType?: 'check_in' | 'check_out';
  employeeBirthDate?: string;  // 'MM-DD' format
  todayHolidayIds?: string[];
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

// ✅ Multi-CDN Fallback URLs with verified stable version
const CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm",
  "https://unpkg.com/@mediapipe/tasks-vision@0.10.17/wasm",
];

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// ✅ Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

// ✅ Helper: Sleep function for retry delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ Helper: Check WebGL2 support
const checkWebGL2Support = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
};

export default function LivenessCamera({ onCapture, onCancel, eventType = 'check_in', employeeBirthDate, todayHolidayIds }: LivenessCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>("");
  
  // ✅ New: Loading and retry states
  const [loadingStatus, setLoadingStatus] = useState<string>("กำลังเริ่มต้น...");
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [diagnosticInfo, setDiagnosticInfo] = useState<{
    webgl2: boolean;
    lastError: string;
    delegate: 'GPU' | 'CPU';
  }>({ webgl2: false, lastError: '', delegate: 'GPU' });
  
  // Liveness detection state
  const [currentChallenge, setCurrentChallenge] = useState<Challenge>("turn_right");
  const [challengeCompleted, setChallengeCompleted] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [headPosition, setHeadPosition] = useState<"center" | "left" | "right">("center");
  
  // 2-Step Challenge states
  const [challengeStep, setChallengeStep] = useState<1 | 2>(1);
  const [step1Completed, setStep1Completed] = useState(false);
  const [step2Challenge, setStep2Challenge] = useState<"blink" | "turn_left">(
    Math.random() < 0.5 ? "blink" : "turn_left"
  );
  
  // Center face detection states
  const [waitingForCenter, setWaitingForCenter] = useState(false);
  const [centerHoldTimer, setCenterHoldTimer] = useState(0);
  const [waitingForCenterAfterStep1, setWaitingForCenterAfterStep1] = useState(false);
  const centerStartTimeRef = useRef<number | null>(null);
  const lastEyeStateRef = useRef<boolean>(true); // true = open, false = closed
  
  // ✅ Real-time feedback hints
  const [feedbackHint, setFeedbackHint] = useState<string>("");
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceDistance, setFaceDistance] = useState<"too_far" | "good" | "too_close">("good");
  const livenessDataRef = useRef<LivenessData>({
    blinked: false,
    headTurned: false,
    challenge: "",
    timestamp: Date.now(),
  });
  
  // ✅ Cute Quotes feature
  const { getRandomQuote, shouldShowQuote, isEnabled: cuteQuotesEnabled } = useCuteQuotes();
  const [cuteQuote, setCuteQuote] = useState<{ text: string; emoji: string; bgColor: string } | null>(null);
  
  // ✅ Refs for accessing latest state in animation frame (avoid stale closure)
  const waitingForCenterAfterStep1Ref = useRef(false);
  const step1CompletedRef = useRef(false);
  const challengeStepRef = useRef<1 | 2>(1);
  const currentChallengeRef = useRef<Challenge>("turn_right");
  const challengeCompletedRef = useRef(false);
  const step2ChallengeRef = useRef<"blink" | "turn_left">("blink");
  
  // Tips dialog state
  const [showTips, setShowTips] = useState(false);

  // ✅ Guards to prevent re-initialization
  const isInitializingRef = useRef(false);
  const initAttemptedRef = useRef(false);

  // ✅ Sync state to refs for animation frame access
  useEffect(() => {
    waitingForCenterAfterStep1Ref.current = waitingForCenterAfterStep1;
  }, [waitingForCenterAfterStep1]);

  useEffect(() => {
    step1CompletedRef.current = step1Completed;
  }, [step1Completed]);

  useEffect(() => {
    challengeStepRef.current = challengeStep;
  }, [challengeStep]);

  useEffect(() => {
    currentChallengeRef.current = currentChallenge;
  }, [currentChallenge]);

  useEffect(() => {
    challengeCompletedRef.current = challengeCompleted;
  }, [challengeCompleted]);

  useEffect(() => {
    step2ChallengeRef.current = step2Challenge;
  }, [step2Challenge]);

  // ✅ Initialize MediaPipe Face Landmarker with retry logic
  const initializeFaceLandmarker = useCallback(async (
    attemptNumber: number = 0, 
    useCpu: boolean = false
  ): Promise<void> => {
    // ✅ Guard: Prevent concurrent initialization
    if (isInitializingRef.current) {
      console.log("[LivenessCamera] Already initializing, skipping...");
      return;
    }
    isInitializingRef.current = true;

    const cdnIndex = attemptNumber % CDN_URLS.length;
    const cdnUrl = CDN_URLS[cdnIndex];
    const delegate = useCpu ? "CPU" : "GPU";
    
    setDiagnosticInfo(prev => ({ 
      ...prev, 
      webgl2: checkWebGL2Support(),
      delegate 
    }));
    
    try {
      setLoadingStatus(`กำลังโหลดจาก CDN ${cdnIndex + 1}/${CDN_URLS.length} (${delegate})...`);
      setShowRetryButton(false);
      setError("");
      
      console.log(`[LivenessCamera] Attempt ${attemptNumber + 1}/${MAX_RETRIES}, CDN: ${cdnUrl}, Delegate: ${delegate}`);
      
      const vision = await FilesetResolver.forVisionTasks(cdnUrl);
      
      setLoadingStatus("กำลังสร้างโมเดลตรวจจับใบหน้า...");
      
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: delegate,
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
      
      console.log(`[LivenessCamera] ✅ Successfully initialized with ${delegate} delegate`);
      setFaceLandmarker(landmarker);
      setLoadingStatus("");
      setRetryCount(0);
      isInitializingRef.current = false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[LivenessCamera] Attempt ${attemptNumber + 1} failed:`, errorMessage);
      
      setDiagnosticInfo(prev => ({ ...prev, lastError: errorMessage }));
      
      // Determine error type for better user messaging
      let errorType = "unknown";
      if (errorMessage.includes("fetch") || errorMessage.includes("network") || errorMessage.includes("Failed to load")) {
        errorType = "network";
      } else if (errorMessage.includes("GPU") || errorMessage.includes("WebGL") || errorMessage.includes("delegate")) {
        errorType = "gpu";
      } else if (errorMessage.includes("memory") || errorMessage.includes("Memory")) {
        errorType = "memory";
      }
      
      // Try next attempt if we haven't exhausted retries
      if (attemptNumber < MAX_RETRIES - 1) {
        const delayMs = RETRY_DELAYS[attemptNumber] || 4000;
        setLoadingStatus(`โหลดไม่สำเร็จ รอ ${delayMs / 1000} วินาทีแล้วลองใหม่...`);
        
        await sleep(delayMs);
        isInitializingRef.current = false; // Allow retry
        return initializeFaceLandmarker(attemptNumber + 1, useCpu);
      }
      
      // GPU exhausted, try CPU fallback
      if (!useCpu && checkWebGL2Support()) {
        console.log("[LivenessCamera] GPU failed, trying CPU fallback...");
        setLoadingStatus("GPU ล้มเหลว กำลังลอง CPU mode...");
        await sleep(1000);
        isInitializingRef.current = false; // Allow CPU retry
        return initializeFaceLandmarker(0, true);
      }
      
      // All attempts failed
      console.error("[LivenessCamera] ❌ All initialization attempts failed");
      setError("ไม่สามารถโหลดระบบตรวจจับใบหน้าได้");
      setShowRetryButton(true);
      setLoadingStatus("");
      isInitializingRef.current = false;
    }
  }, []);

  // ✅ Manual retry handler
  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    setRetryCount(prev => prev + 1);
    isInitializingRef.current = false; // Reset guard for manual retry
    initializeFaceLandmarker(0, false).finally(() => {
      setIsRetrying(false);
    });
  }, [initializeFaceLandmarker]);

  // Initialize on mount - ONLY ONCE
  useEffect(() => {
    // ✅ Guard: Prevent double initialization (Strict Mode)
    if (initAttemptedRef.current) {
      console.log("[LivenessCamera] Already attempted init, skipping...");
      return;
    }
    initAttemptedRef.current = true;
    
    initializeFaceLandmarker(0, false);

    return () => {
      if (faceLandmarker) {
        faceLandmarker.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency - run only on mount

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

  // Switch to center face phase after challenge + show cute quote
  useEffect(() => {
    if (challengeCompleted && !waitingForCenter) {
      setWaitingForCenter(true);
      // ✅ Show cute quote when entering center hold phase (based on % chance)
      if (cuteQuotesEnabled && shouldShowQuote(eventType)) {
        const quote = getRandomQuote(eventType, {
          employeeBirthDate,
          todayHolidayIds,
        });
        if (quote) {
          setCuteQuote({ text: quote.text, emoji: quote.emoji, bgColor: quote.bg_color });
        }
      } else {
        setCuteQuote(null);
      }
    }
  }, [challengeCompleted, waitingForCenter, cuteQuotesEnabled, shouldShowQuote, eventType, getRandomQuote, employeeBirthDate, todayHolidayIds]);

  // ✅ MERGED: Single render loop for both liveness detection AND center hold check
  // This prevents double GPU/CPU load from running detectForVideo() twice per frame
  useEffect(() => {
    if (!faceLandmarker || !videoRef.current || !stream) {
      centerStartTimeRef.current = null;
      setCenterHoldTimer(0);
      return;
    }

    let animationId: number;
    let lastVideoTime = -1;

    const renderLoop = () => {
      const video = videoRef.current;
      if (!video || video.readyState !== 4) {
        animationId = requestAnimationFrame(renderLoop);
        return;
      }

      const currentTime = video.currentTime;
      if (currentTime === lastVideoTime) {
        animationId = requestAnimationFrame(renderLoop);
        return;
      }
      lastVideoTime = currentTime;

      try {
        // ✅ Single face detection call per frame
        const result = faceLandmarker.detectForVideo(video, Date.now());
        
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          setFaceDetected(true);
          
          // ✅ Check face distance for feedback
          const landmarks = result.faceLandmarks[0];
          const leftEye = landmarks[33];
          const rightEye = landmarks[263];
          const eyeDistance = Math.abs(rightEye.x - leftEye.x);
          
          if (eyeDistance < 0.15) {
            setFaceDistance("too_far");
            setFeedbackHint("ขยับเข้ามาใกล้ขึ้น");
          } else if (eyeDistance > 0.35) {
            setFaceDistance("too_close");
            setFeedbackHint("ถอยห่างออกไปหน่อย");
          } else {
            setFaceDistance("good");
            setFeedbackHint("");
          }
          
          // 1. Run liveness detection logic (blinks, head turns)
          detectLiveness(result);
          
          // 2. Run center hold logic (only if waiting for center)
          if (waitingForCenter) {
            checkCenterHoldLogic(result);
          }
        } else {
          setFaceDetected(false);
          setFeedbackHint("ไม่พบใบหน้า - กรุณาวางใบหน้าในกรอบ");
        }
      } catch (err) {
        console.error("Render loop error:", err);
      }

      animationId = requestAnimationFrame(renderLoop);
    };

    animationId = requestAnimationFrame(renderLoop);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [faceLandmarker, stream, waitingForCenter]);

  // ✅ Helper: Center hold logic extracted from render loop
  const checkCenterHoldLogic = (result: FaceLandmarkerResult) => {
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return;

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
      }
    } else {
      // Reset if face is not straight
      centerStartTimeRef.current = null;
      setCenterHoldTimer(0);
    }
  };

  // Detect liveness from face landmarks
  const detectLiveness = (result: FaceLandmarkerResult) => {
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return;

    const landmarks = result.faceLandmarks[0];
    
    // ✅ Debug: Log current ref values
    console.log("[DEBUG] detectLiveness called with refs:", {
      waitingForCenterAfterStep1: waitingForCenterAfterStep1Ref.current,
      step1Completed: step1CompletedRef.current,
      challengeStep: challengeStepRef.current,
      currentChallenge: currentChallengeRef.current
    });

    // Blink detection - only during step 2 if challenge is blink
    if (!challengeCompletedRef.current && challengeStepRef.current === 2 && currentChallengeRef.current === "blink") {
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

    // ✅ Special case: waiting for center after step 1
    if (waitingForCenterAfterStep1Ref.current) {
      // Use strict threshold for center detection
      if (Math.abs(normalizedOffset) <= 0.10) {
        setHeadPosition("center");
        
        console.log("[DEBUG] ✓ Detected center after step 1, advancing to step 2...", {
          normalizedOffset,
          step1Completed: step1CompletedRef.current,
          step2Challenge: step2ChallengeRef.current
        });
        
        // ✅ Advance to step 2 immediately
        setWaitingForCenterAfterStep1(false);
        setChallengeStep(2);
        setCurrentChallenge(step2ChallengeRef.current);
        livenessDataRef.current.headTurned = true;
        
        console.log("[DEBUG] ✅ Advanced to step 2 with challenge:", step2ChallengeRef.current);
      } else {
        // Not centered yet, show position
        if (normalizedOffset < -0.10) {
          setHeadPosition("right");
        } else if (normalizedOffset > 0.10) {
          setHeadPosition("left");
        }
      }
      return; // ✅ Early return - don't check other conditions
    }

    // ✅ Normal logic for step 1 and step 2
    const centerThreshold = 0.25;

    // ⚠️ INVERT logic because video is mirrored
    if (normalizedOffset < -centerThreshold) {
      // User turns right → camera sees left → offset < 0
      setHeadPosition("right");
      // Step 1: turn_right (must complete before step 2)
      if (!step1CompletedRef.current && challengeStepRef.current === 1 && currentChallengeRef.current === "turn_right") {
        setStep1Completed(true);
        setWaitingForCenterAfterStep1(true);
        console.log("[DEBUG] ✅ Step 1 completed, waiting for center");
      }
    } else if (normalizedOffset > centerThreshold) {
      // User turns left → camera sees right → offset > 0
      setHeadPosition("left");
      // Step 2: turn_left
      if (!challengeCompletedRef.current && challengeStepRef.current === 2 && currentChallengeRef.current === "turn_left") {
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

  // ✅ Helper: Get gradient class from bg_color key
  const getBgGradientClass = (colorKey: string) => {
    const colorMap: Record<string, string> = {
      'pink-purple': 'from-pink-500/90 to-purple-500/90',
      'blue-cyan': 'from-blue-500/90 to-cyan-500/90',
      'green-teal': 'from-green-500/90 to-teal-500/90',
      'orange-yellow': 'from-orange-500/90 to-yellow-500/90',
      'red-pink': 'from-red-500/90 to-pink-500/90',
      'indigo-purple': 'from-indigo-500/90 to-purple-500/90',
      'gray': 'from-gray-600/90 to-gray-500/90',
    };
    return colorMap[colorKey] || colorMap['pink-purple'];
  };

  const currentChallengeInfo = CHALLENGES.find(c => c.type === currentChallenge)!;
  const ChallengeIcon = currentChallengeInfo.icon;

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-2 sm:p-4 overflow-auto">
      <Card className="w-full max-w-2xl my-auto max-h-screen overflow-y-auto">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
            ตรวจสอบใบหน้า
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            ทำตามคำแนะนำเพื่อยืนยันตัวตน
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 sm:p-6">
          {error ? (
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">{error}</span>
              </div>
              
              {showRetryButton && (
                <div className="space-y-2">
                  <Button 
                    onClick={handleRetry} 
                    disabled={isRetrying}
                    className="w-full"
                    variant="default"
                  >
                    {isRetrying ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        กำลังลองใหม่...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        🔄 ลองใหม่ {retryCount > 0 && `(ครั้งที่ ${retryCount + 1})`}
                      </>
                    )}
                  </Button>
                  
                  <p className="text-xs text-muted-foreground text-center">
                    หากยังไม่สำเร็จ กรุณาลองเปลี่ยน browser หรือรีเฟรชหน้า
                  </p>
                  
                  {/* Diagnostic info for debugging */}
                  <details className="text-xs text-muted-foreground mt-2">
                    <summary className="cursor-pointer hover:text-foreground">ข้อมูลสำหรับแก้ปัญหา</summary>
                    <div className="mt-2 p-2 bg-muted/50 rounded text-left font-mono">
                      <p>WebGL2: {diagnosticInfo.webgl2 ? '✅ รองรับ' : '❌ ไม่รองรับ'}</p>
                      <p>Mode: {diagnosticInfo.delegate}</p>
                      {diagnosticInfo.lastError && (
                        <p className="truncate">Error: {diagnosticInfo.lastError.slice(0, 50)}...</p>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Progress Indicator - Compact */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Badge 
                  variant={step1Completed ? "default" : challengeStep === 1 ? "secondary" : "outline"}
                  className="text-xs px-2 py-0.5"
                >
                  {step1Completed ? "✓" : "1"}
                </Badge>
                <div className="h-px flex-1 bg-border"></div>
                <Badge 
                  variant={challengeCompleted ? "default" : challengeStep === 2 ? "secondary" : "outline"}
                  className="text-xs px-2 py-0.5"
                >
                  {challengeCompleted ? "✓" : "2"}
                </Badge>
                <div className="h-px flex-1 bg-border"></div>
                <Badge 
                  variant={waitingForCenter ? "secondary" : "outline"}
                  className="text-xs px-2 py-0.5"
                >
                  3
                </Badge>
              </div>

              {/* Challenge Instructions - Compact */}
              <div className="bg-primary/10 p-2.5 sm:p-3 rounded-lg border border-primary/20">
                {!challengeCompleted ? (
                  <div className="flex items-center gap-3">
                    <ChallengeIcon className="h-6 w-6 sm:h-7 sm:w-7 text-primary flex-shrink-0" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base sm:text-lg text-primary truncate">
                        {waitingForCenterAfterStep1 ? "กลับหน้าตรงก่อน" :
                         challengeStep === 1 ? "หันหน้าไปทางขวา" : 
                         currentChallenge === "blink" ? "กระพริบตา 2 ครั้ง" : "หันหน้าไปทางซ้าย"}
                      </div>
                      
                      <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                        {waitingForCenterAfterStep1 ? (
                          <>ตำแหน่ง: {headPosition === "center" ? "✓ กลาง" : headPosition === "left" ? "ซ้าย" : "ขวา"}</>
                        ) : challengeStep === 1 ? (
                          <>ตำแหน่ง: {headPosition === "right" ? "✓ ขวา" : headPosition === "left" ? "ซ้าย" : "กลาง"}</>
                        ) : challengeStep === 2 && currentChallenge === "blink" ? (
                          <>ตรวจพบ: {blinkCount}/2 ครั้ง</>
                        ) : challengeStep === 2 && currentChallenge === "turn_left" ? (
                          <>ตำแหน่ง: {headPosition === "left" ? "✓ ซ้าย" : headPosition === "right" ? "ขวา" : "กลาง"}</>
                        ) : null}
                      </div>
                    </div>
                    
                    <Badge variant="secondary" className="text-xs px-2 py-1">
                      {challengeStep}/2
                    </Badge>
                  </div>
                ) : waitingForCenter ? (
                  <div className="flex items-center gap-3">
                    <Camera className="h-6 w-6 sm:h-7 sm:w-7 text-primary flex-shrink-0" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base sm:text-lg text-primary">
                        กรุณาทำหน้าตรง
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                        {centerHoldTimer > 0 ? `กำลังนับ... ${centerHoldTimer}/3` : "นิ่งค้างไว้ 3 วินาที"}
                      </div>
                    </div>
                    
                    {centerHoldTimer > 0 && (
                      <div className="text-2xl sm:text-3xl font-bold text-green-600 tabular-nums">
                        {4 - centerHoldTimer}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Camera className="h-6 w-6 animate-pulse text-primary" />
                    <div className="font-bold text-base sm:text-lg text-primary">
                      กำลังถ่ายรูป...
                    </div>
                  </div>
                )}
              </div>

          {/* Video Feed - Larger */}
          <div className="relative bg-black rounded-lg overflow-hidden h-[400px] sm:h-[450px]">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover scale-x-[-1]"
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Face detection overlay with loading status */}
                {!faceLandmarker && !error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white gap-3">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                    <span className="text-sm text-center px-4">{loadingStatus || "กำลังโหลดระบบตรวจจับใบหน้า..."}</span>
                  </div>
                )}
                
                {/* ✅ Real-time Feedback Hints */}
                {faceLandmarker && feedbackHint && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <Badge 
                      variant={faceDetected ? "secondary" : "destructive"}
                      className="px-4 py-2 text-sm font-medium shadow-lg animate-pulse"
                    >
                      {feedbackHint}
                    </Badge>
                  </div>
                )}
                
                {/* Face detected indicator */}
                {faceLandmarker && faceDetected && !feedbackHint && (
                  <div className="absolute top-4 right-4 z-10">
                    <Badge variant="default" className="bg-green-600">
                      ✓ ตรวจพบใบหน้า
                    </Badge>
                  </div>
                )}
                
                {/* 😊 Cute Quote - Show only during center hold phase */}
                {waitingForCenter && cuteQuote && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-[90%]">
                    <div className={`bg-gradient-to-r ${getBgGradientClass(cuteQuote.bgColor)} 
                                    text-white px-6 py-3 rounded-2xl shadow-xl
                                    text-xl font-bold text-center animate-bounce`}>
                      <span className="text-2xl mr-2">{cuteQuote.emoji}</span>
                      {cuteQuote.text}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
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

              {/* Tips - Hidden by default */}
              <div className="flex justify-center">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowTips(true)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  💡 คำแนะนำการใช้งาน
                </Button>
              </div>

              {/* Tips Dialog */}
              {showTips && (
                <div 
                  className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
                  onClick={() => setShowTips(false)}
                >
                  <div 
                    className="bg-background rounded-lg p-6 max-w-md w-full shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      💡 คำแนะนำการใช้งาน
                    </h3>
                    
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <div className="flex gap-2">
                        <span className="font-semibold text-foreground min-w-[80px]">ขั้นตอน 1:</span>
                        <span>หันหน้าไปทางขวาให้ชัดเจน</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <span className="font-semibold text-foreground min-w-[80px]">ขั้นตอน 2:</span>
                        <span>{step2Challenge === "blink" ? "กระพริบตา 2 ครั้ง" : "หันหน้าไปทางซ้ายให้ชัดเจน"}</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <span className="font-semibold text-foreground min-w-[80px]">ขั้นตอน 3:</span>
                        <span>ทำหน้าตรงและนิ่งค้างไว้ 3 วินาที</span>
                      </div>
                      
                      <div className="pt-2 border-t">
                        <p className="text-xs">• ตรวจสอบว่าแสงสว่างเพียงพอ</p>
                        <p className="text-xs">• วางใบหน้าให้อยู่ตรงกลางกรอบ</p>
                      </div>
                    </div>
                    
                    <Button 
                      onClick={() => setShowTips(false)} 
                      className="w-full mt-4"
                      size="sm"
                    >
                      เข้าใจแล้ว
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
