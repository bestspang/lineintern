

## Manager Dashboard — Implementation Plan

### What We're Building
A new **Manager Dashboard** page in the Portal that aggregates all pending approvals (OT, Leave, Early Leave, Remote Checkout, Redemptions, Deposits) into a single view with team performance stats.

### Why It's Low Risk
- **New page only** — `src/pages/portal/ManagerDashboard.tsx` (new file)
- Reuses the existing `approval-counts` endpoint from `portal-data` edge function (already used by `Approvals.tsx`)
- Reuses existing `team-summary` endpoint for team stats
- Only touches existing files for routing (App.tsx + portal/index.tsx + PortalHome.tsx link)
- Zero changes to business logic, edge functions, or database

### Files to Create/Modify

| File | Change |
|------|--------|
| `src/pages/portal/ManagerDashboard.tsx` | **New file** — main dashboard page |
| `src/pages/portal/index.tsx` | Add 1 export line |
| `src/App.tsx` | Add 1 route: `/portal/manager-dashboard` |
| `src/pages/portal/PortalHome.tsx` | Add Manager Dashboard card to `managerActions` array |

### Files NOT Touched
- Portal-data edge function (reuses existing endpoints)
- Database (no new tables or migrations)
- Approvals.tsx, ApproveOT, ApproveLeave (untouched)
- AuthContext, PortalContext (untouched)
- PortalLayout.tsx (untouched)

### Manager Dashboard Features
1. **Pending Approvals Summary** — Cards showing OT, Leave, Early Leave, Remote Checkout, Redemptions, Deposits counts with click-to-navigate
2. **Team Attendance Overview** — Today's check-in/out stats (from `team-summary` endpoint)
3. **Quick Action Buttons** — Direct links to each approval page
4. **Role-gated** — Only visible to manager/admin/owner roles (matching existing pattern from `managerActions`)

### Data Sources (All Existing)
- `portalApi({ endpoint: 'approval-counts' })` — pending counts per category
- `portalApi({ endpoint: 'team-summary' })` — team attendance data
- No new API calls needed

### Implementation Steps
1. Create `ManagerDashboard.tsx` following the same pattern as `Approvals.tsx` + `PortalHome.tsx`
2. Add route in `App.tsx`
3. Add export in `portal/index.tsx`
4. Add card in `PortalHome.tsx` managerActions array

### Risk Assessment: Very Low
- No database changes
- No edge function changes
- Only adds 1 new file + 3 minor edits (route, export, menu item)
- All data already served by existing endpoints

