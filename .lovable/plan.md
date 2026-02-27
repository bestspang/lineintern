
1) System analysis
- จุดที่กระทบจริงอยู่ที่ `src/components/attendance/PayrollExportDialog.tsx`
- ตอนนี้ใช้ `DialogContent` แบบ `flex flex-col` + `ScrollArea` + employee list ที่มี `overflow-y-auto` ซ้อนอีกชั้น
- โครงสร้าง scroll ซ้อนกันทำให้:
  - เลื่อนไปส่วน “คอลัมน์ที่ต้องการ” ไม่เสถียร (โดยเฉพาะโหมดรายวัน)
  - รายชื่อพนักงานแถวล่างสุดถูกตัด/เห็นไม่เต็ม
- Logic export/column state/prefs ใน localStorage ใช้งานได้ ไม่ต้องแตะ backend

2) Problem list
- P1: Column picker เข้าถึงยากหรือมองไม่เห็น (daily mode ชัดที่สุด) เพราะ nested scroll + dialog body layout ไม่ตามแพทเทิร์นที่โปรเจกต์ใช้
- P2: แถวพนักงานท้ายลิสต์ถูก clip จากพื้นที่ list + footer/viewport ทำให้ชื่อคนสุดท้ายแสดงไม่เต็ม

3) Improvement & feature design
- เปลี่ยน dialog layout ให้เป็นแพทเทิร์นเดียวกับไฟล์ที่เสถียรในโปรเจกต์:
  - `DialogContent`: `!grid !grid-rows-[auto_1fr_auto] overflow-hidden max-h-[85dvh]`
  - body row กลางเป็นพื้นที่ scroll เดียว
- ลด nested scroll conflict:
  - ให้ `ScrollArea` เป็น scroll หลักของฟอร์ม
  - ปรับ employee list ให้ไม่ตัดแถวท้าย (เพิ่ม inner padding bottom + ปรับ max height ให้สมดุล + คุม label width/line-height)
- คง behavior เดิมทั้งหมด: summary/daily, select all, employee filter, persisted prefs, export logic

4) Step-by-step implementation plan
- แก้ไฟล์เดียว: `src/components/attendance/PayrollExportDialog.tsx`
  1. ปรับ `DialogContent` class ไปใช้ grid-row pattern (header/body/footer)
  2. ห่อส่วนกลางด้วย `min-h-0 overflow-hidden` แล้วตั้ง `ScrollArea` เป็น `h-full`
  3. ปรับ employee list container เพื่อลด clipping:
     - ปรับ `max-h-*` ให้พอดีกับ viewport
     - เพิ่ม `pb-1/2` ด้านล่างใน list content
     - คง sticky “เลือกทั้งหมด” ไว้
  4. ปรับแถวชื่อพนักงานให้ไม่โดนตัดแปลกๆ (ให้ชื่อมี `flex-1 min-w-0` + truncate ที่ถูกต้อง)
  5. ไม่แตะ logic data/query/export/localStorage
- ความเสี่ยง: ต่ำมาก (UI/layout only)
- Rollback: revert เฉพาะ className/layout block ของ dialog กลับก่อนแก้

5) Technical details (เฉพาะจุดที่จะเปลี่ยน)
- เป้าหมาย class หลัก:
  - Dialog: `max-w-2xl max-h-[85dvh] !grid !grid-rows-[auto_1fr_auto] overflow-hidden`
  - Body wrapper: `min-h-0 overflow-hidden`
  - ScrollArea: `h-full pr-4`
- Employee row:
  - code: ความกว้างคงที่เล็ก (`w-12 shrink-0`)
  - name: `flex-1 min-w-0 truncate`
- List bottom safe space:
  - เพิ่ม padding ด้านล่างใน container/list content เพื่อไม่ให้แถวสุดท้ายโดนตัดสายตา

6) Regression & prevention checklist
- เปิด Payroll Export แล้วตรวจทั้ง 2 โหมด: `สรุปรายคน` และ `รายวัน`
- ยืนยันว่า section “คอลัมน์ที่ต้องการ” มองเห็นและติ๊กได้ทุกคอลัมน์
- ทดสอบ scroll ด้วยเมาส์ล้อ + trackpad ใน employee list และใน body dialog
- ยืนยันชื่อพนักงานคนสุดท้ายในลิสต์แสดงเต็มตามกรอบ (ไม่โดนตัดครึ่งบรรทัด)
- ทดสอบ sticky “เลือกทั้งหมด” ยังทำงานครบ (เลือก/ยกเลิก)
- Export CSV สำเร็จทั้ง summary/daily
- ปิด/เปิด dialog ใหม่แล้วค่า prefs ล่าสุดยัง restore ได้
- ทดสอบ viewport เล็ก (mobile width) ว่ายังเลื่อนถึง column picker ได้

7) Doc updates (Project Memory)
- โปรเจกต์ยังไม่มี `docs/PROJECT_MEMORY.md`, `docs/DEVLOG.md`, `docs/SMOKE_TEST.md`, `docs/CONTRACTS.md`
- หลัง implement จะเพิ่ม DEVLOG entry แบบย่อในไฟล์บันทึกที่มีอยู่ของโปรเจกต์ (หรือสร้างใน `docs/` ตามโครงที่กำหนด) โดยระบุ:
  - scope = UI layout fix only
  - contracts changed = No
  - risk/rollback = class-only revert
  - smoke steps = รายการด้านบน
