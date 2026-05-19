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

---

## Phase B — Executed (2026-05-19)

- **FAQs inserted (+6):** Daily Missions, Achievement Badges, Gacha Box (category `points`); Notification Center, Notification Preferences, Manager Dashboard (category `general`). All `is_active=true`, bilingual TH/EN.
- **FAQs updated (2):** `46359bc7…` Remote Checkout — answer rewritten to describe portal Notification Center + LINE + Audit Log flow. `f46c6cb1…` "ทำไมเช็คอินไม่ได้" — added GPS retry, expired/used-link resend, camera/liveness, and direct token-link fallback guidance.
- **Sidebar:** added `Flexible Day-Off Config` → `/attendance/flexible-day-off` under Attendance Admin (existing `/attendance/flexible-day-off-requests` unchanged).
- **Counts after:** `portal_faqs` 41/41 active (was 35); categories attendance=6, general=15, leave-ot=8, points=12.
- **Verify:** `audit:consistency` 7 pass / 0 fail / 0 warn. `smoke:quick` 16 pass / 0 fail / 5 skip (manual).
- **Untouched:** schema, RLS, existing 35 FAQ rows, `bot_commands`, `webapp_page_config`, `// ⚠️ VERIFIED` files, `/menu` handler, `employee_menu_tokens`, `portal_performance_events`.

---

## Phase C — Executed (2026-05-19)

- **NEW** `.lovable/feature-registry.json` — 13 user-facing features mapped to routes / nav / FAQ keywords / edge fns / tables / VERIFIED files.
- **NEW** `.lovable/verified-baseline.json` — snapshot of 17 `⚠️ VERIFIED` markers across 17 files (baseline for C12).
- **NEW** `scripts/feature-impact.mjs` — `node scripts/feature-impact.mjs <feature-key>` (or `--list`). Prints all surfaces tied to a feature so AI must audit before editing.
- **EDIT** `scripts/consistency-audit.mjs` — added C10 (enabled bot_commands have parser handler), C11 (feature-registry FAQ coverage info), C12 (VERIFIED markers ≥ baseline, hard FAIL on regression).
- **EDIT** `.lovable/AI_GUARDRAILS.md` — Step 1 checklist now mandates `feature-impact.mjs` and forbids removing VERIFIED markers.
- **Verify:** `audit:consistency` 9 pass / 0 fail / 0 warn / 3 info (was 7/0/0/2). `smoke:quick` 16/0 unchanged.
- **Untouched:** all VERIFIED files, DB schema, RLS, FAQ rows, bot_commands, webapp_page_config.

---

## Phase D — Executed (2026-05-19)

### Guardrail validation
- **C12 fire-drill:** Temporarily replaced `⚠️ VERIFIED` in `src/lib/timezone.ts` → audit failed with `C12 FAIL: timezone.ts expected 1, found 0`, summary `8/1/0/0/3`. Restored → back to `9/0/0/0/3`. C12 works.
- **Registry validator:** Wrote `/tmp/validate-registry.mjs` to resolve nested `<Route>` paths (parent `/portal/*` + child) and verify `verified_files` + `critical_files` exist. Found 3 stale paths from Phase C → fixed:
  - `gacha-box` → `Gacha.tsx` → `GachaBox.tsx`
  - `notification-center` → `NotificationBell.tsx` → `Notifications.tsx`
  - `notification-preferences` → standalone route/file → consolidated into `/portal/notifications` (Notifications.tsx hosts the preferences tab; no separate page exists)
- **feature-impact:** All 13 → 18 keys list cleanly; no crashes; all routes/files now resolve.

### Coverage expansion (+5 keys, registry now 18 total)
Added user-facing features that AI commonly regresses:
- `leave-request` (RequestLeave, MyLeaveBalance, ApproveLeave)
- `ot-request` (RequestOT, ApproveOT)
- `reward-shop` (RewardShop, MyRedemptions, ApproveRedemptions)
- `portal-profile` (MyProfile)
- `payroll-portal` (MyPayroll, PayrollReport)

### Tooling
- **`scripts/consistency-audit.mjs`:** added `--offline` flag (skips C8/C10 cleanly with SKIP records) + startup banner reminding AI to fix root cause, never disable a check.
- **`package.json`:** added `audit:offline` and `check` (= `audit:consistency && smoke:quick`).
- **`.lovable/AI_GUARDRAILS.md`:** Step 1 now mandates `npm run check` before commit + bans editing `verified-baseline.json` to "go green".

