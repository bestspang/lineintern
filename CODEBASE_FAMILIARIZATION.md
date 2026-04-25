# Codebase Familiarization Notes

This document captures a quick orientation pass of the LINE Intern repository.

## 1) What this project is

LINE Intern is a LINE-integrated workplace assistant with:
- AI chat and command workflows
- Work/task tracking
- Attendance + portal flows
- Admin dashboard tooling

Primary stack in this repo:
- React + TypeScript + Vite frontend
- Supabase backend/database integration
- LINE/LIFF integrations for employee and bot experiences

## 2) Top-level repo shape

High-signal directories/files from this pass:
- `src/` main frontend app
- `supabase/` backend config and function assets
- `README.md` product overview and setup
- `CLAUDE.md` architecture and subsystem reference
- several implementation/runbook docs (attendance, deployment, cron, monitoring)

## 3) Frontend architecture snapshot

### App shell and routing
- `src/main.tsx` mounts the React app via strict mode.
- `src/App.tsx` is the routing hub and includes:
  - global providers (TanStack Query, locale, auth, tooltips)
  - route-level lazy loading for large page groups
  - **portal routes** (`/portal/*`) wrapped by LIFF + portal context/layout
  - **admin protected routes** under dashboard layout
  - explicit error routes and root redirect behavior

### Feature grouping (under `src/`)
- `components/` split by domain (`attendance`, `portal`, `settings`, `dm`, `social-intelligence`, `ui`)
- `pages/` split similarly (`attendance`, `portal`, `settings`, plus top-level admin pages)
- `contexts/` for cross-cutting runtime concerns (auth, locale, portal, LIFF)
- `integrations/supabase/` generated API client + DB typings

## 4) Runtime/data integration notes

- Supabase client is initialized from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Auth persistence is enabled in browser local storage via supabase-js options.
- Query defaults in App are conservative (`retry: 1`, `staleTime: 30s`) to balance freshness and network load.

## 5) Operational understanding from docs

From `README.md` + `CLAUDE.md`, this repo supports a broad operational surface:
- conversation + knowledge + analytics workflows
- attendance (check-in/out, photos, GPS/geofence, summaries)
- employee portal and admin dashboard with extensive route surface
- Supabase Edge Function-based backend with significant domain coverage

## 6) Suggested next deep-dive order

1. **Authentication & role access**: `contexts/AuthContext`, `components/ProtectedRoute`, settings/user-role pages.
2. **Attendance end-to-end**: portal check-in pages + Supabase attendance functions and tables.
3. **Webhook/command pipeline**: `supabase/functions/line-webhook` command parsing and response flow.
4. **Feature-flag and safety controls**: settings pages + DB-backed config tables.

## 7) Risks/complexity areas to watch

- Very large route and page surface area (`src/App.tsx` is a major integration point).
- Domain breadth (attendance, payroll, portal, bot intelligence) increases coupling risk.
- Generated types/client boundaries should be respected to avoid drift.
- Timezone-sensitive workflows (attendance/payroll/reporting) likely require strict standards.

---

This is an initial familiarization pass intended to speed onboarding and planning.
