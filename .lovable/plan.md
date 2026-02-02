# Plan: Broadcast Management - Logs & Translation

## ✅ สถานะ: เสร็จสิ้น

### สิ่งที่ทำแล้ว

| ฟีเจอร์ | สถานะ |
|--------|--------|
| **Tab "Logs"** | ✅ เพิ่มแท็บแสดงประวัติการส่งทั้งหมด พร้อมค้นหา/กรอง |
| **View Logs Dialog** | ✅ เพิ่มปุ่ม "View Logs" ในแท็บ History เปิด Dialog ดูรายละเอียด |
| **Language Toggle** | ✅ เพิ่มปุ่ม TH/EN ที่ Header สลับภาษาทั้งหน้า |
| **Full Translation** | ✅ แปลทุก label ใน Broadcast page เป็น TH/EN |

### ไฟล์ที่แก้ไข

- `src/pages/Broadcast.tsx` - เพิ่ม Logs tab, Language toggle, แปลทั้งหมด
- `src/lib/translations.ts` - เพิ่ม translations สำหรับ Broadcast (90+ keys)

### ฟีเจอร์ที่เพิ่ม

1. **Delivery Logs Tab**
   - ค้นหาตาม: ชื่อผู้รับ, LINE ID
   - กรองตาม: Status (all/sent/failed/skipped)
   - แสดง: Broadcast title, Recipient, Status, Sent time, Error

2. **View Logs Button (History Tab)**
   - คลิกเปิด Dialog แสดง delivery logs ของ Broadcast นั้น
   - แสดง Summary: sent/failed/total counts
   - ค้นหาผู้รับในผู้รับทั้งหมดได้

3. **Language Toggle**
   - ปุ่ม TH/EN ที่ header ของหน้า
   - สลับภาษาได้ทันที
   - จำค่าใน localStorage
