# 🧪 Attendance System Testing Guide

## ✅ Phase 1: URL Check-in - DEPLOYED

### การทดสอบ URL Check-in

1. **ส่งข้อความใน LINE Group**
   ```
   checkin
   หรือ
   เช็คอิน
   ```

2. **ตรวจสอบ Response**
   - ต้องได้รับลิงก์ที่ขึ้นต้นด้วย: `https://intern.gem.me/attendance?t=...`
   - ❌ **ห้าม** เป็น `https:///attendance?t=...` (empty domain)
   - ลิงก์ต้องหมดอายุใน 10 นาที

3. **ทดสอบคลิกลิงก์**
   - คลิกลิงก์ที่ได้รับ
   - ต้องเปิดหน้า Attendance form ที่ `https://intern.gem.me/attendance?t=...`
   - แสดงข้อมูล Branch, Employee ถูกต้อง

### Expected URL Format
```
✅ CORRECT: https://intern.gem.me/attendance?t=a1520a5c-d082-4d7a-8490-b4fd150d7dab
❌ WRONG:   https:///attendance?t=a1520a5c-d082-4d7a-8490-b4fd150d7dab
```

---

## 🗺️ Phase 2: Map Picker - READY

### การทดสอบ Map Picker

#### Setup Required
1. **Mapbox Token** (ต้องมี)
   - ถ้ายังไม่มีใน environment: ระบบจะแสดง popup ให้ใส่ token
   - สมัครฟรีที่: https://account.mapbox.com/access-tokens/
   - Copy **Public Token** (ขึ้นต้นด้วย `pk.`)

#### การทดสอบ

1. **เปิดหน้า Branches**
   - ไปที่ `/attendance/branches`
   - คลิก "Add Branch" หรือ "Edit" branch ที่มีอยู่

2. **เปิด Map Picker**
   - ในฟอร์ม Branch, หาช่อง "Location (Latitude, Longitude)"
   - คลิกปุ่ม "🗺️ แผนที่"

3. **ทดสอบ Features**

   **A. คลิกบนแผนที่**
   - คลิกที่ใดก็ได้บนแผนที่
   - Marker สีแดงต้องย้ายไปตำแหน่งที่คลิก
   - Coordinates ด้านบนต้องอัปเดตทันที

   **B. ลาก Marker**
   - คลิกค้างที่ marker สีแดง
   - ลากไปตำแหน่งใหม่
   - Coordinates ต้องอัปเดตเมื่อปล่อย

   **C. ใช้ตำแหน่งปัจจุบัน**
   - คลิกปุ่ม "ใช้ตำแหน่งปัจจุบัน"
   - Browser จะขอ permission
   - แผนที่ต้อง fly ไปตำแหน่งปัจจุบัน
   - Marker ต้องย้ายตาม

   **D. Navigation Controls**
   - ใช้ปุ่ม +/- ที่มุมขวาบน
   - Zoom in/out ต้องทำงาน
   - Rotate ต้องทำงาน (ถ้ามี)

   **E. ยืนยันและบันทึก**
   - คลิก "ยืนยัน"
   - Dialog ปิด
   - Latitude, Longitude ใน form ต้องถูกกรอกด้วยค่าที่เลือก

4. **บันทึก Branch**
   - กรอกข้อมูลอื่นๆ (Name, Type, etc.)
   - คลิก "Save Branch"
   - ต้องบันทึกสำเร็จ
   - Coordinates ถูกต้อง

---

## 🔍 Phase 3: Integration Testing

### Test Case 1: Complete Check-in Flow

```
1. สร้าง Branch ใหม่ด้วย Map Picker
   → เลือกตำแหน่ง: สำนักงาน Bangkok
   → ตั้ง Geofence: 200 meters
   → บันทึก

2. ส่ง "checkin" ใน LINE
   → ได้ลิงก์ https://intern.gem.me/attendance?t=...
   
3. คลิกลิงก์
   → เปิดหน้า attendance form
   → แสดงข้อมูล branch ถูกต้อง
   
4. อนุญาต GPS
   → ถ้าอยู่ในรัศมี: สามารถ check-in ได้
   → ถ้าอยู่นอกรัศมี: แสดง error
```

### Test Case 2: Map Picker Without Token

```
1. เปิดหน้า Branches (ครั้งแรก, ไม่มี token)
   → คลิก "Add Branch"
   → คลิก "🗺️ แผนที่"
   
2. ระบบแสดง Token Input Dialog
   → ใส่ Mapbox Public Token
   → คลิก "ใช้ Token นี้"
   
3. แผนที่โหลด
   → แสดงแผนที่ที่ตำแหน่ง Bangkok (default)
   → Marker แสดง
```

### Test Case 3: Edit Existing Branch

