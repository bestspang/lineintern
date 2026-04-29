# CI Hardening: cache, diagnostics, bun-cleanup, dry-run gate

Four small, additive improvements to `.github/workflows/smoke.yml` (+ one tiny `package.json` script). Zero changes to app code, schema, RLS, edge functions, lockfile, or tests.

## Affected modules

| Item | Status | Action |
|---|---|---|
| `.github/workflows/smoke.yml` | WORKING | Edit — add cache, diagnostics, dry-run, bun-cleanup step |
| `package.json` `scripts` | WORKING | Add one helper script `clean:bun` (additive only) |
| `package-lock.json` | WORKING — just regenerated | Untouched |
| `.npmrc` | WORKING | Untouched |
| `bun.lockb`, source, edge fns, migrations, RLS | WORKING | Untouched |

## What must be preserved

- `npm ci --legacy-peer-deps` as the install command (the `--legacy-peer-deps` flag is required — react-day-picker@8 vs date-fns@4).
- Existing smoke-artifact upload + job-summary append behavior.
- `if: always()` semantics so artifacts upload even on failure.
- All `// ⚠️ VERIFIED` code paths.

## Plan

### 1. Enable npm cache keyed on the lockfile

`actions/setup-node@v4` already supports it — just add `cache-dependency-path` to make the key deterministic:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: "npm"
    cache-dependency-path: package-lock.json
```

Reuses the cache when `package-lock.json` is byte-identical; busts automatically on any lockfile change. No risk to reproducibility — `npm ci` still verifies integrity hashes against the cached tarballs.

### 2. Bun-artifact cleanup step (before install)

Add a step that runs **before** `npm ci`. On a fresh GH runner this is a no-op, but it's defensive against any future caching layer that might restore a `node_modules/.bun` tree (the exact symptom we hit locally — arborist crashed with `Cannot read properties of null (reading 'matches')`):

```yaml
- name: Remove stray bun artifacts (defensive)
  run: |
    if [ -d node_modules/.bun ]; then
      echo "::warning::Removing stale node_modules/.bun before npm ci"
      rm -rf node_modules/.bun node_modules/.package-lock.json
    fi
    rm -rf node_modules/.cache
```

Plus a matching `package.json` script for local parity:

```json
"clean:bun": "rm -rf node_modules/.bun node_modules/.package-lock.json node_modules/.cache"
```

### 3. Enhanced install diagnostics

Wrap `npm ci` so any failure dumps:
- the full npm debug log (`/home/runner/.npm/_logs/*-debug-0.log`)
- a parsed list of `Missing:` / `Invalid:` lines from the captured output (the exact info that took us a round-trip to find earlier)

```yaml
- name: Install dependencies
  id: install
  run: |
    set -o pipefail
    mkdir -p smoke-artifacts
    npm ci --legacy-peer-deps --no-audit --no-fund 2>&1 \
      | tee smoke-artifacts/npm-install.log
  # No `continue-on-error` — we still want the job to fail. The next step uses if: failure().

- name: Diagnose install failure
  if: failure() && steps.install.outcome == 'failure'
  run: |
    echo "## npm ci failed — diagnostic dump" >> "$GITHUB_STEP_SUMMARY"
    echo '### Missing / Invalid lockfile entries' >> "$GITHUB_STEP_SUMMARY"
    echo '```' >> "$GITHUB_STEP_SUMMARY"
    grep -E '^npm error (Missing|Invalid):' smoke-artifacts/npm-install.log \
      | sed 's/^npm error //' | sort -u | head -200 >> "$GITHUB_STEP_SUMMARY" || echo "(none parsed)" >> "$GITHUB_STEP_SUMMARY"
    echo '```' >> "$GITHUB_STEP_SUMMARY"

    # Copy the most recent npm debug log into artifacts.
    LOG_DIR="$HOME/.npm/_logs"
    if [ -d "$LOG_DIR" ]; then
      LATEST=$(ls -1t "$LOG_DIR"/*-debug-0.log 2>/dev/null | head -1 || true)
      if [ -n "$LATEST" ]; then
        cp "$LATEST" smoke-artifacts/npm-debug.log
        echo "Copied $LATEST → smoke-artifacts/npm-debug.log"
        echo '### Tail of npm debug log (last 80 lines)' >> "$GITHUB_STEP_SUMMARY"
        echo '```' >> "$GITHUB_STEP_SUMMARY"
        tail -80 "$LATEST" >> "$GITHUB_STEP_SUMMARY"
        echo '```' >> "$GITHUB_STEP_SUMMARY"
      fi
    fi
```

The existing `Upload smoke artifact` step already runs with `if: always()` and uploads everything in `smoke-artifacts/`, so both `npm-install.log` and `npm-debug.log` will be downloadable from the run page.

### 4. `npm ci --dry-run` verification gate

Insert a quick verification step **after** install succeeds and **before** smoke tests run. It re-runs the resolver against the lockfile in dry mode — a few seconds, no writes — to catch any drift the live install masked (e.g. optional deps satisfied by cache but missing from lock):

```yaml
- name: Verify lockfile completeness
  run: |
    npm ci --legacy-peer-deps --ignore-scripts --dry-run \
      --prefix /tmp/npm-verify-$$ --cache /tmp/npm-cache-$$ \
      --userconfig /dev/null 2>&1 | tail -20
```

Using a throwaway `--prefix` avoids touching the real `node_modules`. If the dry-run reports any `Missing:` or `Invalid:`, the job fails with a clear signal that the lockfile is out of sync — exactly the failure mode we just fixed, surfaced one step earlier.

## Final workflow shape (order)

```text
checkout
  → setup-node (with cache)
  → remove stray bun artifacts
  → prepare smoke-artifacts dir
  → npm ci  (with logging)         ←── on failure: diagnose step
  → verify lockfile (dry-run)      ←── new gate
  → npm run smoke:quick
  → build summary
  → upload artifacts (always)
```

## Regression checklist

- [ ] `package.json` diff: only the new `clean:bun` script line added.
- [ ] `package-lock.json`: byte-identical (no regeneration).
- [ ] Workflow still runs `npm ci --legacy-peer-deps` (flag preserved).
- [ ] Smoke-test step (`npm run smoke:quick`) and artifact upload paths unchanged.
- [ ] First post-merge run populates the npm cache; subsequent runs hit it (visible as "Cache restored" in setup-node logs).
- [ ] On a forced lockfile-drift (delete one entry from `package-lock.json` in a test branch), the workflow fails at the **verify** step with parsed Missing/Invalid output in the job summary.
- [ ] No edits under `src/`, `supabase/`, `docs/`, `.lovable/`.

## Why not bigger changes

- **Switch CI to bun**: out of scope; would need re-validating every transitive resolution and changes to artifact paths.
- **Cache `node_modules` directly**: brittle across Node versions and breaks `npm ci`'s integrity guarantee. The package-cache approach (built into setup-node) is safer.
- **Auto-regenerate the lockfile on drift**: silent self-healing hides the real problem. The dry-run gate fails loudly instead — which is what we want.

Approve to apply.
