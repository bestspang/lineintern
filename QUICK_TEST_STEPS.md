# 🚀 Quick Test Steps

## 1️⃣ Test URL Check-in (2 นาที)

### ส่งข้อความใน LINE:
```
checkin
```

### ✅ Expected Result:
```
✅ กรุณากดลิงก์ด้านล่างเพื่อยืนยันเช็คอิน

🔗 https://intern.gem.me/attendance?t=a1520a5c-d082-4d7a-8490-b4fd150d7dab

⏰ ลิงก์นี้จะหมดอายุใน 10 นาที
```

### ❌ ถ้าได้แบบนี้แสดงว่ายังไม่ถูก:
```
🔗 https:///attendance?t=...  ← ไม่มี domain!
```

---

## 2️⃣ Test Map Picker (5 นาที)

### Step 1: เปิดหน้า Branches
1. ไปที่ `https://intern.gem.me/attendance/branches`
2. คลิก "Add Branch"

### Step 2: เปิด Map Picker
1. มองหาช่อง "Location (Latitude, Longitude)"
2. คลิกปุ่ม "🗺️ แผนที่"

### Step 3: ทดสอบ (ถ้ายังไม่มี token)
1. ระบบจะขอ Mapbox Token
2. ไปที่ https://account.mapbox.com/access-tokens/
3. Login และ copy **Public Token** (ขึ้นต้นด้วย `pk.`)
4. Paste token ในช่อง
5. คลิก "ใช้ Token นี้"

### Step 4: ทดสอบแผนที่
- [ ] แผนที่โหลดได้
- [ ] มี marker สีแดง
- [ ] คลิกบนแผนที่ → marker ย้าย
- [ ] คลิก "ใช้ตำแหน่งปัจจุบัน" → แผนที่ fly ไป
- [ ] คลิก "ยืนยัน" → Lat/Lng ถูกกรอกใน form

### Step 5: บันทึก
1. กรอก Name: "Test Branch"
2. เลือก Type: "Office"
3. คลิก "Save Branch"
4. ✅ ต้องบันทึกสำเร็จ

---

## 3️⃣ Integration Test (5 นาที)

### Complete Flow:
```
1. สร้าง Branch → ✅
2. ส่ง "checkin" ใน LINE → ✅ ได้ลิงก์ https://intern.gem.me/...
3. คลิกลิงก์ → ✅ เปิดหน้า attendance
4. Check-in → ✅ หรือ ❌ (ขึ้นอยู่กับ GPS)
```

---

## 🎯 หากทุกอย่างผ่าน = SUCCESS! 🎉

### ระบบที่ได้:
✅ URL check-in ถูกต้อง (`https://intern.gem.me/...`)  
✅ Map Picker ทำงานได้เต็มรูปแบบ  
✅ เลือกตำแหน่งได้ทุกวิธี (click, drag, GPS)  
✅ Integration สมบูรณ์  

---

## 🐛 Found Issues?

ดู `ATTENDANCE_MAP_TESTING.md` สำหรับ:
- Detailed test cases
- Troubleshooting guide
- Common issues & solutions