### Phase 1D Manual-QA (§5 checklist — closed via static source verification)
Live browser QA blocked by admin-auth gate in sandbox preview; verified at source level instead:
- [x] **Resend Portal Link** — `src/pages/attendance/Employees.tsx:800` button `disabled={!canEdit || !employee.line_user_id || resendingId === employee.id}`, invokes `portal-link-resend`, Thai toast with mode text.
- [x] **OpsCenter "ตรวจการเชื่อมต่อ" button** — `OpsCenter.tsx:275` present inside Portal Performance card.
- [x] **OpsCenter StatCard nav** — `OpsCenter.tsx:229-243` navigate to `/portal/approvals/remote-checkout`, `/early-leave`, `/ot`, `/leave`, `/attendance/employees`, `/attendance/branches`.
- [x] **GPS retry / error UX** — `src/pages/Attendance.tsx:36` full `idle|requesting|granted|denied|timeout|unsupported|error` union; 12s timeout (line 220); distinct Thai strings (lines 1075-1081).
- [x] **Validate-token Thai error map** — `Attendance.tsx:716` (`'ลิงก์หมดอายุแล้ว'`), `:734` (`codeMap.TOKEN_EXPIRED`), `:781` ("กลับไปที่ LINE" CTA).

> Note: live click-through on Resend/Approve still requires a real admin session — recommended before any LINE-push-to-real-employees test.

### Verification
- `npm run audit:consistency` → **9 pass / 0 fail / 0 warn / 0 skip / 3 info**
- `npm run audit:offline`     → **7 pass / 0 fail / 0 warn / 2 skip / 3 info**
- `npm run smoke:quick`       → **16 pass / 0 fail / 5 skip (manual)**
- Registry: 18 keys, 0 missing routes, 0 missing files.
- `⚠️ VERIFIED` markers: 17 (baseline 17) — none lost.

### Files touched (Phase D)
- **EDIT** `.lovable/feature-registry.json` — fixed 3 stale paths, added 5 new keys, bumped `_phase` → "1E Phase D"
- **EDIT** `scripts/consistency-audit.mjs` — `--offline` flag + banner
- **EDIT** `package.json` — `audit:offline`, `check` scripts
- **EDIT** `.lovable/AI_GUARDRAILS.md` — Step 1 mandate `npm run check`
- **EDIT** `docs/PHASE_1E_DRIFT_REPORT.md` (this log)
- **EDIT** `docs/STATUS.md` (date bump)

---

## Phase 1E — Controlled Pilot Rollout (in progress)

### Readiness check (sandbox, no real-device interaction yet)
- **Publish state:** public, live (`publish_settings.effective_publish_visibility = public`).
- **Routes verified at source:** `/overview`, `/attendance/ops-center` (App.tsx:307), `/attendance/portal-performance` (App.tsx:308), `/portal/*` (App.tsx:180), `/attendance` token page (App.tsx:173).
- **Role gating:** `ProtectedRoute` + `usePageAccess` → ops-center/portal-performance allow owner/admin/hr/manager only; lower roles redirected to first accessible page.
- **portal_performance_events baseline:** 0 rows in last 7 days (table exists, awaiting first real tester). Not a regression — expected pre-pilot state.

### Deliverables
- **NEW** `docs/PHASE_1E_CONTROLLED_PILOT.md` — pilot runbook (metadata, tester roster, A/B/C/D test cases, severity rubric, perf snapshot section, exit criteria, sign-off).
- **EDIT** `docs/STATUS.md` (date bump).
- **EDIT** `docs/PHASE_1E_DRIFT_REPORT.md` (this section).

### Verification (Phase 1E pre-pilot)
- `npm run check`  → **9 audit pass / 0 fail / 0 warn / 0 skip / 3 info**, **16 smoke pass / 0 fail / 5 skip (manual)**.
- `bun run test`   → **7 / 7 passed** (employee-documents upload flow).
- `⚠️ VERIFIED` markers: 17 (baseline 17) — none lost.
- No source files edited besides docs.

### Blockers found / fixes applied
- None this pass. Awaiting first real tester before §5 (reactive bugfix) can engage.

### Remaining risks
- LIFF / GPS / camera paths cannot be exercised from the sandbox browser — must be validated on real devices per runbook §5 A–C.
- Role gating leak (D6) needs at least one non-management account in the pilot roster.
- `portal_performance_events` insert path will be invisible until first real LINE-opened session.
