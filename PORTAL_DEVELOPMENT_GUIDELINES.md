# Employee Portal Development Guidelines

This document outlines the coding standards and patterns that MUST be followed when developing or modifying the Employee Portal Mini App.

## 1. Timezone Handling (CRITICAL)

**All dates displayed in Portal MUST use Bangkok timezone.**

### ✅ CORRECT - Use Bangkok timezone utility
```tsx
import { formatBangkokISODate, getBangkokNow } from '@/lib/timezone';

// For queries with today's date
const today = formatBangkokISODate(new Date());

// For displaying dates
const bangkokNow = getBangkokNow();
```

### ❌ WRONG - Never use raw Date without timezone
```tsx
// NEVER do this
const today = new Date().toISOString().split('T')[0];
const currentYear = new Date().getFullYear();
```

### Backend (Edge Functions)
```typescript
import { getBangkokNow, getBangkokDateString } from '../_shared/timezone.ts';

const today = getBangkokDateString();
```

## 2. Portal Context Usage

Always use `usePortal()` hook to access employee data and permissions:

```tsx
const { employee, locale, isManager, isAdmin, token, refreshData } = usePortal();
```

### Role-Based Access
- `isManager`: Includes manager, supervisor, admin, owner
- `isAdmin`: Only admin and owner

## 3. Branch Filtering for Managers

Managers should only see data from their branch. Admins see all.

```tsx
const fetchRequests = useCallback(async () => {
  let query = supabase.from('table').select('...');
  
  // Filter for managers only
  if (!isAdmin && employee?.branch_id) {
    query = query.eq('employee.branch_id', employee.branch_id);
  }
  
  // OR filter in JavaScript after fetch
  if (isManager && !isAdmin && employee?.branch_id) {
    filtered = data.filter(req => req.employee?.branch_id === employee.branch_id);
  }
}, [isAdmin, isManager, employee?.branch_id]);
```

## 4. Realtime Subscriptions

Approval pages should use realtime subscriptions for instant updates:

```tsx
useEffect(() => {
  fetchRequests();

  const channel = supabase
    .channel('unique-channel-name')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'table_name',
        filter: 'status=eq.pending'
      },
      () => fetchRequests()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [fetchRequests]);
```

## 5. Session Management

The Portal uses token-based authentication stored in `sessionStorage`.

- Tokens auto-refresh at 80% of session duration
- Warning toast shown 5 minutes before expiry
- Use `refreshData()` to manually refresh session

## 6. Localization

Always support both Thai and English:

```tsx
const { locale } = usePortal();

// For labels
{locale === 'th' ? 'อนุมัติ' : 'Approve'}

// For dates
import { th, enUS } from 'date-fns/locale';
const dateLocale = locale === 'th' ? th : enUS;
format(date, 'EEE, d MMM yyyy', { locale: dateLocale })
```

## 7. Error Handling

- Wrap content with `PortalErrorBoundary`
- Use toast for user feedback
- Log errors to console for debugging

```tsx
try {
  // ... operation
  toast.success(locale === 'th' ? 'สำเร็จ' : 'Success');
} catch (error) {
  console.error('Error:', error);
  toast.error(locale === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred');
}
```

## 8. File Structure

```
src/pages/portal/
├── index.tsx           # Barrel export
├── PortalHome.tsx      # Main menu page
├── My*.tsx             # Employee self-service pages
├── Request*.tsx        # Request forms
├── Approve*.tsx        # Manager approval pages
├── Team*.tsx           # Manager team views
└── Daily*.tsx          # Admin summary views

src/components/portal/
├── PortalLayout.tsx    # Layout wrapper
└── PortalErrorBoundary.tsx  # Error handling

src/contexts/
└── PortalContext.tsx   # Portal state management
```

## 9. Common Pitfalls to Avoid

1. **DON'T** use `new Date()` without Bangkok timezone conversion
2. **DON'T** forget to filter by branch for manager views
3. **DON'T** hardcode text - always use locale-aware strings
4. **DON'T** forget to clean up realtime subscriptions
5. **DON'T** expose employee data from other branches to managers

## 10. Testing Checklist

Before deploying Portal changes:

- [ ] Test with different employee roles (employee, manager, admin)
- [ ] Test timezone display (should always show Bangkok time)
- [ ] Test branch filtering for managers
- [ ] Test session expiry warning
- [ ] Test on mobile viewport (Portal is mobile-first)
- [ ] Verify realtime updates work
