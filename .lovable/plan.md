

## Recheck & Sync AI Cross-Group Query System

### ปัญหาที่พบ (ตรวจสอบจาก code จริงแล้ว)

| # | ปัญหา | ไฟล์ | ระดับ |
|---|-------|------|------|
| 1 | **Test Console ไม่ดึงข้อมูล employees** | `ai-query-test/index.ts` | Bug — ถามเรื่องพนักงานใน Test Console จะไม่ได้ข้อมูล |
| 2 | **Test Console ไม่แสดง employees_count** | `ai-query-test/index.ts` | Bug — response ไม่มี employees_count, sample_employees |
| 3 | **Test Console prompt ไม่มี employees section** | `ai-query-test/index.ts` | Bug — prompt ส่ง AI ไม่มี "พนักงาน" แม้จะดึงมาได้ |
| 4 | **Test Console empty-check ไม่ include employees** | `ai-query-test/index.ts` | Bug — เช็คว่า "ไม่มีข้อมูล" แต่ไม่เช็ค employees |
| 5 | **System Prompt ไม่ครอบคลุม data sources ใหม่** | `cross-group-query.ts` | Gap — AI ไม่มี instruction เฉพาะสำหรับ points/birthdays/rewards/leave/tasks |
| 6 | **Portal Help ไม่มีข้อมูล Cross-Group Query** | `src/pages/portal/Help.tsx` | Gap — user ไม่รู้วิธีใช้ฟีเจอร์นี้ |

### สิ่งที่ตรวจแล้วว่า OK (ไม่ต้องแก้)

- `cross-group-query.ts` retrieval logic ครบทั้ง 8 data sources
- `cross-group-query.ts` prompt builder ครบทั้ง 8 data sources
- `line-webhook/index.ts` cross-group handler ใช้ `parsed.userMessage` ถูกต้อง (parseCommandDynamic return `userMessage`)
- Frontend `ALL_DATA_SOURCES` ครบ 8 ตัวพร้อม label ภาษาไทย
- Access Matrix, Audit Logs, Recent Queries tabs ทำงานปกติ

### แผนการแก้ไข

**ไฟล์ 1: `supabase/functions/ai-query-test/index.ts`**

1. เพิ่ม employees retrieval logic (ดึง employees จาก branches ที่ match)
2. เพิ่ม `👥 พนักงาน:` section ใน context prompt
3. เพิ่ม `employees_count` และ `sample_employees` ใน response object
4. เพิ่ม `employees` ใน empty-check condition

**ไฟล์ 2: `supabase/functions/line-webhook/utils/cross-group-query.ts`**

อัพเดท `CROSS_GROUP_SYSTEM_PROMPT` ให้ครอบคลุม data sources ใหม่:

```text
เพิ่ม:
7. ถ้ามีข้อมูลคะแนน ให้ระบุชื่อ + คะแนน + streak
8. ถ้ามีข้อมูลวันเกิด ให้ระบุชื่อ + วันเกิด
9. ถ้ามีข้อมูลรางวัล ให้ระบุชื่อรางวัล + จำนวนคงเหลือ
10. ถ้ามีข้อมูลวันลา ให้ระบุชื่อ + ประเภท + วันที่ + สถานะ
11. ถ้ามีข้อมูลงาน ให้ระบุชื่องาน + สถานะ + ผู้รับผิดชอบ
```

**ไฟล์ 3: `src/pages/portal/Help.tsx`**

- เพิ่ม FAQ เกี่ยวกับ Cross-Group Query (ถามข้ามกลุ่มได้ยังไง, ข้อมูลอะไรบ้างที่ถามได้)
- ไม่เพิ่ม Quick Action (เพราะ feature นี้ใช้ผ่าน LINE ไม่ใช่ Portal)

### สิ่งที่จะไม่แตะ

- ไม่แก้ `cross-group-query.ts` retrieval/prompt logic (ทำงานถูกต้องอยู่แล้ว)
- ไม่แก้ `line-webhook/index.ts` handler (ทำงานถูกต้องอยู่แล้ว)
- ไม่แก้ `AIQueryControl.tsx` frontend (ทำงานถูกต้องอยู่แล้ว)
- ไม่แก้ DB schema, RLS, routing

### Smoke Test

1. ไปที่ Test Console ถามคำถามเรื่องพนักงาน (เช่น "พนักงานสาขา X มีใครบ้าง") ต้องเห็น employees_count > 0
2. ถาม LINE bot เรื่องคะแนน/วันเกิด ต้องตอบได้ตรงประเด็น (system prompt ใหม่)
3. Portal Help page ต้องเห็น FAQ เรื่อง Cross-Group Query

### Technical Details

```text
ai-query-test employees retrieval (เพิ่มหลัง attendance section):

if (allowedDataSources.includes("employees")) {
  const branchIdsE = matchedBranches.map(b => b.id);
  if (branchIdsE.length > 0) {
    const bMapE = new Map(matchedBranches.map(b => [b.id, b.name]));
    const { data: empsE } = await adminClient
      .from("employees").select("full_name, branch_id, role")
      .in("branch_id", branchIdsE).eq("is_active", true);
    for (const emp of empsE || []) {
      evidence.employees.push({
        name: emp.full_name || "Unknown",
        branch_name: bMapE.get(emp.branch_id) || "Unknown",
        role: emp.role || "employee"
      });
    }
  }
}

Prompt addition:
if (evidence.employees.length > 0) {
  contextPrompt += `👥 พนักงาน:\n`;
  for (const e of evidence.employees.slice(0, 20)) {
    contextPrompt += `- ${e.name} | ${e.branch_name} | ${e.role}\n`;
  }
  contextPrompt += "\n";
}

Response addition:
employees_count: evidence.employees.length,
sample_employees: evidence.employees.slice(0, 5),

Empty check addition:
&& evidence.employees.length === 0
```
