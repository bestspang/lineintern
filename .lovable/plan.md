

## Fix: เพิ่มปุ่ม Bag Management ใน Sidebar Menu

### ปัญหา
หน้า Bag Management (`/attendance/bag-management`) มี route ใน `App.tsx` แล้ว แต่ไม่มีรายการ menu ใน sidebar (`DashboardLayout.tsx`) ทำให้ admin ไม่สามารถเข้าถึงได้จาก navigation

### การแก้ไข
เพิ่ม menu item "Bag Management" / "กระเป๋าพนักงาน" ในกลุ่ม **Points & Rewards** (บรรทัด 198-204) ของ `src/components/DashboardLayout.tsx`

### รายละเอียด
- **ไฟล์ที่แก้**: `src/components/DashboardLayout.tsx` (1 ไฟล์เท่านั้น)
- **ตำแหน่ง**: กลุ่ม "Points & Rewards" เพิ่มต่อจาก "Redemption Approvals"
- **Icon**: `Backpack` จาก lucide-react (ใช้ icon เดียวกับหน้า BagManagement)
- **ชื่อ**: "Bag Management" / "กระเป๋าพนักงาน"
- **URL**: `/attendance/bag-management`

### ความเสี่ยง
- ต่ำมาก: เพิ่มรายการ menu 1 รายการ ไม่กระทบ feature อื่น
- การเข้าถึงจะถูกควบคุมโดย `canAccessPage` เหมือน menu อื่นๆ

