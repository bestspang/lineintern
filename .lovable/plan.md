

## Fix: Policy Dialog Shows Stale Data After Save/Reopen

### Root Cause

Two bugs in `PolicyDialog` component (`AIQueryControl.tsx` lines 282-378):

1. **Stale state on reopen**: `useState(policy?.source_type || 'group')` etc. (lines 297-306) only set initial values on first mount. When the dialog reopens with a different `policy` prop, React reuses the existing state -- showing old data.

2. **Misused `useState` as side effect**: Lines 324-326 use `useState()` callback to sync `scopeGroupIds` from `existingScopeGroups`. This should be `useEffect`. The current code runs once during component initialization, before the query has loaded, so scope groups are never synced.

### Fix (Surgical, 2 changes)

**File**: `src/pages/settings/AIQueryControl.tsx`

**Change 1** -- Add `useEffect` to reset all form state when `policy` prop changes (replaces reliance on useState initial values):

```typescript
import { useState, useEffect } from 'react';

// Inside PolicyDialog, after the useState declarations:
useEffect(() => {
  setSourceType(policy?.source_type || 'group');
  setSourceGroupId(policy?.source_group_id || '');
  setSourceUserId(policy?.source_user_id || '');
  setScopeMode(policy?.scope_mode || 'all');
  setDataSources(policy?.allowed_data_sources || ['messages']);
  setTimeWindow(policy?.time_window_days || 30);
  setPiiMode(policy?.pii_mode || 'mask_sensitive');
  setMaxHits(policy?.max_hits_per_group || 50);
  setPriority(policy?.priority || 0);
  setScopeGroupIds([]);
}, [policy]);
```

**Change 2** -- Replace the broken `useState` callback (lines 324-326) with a proper `useEffect`:

```typescript
// Replace:
useState(() => {
  if (existingScopeGroups) setScopeGroupIds(existingScopeGroups);
});

// With:
useEffect(() => {
  if (existingScopeGroups) setScopeGroupIds(existingScopeGroups);
}, [existingScopeGroups]);
```

### Impact

- Only touches `PolicyDialog` internal state management
- No API changes, no DB changes, no other components affected
- Existing save logic is unchanged
- After fix: opening a saved policy will correctly show its saved values

### Files Changed

| File | Lines | Change |
|------|-------|--------|
| `src/pages/settings/AIQueryControl.tsx` | 1 (import) | Add `useEffect` to import |
| `src/pages/settings/AIQueryControl.tsx` | ~306-326 | Add `useEffect` for policy sync + fix scope groups sync |

