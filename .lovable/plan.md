## 1) System analysis

- Admin routes use `ProtectedRoute` and redirect unauthenticated users to `/auth`.
- The custom domain currently serves the latest auth page for unauthenticated `/overview` requests.
- `ProtectedRoute` source already contains the requested buttons: Retry, Home (`ไปหน้าหลัก`), and Sign Out (`ออกจากระบบ`).
- Root route `/` goes through `RootRedirect`, which can send regular browsers to auth or LIFF users to portal.
- Current custom-domain browser inspection shows `/overview` ends up on the Sign In page, not the access-denied card.

## 2) Problem list

1. The requested buttons are already present in source code.
   - `src/components/ProtectedRoute.tsx` already renders both `ไปหน้าหลัก` and `ออกจากระบบ`.
   - So the real issue is not “missing buttons” in current source.

2. The live symptom appears inconsistent across environments/sessions.
   - Static fetch of `https://intern.gem.me/overview` returned a blank shell at one point.
   - Browser navigation and current fetches now show the login page loading correctly.
   - This suggests stale deployed assets, cached authenticated state, or a race during permission bootstrap.

3. There is still one UX gap worth fixing safely.
   - If a user lands on `/auth` with a bad/stale session or after being bounced from `/overview`, there is no explicit “clear session / start over” control on the auth screen.
   - Since the user specifically asked for Home / Sign Out buttons, adding safe escape hatches to `Auth.tsx` is the lowest-risk way to guarantee those actions are visible even when `ProtectedRoute` is bypassed.

## 3) Improvement & feature design

Add explicit recovery actions on the auth page without changing any working auth logic:

- Add a small action row on `src/pages/Auth.tsx`:
  - `ไปหน้าหลัก` → navigate to `/`
  - `ออกจากระบบ` / `ล้าง session` → call `supabase.auth.signOut({ scope: 'local' })` or existing `signOut()` and remain on `/auth`
- Keep `ProtectedRoute` behavior unchanged unless verified broken again.
- Preserve existing sign-in, sign-up, and forgot-password flows exactly as-is.

Why this is safe:
- No contract changes.
- No RLS/auth model changes.
- No route removals.
- Only additive UI on an existing public page.

## 4) Step-by-step implementation plan

1. Update `src/pages/Auth.tsx`
   - Add lightweight recovery buttons above or below the sign-in card.
   - Reuse existing router/auth context patterns.
   - Preserve current validation and form behavior.

2. Keep `src/components/ProtectedRoute.tsx` unchanged unless the source is found missing after re-check.
   - It already includes the requested buttons.

3. Add a short regression pass
   - `/auth` still works for sign in, sign up, forgot password.
   - Clicking Home sends user to `/`.
   - Clicking Sign Out clears stale local session and leaves user on `/auth`.
   - Logged-out access to `/overview` still redirects to `/auth`.
   - Logged-in users still redirect away from `/auth` as before.

## 5) Technical details

Files to touch:
- `src/pages/Auth.tsx`

Preserve:
- Existing auth validation schemas
- Existing toast behavior
- Existing redirect when `user` is already present
- Existing `ProtectedRoute` access-control behavior

Risk:
- Very low. Additive UI only.

Rollback:
- Remove the added action row from `Auth.tsx`.

## 6) Regression & prevention

Smoke checklist:
1. Open `/auth` logged out.
2. Confirm sign-in form still renders.
3. Confirm sign-up tab still works.
4. Confirm forgot-password flow still opens.
5. Click `ไปหน้าหลัก` and verify root redirect works.
6. Return to `/auth` and click `ออกจากระบบ`.
7. Confirm page remains usable and session is cleared.
8. Open `/overview` while logged out and confirm redirect to `/auth`.
9. Log in with a valid admin account and confirm redirect still works.
10. Verify no layout overflow on desktop and mobile widths.

## 7) Doc updates

If implemented, add a DEVLOG note describing:
- Auth-page recovery actions added for stale-session/custom-domain lockout recovery
- No contract changes
- No permission model changes