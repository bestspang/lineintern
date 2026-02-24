# LINE Intern - Codebase Guide

## What This Project Is

LINE Intern is an AI-powered LINE bot with a full-stack admin dashboard and employee self-service portal. It serves as a workplace management tool for Thai businesses, handling attendance tracking, work assignments, receipt scanning, conversation intelligence, and employee engagement features -- all through LINE messaging and a web interface.

**Live Supabase project**: `bjzzqfzgnslefqhnsmla`
**AI model**: Google Gemini 2.5 Flash via Lovable AI Gateway
**Primary language**: Thai (with English support)

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    LINE Platform                     │
│  (Messaging API, Rich Menu, LIFF, Webhooks)          │
└──────────────┬──────────────────────┬────────────────┘
               │ webhook              │ LIFF
               ▼                      ▼
┌──────────────────────┐  ┌─────────────────────────────┐
│  Supabase Edge Fns   │  │  React Frontend (Vite)      │
│  (Deno runtime)      │  │  ├── Admin Dashboard        │
│  ├── line-webhook    │  │  ├── Employee Portal (/p/)  │
│  ├── attendance-*    │  │  └── LIFF pages (/liff/)    │
│  ├── receipt-*       │  └──────────────┬──────────────┘
│  ├── point-*         │                 │
│  ├── cognitive-*     │                 │ supabase-js
│  └── 80+ others      │                 │
└──────────┬───────────┘                 │
           │                             │
           ▼                             ▼
┌─────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL)                    │
│  218 migrations, RLS policies, pg_cron jobs          │
│  Storage buckets for photos/assets                    │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + TanStack Query + Recharts
- **Backend**: Supabase Edge Functions (Deno/TypeScript)
- **Database**: PostgreSQL via Supabase (218 migrations)
- **AI**: Lovable AI Gateway → Gemini 2.5 Flash
- **Messaging**: LINE Messaging API (webhook, push, reply, flex messages, rich menus, LIFF)
- **Storage**: Supabase Storage (attendance photos, receipt images)
- **Scheduling**: pg_cron for automated jobs (reminders, summaries, decay)

## Directory Structure

### Frontend (`src/`)
```
src/
├── App.tsx                    # Route definitions (3 route groups: admin, portal, LIFF)
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── attendance/            # Admin attendance components
│   ├── portal/                # Employee portal components (PortalLayout)
│   ├── receipts/              # Receipt management components
│   ├── dm/                    # Direct message components
│   ├── settings/              # Settings panel components
│   ├── shared/                # Shared components
│   ├── social-intelligence/   # Social intelligence views
│   ├── DashboardLayout.tsx    # Admin layout with sidebar nav
│   └── ProtectedRoute.tsx     # Auth guard
├── pages/
│   ├── attendance/            # 38 admin attendance pages
│   ├── portal/                # Employee self-service pages (portal index exports all)
│   ├── receipts/              # Receipt admin pages
│   ├── settings/              # User/role/API key management
│   ├── liff/                  # LINE LIFF mini-app pages
│   ├── branch-reports/        # Branch report pages
│   └── *.tsx                  # Top-level admin pages (Overview, Groups, Users, etc.)
├── hooks/                     # useAdminRole, useFeatureFlags, usePageAccess, etc.
├── contexts/                  # AuthContext, PortalContext, LocaleContext, LiffContext
├── lib/                       # portal-api.ts, translations.ts, timezone.ts, utils.ts
└── integrations/supabase/     # Auto-generated Supabase client and types
```

### Backend (`supabase/functions/`)

**Main webhook handler** (the heart of the bot):
```
supabase/functions/line-webhook/
├── index.ts          # ~11,195 lines - Main webhook handler with all command logic
├── types.ts          # Shared types
├── handlers/
│   └── receipt-handler.ts   # Receipt/image processing (2,247 lines)
└── utils/
    ├── ai.ts                # AI/LLM calls to Lovable AI Gateway
    ├── prompts.ts           # System prompts and personality modes
    ├── command-parser.ts    # Slash command parsing and routing
    ├── context-builder.ts   # Conversation context assembly
    ├── cross-group-query.ts # Cross-group data querying (804 lines)
    ├── db-helpers.ts        # Database utility functions
    ├── formatters.ts        # Date/time/number formatting
    ├── line-api.ts          # LINE Messaging API wrapper
    └── validators.ts        # Input validation
```

