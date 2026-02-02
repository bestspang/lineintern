

## 🎯 แผนปรับปรุง Direct Messages - UX/UI Redesign

### 📊 สรุปปัญหาที่พบจากการวิเคราะห์

| หมวด | ปัญหา | ความรุนแรง |
|------|-------|-----------|
| **ภาษา** | ปนกันไทย-อังกฤษไม่เป็นระบบ | 🔴 High |
| **Message Direction** | ทิศทาง bubble สับสน (User ควรอยู่ซ้าย, Admin อยู่ขวา) | 🔴 High |
| **Mobile** | ไม่มีทางเข้าถึง Employee Info และ Notes | 🔴 High |
| **Visual** | ข้อมูลซ้ำซ้อน, hierarchy ไม่ชัด | 🟡 Medium |
| **Feedback** | ไม่มี unread indicator, delivery status | 🟡 Medium |
| **Timestamp** | แสดงยาวเกินไป, ไม่ smart format | 🟢 Low |

---

### 🔧 การปรับปรุง

#### 1. แก้ไข Message Direction (Critical Fix)

**ปัญหา:** ปัจจุบัน User messages (incoming) อยู่ขวา ซึ่งสับสนเพราะเรา (Admin) กำลัง chat กับ User

**แก้ไข:** 
- **ข้อความจาก User (incoming)** → ฝั่ง**ซ้าย** (เหมือน LINE ปกติที่คู่สนทนาอยู่ซ้าย)
- **ข้อความจาก Bot/Admin (reply)** → ฝั่ง**ขวา** (เราเป็นคนพิมพ์)

```
┌─────────────────────────────────────┐
│  👤 User                            │  ← ซ้าย (สีเทา)
│  สวัสดีครับ                         │
│                          10:30      │
│                                     │
│                     🤖 Bot          │  → ขวา (สีเขียว)
│              มีอะไรให้ช่วยครับ       │
│                          10:31      │
│                                     │
│                     🛡️ Admin        │  → ขวา (สีน้ำเงิน)
│              ได้ครับ รอสักครู่        │
│                          10:32 ✓    │
└─────────────────────────────────────┘
```

---

#### 2. ทำ Language Consistency ให้เป็นระบบ

**หลักการ:** ใช้ภาษาไทยเป็นหลัก ยกเว้น technical terms

| ก่อน | หลัง |
|------|------|
| "Chats" | "แชท" |
| "Notes" | "บันทึก" |
| "User", "Bot", "Admin" | "ผู้ใช้", "บอท", "แอดมิน" |
| "Active"/"Inactive" | "ใช้งาน"/"ปิดใช้งาน" |
| "Unknown" | "ไม่ทราบชื่อ" |
| Badge non-employee แค่ icon | "บุคคลภายนอก" |

---

#### 3. เพิ่ม Mobile Bottom Sheet สำหรับ Info Panel

**ปัญหา:** Mobile ไม่มีทางดู Employee Info และ Notes

**แก้ไข:** เพิ่มปุ่ม info ที่ header → เปิด Bottom Sheet

```
┌─────────────────────────────┐
│ ← กลับ  Pass     ℹ️  ···   │  ← เพิ่มปุ่ม info
├─────────────────────────────┤
│                             │
│    [Chat Messages]          │
│                             │
├─────────────────────────────┤
│ 💬 พิมพ์ข้อความ...    [ส่ง] │
└─────────────────────────────┘

     เมื่อกด ℹ️ → เปิด Sheet
┌─────────────────────────────┐
│ ═══════════════════════════ │
│    ข้อมูลพนักงาน            │
│    [Employee Card]          │
│                             │
│    บันทึก (Notes)           │
│    [Notes List]             │
└─────────────────────────────┘
```

---

#### 4. Smart Timestamp Format

**ปัญหา:** แสดง "2 ก.พ. 2569 10:30:00" ยาวเกินไป

**แก้ไข:** 
- **วันนี้:** แสดงแค่เวลา "10:30"
- **สัปดาห์นี้:** "จันทร์ 10:30"
- **ปีนี้:** "2 ก.พ. 10:30"
- **ก่อนหน้า:** "2 ก.พ. 68"

---

#### 5. ปรับ Visual Hierarchy

**5.1 Conversation List:**
```
┌─────────────────────────────────┐
│ 💬 แชท                     (12) │  ← เปลี่ยนเป็นไทย
├─────────────────────────────────┤
│ 🔍 ค้นหาชื่อ สาขา...            │
│ [ทั้งหมด] [พนักงาน] [ภายนอก]   │  ← "อื่นๆ" → "ภายนอก"
├─────────────────────────────────┤
│ ┌───────────────────────────┐   │
│ │ 👤 Pass          สาขา A   │   │
│ │ 📍 พนักงาน               │   │
│ │ สวัสดีครับ...      2 นาที │   │
│ │                     12 💬 │   │  ← message count ชัดขึ้น
│ └───────────────────────────┘   │
│                                 │
│ ┌───────────────────────────┐   │
│ │ 👤 Unknown         ภายนอก │   │  ← badge มี label
│ │ ขอสอบถาม...       1 ชม.   │   │
│ │                      3 💬 │   │
│ └───────────────────────────┘   │
└─────────────────────────────────┘
```

