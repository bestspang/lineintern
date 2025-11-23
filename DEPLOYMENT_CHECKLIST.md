# ✅ Deployment Checklist

## 📋 Pre-Deployment

### 1. Environment Variables
- [x] `APP_URL` = `https://intern.gem.me` (in Supabase Edge Function Secrets)
- [x] `MAPBOX_PUBLIC_TOKEN` = `pk.xxx...` (in Supabase Edge Function Secrets)
- [ ] `VITE_MAPBOX_PUBLIC_TOKEN` (optional, for frontend - user can input manually)

### 2. Edge Functions
- [x] `line-webhook` deployed
- [x] URL generation fixed (using APP_URL)

### 3. Frontend Components
- [x] `MapPicker` component created
- [x] `Branches.tsx` updated with Map Picker
- [x] Mapbox GL library installed

---

## 🧪 Testing Phase

### Quick Tests (ต้องทำก่อน Production)

#### Test 1: URL Check-in ✅
```bash
# ใน LINE
checkin

# Expected:
# ✅ https://intern.gem.me/attendance?t=...
# ❌ https:///attendance?t=...
```
- [ ] ส่งข้อความใน LINE
- [ ] ได้ URL ถูกต้อง
- [ ] คลิกเปิดหน้า attendance ได้

#### Test 2: Map Picker ✅
- [ ] เปิดหน้า Branches
- [ ] คลิก "Add Branch"
- [ ] คลิก "🗺️ แผนที่"
- [ ] แผนที่โหลดได้ (หรือขอ token)
- [ ] เลือกตำแหน่งได้
- [ ] บันทึก Branch สำเร็จ

#### Test 3: Integration ✅
- [ ] สร้าง Branch ด้วย Map Picker
- [ ] ส่ง checkin ใน LINE
- [ ] คลิกลิงก์
- [ ] Check-in สำเร็จ (หรือ fail ถ้านอกรัศมี)

---

## 🚀 Production Deployment

### Step 1: Verify All Changes
```bash
✅ line-webhook/index.ts - URL generation fixed
✅ MapPicker.tsx - Component created
✅ Branches.tsx - Map Picker integrated
✅ mapbox-gl - Dependency added
```

### Step 2: Deploy Edge Functions
```bash
# Already deployed via Lovable
✅ line-webhook deployed automatically
```

### Step 3: Update Environment
```bash
# In Supabase Dashboard > Edge Functions > Secrets
✅ APP_URL = https://intern.gem.me
✅ MAPBOX_PUBLIC_TOKEN = pk.xxx...
```

### Step 4: Frontend Deployment
```bash
# Click "Update" in Lovable Publish dialog
- Update frontend to production
- New features:
  ✅ Map Picker in Branches page
  ✅ Fixed URL generation
```

---

## 🎯 Post-Deployment Verification

### Smoke Tests

1. **URL Check-in** (Critical)
   - [ ] Send "checkin" in LINE
   - [ ] Verify URL: `https://intern.gem.me/attendance?t=...`
   - [ ] Click link opens attendance page
   
2. **Map Picker** (Critical)
   - [ ] Open Branches page
   - [ ] Add new branch with Map Picker
   - [ ] Coordinates saved correctly
   
3. **Geofence** (Important)
   - [ ] Check-in inside radius = Success
   - [ ] Check-in outside radius = Error
   
4. **Performance** (Monitor)
   - [ ] Map loads within 3 seconds
   - [ ] No console errors
   - [ ] GPS works (if allowed)

---

## 📊 Monitoring

### Key Metrics to Watch

1. **LINE Messages**
   - Check-in command usage
   - Success rate of URL clicks
   - Token expiration rate

2. **Map Picker**
   - Usage frequency
   - Token input rate (if no env var)
   - Error rate

3. **Attendance System**
   - Check-in success rate
   - Geofence violations
   - Late check-ins

### Logs to Monitor
```bash
# Edge Function Logs
- [handleAttendanceCommand] logs
- APP_URL usage
- Token generation

# Frontend Logs (Console)
- Map initialization errors
- GPS errors
- API errors
```

---

## 🐛 Rollback Plan

### If Critical Issues Occur

#### Issue: Wrong URLs in LINE
```bash
1. Check APP_URL secret
2. Redeploy line-webhook
3. Test immediately
```

#### Issue: Map not loading
```bash
1. Check MAPBOX_PUBLIC_TOKEN
2. Verify Mapbox API status
3. Use manual input fallback
```

#### Issue: Check-in failures
```bash
1. Check geofence calculations
2. Verify branch coordinates
3. Test GPS permissions
```

---

## 📝 Release Notes

### Version: Attendance System v1.1

**New Features:**
- ✅ Fixed check-in URL generation (`https://intern.gem.me`)
- ✅ Interactive Map Picker for branch locations
- ✅ GPS-based location selection
- ✅ Drag-and-drop marker positioning
- ✅ Mapbox integration with fallback token input

**Improvements:**
- Better geofence accuracy
- Enhanced UX for location selection
- Loading states and error handling
- Mobile-responsive map interface

**Bug Fixes:**
- Fixed empty domain in check-in URLs
- Improved coordinate precision

---

## 🎉 Success Criteria

All checkboxes ✅ = Ready for Production!

- [x] Environment configured
- [x] Edge functions deployed
- [x] Frontend updated
- [ ] All tests passed
- [ ] No critical bugs
- [ ] Monitoring in place
- [ ] Rollback plan ready

---

## 📞 Support Contacts

**Technical Issues:**
- Check ATTENDANCE_MAP_TESTING.md
- Check QUICK_TEST_STEPS.md
- Review edge function logs

**Mapbox Issues:**
- https://docs.mapbox.com/
- https://account.mapbox.com/

**LINE API Issues:**
- LINE Developers Console
- LINE Messaging API docs
