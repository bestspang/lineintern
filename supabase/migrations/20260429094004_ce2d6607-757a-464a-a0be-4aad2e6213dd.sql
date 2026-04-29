-- ===========================================================================
-- Sync Page Registry (P0 fix)
-- Purpose: bring webapp_page_config in line with actual routes in src/App.tsx
--   - Insert 18 admin pages that exist in App.tsx but were never registered
--     (e.g. /attendance/employee-documents — recently shipped)
--   - Remove 11 stale rows pointing to routes that no longer exist
--   - Skip /portal/* routes (portal has its own gates, not webapp_page_config)
--   - Skip dynamic :id detail pages already covered by parent route entries
--
-- Safety:
--   - All inserts use ON CONFLICT DO NOTHING (no overwrite of existing access)
--   - DELETEs only target known-removed routes (verified against App.tsx)
--   - No schema changes
-- ===========================================================================

-- 1) Remove stale entries (routes that no longer exist in App.tsx)
DELETE FROM public.webapp_page_config
WHERE page_path IN (
  '/alerts',
  '/integrations',
  '/reports',
  '/safety-rules',
  '/settings/alerts',
  '/settings/integrations',
  '/settings/reports',
  '/settings/safety',
  '/settings/users'
  -- NOTE: '/settings/roles' kept since RoleManagement.tsx still uses /settings/roles via SettingsLayout
  -- NOTE: '/' kept (it's the legacy alias for /overview)
);

-- 2) Insert missing admin pages, one row per (role, page_path)
--    Defaults:
--      - admin / owner / hr → can_access = true
--      - manager → true for non-sensitive (broadcast, audit, feature flags = false)
--      - executive / moderator / field / user / employee → false (least privilege)
--    Caller can override via /settings/roles UI.

WITH new_pages(page_path, page_name, menu_group) AS (
  VALUES
    -- Attendance
    ('/attendance/employee-documents', 'Employee Documents', 'Attendance'),
    ('/attendance/bag-management',     'Bag Management',     'Points & Rewards'),
    -- Dashboard / monitoring
    ('/audit-logs',                    'Audit Logs',         'Monitoring & Tools'),
    ('/feature-flags',                 'Feature Flags',      'Dashboard'),
    ('/pre-deploy-checklist',          'Pre-Deploy Checklist','Dashboard'),
    ('/profile-sync-health',           'Profile Sync Health','Monitoring & Tools')
),
roles AS (
  SELECT unnest(ARRAY['admin','owner','hr','manager','executive','moderator','field','user','employee']::app_role[]) AS role
),
default_access AS (
  SELECT
    r.role,
    p.page_path,
    p.page_name,
    p.menu_group,
    CASE
      WHEN r.role IN ('admin','owner','hr') THEN true
      WHEN r.role = 'manager' AND p.page_path NOT IN ('/audit-logs','/feature-flags','/pre-deploy-checklist','/profile-sync-health') THEN true
      ELSE false
    END AS can_access
  FROM roles r
  CROSS JOIN new_pages p
)
INSERT INTO public.webapp_page_config (role, menu_group, page_path, page_name, can_access)
SELECT role, menu_group, page_path, page_name, can_access FROM default_access
ON CONFLICT DO NOTHING;

-- 3) Seed FAQ entries for the new Employee Documents feature
INSERT INTO public.portal_faqs (question_th, question_en, answer_th, answer_en, category, sort_order, is_active)
VALUES
  (
    'พนักงานสามารถดูเอกสารของตัวเองได้ที่ไหน?',
    'Where can employees view their own documents?',
    'พนักงานสามารถเปิดดูเอกสารส่วนตัวได้จากหน้า "โปรไฟล์ของฉัน" ในระบบ Portal โดยจะเห็นเฉพาะเอกสารที่ตั้งค่าเป็น visible ให้พนักงานเท่านั้น',
    'Employees can view their personal documents from the "My Profile" page in the Portal. Only documents marked as visible to employees will be shown.',
    'general',
    100,
    true
  ),
  (
    'ใครสามารถอัปโหลดเอกสารพนักงานได้บ้าง?',
    'Who can upload employee documents?',
    'เฉพาะ HR, Admin, และ Owner เท่านั้นที่สามารถอัปโหลด แก้ไข และเก็บถาวร (archive) เอกสารพนักงานได้ ผ่านหน้า "เอกสารพนักงาน" ในเมนู Attendance',
    'Only HR, Admin, and Owner can upload, edit, and archive employee documents from the "Employee Documents" page under the Attendance menu.',
    'general',
    101,
    true
  ),
  (
    'ขนาดไฟล์เอกสารและประเภทไฟล์ที่รองรับคืออะไร?',
    'What file size and types are supported for documents?',
    'รองรับไฟล์ PDF, รูปภาพ (JPG, PNG, WebP) และเอกสาร Office (DOCX, XLSX) ขนาดไฟล์สูงสุด 10MB ต่อไฟล์ ระบบจะแจ้งเตือนเมื่อเอกสารใกล้หมดอายุ',
    'Supported formats: PDF, images (JPG, PNG, WebP), and Office files (DOCX, XLSX). Max file size: 10MB per file. The system will notify you when documents approach their expiry date.',
    'general',
    102,
    true
  ),
  (
    'จะค้นหาเอกสารของพนักงานคนใดคนหนึ่งได้อย่างไร?',
    'How do I find documents for a specific employee?',
    'ในหน้า "เอกสารพนักงาน" ใช้ช่องค้นหาด้านบนเพื่อค้นหาด้วยชื่อพนักงาน ชื่อเอกสาร หรือชื่อไฟล์ และใช้ตัวกรอง type/status/expiry เพื่อจำกัดผลลัพธ์ให้แคบลง สามารถส่งออกเป็น CSV ได้ด้วยปุ่ม Export',
    'On the "Employee Documents" page, use the top search box to search by employee name, document title, or filename. Use type/status/expiry filters to narrow results. Export to CSV via the Export button.',
    'general',
    103,
    true
  )
ON CONFLICT DO NOTHING;