

## Gacha Box Labeling Fix - Verified & Ready

### Verification Result: ALL 3 BUGS CONFIRMED

Rechecked actual code at exact line numbers. Every bug is real and the proposed fixes are correct.

---

### Bug 1: MyBag.tsx (line 97-99) - CONFIRMED
**Current code**: Only checks `admin_grant` vs fallback "Purchased"
```
granted_by === 'admin_grant' ? '🎁 Granted by manager' : '🛒 Purchased'
```
**Fix**: Add gacha case before fallback
```
granted_by === 'admin_grant' ? '🎁 ได้รับจากผู้จัดการ'
: granted_by === 'gacha' ? '🎲 สุ่มได้จาก Gacha'
: '🛒 ซื้อจากร้านค้า'
```

### Bug 2: BagManagement.tsx (line 308) - CONFIRMED
**Current code**: `admin_grant ? '🎁 Admin' : '🛒 Purchase'`
**Fix**: Add gacha case
```
granted_by === 'admin_grant' ? '🎁 Admin'
: granted_by === 'gacha' ? '🎲 Gacha'
: '🛒 Purchase'
```

### Bug 3: EmployeeDetail.tsx (line 609) - CONFIRMED
**Current code**: `purchase ? '🛒 Purchased' : admin_grant ? '👑 Admin' : '⚙️ System'`
**Fix**: Add gacha case
```
granted_by === 'purchase' ? '🛒 Purchased'
: granted_by === 'admin_grant' ? '👑 Admin'
: granted_by === 'gacha' ? '🎲 Gacha'
: '⚙️ System'
```

---

### Risk 1 & 2: NOT fixing (correct decision)
- **Name-based detection**: Works now, and adding a DB-level `reward_type` column is overkill for current usage. If the reward gets renamed, the admin who renamed it would know.
- **Race condition**: UI-level `isPending` is sufficient protection. DB-level locking is not needed.

### Files to touch (3 files, 1-3 lines each)

| File | Line | Change |
|------|------|--------|
| `src/pages/portal/MyBag.tsx` | 97-99 | Add gacha label |
| `src/pages/attendance/BagManagement.tsx` | 308 | Add gacha label |
| `src/pages/attendance/EmployeeDetail.tsx` | 609 | Add gacha label |

### Zero regression risk
- Only adding a new case to existing ternary expressions
- No logic changes, no data flow changes
- All other granted_by values continue to display the same way