**Other major edge functions** (80+ total):
- `attendance-*` (8 functions): submit, validate-token, daily-summary, reminder, snapshot-update, employee-history, auto-checkout-grace, auto-checkout-midnight
- `receipt-*` (3 functions): submit, quota, monthly-report
- `point-*` (9 functions): attendance-calculator, daily-response-scorer, health-manager, monthly-summary, redemption, response-tracker, streak-calculator, weekly-summary
- `cognitive-processor`: Background social intelligence processing
- `personality-engine`: Bot personality state management
- `memory-*` (5 functions): writer, consolidator, decay, summary, backfill
- `broadcast-*`: Scheduled broadcast messages
- `overtime-*`, `cancel-ot`, `cancel-dayoff`, `early-checkout-request`: Leave/OT management
- `deposit-*`: Deposit slip management
- `work-*`: Work reminders and check-ins
- `_shared/`: Common utilities (logger, bot-logger, rate-limiter, retry, timezone, validators)

### Database (`supabase/migrations/`)

218 migration files. Key tables:
- **Core**: `groups`, `users`, `messages`, `message_threads`
- **Work**: `tasks` (assignments, todos, reminders)
- **Attendance**: `employees`, `branches`, `attendance_logs`, `attendance_tokens`, `attendance_settings`
- **Receipts**: `receipt_subscriptions`, `receipt_businesses`, `receipt_usage`, `receipt_plans`, `receipt_group_mappings`, `receipt_settings`
- **Intelligence**: `memory_items`, `personality_state`, `user_profiles`
- **Knowledge**: `knowledge_items`, `bot_commands`, `safety_rules`
- **Points/Gamification**: Point-related tables for Happy Points system
- **Config**: `feature_flags`, `ai_query_group_export`

## Key Subsystems

### 1. LINE Webhook Handler (`line-webhook/index.ts`)

The monolithic 11K-line handler processes all LINE events:

- **Text messages**: Parsed for slash commands (`/help`, `/summary`, `/tasks`, etc.) or natural language. In groups, requires bot mention (`@intern`, `@bot`, `@บอท`) unless it's a command. In DMs, always triggers.
- **Image messages**: Routed to receipt scanning (OCR via AI) or attendance photo processing.
- **Postback events**: Handle button interactions from flex messages (receipt approval, etc.)
- **Group events**: join/leave/memberJoined/memberLeft

Message flow:
1. Verify LINE webhook signature (HMAC-SHA256)
2. Parse event type → route to handler
3. For text: parse command → build context (thread, memory, personality) → call AI → send reply
4. Messages are chunked to LINE's 5000-char limit and sent via reply/push API

### 2. AI & Prompts (`utils/prompts.ts`, `utils/ai.ts`)

6 bot modes with distinct personalities:
- **HELPER** (default): Versatile assistant
- **FAQ**: Knowledge base expert
- **REPORT**: Data analyst
- **FUN**: Entertaining/creative
- **SAFETY**: Risk detection
- **MAGIC**: Evolving AI personality with mood and relationships

The prompt system layers: system knowledge → mode behavior → command-specific instructions → conversation context → working memory → long-term memory.

### 3. Attendance System

Employee check-in/check-out flow:
1. Employee sends `checkin`/`เช็คอิน` in DM
2. Bot generates one-time token (10 min expiry) → sends link
3. Employee clicks link → opens web form with camera + GPS
4. `attendance-submit` function validates geofence, saves photo, records log
5. Confirmation sent to DM + group announcement

Admin features: branch geofencing, photo verification, fraud detection, analytics, automated daily summaries, overtime/leave management.

### 4. Receipt Scanning System

AI-powered receipt processing:
1. User sends receipt photo in LINE
2. Image downloaded, converted to base64, sent to AI for OCR
3. Extracted data: vendor, amount, tax ID, items, date
4. Quota checked (per-user monthly limits)
5. Approval workflow with flex message cards (approve/edit/reject buttons)
6. Monthly export capability

### 5. Points & Gamification (Happy Points)

Employee engagement system:
- Points earned for: attendance, response speed, streaks
- Leaderboards, reward shop, redemption with admin approval
- Gacha box system (collectible items in "bags")
- Weekly/monthly summaries

### 6. Employee Portal (`/p/` routes)

Self-service web app for employees (accessed via LIFF or direct URL):
- Check-in/check-out, leave requests, OT requests
- Work history, leave balance, payroll view
- Points leaderboard, reward shop, gacha
- Receipt submission and management
- Manager views: approvals, team summary, daily photos

### 7. Memory & Social Intelligence

