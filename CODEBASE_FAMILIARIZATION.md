# Codebase Familiarization Notes

## What this project is
`lineintern` is a Vite + React + TypeScript application that appears to run two major UX surfaces:

1. **Admin dashboard** (protected routes) for operations such as attendance, payroll, analytics, settings, and bot administration.
2. **Employee portal / LINE LIFF mini app** under `/portal/*` for check-in/out, leave, overtime, approvals, points/rewards, and profile/self-service.

Backend behavior is heavily driven by **Supabase Edge Functions** in `supabase/functions/*` (82 functions currently), indicating a serverless integration pattern.

## High-level architecture

### Frontend stack
- React 18 + React Router 6 + TypeScript.
- Query/data cache via `@tanstack/react-query` with global defaults (`retry: 1`, `staleTime: 30s`).
- UI primitives largely from Radix-based components and shared local UI components under `src/components/ui`.
- Tailwind CSS + Vite build.

### Routing model
- **Public routes**: `/auth`, `/reset-password`, and error routes.
- **Portal routes**: nested inside `/portal/*`, wrapped by `LiffProvider` + `PortalProvider` + `PortalLayout`.
- **Admin routes**: protected by `ProtectedRoute`, rendered under `DashboardLayout`.
- Root route `/` uses `RootRedirect` (with LIFF context) to detect context and redirect appropriately.

### Backend/serverless shape
- Edge functions cover attendance flows, approvals, reminders, payroll/summary jobs, LIFF integration, profile sync health, and operational backfills.
- Shared function utilities are under `supabase/functions/_shared` (logging, retry, rate limiting, timezone, validators).

## Directory map (quick mental model)
- `src/pages/*`: route-level screens (admin + support pages).
- `src/pages/portal/*`: employee-facing portal pages.
- `src/pages/attendance/*`: attendance/payroll/HR operation pages.
- `src/components/*`: reusable components (layouts, feature widgets, and UI atoms).
- `supabase/functions/*`: edge-function backend endpoints and cron-style workers.
- Root `*.md` guides: operational runbooks/checklists (deployment, cron, attendance, webhook verification, etc.).

## Notable technical signals
- Build config manually chunks key vendor bundles (`react`, Radix UI subsets, query, charts, Supabase, LIFF, xlsx), suggesting bundle-size awareness.
- Development includes `lovable-tagger` plugin in dev mode.
- Scripts include smoke test workflows (`npm run smoke`, `npm run smoke:quick`).
- Presence of broad docs/checklists suggests this codebase is production-operated with recurring maintenance procedures.

## Suggested onboarding path for next session
1. Read `src/App.tsx` end-to-end (authoritative route topology).
2. Inspect `src/contexts/*` to understand auth, locale, LIFF, and portal state boundaries.
3. Trace one vertical feature (e.g., portal check-in):
   - Portal page in `src/pages/portal/*`
   - Shared hooks/utilities/services it calls
   - Matching Supabase function(s) in `supabase/functions/*`
4. Run:
   - `npm install`
   - `npm run dev`
   - `npm run smoke:quick`
5. Review root runbooks most relevant to your first change domain (attendance, cron jobs, deployment checklist).
