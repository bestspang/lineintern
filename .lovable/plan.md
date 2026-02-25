

## วิเคราะห์: Feature ถัดไปที่กระทบน้อยสุด

### สถานะปัจจุบัน (ทำเสร็จแล้ว)
- ✅ Build Error Fix (ai-query-test)
- ✅ Feature Flags RLS → admin only
- ✅ Logger PII masking (email, phone, bank_account)
- ✅ UUID validation ใน cross-group-query

### Feature ที่แนะนำถัดไป: **Notification Center**

**ทำไมกระทบน้อยสุด:**
- ไม่มี `notifications` table ในระบบเลย → สร้างใหม่ทั้งหมด
- สร้าง page ใหม่ → ไม่แก้ไฟล์เดิมยกเว้นเพิ่ม route ใน App.tsx
- ไม่แตะ logic ของ Approvals, Attendance, Receipts, Points ที่มีอยู่
- Portal มี pattern ชัดเจน (PortalHome, Approvals) → ทำตาม pattern เดิม

### Implementation Plan

#### 1. Database (migration)
```sql
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'info',  -- 'info', 'approval', 'alert', 'system'
  priority text NOT NULL DEFAULT 'normal',  -- 'low', 'normal', 'high', 'urgent'
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  action_url text,  -- optional deep link e.g. '/portal/approvals/ot'
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_notifications_employee_unread ON public.notifications(employee_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_employee_created ON public.notifications(employee_id, created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can read own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (employee_id IN (
  SELECT id FROM public.employees WHERE line_user_id = auth.jwt()->>'sub'
  OR id IN (SELECT e.id FROM public.employees e JOIN auth.users u ON e.line_user_id = u.id::text WHERE u.id = auth.uid())
));

CREATE POLICY "Employees can update own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (employee_id IN (
  SELECT id FROM public.employees WHERE line_user_id = auth.jwt()->>'sub'
  OR id IN (SELECT e.id FROM public.employees e JOIN auth.users u ON e.line_user_id = u.id::text WHERE u.id = auth.uid())
));

-- Admin can insert (for system notifications)
CREATE POLICY "Admins can insert notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (public.has_admin_access(auth.uid()));
```

#### 2. Portal Page: `src/pages/portal/Notifications.tsx` (ไฟล์ใหม่)
- แสดง list notifications แบ่งตาม read/unread
- Mark as read (single + mark all)
- Click notification → navigate to action_url
- Filter by type/priority
- Empty state เมื่อไม่มี notifications
- ใช้ pattern เดียวกับ Approvals.tsx (Card list + Badge + icons)

#### 3. เพิ่ม route ใน App.tsx (1 บรรทัด)
```
<Route path="notifications" element={<Notifications />} />
```

#### 4. เพิ่ม export ใน portal/index.tsx (1 บรรทัด)
```
export { default as Notifications } from './Notifications';
```

#### 5. เพิ่ม notification bell icon ใน PortalLayout header (optional)
- แสดง unread count badge
- Click → navigate to /portal/notifications

### ไฟล์ที่แตะ
| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `supabase/migrations/...` | สร้าง notifications table (ใหม่) |
| `src/pages/portal/Notifications.tsx` | **ไฟล์ใหม่** |
| `src/pages/portal/index.tsx` | เพิ่ม 1 export line |
| `src/App.tsx` | เพิ่ม 1 route |
| `src/components/portal/PortalLayout.tsx` | เพิ่ม bell icon (optional, minimal) |

### ไฟล์ที่ไม่แตะ
- ❌ PortalHome.tsx
- ❌ Approvals.tsx / ApproveOT / ApproveLeave
- ❌ Edge Functions ทั้งหมด
- ❌ AuthContext / PortalContext
- ❌ Database tables อื่นทั้งหมด

### ความเสี่ยง: ต่ำมาก
- สร้าง table + page ใหม่ทั้งหมด
- แก้ไฟล์เดิมแค่ 2-3 บรรทัด (route + export)
- ไม่กระทบ flow เดิมใดๆ

### Phase 2 (อนาคต - ไม่ทำตอนนี้)
- Edge function สำหรับ create notifications อัตโนมัติ (เมื่อ approve/reject)
- LINE push notification integration
- Notification preferences per employee

