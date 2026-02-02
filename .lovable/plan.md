

## แผนออกแบบระบบ Direct Messages ใหม่ทั้งหมด

### ภาพรวมการออกแบบ UX/UI

**Layout แบบ Chat App (3 คอลัมน์)**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 💬 Direct Messages                    [Search]  [TH/EN] [Filter ▼]     │
├─────────────┬────────────────────────────────────┬──────────────────────┤
│             │                                    │                      │
│ Conversation│        Chat Area                   │   Employee Info      │
│    List     │                                    │                      │
│             │  ┌─────────────────────────────┐   │   ┌──────────────┐   │
│ ┌─────────┐ │  │ User: สวัสดีครับ           │   │   │  รูปโปรไฟล์  │   │
│ │ Pass    │ │  │            10:30 AM        │   │   │   Pass       │   │
│ │ สาขา A  │ │  └─────────────────────────────┘   │   │ พนักงานขาย  │   │
│ │ 2 นาที..│ │                                    │   │ สาขา: เซ็นทรัล│   │
│ └─────────┘ │  ┌─────────────────────────────┐   │   │ เริ่มงาน:    │   │
│             │  │ Bot: มีอะไรให้ช่วยครับ      │   │   │ 15 ม.ค. 68  │   │
│ ┌─────────┐ │  │            10:30 AM        │   │   └──────────────┘   │
│ │ Nu      │ │  └─────────────────────────────┘   │                      │
│ │ สาขา B  │ │                                    │   📝 Notes           │
│ │ 1 ชม... │ │                                    │   ┌──────────────┐   │
│ └─────────┘ │                                    │   │ ติดตามเรื่อง │   │
│             │  ┌─────────────────────────────┐   │   │ เงินเดือน   │   │
│ ┌─────────┐ │  │ 💬 Type a message...        │   │   │ - Admin      │   │
│ │ Unknown │ │  │                    [Send]   │   │   │ 30 ม.ค.     │   │
│ │ ไม่ใช่.. │ │  └─────────────────────────────┘   │   └──────────────┘   │
│ └─────────┘ │                                    │   [+ เพิ่ม Note]     │
└─────────────┴────────────────────────────────────┴──────────────────────┘
```

---

### การเปลี่ยนแปลงฐานข้อมูล

#### ตารางใหม่: `employee_notes`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| employee_id | UUID | FK to employees |
| created_by | UUID | FK to auth.users (ผู้สร้าง note) |
| content | TEXT | เนื้อหา note |
| category | TEXT | หมวดหมู่ (general, follow-up, warning, etc.) |
| is_pinned | BOOLEAN | ปักหมุดไว้ด้านบน |
| created_at | TIMESTAMPTZ | วันที่สร้าง |
| updated_at | TIMESTAMPTZ | วันที่แก้ไข |

**RLS Policy**: เฉพาะ Admin/HR/Manager ที่สร้างหรือแก้ไขได้

---

### Edge Function ใหม่: `dm-send`

**Endpoint**: `/dm-send`

**Request Body**:
```json
{
  "line_user_id": "Uxxxxxxxx",
  "message": "ข้อความที่ต้องการส่ง",
  "group_id": "uuid-of-dm-group"
}
```

**Logic**:
1. ใช้ LINE Push API ส่งข้อความ
2. บันทึกข้อความลง `messages` table โดยใช้ `direction = 'admin_reply'`
3. Return success/error

---

### ไฟล์ที่ต้องสร้าง/แก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `src/pages/DirectMessages.tsx` | เขียนใหม่ทั้งหมด - 3 column layout |
| `src/components/dm/ConversationList.tsx` | ใหม่ - รายการ conversations |
| `src/components/dm/ChatPanel.tsx` | ใหม่ - แสดงแชทและส่งข้อความ |
| `src/components/dm/EmployeeInfoCard.tsx` | ใหม่ - การ์ดข้อมูลพนักงาน |
| `src/components/dm/EmployeeNotes.tsx` | ใหม่ - จัดการ notes |
| `supabase/functions/dm-send/index.ts` | ใหม่ - Edge function ส่งข้อความ |
| Database migration | ใหม่ - สร้างตาราง `employee_notes` |

---

### รายละเอียดการออกแบบ UI

#### 1. Conversation List (คอลัมน์ซ้าย)

**Features**:
- รูป Avatar + ชื่อ + Badge (พนักงาน/ไม่ใช่พนักงาน)
- ข้อความล่าสุด (preview)
- เวลาข้อความล่าสุด (relative time)
- Unread indicator (จุดสีเขียว)
- Search + Filter (ทั้งหมด/พนักงาน/ไม่ใช่พนักงาน)
- Online status indicator (ถ้ามี)

```typescript
interface ConversationItem {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isEmployee: boolean;
  employeeName: string | null;
  branchName: string | null;
  lastMessage: string | null;
  lastActivity: Date | null;
  unreadCount: number;
}
```

#### 2. Chat Panel (คอลัมน์กลาง)

**Features**:
- Header: ชื่อผู้ใช้ + สถานะ
- Message bubbles แบบ LINE style
  - ข้อความ User → ขวา (สีเขียว/primary)
  - ข้อความ Bot → ซ้าย (สีเทา)
  - ข้อความ Admin → ซ้าย (สีฟ้า พิเศษ)
- Timestamp ทุกข้อความ
- Command badges (ถ้ามี)
- Input area: Textarea + Send button
- Auto-scroll to bottom
- Realtime updates

**การส่งข้อความ**:
```typescript
const handleSendMessage = async (text: string) => {
  await supabase.functions.invoke('dm-send', {
    body: {
      line_user_id: conversation.lineUserId,
      message: text,
      group_id: conversation.id
    }
  });
};
```

#### 3. Employee Info Card (คอลัมน์ขวา)

**แสดงเมื่อ**: ผู้ใช้เป็นพนักงาน

**ข้อมูลที่แสดง**:
- รูปโปรไฟล์ (ขนาดใหญ่)
- ชื่อเต็ม
- รหัสพนักงาน
- ตำแหน่ง (Role)
- สาขา
- วันที่เริ่มงาน
- สถานะ (active/inactive)
- ปุ่มลิงก์ไป Employee Detail

**Quick Stats**:
- จำนวนข้อความทั้งหมด
- ข้อความล่าสุดเมื่อไหร่
- Commands ที่ใช้บ่อย

#### 4. Notes Section

**Features**:
- แสดง notes ล่าสุดก่อน
- Pinned notes แสดงบนสุด
- เพิ่ม note ใหม่ (Dialog)
- แก้ไข/ลบ note (ถ้าเป็นเจ้าของ)
- แสดงชื่อผู้สร้าง + วันที่

**Categories**:
- `general` - ทั่วไป
- `follow-up` - ต้องติดตาม
- `warning` - เตือน
- `resolved` - แก้ไขแล้ว

---

### Technical Implementation

#### State Management

```typescript
interface DMPageState {
  // Conversation list
  conversations: DMConversation[];
  selectedConversationId: string | null;
  searchTerm: string;
  filter: 'all' | 'employees' | 'non-employees';
  
