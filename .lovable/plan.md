

## แผนเพิ่ม Remote Checkout Request Dialog ใน Attendance.tsx

### สถานะปัจจุบัน

#### Backend (พร้อมแล้ว)
| Component | สถานะ | หมายเหตุ |
|-----------|-------|---------|
| `attendance-submit` Edge Function | ✅ | Return `code: 'OUTSIDE_GEOFENCE'` และ `requires_remote_approval: true` เมื่อ checkout นอกพื้นที่ |
| `remote-checkout-request` Edge Function | ✅ | ทดสอบด้วย curl สำเร็จ - สร้าง request และส่ง LINE notification |
| `remote-checkout-approval` Edge Function | ✅ | Process approval และ checkout ให้พนักงาน |

#### Frontend (ต้องเพิ่ม)
| Component | สถานะ | หมายเหตุ |
|-----------|-------|---------|
| Handle `OUTSIDE_GEOFENCE` error | ❌ | ไม่มีใน `Attendance.tsx` |
| Remote Checkout Dialog | ❌ | ต้องสร้างใหม่ |

---

### Flow ที่จะ Implement

```text
[พนักงาน] กด Submit Check Out
         ↓
[attendance-submit] ตรวจ geofence
         ↓
    ┌────────────────────────────────────┐
    │ อยู่นอกพื้นที่                        │
    │ return 403 + OUTSIDE_GEOFENCE     │
    └────────────────────────────────────┘
         ↓
[Attendance.tsx] ตรวจจับ error code
         ↓
    ┌────────────────────────────────────┐
    │ เปิด Remote Checkout Dialog        │
    │ - แสดงระยะห่างจากสาขา             │
    │ - กรอกเหตุผล                       │
    └────────────────────────────────────┘
         ↓
[พนักงาน] กรอกเหตุผล → กดส่ง
         ↓
[remote-checkout-request] สร้าง request
         ↓
[Manager] อนุมัติใน Portal
         ↓
[remote-checkout-approval] Checkout ให้อัตโนมัติ
```

---

### การแก้ไข Attendance.tsx

#### Step 1: เพิ่ม State Variables (ประมาณ Line 52)

```typescript
// Remote checkout request state
const [showRemoteCheckoutDialog, setShowRemoteCheckoutDialog] = useState(false);
const [remoteCheckoutReason, setRemoteCheckoutReason] = useState<string>('');
const [remoteCheckoutSubmitting, setRemoteCheckoutSubmitting] = useState(false);
const [remoteCheckoutData, setRemoteCheckoutData] = useState<{
  distance: number;
  allowed_radius: number;
  branch_name: string;
  branch_id: string;
  latitude: number;
  longitude: number;
} | null>(null);
```

---

#### Step 2: เพิ่ม Handler สำหรับ OUTSIDE_GEOFENCE (ประมาณ Line 331)

หลังจาก handle OT approval (line 346) เพิ่ม:

```typescript
// Handle 403 Outside Geofence - remote checkout required
if (response.status === 403 && result.code === 'OUTSIDE_GEOFENCE') {
  setSubmitting(false);
  setSubmitProgress('');
  
  // Store geofence data for the dialog
  setRemoteCheckoutData({
    distance: result.distance,
    allowed_radius: result.allowed_radius,
    branch_name: result.branch_name,
    branch_id: result.branch_id,
    latitude: result.latitude,
    longitude: result.longitude
  });
  
  // Show remote checkout dialog
  setShowRemoteCheckoutDialog(true);
  return;
}
```

---

#### Step 3: เพิ่ม Handler Function สำหรับส่งคำขอ (ประมาณ Line 557)

หลัง `handleEarlyLeaveRequest` function:

