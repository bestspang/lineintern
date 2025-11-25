# LINE Webhook Refactoring Plan

## Overview
The original `index.ts` file was **7,527 lines** long - too large for maintainability, testing, and deployment efficiency. This document outlines the modular refactoring strategy.

## ✅ Phase 1: Core Utilities (COMPLETED)

### Files Created:

1. **`types.ts`** (80 lines)
   - All TypeScript interfaces and type definitions
   - Includes: LineEvent, WorkAssignment, ApprovalResult, etc.

2. **`utils/formatters.ts`** (150 lines)
   - Time formatting utilities
   - Task status formatters
   - Language detection

3. **`utils/line-api.ts`** (180 lines)
   - LINE API integration functions
   - Signature verification
   - Reply/Push message functions
   - User/Group profile fetching
   - Quick Reply builders

4. **`utils/validators.ts`** (50 lines)
   - URL validation
   - Suspicious pattern detection
   - Mention extraction
   - Keyword extraction

5. **`utils/ai.ts`** (100 lines)
   - AI generation utilities
   - Work feedback generation
   - Generic Lovable AI caller

## 🔄 Phase 2: Command Handlers (IN PROGRESS)

### Planned Structure:
```
commands/
├── approval.ts          # /confirm command
├── tasks.ts             # /tasks command
├── todo.ts              # /todo command
├── remind.ts            # /remind command
├── summary.ts           # /summary command
├── faq.ts               # /faq command
├── report.ts            # /report command
├── imagine.ts           # /imagine command
├── help.ts              # /help command
├── mode.ts              # /mode command
├── status.ts            # /status command
├── find.ts              # /find command
└── work-progress.ts     # /progress command
```

Each command file should export:
- A detection function (`detect*Command`)
- A handler function (`handle*Command`)

## 🔄 Phase 3: Event Handlers (PLANNED)

```
handlers/
├── message.ts           # Message event handler (main logic)
├── join-leave.ts        # Join/Leave event handlers
├── member-events.ts     # Member joined/left handlers
└── attendance.ts        # Attendance-specific handlers
```

## 🔄 Phase 4: Database Layer (PLANNED)

```
database/
├── groups.ts            # Group CRUD operations
├── users.ts             # User CRUD operations
├── messages.ts          # Message logging
├── tasks.ts             # Task management
├── memory.ts            # Memory system queries
├── alerts.ts            # Alert creation
└── analytics.ts         # Analytics snapshots
```

## 🔄 Phase 5: Final Integration (PLANNED)

### Main `index.ts` Structure (target: ~300 lines):
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifySignature, replyToLine } from "./utils/line-api.ts";
import { handleMessageEvent } from "./handlers/message.ts";
import { handleJoinEvent, handleLeaveEvent } from "./handlers/join-leave.ts";
import { handleMemberJoinedEvent, handleMemberLeftEvent } from "./handlers/member-events.ts";

serve(async (req) => {
  // Health check
  // CORS handling
  // Signature verification
  // Event routing
});
```

## Benefits of This Refactoring

### 1. **Maintainability** ✨
   - Each file has a single responsibility
   - Easy to locate and fix bugs
   - Clear separation of concerns

### 2. **Testability** 🧪
   - Individual functions can be unit tested
   - Mocking becomes straightforward
   - Integration tests are cleaner

### 3. **Performance** ⚡
   - Faster cold starts (smaller chunks)
   - Better tree-shaking
   - Reduced memory footprint

### 4. **Collaboration** 👥
   - Multiple developers can work on different modules
   - Less merge conflicts
   - Easier code reviews

### 5. **Debugging** 🐛
   - Stack traces show specific file names
   - Easier to isolate issues
   - Better logging granularity

## Migration Strategy

### For New Features:
✅ Create new modules in appropriate folders
✅ Import and use in main handler

### For Existing Code:
1. Extract utility functions first (✅ DONE)
2. Extract command handlers next (🔄 IN PROGRESS)
3. Extract event handlers
4. Refactor main index.ts to use modules
5. Test thoroughly before deployment

## Rollback Plan

If issues arise:
1. Git history contains original monolithic file
2. Can revert to previous commit
3. Modular structure is additive - old code still works

## Next Steps

1. **Immediate**: Create command handler modules
2. **Short-term**: Extract event handlers
3. **Medium-term**: Create database layer
4. **Long-term**: Add comprehensive tests for each module

## Critical Bug Fix (COMPLETED)

✅ **Query Key Collision**: Fixed `useAdminRole.ts` query key from `['user-role', user?.id]` to `['user-role-admin-check', user?.id]` to prevent collision with `useUserRole.ts`.

---

Last Updated: 2025-01-XX
Status: Phase 1 Complete, Phase 2 In Progress
