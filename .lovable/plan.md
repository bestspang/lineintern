## 1. Affected modules

- `package.json` — currently includes newer dev-only dependencies/scripts.
- `package-lock.json` — currently out of sync with `package.json`.
- `bun.lock` / `bun.lockb` — already include the newer dependencies and should be preserved.
- No attendance, LINE webhook, payroll, point, portal core logic, RLS, or database schema should be touched.

## 2. Status of each module

| Module | Status | Evidence |
|---|---|---|
| Published site | WORKING | `https://lineintern.lovable.app` and `https://intern.gem.me` respond and show the login page. |
| Publish visibility | WORKING | Project is published and `effective_publish_visibility = public`. |
| Vite/dev preview | WORKING | Dev server has no fatal errors; only prior AuthContext timeout warning. |
| Frontend app code | UNKNOWN but not implicated | No publish-request console/network errors were visible in the preview snapshot. |
| `package-lock.json` | BROKEN | `npm ci --dry-run --ignore-scripts` fails because `package.json` and `package-lock.json` are not in sync. |
| Core business logic | WORKING / PROTECTED | No evidence it is related to publishing failure; must not be modified. |

## 3. What must be preserved

- Do not edit `src/integrations/supabase/client.ts` or `src/integrations/supabase/types.ts` manually.
- Do not touch any `// ⚠️ VERIFIED` files or protected flows.
- Do not change routes, UI behavior, authentication, RLS, database schema, or edge functions.
- Preserve current dependency versions in `package.json`; only synchronize the npm lockfile.
- Keep the Phase 1C rollback-safe rules intact.

## 4. What is actually broken

The publish retry is likely failing during the clean install phase, before the app build, because the npm lockfile is stale.

Confirmed command:

```text
npm ci --dry-run --ignore-scripts
```

fails with:

```text
npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.
npm error Missing: @testing-library/jest-dom@6.9.1 from lock file
npm error Missing: @testing-library/react@16.3.2 from lock file
npm error Missing: @testing-library/user-event@14.6.1 from lock file
npm error Missing: jsdom@25.0.1 from lock file
npm error Missing: pg@8.20.0 from lock file
npm error Missing: vitest@3.2.4 from lock file
...
```

This explains why local/dev build can look fine while Publish fails with little detail: publish environments often run a clean install from lockfiles.

## 5. Minimal-diff plan

1. Regenerate only `package-lock.json` from the existing `package.json`.
   - Use lockfile-only install so `package.json` dependencies are not changed.
   - Do not add/remove dependencies.
2. Re-run the same clean-install simulation:
   - `npm ci --dry-run --ignore-scripts`
   - Expected: exit 0.
3. Re-run lightweight safety checks that do not touch core logic:
   - `npm run smoke:quick`
   - `npm run audit:consistency`
4. Inspect changed files and confirm the diff is limited to lockfile synchronization.
5. Update `.lovable/plan.md` only if useful to record the root cause/resolution; otherwise avoid touching docs.

## 6. Code changes

Expected code changes are intentionally minimal:

- Update: `package-lock.json`
- No TypeScript/React/Edge Function/database changes.

## 7. Regression checklist

Before telling you to retry Publish:

- [ ] `npm ci --dry-run --ignore-scripts` passes.
- [ ] `npm run smoke:quick` passes.
- [ ] `npm run audit:consistency` passes.
- [ ] `git diff --stat` shows no core logic files changed.
- [ ] Published URLs remain reachable.

## 8. Doc updates

- If `.lovable/plan.md` is updated, record the real root cause: stale `package-lock.json`, not platform transient issue.
- No user-facing help, attendance docs, or Phase 1C QA docs need changes for this fix.

## Expected result

After this fix, Publish should no longer fail at dependency installation. Then you can retry **Publish → Update** once more.