**5.2 Employee Info Card:**
```
┌─────────────────────────────┐
│ 💼 ข้อมูลพนักงาน           │
├─────────────────────────────┤
│      [Avatar]               │
│    Pass Doe                 │
│ [ใช้งาน] [พนักงานขาย]       │  ← เป็นไทย
│                             │
│ 🏢 สาขาเซ็นทรัล              │
│ 📍 123 ถ.พหลโยธิน...        │
│                             │
│ ┌───────────┬───────────┐   │
│ │ 💬 12     │ 🕐 ล่าสุด │   │  ← รวมข้อมูลล่าสุด
│ │ ข้อความ   │ 2 ก.พ. 69 │   │
│ └───────────┴───────────┘   │
│                             │
│ [🔗 ดูข้อมูลเพิ่มเติม]      │
└─────────────────────────────┘
```

---

#### 6. ปรับ Notes Section

**เปลี่ยนแปลง:**
- Title: "Notes" → "📝 บันทึก"
- Empty state: "ยังไม่มี Notes" → "ยังไม่มีบันทึก"
- Scroll height: 200px → auto (max-h-[250px])

---

#### 7. เพิ่ม Delivery Status (Optional Enhancement)

แสดงสถานะข้อความที่ส่ง:
- ✓ ส่งสำเร็จ (LINE ได้รับแล้ว)
- ⏳ กำลังส่ง...
- ✗ ส่งไม่สำเร็จ

---

### 📁 ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `src/pages/DirectMessages.tsx` | เพิ่ม Mobile Info Sheet, ปรับ header labels |
| `src/components/dm/ChatPanel.tsx` | แก้ message direction, smart timestamp, delivery status |
| `src/components/dm/ConversationList.tsx` | ปรับ labels เป็นไทย, message count display |
| `src/components/dm/EmployeeInfoCard.tsx` | แก้ Active → ใช้งาน, ปรับ Last Activity display |
| `src/components/dm/EmployeeNotes.tsx` | แก้ labels เป็นไทย |
| `src/lib/timezone.ts` | เพิ่ม smartFormatTime function |

---

### 📐 Technical Details

#### Smart Time Formatter
```typescript
export function formatSmartTime(date: string | Date): string {
  const d = new Date(date);
  const now = getBangkokNow();
  
  // วันนี้ → "10:30"
  if (isBangkokToday(d)) {
    return formatBangkokTimeShort(d);
  }
  
  // สัปดาห์นี้ → "จันทร์ 10:30"
  const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (daysAgo < 7) {
    return d.toLocaleDateString('th-TH', { 
      weekday: 'short', 
      timeZone: BANGKOK_TIMEZONE 
    }) + ' ' + formatBangkokTimeShort(d);
  }
  
  // ปีนี้ → "2 ก.พ. 10:30"
  // ก่อนหน้า → "2 ก.พ. 68"
  // ...
}
```

#### Mobile Info Sheet
```typescript
// ใน DirectMessages.tsx mobile view
const [showInfoSheet, setShowInfoSheet] = useState(false);

// Header
<Button variant="ghost" size="icon" onClick={() => setShowInfoSheet(true)}>
  <Info className="h-5 w-5" />
</Button>

// Sheet
<Sheet open={showInfoSheet} onOpenChange={setShowInfoSheet}>
  <SheetContent side="bottom" className="h-[70vh]">
    <ScrollArea className="h-full">
      <EmployeeInfoCard conversation={selectedConversation} />
      <EmployeeNotes conversation={selectedConversation} />
    </ScrollArea>
  </SheetContent>
</Sheet>
```

---

### ✅ ผลลัพธ์ที่คาดหวัง

| ด้าน | Before | After |
|------|--------|-------|
| **ภาษา** | ปนกัน TH/EN | สม่ำเสมอ (ไทยเป็นหลัก) |
| **Message Direction** | User ขวา (สับสน) | User ซ้าย, Admin ขวา (ถูกต้อง) |
| **Mobile** | ไม่มี Info/Notes | มี Bottom Sheet |
| **Timestamp** | ยาวเกินไป | Smart format ตามเวลา |
| **Visual** | ข้อมูลซ้ำซ้อน | Hierarchy ชัดเจน |
| **Status Badge** | Active/Inactive (EN) | ใช้งาน/ปิดใช้งาน (TH) |

---

### 📝 Implementation Order

1. **Message Direction** - Critical fix ก่อน
2. **Language Consistency** - ทำพร้อมกันทุกไฟล์
3. **Mobile Info Sheet** - เพิ่ม Sheet component
4. **Smart Timestamp** - เพิ่ม utility function
5. **Visual Polish** - ปรับรายละเอียด UI

