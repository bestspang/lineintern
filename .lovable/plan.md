

## สถานะปัจจุบัน (ทำเสร็จแล้ว)
- ✅ Build Error Fix (ai-query-test)
- ✅ Feature Flags RLS → admin only
- ✅ Logger PII masking (email, phone, bank_account)
- ✅ UUID validation ใน cross-group-query
- ✅ Notification Center (table + page + bell icon + realtime)

## Feature ถัดไปที่แนะนำ

| ลำดับ | Feature | Risk | Effort |
|-------|---------|------|--------|
| 1 | **Manager Dashboard** | ต่ำ (page ใหม่) | กลาง |
| 2 | **Broadcast Audience Targeting** | ต่ำ | ต่ำ |
| 3 | **Receipt Smart Categorization** | ต่ำ | ต่ำ |
| 4 | **Gacha Daily Missions** | กลาง | กลาง |
| 5 | **Attendance Predictive Insights** | กลาง-สูง | กลาง |

## Phase 2 (Notification Center อนาคต)
- Edge function สำหรับ create notifications อัตโนมัติ (เมื่อ approve/reject)
- LINE push notification integration
- Notification preferences per employee
