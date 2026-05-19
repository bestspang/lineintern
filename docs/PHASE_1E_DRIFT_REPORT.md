# Phase 1E — Cross-Surface Drift Report

**Generated:** 2026-05-19
**Scope:** Read-only audit. No code or DB mutations performed.
**Source-of-truth checks:**
- `npm run audit:consistency` → **7 pass / 0 fail / 0 warn** (structural sync OK)
- `npm run smoke:quick` → **16 pass / 0 fail** (no ghost tables/routes)

> **Conclusion up-front:** there is **no structural drift** (every route, command, action has its expected counterpart). What is out-of-sync is **content** — the Portal FAQ has not kept up with features shipped in Phase 1B–1D, and a handful of admin routes lack sidebar navigation.

---

## 1. Portal FAQ vs. Shipped Features

`portal_faqs` currently has **35 active rows / 4 categories** (`attendance`, `general`, `leave-ot`, `points`). Comparing against features that landed in Phase 1B–1D:

| Feature (shipped) | Memory ref | FAQ row exists? | Recommendation |
|---|---|---|---|
| Daily Missions (My Points) | `mem://features/portal/daily-missions-system` | ❌ no | **ADD** (category `points`) — "Daily Missions คืออะไร?" |
| Achievement Badges (Bronze/Silver/Gold) | `mem://features/portal/achievement-badges-system` | ❌ no | **ADD** (category `points`) — "Badge / เหรียญตรา คืออะไร?" |
| Gacha Box | `mem://features/points/gacha-box-system` | ❌ no | **ADD** (category `points`) — "Gacha คืออะไร?" + "กด Gacha ไม่ได้ ทำอย่างไร?" |
| Notification Center (`/portal/notifications`) | `mem://features/portal/notification-center` | ❌ no | **ADD** (category `general`) — "ดูการแจ้งเตือนได้ที่ไหน?" |
| Notification Preferences (manager toggles) | `mem://features/portal/notification-preferences` | ❌ no | **ADD** (category `general`, manager-tier) |
| Manager Dashboard | route `/portal/manager-dashboard` | ❌ no | **ADD** (category `general`) — "Manager Dashboard ทำอะไรได้?" |
| Remote Checkout approval flow | `mem://features/attendance/advanced-checkout-workflows` | ⚠️ partial — "ฉันจะ checkout นอกสถานที่ได้อย่างไร?" exists but no mention of the **approval** half | **UPDATE** that row to describe approver experience |
| Streak Shield (auto-activate from bag) | `mem://features/points/streak-shield-bag-logic` | ✅ row exists ("Streak Shield คืออะไร?") — verified accurate | OK |
| Direct check-in (token without webhook) | `mem://features/portal/direct-checkin-access` | ⚠️ existing check-in FAQ does not mention this fallback | **UPDATE** "ทำไมเช็คอินไม่ได้?" |
| Resend Portal Link (admin button — Phase 1D.1) | — | n/a (admin-only — no portal FAQ needed) | OK |
| OpsCenter Connection Check (Phase 1D.1) | — | n/a (admin-only) | OK |

**Net Phase B work for FAQ:** ~6 INSERT rows + 2 UPDATE rows. All additive — no deletes.

---

## 2. `/help` Command vs. `bot_commands` DB

✅ **OK.** `handleHelpCommand` (line-webhook/index.ts:5133) reads commands **dynamically from `bot_commands` table** filtered by `min_role_priority`. It is impossible for the help message to fall out of sync with the DB.

- 27 commands in DB, all `is_enabled=true`
- 27 mapped values in `command-parser.ts` `commandMap`
- Receipt/deposit deprecation responses already wired (index.ts:9768-9783)

---

## 3. Admin Sidebar vs. Admin Routes

`DashboardLayout.tsx` declares **60 nav items**. Snapshot has **70 admin routes** (excluding params). Diff:

| Route | In sidebar? | Notes |
|---|---|---|
| `/overview` | ❌ | Intentional alias — `/` already points to Overview. **No fix needed.** |
| `/attendance/flexible-day-off` | ❌ | Only the *requests* page (`/attendance/flexible-day-off-requests`) is in nav. **Verify with user** whether the admin-config page should be linked or is reachable from the requests page header. |