- **Working memory**: 24-hour short-term facts
- **Long-term memory**: Persistent items with importance scoring and decay
- **Personality state**: Mood, energy level (0-100), relationship map per user
- **Cognitive processor**: Background analysis of social patterns
- **Cross-group queries**: AI can fetch and synthesize data across multiple LINE groups based on access policies

### 8. Admin Dashboard (`/` routes, protected)

Full management console with role-based access:
- Overview, groups, users, messages, alerts
- Task management, cron job monitoring
- All attendance admin pages (38 pages)
- Knowledge base, commands, safety rules, training
- Bot logs, FAQ logs, broadcast, direct messages
- Settings: user management, roles, API keys, feature flags
- Receipt management and analytics
- Social intelligence views (memory, personality)
- Health monitoring, configuration validator, pre-deploy checklist

## Important Patterns

### Timezone Handling
All timestamps use Bangkok timezone (Asia/Bangkok, UTC+7). The `_shared/timezone.ts` module provides `getBangkokNow()`, `toBangkokTime()`, `getBangkokDateString()`. Never use raw `new Date()` for display or business logic.

### LINE API Interaction
- Reply API (within 1 min of event) vs Push API (anytime)
- Messages chunked to 5000 chars max
- Flex messages for rich interactive content
- Quick replies added to first message chunk
- Rich menu: 3x2 grid (check-in, status, menu, leave, OT, help)

### Multi-language (Thai/English)
- All user-facing strings check `locale === 'th'`
- Command aliases in both languages: `/ถาม` = `/ask`
- AI prompts include language context
- Group-level language setting in database

### Authentication
- Admin dashboard: Supabase Auth (JWT)
- Employee portal: LIFF (LINE Front-end Framework) or employee-menu-validate token
- Attendance: One-time tokens with 10-minute expiry
- Webhook: HMAC-SHA256 signature verification

### Feature Flags
Database-driven feature flags (`feature_flags` table) control feature rollout. Checked via `useFeatureFlags` hook on frontend and queried directly on backend.

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build
npm run test         # Run tests
```

Edge functions are deployed via Lovable Cloud (push to repo triggers deploy). For local edge function testing, use the Supabase CLI.

## Key Files to Know

| File | Lines | Purpose |
|------|-------|---------|
| `supabase/functions/line-webhook/index.ts` | 11,195 | Main bot logic - commands, AI, routing |
| `supabase/functions/line-webhook/handlers/receipt-handler.ts` | 2,247 | Receipt OCR and approval workflow |
| `supabase/functions/line-webhook/utils/cross-group-query.ts` | 804 | Cross-group data querying |
| `supabase/functions/line-webhook/utils/command-parser.ts` | 248 | Command parsing and routing |
| `supabase/functions/line-webhook/utils/prompts.ts` | 201 | AI system prompts and modes |
| `supabase/functions/line-webhook/utils/context-builder.ts` | 209 | Conversation context assembly |
| `src/App.tsx` | ~300 | All route definitions |
| `src/components/DashboardLayout.tsx` | | Admin sidebar navigation |
| `src/components/portal/PortalLayout.tsx` | | Employee portal layout |
| `src/lib/portal-api.ts` | | Portal API client |
| `src/integrations/supabase/client.ts` | | Supabase client config |

## Cron Jobs

Automated scheduled tasks via pg_cron:
- `attendance-daily-summary`: Daily attendance report to LINE groups
- `attendance-reminder`: Check-in/check-out reminders
- `auto-checkout-grace` / `auto-checkout-midnight`: Auto-checkout for forgotten check-outs
- `work-reminder`: Overdue task notifications
- `memory-decay` / `memory-consolidator`: Memory lifecycle management
- `point-*` calculators: Daily/weekly/monthly point calculations
- `broadcast-scheduler`: Scheduled message delivery
- `birthday-reminder`: Birthday notifications
- `deposit-reminder`: Deposit submission reminders

## Common Tasks

**Adding a new bot command**: Add parsing in `command-parser.ts`, implement handler in `index.ts`, register in `bot_commands` database table with `available_in_dm`/`available_in_group` flags.

**Adding a new admin page**: Create page in `src/pages/`, add route in `App.tsx` under the `DashboardLayout` route group, add nav link in `DashboardLayout.tsx`.

**Adding a new portal page**: Create page in `src/pages/portal/`, export from `src/pages/portal/index.ts`, add route in `App.tsx` under the `PortalLayout` route group.

**Adding a new edge function**: Create directory under `supabase/functions/`, add `index.ts`. Use `_shared/` utilities for logging, timezone, rate limiting.

**Database changes**: Create new migration in `supabase/migrations/` with timestamp prefix. Always add RLS policies for new tables.
