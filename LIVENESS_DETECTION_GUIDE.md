# Phase 2: Liveness Detection Implementation Guide

## Overview

Phase 2 adds **Liveness Detection** using MediaPipe Face Landmarker to prevent photo fraud in the attendance system. Employees must complete a random challenge (blink or head turn) before capturing their attendance photo.

## Features Implemented

### 1. **Liveness Verification with MediaPipe**
- Real-time face detection using MediaPipe Face Landmarker
- Runs entirely in the browser (no server processing needed)
- GPU-accelerated for better performance

### 2. **Random Challenge System**
Three types of challenges:
- **Blink Detection**: Detect 2 blinks using Eye Aspect Ratio (EAR)
- **Turn Left**: Detect head rotation to the left
- **Turn Right**: Detect head rotation to the right

### 3. **Fraud Score Integration**
- **+30 points**: No liveness verification
- **+15 points**: Liveness challenge failed
- **-20 points**: Liveness verification passed successfully
- Combined with Phase 1 duplicate detection and timing patterns

### 4. **User Experience**
- Clear visual feedback during challenge
- Real-time detection status
- Mobile-friendly interface
- Automatic challenge selection

## How It Works

### Technical Implementation

1. **Face Detection**
   - Uses MediaPipe Face Landmarker with 478 facial landmarks
   - Processes video frames in real-time (30-60 FPS)
   - GPU acceleration when available

2. **Blink Detection Algorithm**
   - Calculates Eye Aspect Ratio (EAR) for both eyes
   - EAR < 0.2 = eye closed
   - Detects transitions: open → closed → open
   - Requires 2 complete blinks

3. **Head Turn Detection**
   - Measures nose tip position relative to face center
   - Normalized offset threshold: ±0.15
   - Detects left/right head rotation

4. **Data Storage**
   ```json
   {
     "blinked": true,
     "headTurned": false,
     "challenge": "กระพริบตา 2 ครั้ง / Blink twice",
     "timestamp": 1234567890
   }
   ```

## Testing Guide

### Test Case 1: Successful Liveness Check

1. Open attendance check-in page with valid token
2. Click "Start Liveness Check"
3. Allow camera permission
4. Wait for face detection to initialize
5. Complete the displayed challenge:
   - If "Blink": Blink your eyes twice clearly
   - If "Turn Left": Turn your head to the left
   - If "Turn Right": Turn your head to the right
6. Verify "Completed" badge appears
7. Click "Capture Photo"
8. Submit attendance
9. Check fraud dashboard - should have **negative** fraud score adjustment

**Expected Result**: 
- Attendance logged successfully
- Fraud score reduced by 20 points
- `liveness_verified` in fraud_reasons

### Test Case 2: No Liveness Verification (Old Flow)

1. Skip liveness detection (if possible through direct API call)
2. Submit attendance without liveness data

**Expected Result**:
- Fraud score increased by 30 points
- `no_liveness_verification` in fraud_reasons

### Test Case 3: Challenge Not Completed

1. Start liveness check
2. Do NOT complete the challenge
3. Try to capture photo (button should be disabled)

**Expected Result**:
- Capture button remains disabled
- Cannot proceed without completing challenge

### Test Case 4: Poor Lighting Conditions

1. Test in very dark room
2. Test with strong backlight

**Expected Result**:
- May have difficulty detecting face
- Should show "Loading face detection..." message
- Consider improving lighting or repositioning

### Test Case 5: Multiple Users

1. Have another person try to check in with your photo
2. Their face won't match the live detection
3. They won't be able to complete challenges naturally

**Expected Result**:
- Difficult to fake natural blinks/movements
- Challenge completion should be notably harder

## Fraud Detection Dashboard

View suspected fraud cases at `/attendance/fraud-detection`:

### Liveness-Related Fraud Reasons:
- `liveness_verified` - Successfully passed (score -20)
- `no_liveness_verification` - Not performed (score +30)
- `liveness_challenge_failed` - Challenge not completed (score +15)

### Combined Detection:
The system now detects multiple fraud patterns:
- Duplicate photos (Phase 1)
- Suspicious timing (Phase 1)
- Outside geofence (Phase 1)
- No liveness verification (Phase 2)

### Fraud Score Ranges:
- **0-39**: Low Risk (mostly legitimate)
- **40-69**: Medium Risk (requires review)
- **70+**: High Risk (likely fraudulent)

## Browser Compatibility

### Supported Browsers:
- ✅ Chrome 90+ (Desktop & Mobile)
- ✅ Edge 90+
- ✅ Safari 14+ (iOS 14+)
- ✅ Firefox 88+
- ✅ Samsung Internet 14+

### Requirements:
- Camera access permission
- WebGL support (for GPU acceleration)
- Modern JavaScript (ES2018+)

## Performance Optimization

### Model Loading:
- Face Landmarker: ~5MB download
- Cached in browser after first load
- CDN delivery (fast global access)

### Processing:
- 30-60 FPS on modern devices
- GPU acceleration when available
- Fallback to CPU if GPU unavailable

### Mobile Performance:
- Optimized for mobile devices
- Lower resolution if needed
- Battery-efficient processing

## Privacy & Security

### Data Processing:
- ✅ All processing happens in browser
- ✅ No video/images sent to AI servers
- ✅ Only final photo uploaded to storage
- ✅ Liveness metadata stored (not facial features)

### PDPA Compliance:
- Inform employees about liveness detection
- Explain why it's used (fraud prevention)
- Provide option to disable (if policy allows)

## Troubleshooting

### Issue: "Cannot access camera"
**Solution:**
- Check browser permissions
- Ensure HTTPS connection
- Try different browser
- Check if camera is in use by another app

### Issue: "Failed to load face detection model"
**Solution:**
- Check internet connection
- Clear browser cache
- Check CDN accessibility
- Try incognito/private mode

### Issue: Blinks not detected
**Solution:**
- Ensure face is well-lit
- Look directly at camera
- Blink clearly and deliberately
- Check if glasses are causing issues

### Issue: Head turn not detected
**Solution:**
- Turn head more noticeably
- Ensure entire face stays in frame
- Move slower (not too fast)
- Check camera positioning

## Next Steps (Phase 3)

Phase 3 will add:
- AI Face Verification (compare with employee profile photo)
- Face embedding comparison
- Higher accuracy fraud detection
- Cross-reference with previous photos

## API Reference

### LivenessData Interface
```typescript
interface LivenessData {
  blinked: boolean;          // Whether blink was detected
  headTurned: boolean;       // Whether head turn was detected
  challenge: string;         // Challenge text shown to user
  timestamp: number;         // When verification completed
}
```

### Attendance Submission
```typescript
// FormData includes:
formData.append('livenessData', JSON.stringify({
  blinked: true,
  headTurned: false,
  challenge: "กระพริบตา 2 ครั้ง / Blink twice",
  timestamp: Date.now()
}));
```

## Metrics & Monitoring

Track these metrics in the fraud dashboard:
- Total liveness verifications performed
- Success rate of liveness challenges
- Average time to complete challenge
- Most common fraud patterns detected
- False positive rate (legitimate users flagged)

## Support

For issues or questions:
1. Check this guide first
2. Review browser console logs
3. Check fraud detection dashboard
4. Test in different browsers/devices
5. Contact system administrator

---

**Implementation Date**: Phase 2 Complete
**Version**: 1.0
**Status**: ✅ Production Ready