```
1. เปิดหน้า Branches
   → คลิก Edit บน branch ที่มีอยู่
   
2. คลิก "🗺️ แผนที่"
   → แผนที่เปิดที่ตำแหน่งปัจจุบันของ branch
   → Marker อยู่ที่ตำแหน่งถูกต้อง
   
3. เปลี่ยนตำแหน่ง
   → ลาก marker ไปที่ใหม่
   → คลิก "ยืนยัน"
   → บันทึก
   → Coordinates อัปเดต
```

---

## 🐛 Common Issues & Solutions

### Issue 1: URL ยัง empty domain
**Symptom**: ได้ `https:///attendance?t=...`
**Solution**: 
- Check ว่า `APP_URL` secret ถูกตั้งค่าแล้ว = `https://intern.gem.me`
- Deploy edge function ใหม่

### Issue 2: Mapbox แสดง "Token not configured"
**Symptom**: แสดง error แทนแผนที่
**Solution**:
- ใส่ token ใน popup dialog ที่แสดง
- หรือ ถ้าต้องการตั้งถาวร: ติดต่อ admin เพิ่ม `VITE_MAPBOX_PUBLIC_TOKEN` ใน .env

### Issue 3: GPS ไม่ทำงาน
**Symptom**: คลิก "ใช้ตำแหน่งปัจจุบัน" แต่ไม่เกิดอะไร
**Solution**:
- Check browser permission (Allow location access)
- ใช้ HTTPS (Geolocation API ต้องการ secure context)
- Fallback: คลิกบนแผนที่แทน

### Issue 4: Marker ไม่เห็น
**Symptom**: เห็นแผนที่แต่ไม่เห็น marker
**Solution**:
- Refresh page
- Check console สำหรับ Mapbox API errors
- Check ว่า token valid

---

## ✅ Testing Checklist

### URL Check-in
- [ ] ส่ง "checkin" ใน LINE
- [ ] ได้รับลิงก์ที่มี domain ถูกต้อง (`https://intern.gem.me/...`)
- [ ] คลิกลิงก์เปิดหน้า attendance ได้
- [ ] Check-in สำเร็จ

### Map Picker - Basic
- [ ] เปิด Map Picker ได้
- [ ] แสดงแผนที่
- [ ] แสดง marker
- [ ] คลิกบนแผนที่ → marker ย้าย
- [ ] ลาก marker → เปลี่ยนตำแหน่ง
- [ ] แสดง coordinates อัปเดต real-time

### Map Picker - GPS
- [ ] คลิก "ใช้ตำแหน่งปัจจุบัน"
- [ ] Browser ขอ permission
- [ ] แผนที่ fly ไปตำแหน่งปัจจุบัน
- [ ] Marker ย้ายตาม

### Map Picker - Save
- [ ] คลิก "ยืนยัน"
- [ ] Dialog ปิด
- [ ] Lat/Lng ถูกกรอกใน form
- [ ] บันทึก Branch สำเร็จ
- [ ] Coordinates ถูกต้องใน database

### Integration
- [ ] สร้าง branch ด้วย Map Picker
- [ ] Check-in ใช้ geofence validation
- [ ] ถ้าอยู่นอกรัศมี → แสดง error
- [ ] ถ้าอยู่ในรัศมี → check-in สำเร็จ

---

## 📊 Performance Notes

- **Map Loading Time**: ~1-2 วินาที (ขึ้นอยู่กับ network)
- **GPS Accuracy**: ±10-50 meters (ขึ้นอยู่กับอุปกรณ์)
- **Token Validity**: Check-in links expire ใน 10 นาที
- **Geofence Default**: 200 meters radius

---

## 🎯 Success Criteria

✅ **Phase 1 Success**
- URL check-in มี domain ถูกต้อง (`https://intern.gem.me/...`)
- ลิงก์เปิดหน้า attendance form ได้
- Check-in flow สมบูรณ์

✅ **Phase 2 Success**
- Map Picker เปิดได้
- เลือกตำแหน่งได้ทุกวิธี (click, drag, GPS)
- Coordinates ถูกบันทึกใน database ถูกต้อง

✅ **Phase 3 Success**
- Integration test ผ่านทุก case
- No console errors
- User experience ลื่นไหล
- Geofence validation ทำงานถูกต้อง

---

## 🚀 Next Steps (After Testing)

1. **Polish UX**
   - เพิ่ม loading states
   - เพิ่ม error messages ที่ชัดเจน
   - เพิ่ม tooltips/help text

2. **Advanced Features**
   - Search box บนแผนที่
   - Reverse geocoding (แสดงชื่อสถานที่)
   - วาดวงกลม geofence บนแผนที่
   - บันทึกตำแหน่งที่ใช้บ่อย

3. **Analytics**
   - แสดงสถิติ check-in ตาม branch
   - Heat map ตำแหน่ง check-in
   - Report geofence violations

4. **Optimization**
   - Lazy load Mapbox
   - Cache map tiles
   - Preload GPS location