  // Messages
  messages: Message[];
  messageInput: string;
  isSending: boolean;
  
  // Employee info
  employeeDetails: Employee | null;
  
  // Notes
  notes: EmployeeNote[];
  isAddingNote: boolean;
}
```

#### Realtime Subscriptions

```typescript
// 1. New messages
supabase.channel('dm-messages')
  .on('postgres_changes', { event: 'INSERT', table: 'messages' }, ...)

// 2. Message updates (read status)
supabase.channel('dm-messages-update')
  .on('postgres_changes', { event: 'UPDATE', table: 'messages' }, ...)

// 3. Notes changes
supabase.channel('employee-notes')
  .on('postgres_changes', { event: '*', table: 'employee_notes' }, ...)
```

#### Responsive Design

| Screen Size | Layout |
|-------------|--------|
| Desktop (≥1024px) | 3 columns: List + Chat + Info |
| Tablet (768-1023px) | 2 columns: List + Chat, Info in panel |
| Mobile (<768px) | 1 column: List → Chat → Info (navigation) |

---

### Migration Script

```sql
-- Create employee_notes table
CREATE TABLE employee_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'follow-up', 'warning', 'resolved')),
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_employee_notes_employee ON employee_notes(employee_id);
CREATE INDEX idx_employee_notes_created ON employee_notes(created_at DESC);

-- RLS
ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read notes"
  ON employee_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert notes"
  ON employee_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own notes"
  ON employee_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own notes"
  ON employee_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE employee_notes;
```

---

### Edge Function: dm-send

```typescript
// supabase/functions/dm-send/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // CORS handling
  // ...

  const { line_user_id, message, group_id } = await req.json();

  // 1. Send to LINE via Push API
  const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: line_user_id,
      messages: [{ type: "text", text: message }],
    }),
  });

  // 2. Save to messages table
  await supabase.from('messages').insert({
    group_id,
    direction: 'admin_reply',
    text: message,
    sent_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ success: true }));
});
```

---

### ผลลัพธ์ที่คาดหวัง

| ฟีเจอร์ | Before | After |
|---------|--------|-------|
| UI Layout | Dialog-based | Chat app style |
| ส่งข้อความตอบกลับ | ไม่ได้ | ได้ |
| ข้อมูลพนักงาน | Badge เล็ก | Card แสดงรายละเอียด |
| Notes | ไม่มี | มี + จัดหมวดหมู่ได้ |
| Realtime | Basic | ครบทุกส่วน |
| Responsive | ไม่ดี | Mobile-friendly |
| Search | ชื่อ/LINE ID | ชื่อ + ข้อความ + branch |

---

### ลำดับการ Implement

1. **Database**: สร้างตาราง `employee_notes` + RLS
2. **Edge Function**: สร้าง `dm-send` function
3. **Components**: สร้าง components ใหม่ทั้ง 4 ตัว
4. **Main Page**: เขียน `DirectMessages.tsx` ใหม่
5. **Testing**: ทดสอบการส่งข้อความ + Realtime
6. **Mobile**: ปรับ responsive

