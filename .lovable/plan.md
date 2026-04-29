## Phase 1C: Pilot Execution & Real-device QA

Goal: Prepare a pilot QA runbook, add a small "Pilot QA" card on Ops Center, run automated checks, define pass/fail gates. No new features, no refactor, no touching protected modules.

### Note on prior work
`docs/PHASE_1C_PILOT_QA.md` and `docs/PHASE_1C_PERF_QUERIES.md` already exist (created earlier this phase). The new doc requested here is `PHASE_1C_PILOT_RESULTS.md` — a *results capture* template, not another checklist. I will keep it complementary, not duplicative.

---

### Task 1 — Create `docs/PHASE_1C_PILOT_RESULTS.md`

Bilingual (TH/EN) results-capture template with the requested sections:
1. Tester list (initials + role)
2. Device list (model / OS / DPR)
3. LINE app version
4. Network type (Wi-Fi / 4G / 5G)
5. Test account / role (owner / admin / hr / manager / employee / field / user)
6. Test branch
7. Start / end time (Asia/Bangkok)
8. PASS / PARTIAL / FAIL counts (table per area: A Portal, B Outside-LINE, C Token, D Admin)
9. Blocker list (S1/S2 with repro steps, no PII)
10. Screenshots / evidence links (storage location, naming convention `phase1c_<area>_<id>_<initials>.png`)
11. Linked `/attendance/portal-performance` snapshot time + p50/p95 numbers captured

Reference (not copy) `PHASE_1B_QA_CHECKLIST.md` and `PHASE_1C_PILOT_QA.md` as the source checklists.

### Task 2 — Add Pilot QA card to Ops Center

Append a single new `<Card>` at the bottom of `src/pages/attendance/OpsCenter.tsx` (above the final Alert). Minimal additive change, no refactor.

Card contents:
- Title: "Pilot QA — รอบทดสอบจริง"
- Top-7 manual checklist items as a static `<ul>`:
  - LIFF cold start
  - Expired link UX
  - GPS denied retry
  - Camera denied retry
  - Double-tap submit guard
  - Offline submit recovery
  - Role access control (ops/perf hidden from field/user)
- Two link buttons:
  - "Open Portal Performance" → `/attendance/portal-performance`
  - "View QA Checklist (PHASE_1B)" → static reference text + path (no in-app doc viewer needed)
- Small footnote: "Record results in `docs/PHASE_1C_PILOT_RESULTS.md`"

No state, no fetch, no DB changes. Pure markup.

### Task 3 — Run automated checks

- `npm run smoke:quick` (build runs automatically in harness)
- `bunx vitest run` if test setup is present
- Report counts in final message

### Task 4 — Pass/Fail gates documented

Embed the READY / NOT READY criteria from the user's spec verbatim into the new results doc, so testers sign off against the same gates.

### Task 5 — Blocker fixes (only if found)

Scope-limited fixes allowed only if automated checks expose them:
- Route typo, access config typo, missing nav link, broken import, null-handling, confusing Thai copy, missing retry button.
Anything bigger → list as remaining blocker, do NOT fix.

---

### Files to change

| File | Action |
|---|---|
| `docs/PHASE_1C_PILOT_RESULTS.md` | Create |
| `src/pages/attendance/OpsCenter.tsx` | Add one Pilot QA card (additive, ~30 lines) |
| `.lovable/plan.md` | Append Phase 1C execution note |

### Out of scope (explicit)

- No CSV export, branch filter, trend chart, drilldown, alerting on perf dashboard
- No changes to `line-webhook`, `attendance-submit`, `attendance-validate-token`, `claim_attendance_token`, timezone helpers, payroll, points, Employee Documents
- No DB migrations, no RLS changes, no edge function deploys
- No new routes, no nav changes (Ops Center + Portal Performance already in nav from prior step)

### Final report sections

1. Pilot runbook created (path)
2. Admin QA card added (file + lines)
3. Build / smoke / test results
4. Pilot pass/fail gates (summary)
5. Any blocker fixes (likely none)
6. Remaining manual steps (recruit testers, run on iOS+Android in LINE, fill results doc)
7. Verdict: READY TO RUN PILOT or NOT READY + blockers