

## แก้ 3 จุด: Promise.allSettled, ลบ secrets_configured, เพิ่ม message length limit

### 1. เปลี่ยน Promise.all → Promise.allSettled (line 11163-11170)

**ปัญหา**: ถ้า event เดียวพัง ทั้ง batch พัง → LINE retry ซ้ำทุก event
**แก้ที่**: `supabase/functions/line-webhook/index.ts` line 11163-11170

```text
// ก่อน:
const promises = webhookBody.events.map(...);
await Promise.all(promises);

// หลัง:
const results = await Promise.allSettled(
  webhookBody.events.map((event, index) => {
    console.log(`[webhook] Starting processing of event ${index + 1}...`);
    return handleEvent(event);
  })
);
const failed = results.filter(r => r.status === 'rejected');
if (failed.length > 0) {
  console.error(`[webhook] ${failed.length}/${results.length} events failed`);
  failed.forEach((f, i) => console.error(`[webhook] Event failure ${i+1}:`, f.reason));
}
```

**ผลลัพธ์**: event ที่พังจะไม่กระทบ event อื่น, log error แยกแต่ละตัว, ยังคง return 200 ให้ LINE ไม่ retry

---

### 2. ลบ secrets_configured จาก health check (line 11060-11073)

**ปัญหา**: เปิดเผยว่า secret ไหนมี/ไม่มี → attacker รู้จุดอ่อน
**แก้ที่**: `supabase/functions/line-webhook/index.ts` line 11060-11073

```text
// ก่อน:
{ status, timestamp, service, version, secrets_configured: { ... } }

// หลัง:
{ status: "healthy", timestamp, service: "line-webhook", version: "2.0.0" }
```

---

### 3. เพิ่ม message length limit (line 9944-9948)

**ปัญหา**: ไม่จำกัดความยาวข้อความก่อนส่ง AI → อาจ DoS ผ่าน token overflow
**แก้ที่**: `supabase/functions/line-webhook/index.ts` หลัง line 9947 (หลังเช็ค empty text)

```text
// เพิ่มหลัง check empty text:
const MAX_MESSAGE_LENGTH = 2000;
if (event.message.text.length > MAX_MESSAGE_LENGTH) {
  console.log(`[handleMessageEvent] Message too long (${event.message.text.length} chars), truncating to ${MAX_MESSAGE_LENGTH}`);
  event.message.text = event.message.text.substring(0, MAX_MESSAGE_LENGTH);
}
```

**หมายเหตุ**: ไม่ reject ข้อความ (อาจเป็นข้อมูลจริง เช่น รายงานยอดขาย) แต่ truncate เพื่อป้องกัน token overflow

---

### ไฟล์ที่แก้

| ไฟล์ | จุดที่แก้ | รายละเอียด |
|------|----------|-----------|
| `supabase/functions/line-webhook/index.ts` | line 11163-11170 | Promise.all → Promise.allSettled + error logging |
| `supabase/functions/line-webhook/index.ts` | line 11060-11073 | ลบ secrets_configured จาก health check response |
| `supabase/functions/line-webhook/index.ts` | line ~9948 | เพิ่ม message length limit 2000 chars |

### สิ่งที่ไม่แตะ
- ไม่แก้ command routing / prompts / DB / RLS / frontend
- ไม่แก้ handleEvent logic (แค่เปลี่ยนวิธี await)
- ไม่แก้ health-check edge function แยก (แก้เฉพาะ health endpoint ใน line-webhook)

### ความเสี่ยง: ต่ำมาก
- Promise.allSettled: เปลี่ยนเฉพาะ error isolation, ไม่กระทบ logic
- ลบ secrets_configured: ข้อมูลนี้ไม่ได้ถูกใช้โดย frontend
- Message truncate: ข้อความ LINE ปกติไม่เกิน 5,000 chars, limit 2,000 เพียงพอสำหรับ AI processing

