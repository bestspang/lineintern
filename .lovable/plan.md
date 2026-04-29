## เป้าหมาย

ปรับการแสดงผล error บนหน้า **เอกสารพนักงาน** ให้ HR เข้าใจง่ายและกู้คืนสถานการณ์เองได้ด้วยปุ่ม "ลองใหม่" ในทุกจุดที่ดึงข้อมูล (รายการหลัก, KPI, การโหลดหน้าเพิ่ม infinite scroll, การดึงทั้งหมดสำหรับ CSV)

## สถานะปัจจุบัน (สิ่งที่ขาด)

- Error banner หลักแสดงเฉพาะ `error.message` ดิบ ๆ ภาษาอังกฤษ — HR อ่านไม่เข้าใจ
- KPI strip (`useQuery employee-documents-kpi`) ไม่มี UI แจ้ง error เลย ถ้า fail ตัวเลขจะเป็น 0 เงียบ ๆ
- Infinite scroll: ถ้า `fetchNextPage` ล้มเหลว ปุ่ม "โหลดเพิ่ม" จะกลับมาเป็น idle โดยไม่บอกผู้ใช้ว่าพลาด
- Export CSV: ถ้าดึงข้อมูลทั้งหมดเพื่อ export ล้มเหลว แค่ throw เงียบ ไม่มี toast/retry
- ไม่แยกประเภท error (network offline / permission denied / timeout / server error) → ข้อความไม่ตรงสาเหตุ

## สิ่งที่จะทำ

### 1. Helper แปลง error เป็นข้อความภาษาไทยที่เข้าใจง่าย
สร้างฟังก์ชันใน `src/pages/attendance/EmployeeDocuments.tsx` (หรือแยกไฟล์ `src/lib/employee-document-errors.ts` เพื่อเรียกใช้ซ้ำได้):

```ts
function describeDocError(err: unknown): { title: string; hint: string; canRetry: boolean }
```

แม็พจาก Supabase/Postgrest error code + `navigator.onLine`:
- offline → "ขาดการเชื่อมต่ออินเทอร์เน็ต" + "ตรวจสอบ Wi-Fi/4G แล้วลองใหม่"
- 401/403 / RLS → "ไม่มีสิทธิ์เข้าถึงเอกสาร" + แนะนำให้ติดต่อแอดมิน (ไม่แสดงปุ่ม retry)
- 408/504 timeout → "เซิร์ฟเวอร์ตอบช้า กรุณาลองใหม่"
- 5xx → "ระบบขัดข้องชั่วคราว"
- default → ข้อความทั่วไป + ขีดข้อความเทคนิคเล็ก ๆ ให้ดู (ใต้ collapsible "รายละเอียด")

### 2. ปรับ Error banner หลัก (เอกสารหลัก)
แทนที่ Alert บรรทัด 572-581 ด้วยเวอร์ชันใหม่:
- หัวข้อ + คำแนะนำเป็นภาษาไทย
- ปุ่ม "ลองใหม่" (พร้อม spinner ตอน `isFetching`)
- ปุ่ม "ดูรายละเอียดทางเทคนิค" แบบ toggle เพื่อโชว์ข้อความ error จริง (ช่วย debug แต่ไม่รบกวนสายตา)
- ซ่อนปุ่ม retry สำหรับ permission error

### 3. KPI Strip error state
เพิ่ม `isError`, `error`, `refetch` จาก `useQuery employee-documents-kpi` แล้วแสดงแถบบางๆ เหนือ KPI พร้อมปุ่ม "โหลด KPI ใหม่" เมื่อ fail (ไม่บล็อกตารางหลัก)

### 4. Infinite scroll: แสดง error และ retry ในแถวล่างสุด
ขยาย `PaginationFooter` (บรรทัด 727-754) ให้รับ `error?: unknown` และ `onRetry`:
- ถ้า `error` มีค่า → โชว์ icon + ข้อความ "โหลดหน้าถัดไปไม่สำเร็จ" + ปุ่ม "ลองใหม่" แทนปุ่ม "โหลดเพิ่ม"
- หยุด IntersectionObserver auto-trigger เมื่ออยู่ในสถานะ error เพื่อไม่ให้ retry วนซ้ำเอง (ต้องกดเอง)
- ดึง error ของหน้าล่าสุดผ่าน `useInfiniteQuery` (`isFetchNextPageError`, error) มาส่งให้

### 5. CSV Export: toast + retry
- ห่อ `exportCsv` ด้วย try/catch
- เมื่อสำเร็จ: `toast.success("ส่งออก CSV สำเร็จ")`
- เมื่อล้มเหลว: `toast.error("ส่งออก CSV ไม่สำเร็จ", { description, action: { label: "ลองใหม่", onClick: exportCsv } })`
- ปิดปุ่ม Export ระหว่างทำงาน (มี state `isExporting`) เพื่อกัน double-click

### 6. Offline awareness (เล็ก)
เพิ่ม listener `online`/`offline` แสดง banner บน ๆ "คุณกำลังออฟไลน์ — ข้อมูลที่แสดงอาจไม่อัปเดต" เมื่อ `navigator.onLine === false` (ไม่ขัดจังหวะการดูข้อมูลที่ cache อยู่แล้ว)

## ไฟล์ที่จะแก้

- `src/pages/attendance/EmployeeDocuments.tsx` — Error banner, KPI error, PaginationFooter ใหม่, CSV toast, offline banner
- `src/lib/employee-document-errors.ts` (ใหม่) — `describeDocError()` helper แชร์ใช้ได้กับ EmployeeDocumentsTab ถ้าต้องการในอนาคต

## สิ่งที่จะ "ไม่" แตะ
- Logic การ query ข้อมูล / RLS / pagination math — เปลี่ยนเฉพาะการแสดงผล error
- โครงสร้าง `useInfiniteQuery` keys (กันไม่ให้ cache invalidate โดยไม่ตั้งใจ)
- คอมโพเนนต์ row/card ที่ทำงานเสถียรอยู่แล้ว
