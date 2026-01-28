
## แผนแก้ไข: Invalid Hook Call Error ที่ทำให้ App พัง

### สรุปปัญหาที่พบ

**ปัญหาหลัก:** React hooks ไม่ทำงาน (Invalid hook call) ทำให้ทั้ง App พัง และผู้ใช้ไม่สามารถใช้งานได้

**สาเหตุ:** การแก้ไข `src/main.tsx` ครั้งล่าสุดที่เปลี่ยนจาก:
```typescript
import React from "react";  // ✅ ถูกต้อง
```
เป็น:
```typescript
import * as React from "react";  // ❌ อาจทำให้เกิด duplicate React instances
```

**หลักฐาน:** Console logs แสดง:
```
Warning: Invalid hook call. Hooks can only be called inside of the body of a function component.
This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
```

---

### วิเคราะห์ Root Cause

| รายการ | สถานะ | หมายเหตุ |
|--------|-------|---------|
| React version | ✅ ถูกต้อง | 18.3.1 |
| React-DOM version | ✅ ถูกต้อง | 18.3.1 |
| main.tsx import | ❌ ปัญหา | `import * as React` อาจสร้าง duplicate instance |
| Vite config | ✅ ถูกต้อง | ใช้ @vitejs/plugin-react-swc |

**หมายเหตุ:** เรื่อง Timezone ที่แจ้ง "ตี 1" **ไม่ใช่ปัญหา timezone ใน code** แต่เกิดจาก App พังทั้งหมดเพราะ React hooks ไม่ทำงาน ทำให้อาจเห็น error message แปลกๆ หรือหน้าว่างเปล่า

---

### แผนการแก้ไข

#### ขั้นตอนที่ 1: Revert main.tsx กลับไปเป็นรูปแบบเดิม

**ก่อนแก้ไข (ปัจจุบัน - มีปัญหา):**
```typescript
import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**หลังแก้ไข (กลับไปรูปแบบมาตรฐาน):**
```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง | ความเสี่ยง |
|------|---------------|-----------|
| `src/main.tsx` | Revert กลับไปรูปแบบมาตรฐาน | ต่ำมาก - เป็น standard pattern |

---

### ผลลัพธ์ที่คาดหวัง

1. **React hooks ทำงานปกติ** - QueryClientProvider, PortalProvider ทำงานได้
2. **App ไม่พังอีกต่อไป** - ผู้ใช้เข้าถึง Portal, Check-in/out ได้
3. **ไม่มี "Invalid hook call" errors** - Console สะอาด

---

### การป้องกันปัญหาในอนาคต

**หมายเหตุสำคัญ:** การแก้ไข main.tsx ที่ผ่านมาทำให้ App พังเพราะ:

1. **`import * as React`** - อาจทำให้ bundler สร้าง duplicate React instances
2. **การเปลี่ยน createRoot pattern** - ไม่จำเป็นต้องเปลี่ยน เพราะ `document.getElementById("root")!` ทำงานได้ปกติ

**ไฟล์ที่ไม่ควรแก้ไขโดยไม่จำเป็น:**
- `src/main.tsx` - Entry point หลัก
- `src/App.tsx` - Root component

---

### สรุป

**ปัญหาที่แท้จริง:** ไม่ใช่ timezone แต่เป็น React hooks พังจากการแก้ไข main.tsx

**วิธีแก้:** Revert main.tsx กลับไปรูปแบบมาตรฐาน

**เวลาที่ใช้:** ไม่กี่วินาที

**ความเสี่ยง:** ต่ำมาก
