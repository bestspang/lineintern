

## Bag & Reward System Analysis + Development Plan

### Current Status: Working but needs refinements

The core system is functional:
- Database table `employee_bag_items` exists with correct schema + RLS policies for admin
- Portal MyBag page, RewardShop with use_mode flow, and admin BagManagement page all exist
- Edge functions (`point-redemption`, `point-attendance-calculator`) have bag logic integrated
- Streak Shield correctly uses bag system with backward compatibility

---

### Issues Found (ordered by priority)

#### Issue 1: Gacha Box use_mode not set correctly (DATA FIX)
- **Problem**: Original plan said Gacha Box should have `use_mode = 'choose'` but it's currently `use_now`
- **Impact**: Users can't choose to save Gacha Box items to their bag
- **Fix**: Run UPDATE to set `use_mode = 'choose'` for Gacha Box

#### Issue 2: Admin Rewards table doesn't show use_mode column
- **Problem**: The Rewards admin table lists rewards but doesn't display the `use_mode` setting inline, so admins can't see at a glance which mode each reward uses
- **Fix**: Add a "Mode" column to the rewards table in `src/pages/attendance/Rewards.tsx`

#### Issue 3: No item expiration handler
- **Problem**: Bag items have an `expires_at` field but nothing auto-expires them. Items past their expiration date will still show as "Active" until manually changed
- **Fix**: Add an `expired-items-checker` cron or handle expiration in the `portal-data` endpoint when fetching items (filter/update expired items on read)
- **Recommended approach**: Filter on read in `portal-data` (simpler, no new cron needed) - items past `expires_at` should be returned as status `expired` even if DB says `active`

#### Issue 4: Usable rewards should probably be bag items too
- **Problem**: Several rewards like "Late Pass", "WFH Ticket", "Go Home Early", "Sleep In", "Nap Pass" are `use_now` but logically should be kept in bag until the employee wants to use them on a specific day
- **Impact**: Currently these are "redeemed and used instantly" which doesn't make practical sense
- **Fix**: Propose setting these to `choose` so employees can save them for when needed. This is a **business decision** - will ask for confirmation

#### Issue 5: MyBag "Use Item" should show usage rules before confirming
- **Problem**: When clicking "Use Item", the confirm dialog only asks "Do you want to use this item?" but doesn't show the usage_rules so user can understand what will happen
- **Fix**: Include usage_rules text in the confirm dialog in `src/pages/portal/MyBag.tsx`

---

### Implementation Plan

#### Task 1: Data Fix - Gacha Box use_mode
- Run UPDATE on `point_rewards` to set Gacha Box to `choose`

#### Task 2: Add use_mode column to admin Rewards table
- **File**: `src/pages/attendance/Rewards.tsx`
- Add "Mode" column showing use_mode badge (Use Now / Bag Only / Choose)
- 1 file, minimal change

#### Task 3: Handle item expiration on read (portal-data)
- **File**: `supabase/functions/portal-data/index.ts`
- In `my-bag-items` endpoint: after fetching, auto-update items where `expires_at < now()` AND `status = 'active'` to `status = 'expired'`
- This is a "lazy expiration" pattern - no cron needed

#### Task 4: Improve MyBag "Use Item" dialog
- **File**: `src/pages/portal/MyBag.tsx`
- Add usage_rules text to the confirm dialog so user sees conditions before confirming

#### Task 5: (Optional, pending confirmation) Update use_mode for practical rewards
- Set `choose` for: Late Pass (15min), Late Pass (1hr), WFH Ticket, Go Home Early, Sleep In (2hr), Nap Pass, Immunity Card, Deadline Extension
- These are items employees would logically want to save and use on a specific day

### Files to modify
```
src/pages/attendance/Rewards.tsx      - Add use_mode column to table
src/pages/portal/MyBag.tsx            - Improve use confirm dialog  
supabase/functions/portal-data/index.ts - Lazy expiration on read
```

### No impact on existing features
- All changes are additive or display-only
- Lazy expiration only affects items already past their expiry date
- Reward shop and redemption flows unchanged
- Streak Shield logic unchanged

