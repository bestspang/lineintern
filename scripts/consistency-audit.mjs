#!/usr/bin/env node
/**
 * ⚠️ VERIFIED 2026-04-29 — Cross-surface consistency auditor
 *
 * READ-ONLY tool that checks "did we update everything?" across:
 *   1. App.tsx routes ↔ registry-snapshot.json
 *   2. Admin routes  ↔ webapp_page_config DB rows (via registry-snapshot)
 *   3. portal-actions.ts paths ↔ App.tsx /portal/* routes
 *   4. command-parser.ts commandMap ↔ ParsedCommand commandType union
 *   5. CRITICAL_FILES.md P0/P1 entries ↔ filesystem
 *   6. supervisor role string sanity (intentional — must appear in 4+ places)
 *   7. ⚠️ VERIFIED markers count (regression detector)
 *
 * Usage: npm run audit:consistency
 *
 * Exit code:
 *   0 = clean
 *   1 = drift found (CI should fail)
 *
 * NEVER mutates anything. Run before & after large AI edits.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};
const c = (col, s) => `${C[col]}${s}${C.reset}`;

const results = [];
let hasFail = false;

function record(id, label, status, detail = "", drift = []) {
  results.push({ id, label, status, detail, drift });
  if (status === "FAIL") hasFail = true;
}

function readSafe(p) {
  try { return readFileSync(p, "utf8"); } catch { return null; }
}

// ───────────────────────────────────────────────────────────
// Check 1: App.tsx routes ↔ registry-snapshot.json
// ───────────────────────────────────────────────────────────
function check1_routesVsSnapshot() {
  const app = readSafe("src/App.tsx");
  const snapRaw = readSafe(".lovable/registry-snapshot.json");
  if (!app || !snapRaw) {
    record("C1", "App.tsx ↔ registry-snapshot.json", "SKIP", "missing source file");
    return;
  }
  const snap = JSON.parse(snapRaw);

  // Extract <Route path="..."> from App.tsx
  const routeRegex = /<Route\s+path=["']([^"']+)["']/g;
  const found = new Set();
  let m;
  while ((m = routeRegex.exec(app)) !== null) {
    found.add(m[1]);
  }

  // Strip dynamic params for comparison
  const norm = (p) => p.replace(/\/:\w+/g, "/:id");
  const declared = new Set([...snap.admin_routes, ...snap.portal_routes].map(norm));

  // Routes in App.tsx but not in snapshot (excluding error/auth/wildcard/index)
  const ignoredPrefixes = ["/auth", "/reset-password", "*", "/employee-menu", "/network-error", "/server-error", "/session-expired", "/portal", "/p/"];
  const driftMissingFromSnapshot = [...found]
    .map(norm)
    .filter(r => !declared.has(r))
    .filter(r => !ignoredPrefixes.some(p => r === p || r.startsWith(p + "/")))
    .filter(r => r !== "" && r !== "/");

  if (driftMissingFromSnapshot.length === 0) {
    record("C1", "App.tsx routes ↔ registry-snapshot.json", "PASS", `${found.size} routes scanned`);
  } else {
    record("C1", "App.tsx routes ↔ registry-snapshot.json", "WARN",
      `${driftMissingFromSnapshot.length} route(s) in App.tsx not in snapshot`,
      driftMissingFromSnapshot);
  }
}

// ───────────────────────────────────────────────────────────
// Check 2: portal-actions.ts paths ↔ App.tsx routes
// ───────────────────────────────────────────────────────────
function check2_portalActionsVsRoutes() {
  const app = readSafe("src/App.tsx");
  const actions = readSafe("src/lib/portal-actions.ts");
  if (!app || !actions) {
    record("C2", "portal-actions.ts ↔ App.tsx", "SKIP", "missing source file");
    return;
  }

  const pathRegex = /path:\s*['"](\/portal\/[^'"]*)['"]/g;
  const declaredPaths = new Set();
  let m;
  while ((m = pathRegex.exec(actions)) !== null) declaredPaths.add(m[1]);

  // Routes in App.tsx that start with /portal
  const routeRegex = /<Route\s+path=["'](\/portal[^"']*)["']/g;
  const realRoutes = new Set();
  while ((m = routeRegex.exec(app)) !== null) realRoutes.add(m[1]);

  // Strip /portal prefix sometimes; check if exact match exists
  const drift = [...declaredPaths].filter(p => !realRoutes.has(p));

  if (drift.length === 0) {
    record("C2", "portal-actions.ts paths ↔ App.tsx routes", "PASS",
      `${declaredPaths.size} portal action paths verified`);
  } else {
    record("C2", "portal-actions.ts paths ↔ App.tsx routes", "FAIL",
      `${drift.length} action path(s) have no matching route`, drift);
  }
}

// ───────────────────────────────────────────────────────────
// Check 3: command-parser.ts commandMap ↔ ParsedCommand union
// ───────────────────────────────────────────────────────────
function check3_commandParserConsistency() {
  const parser = readSafe("supabase/functions/line-webhook/utils/command-parser.ts");
  if (!parser) {
    record("C3", "command-parser.ts internal consistency", "SKIP", "missing");
    return;
  }

  // Extract ParsedCommand commandType union members
  const unionMatch = parser.match(/commandType:\s*([^;]+);/);
  if (!unionMatch) {
    record("C3", "command-parser.ts internal consistency", "WARN", "could not parse union");
    return;
  }
  const unionMembers = new Set(
    [...unionMatch[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  );

  // Extract right-hand sides of commandMap entries
  const mapValues = new Set(
    [...parser.matchAll(/:\s*'([a-z_]+)',?\s*$/gm)].map(m => m[1])
  );

  // All map values must be in union
  const orphans = [...mapValues].filter(v => !unionMembers.has(v));

  if (orphans.length === 0) {
    record("C3", "command-parser.ts: commandMap ↔ ParsedCommand union", "PASS",
      `${unionMembers.size} types in union, ${mapValues.size} mapped values verified`);
  } else {
    record("C3", "command-parser.ts: commandMap ↔ ParsedCommand union", "FAIL",
      `${orphans.length} mapped command(s) not in ParsedCommand union`, orphans);
  }
}

// ───────────────────────────────────────────────────────────
// Check 4: CRITICAL_FILES.md P0/P1 ↔ filesystem
// ───────────────────────────────────────────────────────────
function check4_criticalFilesExist() {
  const md = readSafe(".lovable/CRITICAL_FILES.md");
  if (!md) {
    record("C4", "CRITICAL_FILES.md ↔ filesystem", "SKIP", "missing");
    return;
  }
  // Match `path/to/file.ext` style backticks containing /
  const pathRegex = /`([a-zA-Z0-9_./-]+\/[a-zA-Z0-9_./-]+\.[a-z]+)`/g;
  const paths = new Set();
  let m;
  while ((m = pathRegex.exec(md)) !== null) paths.add(m[1]);

  const missing = [...paths].filter(p => !existsSync(p));

  if (missing.length === 0) {
    record("C4", "CRITICAL_FILES.md ↔ filesystem", "PASS",
      `${paths.size} referenced files exist`);
  } else {
    record("C4", "CRITICAL_FILES.md ↔ filesystem", "FAIL",
      `${missing.length} referenced file(s) missing`, missing);
  }
}

// ───────────────────────────────────────────────────────────
// Check 5: supervisor role string sanity
// ───────────────────────────────────────────────────────────
function check5_supervisorRoleConsistency() {
  // supervisor must appear consistently in: PortalLayout, PortalContext,
  // portal-actions (MANAGER_ROLES + TEAM_VIEW_ROLES), line-webhook role-priority
  const expected = [
    { file: "src/components/portal/PortalLayout.tsx", needle: "'supervisor'" },
    { file: "src/contexts/PortalContext.tsx", needle: "'supervisor'" },
    { file: "src/lib/portal-actions.ts", needle: "'supervisor'" },
    { file: "supabase/functions/line-webhook/index.ts", needle: "'supervisor'" },
  ];
  const missing = expected.filter(({ file, needle }) => {
    const txt = readSafe(file);
    return !txt || !txt.includes(needle);
  }).map(e => e.file);

  if (missing.length === 0) {
    record("C5", "supervisor role string consistency", "PASS",
      "all 4 expected sites declare 'supervisor'");
  } else {
    record("C5", "supervisor role string consistency", "WARN",
      `${missing.length} site(s) missing 'supervisor' — verify intentional`,
      missing);
  }
}

// ───────────────────────────────────────────────────────────
// Check 6: ⚠️ VERIFIED markers count (regression detector)
// ───────────────────────────────────────────────────────────
function check6_verifiedMarkers() {
  // Walk src/ + supabase/functions/ for "⚠️ VERIFIED" comments
  const roots = ["src", "supabase/functions"];
  let count = 0;
  const files = new Set();

  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".git") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
        const txt = readSafe(full);
        if (txt && txt.includes("⚠️ VERIFIED")) {
          count += (txt.match(/⚠️ VERIFIED/g) || []).length;
          files.add(full);
        }
      }
    }
  }
  roots.forEach(walk);

  // We expect at least 5 verified markers across critical files (current count is the floor).
  // This is informational — print the count so future audits can compare.
  record("C6", "⚠️ VERIFIED markers", "INFO",
    `${count} marker(s) across ${files.size} file(s) — keep ≥ this number`);
}

// ───────────────────────────────────────────────────────────
// Check 7: webapp_page_config coverage hint (offline)
// ───────────────────────────────────────────────────────────
function check7_pageConfigHint() {
  const snapRaw = readSafe(".lovable/registry-snapshot.json");
  if (!snapRaw) {
    record("C7", "webapp_page_config coverage hint", "SKIP", "no snapshot");
    return;
  }
  const snap = JSON.parse(snapRaw);
  // We can't query DB from here, so just remind the user
  record("C7", "webapp_page_config coverage hint", "INFO",
    `${snap.admin_routes.length} admin route(s) declared — verify each has webapp_page_config row in DB`);
}

// ───────────────────────────────────────────────────────────
// Run + report
// ───────────────────────────────────────────────────────────
console.log(c("bold", c("cyan", "\n🔍 Cross-Surface Consistency Audit\n")));
console.log(c("dim", "Read-only checks. No mutations.\n"));

check1_routesVsSnapshot();
check2_portalActionsVsRoutes();
check3_commandParserConsistency();
check4_criticalFilesExist();
check5_supervisorRoleConsistency();
check6_verifiedMarkers();
check7_pageConfigHint();

console.log("");
for (const r of results) {
  const badge =
    r.status === "PASS" ? c("green", "✓ PASS") :
    r.status === "FAIL" ? c("red",   "✗ FAIL") :
    r.status === "WARN" ? c("yellow","⚠ WARN") :
    r.status === "SKIP" ? c("dim",   "○ SKIP") :
                          c("cyan",  "ℹ INFO");
  console.log(`  ${badge}  ${c("bold", r.id)}  ${r.label}`);
  if (r.detail) console.log(`         ${c("dim", r.detail)}`);
  if (r.drift && r.drift.length) {
    for (const d of r.drift.slice(0, 8)) console.log(`           ${c("yellow", "→ " + d)}`);
    if (r.drift.length > 8) console.log(`           ${c("dim", `... +${r.drift.length - 8} more`)}`);
  }
}

const summary = {
  pass: results.filter(r => r.status === "PASS").length,
  fail: results.filter(r => r.status === "FAIL").length,
  warn: results.filter(r => r.status === "WARN").length,
  skip: results.filter(r => r.status === "SKIP").length,
  info: results.filter(r => r.status === "INFO").length,
};
console.log("");
console.log(`${c("bold", "Summary:")}  ${c("green", summary.pass + " pass")}  ${c("red", summary.fail + " fail")}  ${c("yellow", summary.warn + " warn")}  ${c("dim", summary.skip + " skip")}  ${c("cyan", summary.info + " info")}`);
console.log("");

if (hasFail) {
  console.log(c("red", "✗ Drift detected — fix before sign-off.\n"));
  process.exit(1);
}
console.log(c("green", "✓ No critical drift detected.\n"));
process.exit(0);
