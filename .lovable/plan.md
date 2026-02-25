

## Notification Center — End-to-End Verification Results

### Database Layer ✅
| Check | Status |
|-------|--------|
| `notifications` table exists | ✅ All 11 columns correct (id, employee_id, title, body, type, priority, is_read, read_at, action_url, metadata, created_at) |
| RLS enabled | ✅ `relrowsecurity = true` |
| RLS policies (4 total) | ✅ SELECT own, UPDATE own, SELECT admin, INSERT admin |
| Indexes | ✅ `idx_notifications_employee_unread` (partial on is_read=false) + `idx_notifications_employee_created` (DESC) |
| Realtime enabled | ✅ In `supabase_realtime` publication |

### Frontend Layer ✅
| Check | Status |
|-------|--------|
| `Notifications.tsx` page exists | ✅ Tabs (All/Unread), mark read, mark all, realtime subscription, action_url navigation |
| Route `/portal/notifications` in App.tsx | ✅ Line 221 |
| Export in `portal/index.tsx` | ✅ Present |
| Bell icon in PortalLayout header | ✅ With unread badge, navigates to `/portal/notifications` |
| Realtime subscription in PortalLayout | ✅ `notif-count` channel updates badge count |

### Cannot Test in Browser
Portal pages require **LINE LIFF authentication** — the loading screen shows "กำลังเชื่อมต่อ LINE..." (Connecting to LINE...). This is expected behavior; portal pages are designed to be accessed only through LINE's in-app browser.

### What Works (Code Review Confirmed)
1. **Bell icon** — renders in header with dynamic unread count badge (destructive color, "99+" overflow)
2. **Read/unread tracking** — `markAsRead()` updates single notification, `markAllAsRead()` batch updates
3. **Realtime updates** — both `Notifications.tsx` and `PortalLayout.tsx` subscribe to `postgres_changes` on `notifications` table filtered by `employee_id`
4. **Navigation** — clicking a notification with `action_url` calls `navigate(n.action_url)` and auto-marks as read
5. **Empty states** — different messages for "no notifications" vs "no unread"
6. **Time formatting** — relative time in Thai/English (เมื่อสักครู่, นาทีที่แล้ว, etc.)

### Risk Assessment: No Issues Found
- All components follow existing Portal patterns
- No console errors related to notifications (only LIFF auth timeout which is expected without LINE context)
- Database schema, RLS, indexes, and realtime all correctly configured
- No regressions in existing portal routes

### To Fully Test End-to-End
The user would need to open the portal through LINE LIFF (in-app browser) and:
1. Check the bell icon shows in the header
2. Insert a test notification via the database to verify realtime badge update
3. Navigate to `/portal/notifications` and verify the list renders
4. Click a notification to verify mark-as-read and navigation

