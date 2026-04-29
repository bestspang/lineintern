# CI: add full vitest job + guarantee npm-log uploads on install failure

Two additive changes to `.github/workflows/smoke.yml` only. Zero changes to source, schema, RLS, edge functions, lockfile, or `package.json`.

## Affected modules

| Item | Status | Action |
|---|---|---|
| `.github/workflows/smoke.yml` | WORKING | Edit — add dedicated install-log upload step + new `vitest` job |
| Existing `smoke` job | WORKING | Preserve order, env, artifact name, and `if: always()` semantics |
| `package.json` `test` script (`vitest run`) | WORKING | Reused as-is by the new job |
| `vitest.config.ts`, `src/test/setup.ts`, existing tests | WORKING | Untouched |
| `package-lock.json`, `.npmrc`, source, edge fns, migrations | WORKING | Untouched |

## What must be preserved

- `npm ci --legacy-peer-deps` (react-day-picker@8 vs date-fns@4 conflict).
- The smoke job's `Verify lockfile completeness (dry-run)` gate and existing artifact name `phase-0b-smoke-${{ github.run_number }}`.
- Existing `Diagnose install failure` step — it already copies the latest `~/.npm/_logs/*-debug-0.log` into `smoke-artifacts/npm-debug.log`. We just guarantee it gets uploaded under a dedicated, easy-to-find artifact name even if the rest of the job aborts before `Upload smoke artifact` runs.
- `// ⚠️ VERIFIED` code paths.

## Plan

### 1. Guarantee npm-install + npm-debug log uploads on failure

Add a focused upload step that runs **only when `npm ci` fails**, immediately after `Diagnose install failure`. It uploads just the two log files under a distinct artifact name so they're trivial to find on the failed run page (without scrolling the larger `phase-0b-smoke-N` bundle).

```yaml
- name: Upload npm install logs (on failure)
  if: failure() && steps.install.outcome == 'failure'
  uses: actions/upload-artifact@v4
  with:
    name: npm-install-logs-${{ github.run_number }}
    # Both files always exist by this point: npm-install.log is written by tee
    # in the install step; npm-debug.log is copied by `Diagnose install failure`.
    # if-no-files-found: warn so we never silently miss an upload.
    path: |
      smoke-artifacts/npm-install.log
      smoke-artifacts/npm-debug.log
    if-no-files-found: warn
    retention-days: 30
```

The existing `Upload smoke artifact` (`if: always()`) is kept — it still bundles the full `smoke-artifacts/` dir for the happy path. The new step is purely additive: a fast, dedicated logs artifact for the failure path.

### 2. New `vitest` job (full suite)

A second job in the same workflow file, running in parallel with `smoke`. It reuses the same install hardening so a dependency-level break is reported by both jobs identically.