```typescript
const handleRemoteCheckoutRequest = async () => {
  if (!remoteCheckoutReason.trim() || !remoteCheckoutData) {
    toast({
      title: 'กรอกข้อมูลให้ครบ',
      description: 'กรุณาระบุเหตุผลในการขอ checkout นอกสถานที่',
      variant: 'destructive'
    });
    return;
  }

  try {
    setRemoteCheckoutSubmitting(true);

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/remote-checkout-request`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          employee_id: tokenData.employee.id,
          latitude: remoteCheckoutData.latitude,
          longitude: remoteCheckoutData.longitude,
          distance_from_branch: remoteCheckoutData.distance,
          branch_id: remoteCheckoutData.branch_id,
          reason: remoteCheckoutReason
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to submit remote checkout request');
    }

    setShowRemoteCheckoutDialog(false);
    setSubmitted(true);
    setSubmitResult({
      log: {
        server_time: new Date().toISOString(),
        is_flagged: false
      },
      remote_checkout_pending: true,
      request_id: result.request_id
    });

    toast({
      title: '✅ ส่งคำขอ Checkout นอกสถานที่สำเร็จ',
      description: 'รอการอนุมัติจากหัวหน้างาน'
    });

  } catch (err) {
    console.error('Remote checkout request error:', err);
    toast({
      title: 'เกิดข้อผิดพลาด',
      description: err instanceof Error ? err.message : 'Failed to submit request',
      variant: 'destructive'
    });
  } finally {
    setRemoteCheckoutSubmitting(false);
  }
};
```

---

#### Step 4: เพิ่ม Dialog Component (ก่อน closing `</div>` ประมาณ Line 1098)

```typescript
{/* Remote Checkout Request Dialog */}
<Dialog open={showRemoteCheckoutDialog} onOpenChange={setShowRemoteCheckoutDialog}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-orange-500" />
        ขอ Checkout นอกสถานที่
      </DialogTitle>
      <DialogDescription>
        คุณอยู่นอกพื้นที่ที่กำหนด กรุณาระบุเหตุผล
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4 py-4">
      {remoteCheckoutData && (
        <Alert className="bg-orange-50 dark:bg-orange-950/20 border-orange-200">
          <MapPin className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-sm">
            <div><strong>สาขา:</strong> {remoteCheckoutData.branch_name}</div>
            <div><strong>ระยะห่าง:</strong> {remoteCheckoutData.distance} เมตร</div>
            <div><strong>อนุญาตภายใน:</strong> {remoteCheckoutData.allowed_radius} เมตร</div>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="remote-reason">เหตุผล *</Label>
        <Textarea
          id="remote-reason"
          placeholder="เช่น: ไปพบลูกค้า, ออกไปซื้อของให้ร้าน, ธุระด่วน..."
          value={remoteCheckoutReason}
          onChange={(e) => setRemoteCheckoutReason(e.target.value)}
          className="min-h-[100px]"
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">
          {remoteCheckoutReason.length}/500 ตัวอักษร
        </p>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          คำขอจะถูกส่งไปยังหัวหน้าเพื่อพิจารณา เมื่ออนุมัติแล้วระบบจะ checkout ให้อัตโนมัติ
        </AlertDescription>
      </Alert>
    </div>

    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={() => {
          setShowRemoteCheckoutDialog(false);
          setRemoteCheckoutReason('');
          setRemoteCheckoutData(null);
        }}
        disabled={remoteCheckoutSubmitting}
        className="flex-1"
      >
        ยกเลิก
      </Button>
      <Button
        onClick={handleRemoteCheckoutRequest}
        disabled={remoteCheckoutSubmitting || !remoteCheckoutReason.trim()}
        className="flex-1"
      >
        {remoteCheckoutSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            กำลังส่ง...
          </>
        ) : (
          'ส่งคำขอ'
        )}
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

---

#### Step 5: อัปเดต Success Screen สำหรับ Remote Checkout Pending (Line 639)

เพิ่มใน success screen เพื่อแสดงสถานะ pending:

```typescript
{submitResult.remote_checkout_pending && (
  <Alert className="bg-orange-50 dark:bg-orange-950/20 border-orange-200">
    <MapPin className="h-4 w-4 text-orange-600" />
    <AlertDescription className="text-xs sm:text-sm">
      📍 คำขอ Checkout นอกสถานที่ถูกส่งแล้ว
      <br />
      รอการอนุมัติจากหัวหน้า - เมื่ออนุมัติแล้วระบบจะ checkout ให้อัตโนมัติ
    </AlertDescription>
  </Alert>
)}
```

---

### สรุปไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง | ความเสี่ยง |
|------|--------------|-----------|
| `src/pages/Attendance.tsx` | เพิ่ม state, handler, dialog, success screen | ต่ำ |

---

### ไม่ต้องแก้ไข

- `remote-checkout-request/index.ts` - ทำงานถูกต้องแล้ว
- `remote-checkout-approval/index.ts` - ทำงานถูกต้องแล้ว
- `attendance-submit/index.ts` - return error code ถูกต้องแล้ว
- `ApproveRemoteCheckout.tsx` - Portal ทำงานถูกต้องแล้ว

---

### ผลลัพธ์ที่คาดหวัง

| Before | After |
|--------|-------|
| พนักงาน checkout นอกสถานที่ → เห็น error message ทั่วไป | พนักงาน checkout นอกสถานที่ → เห็น dialog ให้กรอกเหตุผล |
| ไม่มีทางส่งคำขอ remote checkout | กรอกเหตุผล → ส่งคำขอ → รอ manager อนุมัติ |
| Manager ไม่รู้ว่าพนักงานต้องการ checkout | Manager ได้รับ LINE notification และเห็นใน Portal |

