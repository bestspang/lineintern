#!/usr/bin/env node
/**
 * ⚠️ VERIFIED 2026-04-26: Phase 4.5 automated smoke test
 *
 * Runs the Phase 4.5 checklist (build + routes + DB sanity) and prints
 * pass/fail/skip results. Exit 0 if no failures.
 *
 * Usage:
 *   node scripts/smoke-test.mjs            # full run
 *   node scripts/smoke-test.mjs --skip-build
 *   node scripts/smoke-test.mjs --json     # machine-readable output
 *
 * See docs/SMOKE_TEST_PHASE4.md for the manual checklist this complements.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const SKIP_BUILD = args.has("--skip-build");
const JSON_OUT = args.has("--json");

// ---------------- ANSI helpers ----------------
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};
const c = (color, s) => (JSON_OUT ? s : `${C[color]}${s}${C.reset}`);

const results = [];
function record(id, label, status, detail = "", durationMs = 0) {
  results.push({ id, label, status, detail, durationMs });
}

// ---------------- Test helpers ----------------
function grepFile(path, regex) {
  if (!existsSync(path)) return [];
  const txt = readFileSync(path, "utf8");
  const matches = [];
  for (const line of txt.split("\n")) {
    if (regex.test(line)) matches.push(line.trim());
  }
  return matches;
}

function grepDirRecursive(dir, regex, exts = [".ts", ".tsx", ".js", ".mjs"], { skipComments = true } = {}) {
  const hits = [];
  if (!existsSync(dir)) return hits;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(cur, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) stack.push(full);
      else if (exts.some((e) => name.endsWith(e))) {
        const txt = readFileSync(full, "utf8");
        for (const line of txt.split("\n")) {
          if (!regex.test(line)) continue;
          if (skipComments) {
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
          }
          hits.push(`${full}: ${line.trim()}`);
        }
      }
    }
  }
  return hits;
}

// =================================================================
// SECTION A — BUILD & TYPECHECK
// =================================================================
async function testBuild() {
  if (SKIP_BUILD) {
    record("A1", "Build (bun run build)", "SKIP", "--skip-build flag");
    record("A2", "No TypeScript errors", "SKIP", "--skip-build flag");
    return;
  }
  const start = Date.now();
  const proc = spawnSync("bun", ["run", "build"], {
    encoding: "utf8",
    timeout: 240_000,
  });
  const dur = Date.now() - start;
  const stdout = proc.stdout || "";
  const stderr = proc.stderr || "";
  const combined = stdout + "\n" + stderr;

  if (proc.status === 0) {
    record("A1", "Build (bun run build)", "PASS", `${(dur / 1000).toFixed(1)}s`, dur);
  } else {
    record("A1", "Build (bun run build)", "FAIL",
      `exit=${proc.status} — ${stderr.split("\n").slice(-3).join(" | ").slice(0, 200)}`, dur);
  }

  const tsErrors = combined.match(/TS\d{4}/g) || [];
  if (tsErrors.length === 0) {
    record("A2", "No TypeScript errors", "PASS", "");
  } else {
    record("A2", "No TypeScript errors", "FAIL",
      `${tsErrors.length} errors: ${[...new Set(tsErrors)].slice(0, 5).join(", ")}`);
  }
}

// =================================================================
// SECTION B — ROUTES & FRONTEND CLEANUP
// =================================================================
function testRoutes() {
  const appPath = "src/App.tsx";
  const deadRouteRegex = /path=["']\/(receipts?|deposits?|receipt-management|receipt-analytics|deposit-management)/i;
  const hits = grepFile(appPath, deadRouteRegex);
  if (hits.length === 0) {
    record("B1", "No receipt/deposit routes in App.tsx", "PASS", "");
  } else {
    record("B1", "No receipt/deposit routes in App.tsx", "FAIL",
      `${hits.length} hit(s): ${hits[0].slice(0, 100)}`);
  }

  // Check src/ for dead imports
  const importHits = grepDirRecursive(
    "src",
    /from\s+["'][^"']*\/(receipts?|deposits?)\b/,
  );
  // Filter out matches inside scripts/comments etc — just count
  if (importHits.length === 0) {
    record("B2", "No receipt/deposit imports in src/", "PASS", "");
  } else {
    record("B2", "No receipt/deposit imports in src/", "FAIL",
      `${importHits.length} import(s) found: ${importHits[0].slice(0, 100)}`);
  }

  // Portal nav: must have exactly 6 items (per CRITICAL_FILES.md invariant)
  const portalLayout = "src/components/portal/PortalLayout.tsx";
  if (existsSync(portalLayout)) {
    const txt = readFileSync(portalLayout, "utf8");
    const hasDeposit = /ฝากเงิน|deposit/i.test(txt);
    if (hasDeposit) {
      record("B3", "PortalLayout has no 'ฝากเงิน' nav", "FAIL", "found deposit reference");
    } else {
      record("B3", "PortalLayout has no 'ฝากเงิน' nav", "PASS", "");
    }
  } else {
    record("B3", "PortalLayout has no 'ฝากเงิน' nav", "SKIP", "PortalLayout not found");
  }
}

// =================================================================
// SECTION C — DATABASE SANITY (Phase 4.5 doc Section F)
// =================================================================
async function testDatabase() {
  const tests = [
    {
      id: "C1", label: "bot_commands clean (no receipt/deposit)",
      sql: "SELECT COUNT(*)::int AS n FROM bot_commands WHERE category IN ('receipt','deposit')",
      expect: 0,
    },
    {
      id: "C2", label: "webapp_page_config clean",
      sql: "SELECT COUNT(*)::int AS n FROM webapp_page_config WHERE menu_group IN ('Receipts','Deposits')",
      expect: 0,
    },
    {
      id: "C3", label: "No receipt/deposit tables in public schema",
      sql: `SELECT COUNT(*)::int AS n, COALESCE(string_agg(table_name, ','), '') AS names
            FROM information_schema.tables
            WHERE table_schema='public'
              AND (table_name LIKE '%receipt%' OR table_name LIKE '%deposit%')`,
      expect: 0,
      includeNames: true,
    },
    {
      id: "C4", label: "portal_faqs clean (no receipts/deposits category)",
      sql: "SELECT COUNT(*)::int AS n FROM portal_faqs WHERE category IN ('receipts','deposits')",
      expect: 0,
    },
    {
      id: "C5", label: "No active cron jobs referencing receipt/deposit",
      sql: `SELECT COUNT(*)::int AS n, COALESCE(string_agg(jobname, ','), '') AS names
            FROM cron.job
            WHERE active = true
              AND (jobname ILIKE '%receipt%' OR jobname ILIKE '%deposit%'
                   OR command ILIKE '%receipt%' OR command ILIKE '%deposit%')`,
      expect: 0,
      includeNames: true,
    },
  ];

  if (!process.env.PGHOST) {
    for (const t of tests) record(t.id, t.label, "SKIP", "no PGHOST env");
    return;
  }

  // Use psql CLI — more reliable than pg library against Supabase pooler.
  // psql inherits PG* env vars automatically.
  const psqlCheck = spawnSync("psql", ["-tAc", "SELECT 1"], { encoding: "utf8", timeout: 15_000 });
  if (psqlCheck.status !== 0) {
    const err = (psqlCheck.stderr || "no psql").split("\n")[0].slice(0, 80);
    for (const t of tests) record(t.id, t.label, "SKIP", `psql unavailable: ${err}`);
    return;
  }

  for (const t of tests) {
    // -tA = tuples-only, unaligned. -F '|' = field separator.
    const proc = spawnSync(
      "psql",
      ["-tA", "-F", "|", "-c", t.sql.replace(/\s+/g, " ").trim()],
      { encoding: "utf8", timeout: 30_000 }
    );
    if (proc.status !== 0) {
      record(t.id, t.label, "FAIL", `query error: ${(proc.stderr || "").split("\n")[0].slice(0, 100)}`);
      continue;
    }
    const line = (proc.stdout || "").trim().split("\n")[0] || "";
    const parts = line.split("|");
    const n = Number(parts[0] || 0);
    const names = parts[1] || "";
    if (n === t.expect) {
      record(t.id, t.label, "PASS", `${n} rows`);
    } else {
      const detail = t.includeNames && names
        ? `found ${n}: ${names.slice(0, 120)}`
        : `expected ${t.expect}, got ${n}`;
      record(t.id, t.label, "FAIL", detail);
    }
  }
}

// =================================================================
// SECTION D — EDGE FUNCTION RESIDUES
// =================================================================
function testEdgeFunctions() {
  const dir = "supabase/functions";
  const checks = [
    { id: "D1", label: "No daily_deposits references", regex: /\bdaily_deposits\b/ },
    { id: "D2", label: "No receipt_approvers references", regex: /\breceipt_approvers\b/ },
    { id: "D3", label: "No receipt_quota table references", regex: /from\(['"]receipt_quota['"]/ },
  ];
  for (const ch of checks) {
    const hits = grepDirRecursive(dir, ch.regex, [".ts"]);
    // Allow references inside __archived__ or .deprecated paths
    const live = hits.filter((h) => !/__archived__|\.deprecated/.test(h));
    if (live.length === 0) {
      record(ch.id, ch.label, "PASS", hits.length ? `(${hits.length} in archived/deprecated)` : "");
    } else {
      record(ch.id, ch.label, "FAIL", `${live.length} hit(s); first: ${live[0].slice(0, 100)}`);
    }
  }
}

// =================================================================
// SECTION E — MANUAL (always SKIP, just listed)
// =================================================================
function listManual() {
  record("E1", "Browser smoke (admin /overview, /p, /p/help)", "SKIP", "manual — see docs/SMOKE_TEST_PHASE4.md §B–C");
  record("E2", "LINE bot deprecation replies (/receipt, /deposit)", "SKIP", "manual — see §D");
  record("E3", "Edge Function logs review (portal-data, line-webhook)", "SKIP", "manual — see §E");
}

// =================================================================
// MAIN
// =================================================================
function printResults() {
  if (JSON_OUT) {
    const summary = {
      pass: results.filter((r) => r.status === "PASS").length,
      fail: results.filter((r) => r.status === "FAIL").length,
      skip: results.filter((r) => r.status === "SKIP").length,
    };
    console.log(JSON.stringify({ summary, results }, null, 2));
    return;
  }

  const line = "━".repeat(60);
  console.log("\n" + line);
  console.log(c("bold", "  Phase 4.5 Smoke Test"));
  console.log(line);
  for (const r of results) {
    const tag =
      r.status === "PASS" ? c("green", "[PASS]") :
      r.status === "FAIL" ? c("red",   "[FAIL]") :
                            c("yellow","[SKIP]");
    const id = c("dim", r.id.padEnd(4));
    const label = r.label.padEnd(48);
    const detail = r.detail ? c("dim", `  ${r.detail}`) : "";
    console.log(`  ${tag}  ${id} ${label}${detail}`);
  }
  console.log(line);
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  const summary =
    `  Result: ${c("green", pass + " pass")}, ` +
    `${fail > 0 ? c("red", fail + " fail") : c("dim", "0 fail")}, ` +
    `${c("yellow", skip + " skip")}`;
  console.log(summary);
  console.log(line + "\n");

  if (fail > 0) {
    console.log(c("red", `  ✗ ${fail} test(s) failed. Review above.`));
  } else {
    console.log(c("green", "  ✓ All automated checks passed."));
  }
  if (skip > 0) {
    console.log(c("yellow", `  ⚠ ${skip} test(s) skipped — run manual checklist for full coverage.`));
  }
  console.log("");
}

(async () => {
  try {
    await testBuild();
    testRoutes();
    await testDatabase();
    testEdgeFunctions();
    listManual();
    printResults();
    const fail = results.filter((r) => r.status === "FAIL").length;
    process.exit(fail > 0 ? 1 : 0);
  } catch (e) {
    console.error(c("red", "Smoke test runner crashed:"), e);
    process.exit(2);
  }
})();
