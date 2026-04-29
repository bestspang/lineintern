# Fix Phase 0B Smoke CI: regenerate stale `package-lock.json`

## Problem (verified)

The GitHub Actions `Phase 0B Smoke` workflow runs:

```
npm ci --legacy-peer-deps
```

`npm ci` refuses to install when `package-lock.json` doesn't exactly match `package.json`. The lockfile is missing every test/devDependency that was added in earlier phases:

- `vitest@^3.2.4`
- `@testing-library/jest-dom@^6.6.0`
- `@testing-library/react@^16.0.0`
- `@testing-library/user-event@^14.5.2`
- `jsdom@^25.0.0`
- `pg@^8.x` (used by `scripts/smoke-test.mjs`)
- plus all their transitive deps (`@vitest/*`, `chai`, `tinypool`, `cssstyle`, `tldts`, etc.)

Locally `bun` is used (lenient with peer deps), so the lockfile drift was never caught. CI uses `npm`, so it fails immediately at the install step — no test ever runs.

## Affected modules

| Item | Status | Action |
|---|---|---|
| `package.json` devDependencies | WORKING — correct | Preserve as-is |
| `package-lock.json` | BROKEN — stale | Regenerate |
| `bun.lockb` | WORKING | Leave untouched |
| `.npmrc` (`legacy-peer-deps=true`) | WORKING | Leave untouched (needed for react-day-picker peer dep) |
| `.github/workflows/smoke.yml` | WORKING | Leave untouched |
| App / edge functions / migrations | WORKING | Do not touch |

## What must be preserved

- All existing `package.json` versions — no upgrades, no downgrades.
- `legacy-peer-deps=true` behavior (react-day-picker@8 vs date-fns@4 conflict — already documented in `smoke.yml`).
- `bun.lockb` for local dev parity.
- All Phase 1C artifacts, RLS hardening, and `// ⚠️ VERIFIED` code paths.

## Plan (minimal diff)

1. **Regenerate the lockfile** in default mode:
   ```bash
   rm package-lock.json
   npm install --legacy-peer-deps --package-lock-only --ignore-scripts
   ```
   - `--package-lock-only` writes only `package-lock.json` (no `node_modules` mutation, no postinstall side effects).
   - `--ignore-scripts` keeps it safe and reproducible.
   - `--legacy-peer-deps` matches the CI flag exactly, so the resulting tree is what CI will install.

2. **Verify** the regenerated lockfile contains the previously-missing entries:
   ```bash
   node -e "const l=require('./package-lock.json'); ['vitest','jsdom','pg','@testing-library/react','@testing-library/jest-dom','@testing-library/user-event'].forEach(p=>console.log(p, !!l.packages['node_modules/'+p]))"
   ```
   All six must print `true`.

3. **Dry-run `npm ci`** locally to confirm CI will pass:
   ```bash
   npm ci --legacy-peer-deps --ignore-scripts --dry-run
   ```
   Must exit 0 with no "Missing/Invalid from lock file" errors.

4. **No code, schema, RLS, or workflow changes.** Only `package-lock.json` is rewritten.

## Regression checklist

- [ ] `package.json` byte-identical before/after (diff shows only lockfile).
- [ ] `bun.lockb` untouched.
- [ ] `npm ci --legacy-peer-deps --dry-run` exits 0.
- [ ] Lockfile lists vitest 3.2.4, jsdom 25.x, pg 8.x, all @testing-library/* at the requested ranges.
- [ ] No new top-level dependencies introduced.
- [ ] No edits under `src/`, `supabase/`, `.github/`, `docs/`, `.lovable/`.

## Why not other fixes

- **Switching CI to `npm install`** — defeats the purpose of `npm ci` (reproducible installs) and is slower; not recommended.
- **Switching CI to bun** — larger change, would need to validate every transitive resolution; not requested.
- **Removing test deps** — would break the existing vitest suites in `src/components/employee-documents/__tests__/`.

Approve to proceed and I'll regenerate the lockfile in default mode.
