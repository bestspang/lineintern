# Fix Phase 0B Smoke Workflow

## Root cause
1. **`npm ci` ล้มเหลว**: `react-day-picker@8.10.1` peer-requires `date-fns@^2 || ^3` แต่โปรเจกต์ใช้ `date-fns@4` (จำเป็นสำหรับ `date-fns-tz@3` ที่ใช้ใน Asia/Bangkok timezone helpers — Core memory rule)
2. **`Build summary artifact` ล้ม secondary**: เมื่อ install fail, `smoke-artifacts/SUMMARY.md` ไม่ถูกสร้าง → `cat` ล้มด้วย exit 1

## Affected modules / status
- `.github/workflows/smoke.yml` — BROKEN (install + summary steps)
- `.npmrc` (ใหม่) — ไม่มี
- `package.json`, `src/components/ui/calendar.tsx`, timezone helpers — WORKING (ห้ามแตะ)

## Approach: minimal-diff (ไม่แตะ versions / business code)

### 1. เพิ่ม `.npmrc` ที่ root
```
legacy-peer-deps=true
```
ทำให้ทุก `npm install/ci` (CI, Vercel, dev-server-logs) ผ่อนปรน peer ranges เหมือนกัน — ไม่กระทบ `bun` (bun ไม่อ่าน .npmrc npm-specific flag นี้ และ local ใช้ bun อยู่แล้ว)

### 2. แก้ `.github/workflows/smoke.yml`
- `npm ci` → `npm ci --legacy-peer-deps` (กัน edge case ถ้า .npmrc ไม่ถูกอ่าน)
- เพิ่ม step ใหม่ **`Prepare smoke artifact dir`** (`if: always()`) ที่ pre-create `smoke-artifacts/` + placeholder `smoke-output.txt` ก่อน smoke step รัน
- แก้ **`Build summary artifact`** ให้:
  - `mkdir -p smoke-artifacts` ซ้ำ (idempotent)
  - guard ด้วย `if [ -s "$OUTPUT_FILE" ]` ก่อน `sed`; ถ้า empty/missing เขียน fallback message แทน
  - guard `cat $SUMMARY_FILE >> $GITHUB_STEP_SUMMARY` ด้วย `if [ -s ... ]`; ถ้าไม่มีให้เขียน warning ลง job summary

### 3. ไม่แตะ
- `package.json` versions
- `src/components/ui/calendar.tsx` (shadcn DayPicker)
- `date-fns-tz` / timezone helpers
- `scripts/smoke-test.mjs` (เพิ่งแก้ผ่าน 16/16 รอบที่แล้ว)

## Files to create/edit
- **NEW** `.npmrc`
- **EDIT** `.github/workflows/smoke.yml` (install + 2 summary steps)

## Regression checklist
- CI workflow ผ่าน install step ได้
- Smoke artifact + SUMMARY.md upload สำเร็จแม้ smoke fail
- Local `bun install` ทำงานปกติ (bun ignore .npmrc npm-flags)
- Calendar UI / DatePicker ยังทำงาน (ไม่แตะ code)
- Timezone helpers (`formatBangkokISODate`) ไม่กระทบ
- `node scripts/smoke-test.mjs --skip-build` ยัง 16/16 pass

## Future-proof note (optional, ไม่อยู่ใน scope รอบนี้)
ถ้าต้องการ proper fix ในอนาคต: อัพเกรด `react-day-picker` v8 → v9 (รองรับ date-fns v4 native) + อัพเดต shadcn `calendar.tsx` ตาม v9 spec — ทำเป็นรอบแยกเพราะมี breaking changes (`IconLeft/IconRight` → `Chevron`)