All other 68 routes have sidebar entries. **No nav drift.**

---

## 4. `webapp_page_config` Coverage

- DB has **68 distinct `page_path` values**.
- All 70 static admin routes from snapshot → **0 missing** in DB.
- 4 extra DB rows (informational — not blocking):
  - `/attendance/employee-history/:id` (legacy path; current route is `/attendance/employees/:id/history`)
  - `/attendance/employee-settings/:id` (legacy path; current is `/attendance/employees/:id/settings`)
  - `/settings/reports` (sub-route — covered by `/settings/*`)
  - `/settings/roles` (sub-route — covered by `/settings/*`)

**Recommendation:** leave as-is (no harm; legacy paths simply never match). If user wants cleanup, a Phase B item is a single soft-delete migration. **Not a blocker.**

---

## 5. Phase 1D Button Manual-QA Checklist

These are the user-facing buttons shipped in Phase 1D / 1D.1. None have been clicked in a real browser yet (Phase 1D pilot gate is still pending real users). Listed here so the user (or a future browser session) can verify in one pass:

- [ ] **Resend Portal Link button** — `/attendance/employees`, action column. Should: enable only when employee has `line_user_id`; on click invoke `portal-link-resend` and toast Thai success with mode (LIFF / Token Link).
- [ ] **OpsCenter "ตรวจการเชื่อมต่อ" button** — `/attendance/ops-center`, inside Portal Performance card. Should: show 3 pass/fail rows (DB read, Auth session, Edge function) with latency.
- [ ] **OpsCenter StatCard navigation** — "Setup Issues" → `/attendance/employees` or `/branches`; "Pending Actions" → `/portal/approvals/*`.
- [ ] **GPS retry / error UX** — `/attendance` token page. Should: distinct Thai strings for `requesting | granted | denied | timeout`, 12-second timeout, OS-specific settings hint.
- [ ] **Validate-token Thai error map** — open expired link → Thai title + "Back to LINE" / "Open Portal" CTAs (not raw English error).

> ⚠️ **Do not** click "Approve / Reject" buttons on real approval rows in the live preview — those mutate production state. Test on a seeded fake row only.

---

## 6. Categorization for Phase B

### Must-fix (content drift, user-impacting)
1. Add 6 missing portal FAQ rows (Daily Missions, Achievement Badges, Gacha, Notifications, Notification Preferences, Manager Dashboard)
2. Update 2 existing FAQ rows (remote checkout approval, direct check-in fallback)

### Should-fix (nav clarity)
3. Decide on `/attendance/flexible-day-off` sidebar entry (or document as sub-page only)

### Informational (no action)
4. Legacy `webapp_page_config` rows pointing to renamed paths
5. `/overview` not in sidebar (intentional — `/` is Overview)

### Manual QA needed (not codebase work)
6. Phase 1D button click-through (5 items in §5)

---

## 7. Regression-prevention plan (Phase C preview)

Once Phase B items are merged, ship the following so the next AI loop cannot quietly break the new content:

1. `scripts/consistency-audit.mjs` — add **C10** = every `bot_commands.is_enabled=true` row has a help-test fixture, **C11** = every feature key in new `.lovable/feature-registry.json` has ≥1 FAQ row OR `Help.tsx` static fallback, **C12** = `⚠️ VERIFIED` marker count never decreases below baseline.
2. New file `.lovable/feature-registry.json` — central map: `feature_key → { route, nav_entry, faq_keys[], command_keys[], edge_fn }`.
3. New file `.lovable/verified-baseline.json` — snapshot of current 17 markers across 17 files for C12 to compare against.
4. New script `scripts/feature-impact.mjs <feature-key>` — prints all dependent files so AI must read the impact list before editing.
5. Append "feature-registry consultation" step to `.lovable/AI_GUARDRAILS.md` Step 1 checklist.

---

## Sign-off

- **Structural drift:** none.
- **Content drift:** 6 missing FAQ + 2 stale FAQ + 1 ambiguous sidebar entry.
- **Behavioural drift:** 5 Phase 1D buttons not yet manually verified.

**No code is changed by this report.** Awaiting user direction on which Phase B items to execute and whether to begin Phase C guardrail expansion in parallel.