```yaml
  vitest:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: package-lock.json

      - name: Remove stray bun artifacts (defensive)
        run: |
          if [ -d node_modules/.bun ]; then
            echo "::warning::Removing stale node_modules/.bun before npm ci"
            rm -rf node_modules/.bun node_modules/.package-lock.json
          fi
          rm -rf node_modules/.cache

      - name: Prepare vitest artifact dir
        if: always()
        run: |
          mkdir -p vitest-artifacts
          : > vitest-artifacts/vitest-output.txt

      - name: Install dependencies
        id: install
        run: |
          set -o pipefail
          npm ci --legacy-peer-deps --no-audit --no-fund 2>&1 \
            | tee vitest-artifacts/npm-install.log

      - name: Diagnose install failure
        if: failure() && steps.install.outcome == 'failure'
        run: |
          {
            echo "## npm ci failed (vitest job) — diagnostic dump"
            echo ""
            echo "### Missing / Invalid lockfile entries"
            echo '```'
            grep -E '^npm error (Missing|Invalid):' vitest-artifacts/npm-install.log \
              | sed 's/^npm error //' | sort -u | head -200 \
              || echo "(none parsed)"
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"
          LOG_DIR="$HOME/.npm/_logs"
          if [ -d "$LOG_DIR" ]; then
            LATEST=$(ls -1t "$LOG_DIR"/*-debug-0.log 2>/dev/null | head -1 || true)
            [ -n "$LATEST" ] && cp "$LATEST" vitest-artifacts/npm-debug.log
          fi

      - name: Upload npm install logs (on failure)
        if: failure() && steps.install.outcome == 'failure'
        uses: actions/upload-artifact@v4
        with:
          name: npm-install-logs-vitest-${{ github.run_number }}
          path: |
            vitest-artifacts/npm-install.log
            vitest-artifacts/npm-debug.log
          if-no-files-found: warn
          retention-days: 30

      - name: Run full vitest suite
        id: vitest
        run: |
          set -o pipefail
          # Reuses the existing `test` script (`vitest run`) — same command
          # contributors run locally. No extra flags, no UI mode, no watch.
          npm test -- --reporter=default --reporter=junit \
            --outputFile.junit=vitest-artifacts/junit.xml 2>&1 \
            | tee vitest-artifacts/vitest-output.txt

      - name: Build vitest summary
        if: always()
        run: |
          OUTPUT_FILE="vitest-artifacts/vitest-output.txt"
          {
            echo "# Full Vitest Suite Results"
            echo ""
            echo "- Commit: \`${GITHUB_SHA}\`"
            echo "- Ref: \`${GITHUB_REF}\`"
            echo "- Run: [#${GITHUB_RUN_NUMBER}](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID})"
            echo ""
            echo '```'
            if [ -s "$OUTPUT_FILE" ]; then
              sed -r 's/\x1B\[[0-9;]*[mK]//g' "$OUTPUT_FILE" | tail -200
            else
              echo "(no vitest output captured — earlier step likely failed before tests ran)"
            fi
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Upload vitest artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: phase-0b-vitest-${{ github.run_number }}
          path: vitest-artifacts/
          retention-days: 30
```

Notes on the test command:
- `npm test` runs `vitest run` (already in `package.json`). The `--` separator forwards extra flags to vitest.
- `--reporter=default --reporter=junit --outputFile.junit=...` writes both human-readable console output (captured by `tee`) **and** a JUnit XML for the artifact. This is a vitest 3.x supported pattern and adds no dependencies.
- No coverage flag — coverage requires `@vitest/coverage-*` which isn't installed; we don't add deps.

### Why a separate job (not a step in `smoke`)

- **Parallelism**: smoke + vitest run concurrently → faster feedback.
- **Independent failure surface**: a vitest red doesn't mask a smoke red and vice-versa; both show up as separate checks on PRs.
- **Same install hardening reused**: dependency-level breaks are still caught fast.

## Regression checklist

- [ ] Existing `smoke` job: step order unchanged; `phase-0b-smoke-${{ github.run_number }}` artifact still produced; `Verify lockfile completeness` still runs.
- [ ] On a forced `npm ci` failure (e.g. corrupt lockfile in a test branch):
  - [ ] `smoke` job uploads `npm-install-logs-N` artifact containing both `npm-install.log` and `npm-debug.log`.
  - [ ] `vitest` job uploads `npm-install-logs-vitest-N` artifact with the same two files.
  - [ ] Job summary shows parsed Missing/Invalid lines.
- [ ] On a happy run: `phase-0b-smoke-N` and `phase-0b-vitest-N` artifacts both produced; `npm-install-logs-*` artifacts NOT produced (failure-only).
- [ ] `npm test` exits 0 against current `main` (current vitest suite passes locally — `src/components/employee-documents/__tests__/upload-flow.test.tsx`).
- [ ] No edits outside `.github/workflows/smoke.yml`.
- [ ] No new dependencies, no `package.json` changes, no lockfile regen.

## Why not bigger changes

- **Add coverage reporting** — requires installing `@vitest/coverage-v8`; out of scope, would change the lockfile.
- **Cache `node_modules` between jobs** — brittle; npm cache (already enabled, lockfile-keyed) is the safer reuse path.
- **Make `vitest` block `smoke` (or vice-versa)** — would serialize feedback for no benefit. Both should fail/pass independently.
- **Merge logs into one giant artifact** — defeats the point of a focused failure-only artifact you can grab in one click.

Approve to apply.
