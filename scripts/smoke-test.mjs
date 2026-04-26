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
function record(id, label, status, detail = "", durationMs = 0, hint = "") {
  results.push({ id, label, status, detail, durationMs, hint });
}

// ---------------- Test helpers ----------------
function grepFile(path, regex) {
  if (!existsSync(path)) return [];
  const txt = readFileSync(path, "utf8");
  const matches = [];
  const lines = txt.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      matches.push({ line: i + 1, text: lines[i].trim(), file: path });
    }
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
        const lines = txt.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          if (!regex.test(ln)) continue;
          if (skipComments) {
            const trimmed = ln.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
          }
          hits.push({ file: full, line: i + 1, text: ln.trim() });
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
      `exit=${proc.status} — ${stderr.split("\n").slice(-3).join(" | ").slice(0, 200)}`, dur,
      `Run \`bun run build\` directly to see full output. Likely causes: missing import, syntax error, or new dep not installed (\`bun install\`).`);
  }

  const tsErrors = combined.match(/TS\d{4}/g) || [];
  // Extract first "file.tsx(line,col): error TS####" pattern for actionable hint
  const firstTsLoc = combined.match(/([\w./-]+\.tsx?)\((\d+),\d+\):\s*error\s+(TS\d+)/);
  if (tsErrors.length === 0) {
    record("A2", "No TypeScript errors", "PASS", "");
  } else {
    const hint = firstTsLoc
      ? `Open \`${firstTsLoc[1]}:${firstTsLoc[2]}\` — first error: ${firstTsLoc[3]}. Common: undefined var after deletion, wrong .select() chain (see CRITICAL_FILES.md §Supabase Query Patterns), or stale import.`
      : `Run \`bun run build\` to see file:line of each TS error.`;
    record("A2", "No TypeScript errors", "FAIL",
      `${tsErrors.length} errors: ${[...new Set(tsErrors)].slice(0, 5).join(", ")}`, 0, hint);
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
    const locs = hits.slice(0, 3).map((h) => `${h.file}:${h.line}`).join(", ");
    record("B1", "No receipt/deposit routes in App.tsx", "FAIL",
      `${hits.length} hit(s): "${hits[0].text.slice(0, 80)}"`, 0,
      `Open ${locs} and remove the <Route> + lazy import. Phase 2-4 deleted these features (see CRITICAL_FILES.md §Behavioral Invariants #4). Also check src/lib/portal-actions.ts doesn't reference removed paths.`);
  }

  // Check src/ for dead imports
  const importHits = grepDirRecursive(
    "src",
    /from\s+["'][^"']*\/(receipts?|deposits?)\b/,
  );
  if (importHits.length === 0) {
    record("B2", "No receipt/deposit imports in src/", "PASS", "");
  } else {
    const locs = importHits.slice(0, 3).map((h) => `${h.file}:${h.line}`).join(", ");
    record("B2", "No receipt/deposit imports in src/", "FAIL",
      `${importHits.length} import(s) found`, 0,
      `Open ${locs}. Remove import + the component usage that references the deleted module. If the file itself is dead, delete it.`);
  }

  // Portal nav: must have exactly 6 items (per CRITICAL_FILES.md invariant)
  const portalLayout = "src/components/portal/PortalLayout.tsx";
  if (existsSync(portalLayout)) {
    const matches = grepFile(portalLayout, /ฝากเงิน|deposit/i);
    if (matches.length > 0) {
      const locs = matches.slice(0, 2).map((m) => `:${m.line}`).join(", ");
      record("B3", "PortalLayout has no 'ฝากเงิน' nav", "FAIL",
        `${matches.length} reference(s)`, 0,
        `Open ${portalLayout}${locs}. Remove the deposit nav item — bottom nav must stay at exactly 6 items (CRITICAL_FILES.md §P1 invariant).`);
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
      hint: `Create a migration: DELETE FROM bot_commands WHERE category IN ('receipt','deposit'). Also verify command-parser.ts has no matching commandType (CRITICAL_FILES.md §P0).`,
    },
    {
      id: "C2", label: "webapp_page_config clean",
      sql: "SELECT COUNT(*)::int AS n FROM webapp_page_config WHERE menu_group IN ('Receipts','Deposits')",
      expect: 0,
      hint: `Migration: DELETE FROM webapp_page_config WHERE menu_group IN ('Receipts','Deposits'). These rows drive sidebar nav — leftovers cause ghost menu items.`,
    },
    {
      id: "C3", label: "No receipt/deposit tables in public schema",
      sql: `SELECT COUNT(*)::int AS n, COALESCE(string_agg(table_name, ','), '') AS names
            FROM information_schema.tables
            WHERE table_schema='public'
              AND (table_name LIKE '%receipt%' OR table_name LIKE '%deposit%')`,
      expect: 0,
      includeNames: true,
      hint: `Migration: DROP TABLE public.<name> CASCADE for each leftover. Check FK refs in information_schema.table_constraints first to avoid breaking other tables.`,
    },
    {
      id: "C4", label: "portal_faqs clean (no receipts/deposits category)",
      sql: "SELECT COUNT(*)::int AS n FROM portal_faqs WHERE category IN ('receipts','deposits')",
      expect: 0,
      hint: `Migration: DELETE FROM portal_faqs WHERE category IN ('receipts','deposits'). Otherwise Help.tsx may render empty category tabs.`,
    },
    {
      id: "C5", label: "No active cron jobs referencing receipt/deposit",
      // Use SECURITY DEFINER function — direct cron schema is restricted
      sql: `SELECT COUNT(*)::int AS n,
                   COALESCE(string_agg(jobname, ','), '') AS names
            FROM public.get_cron_jobs()
            WHERE active = true
              AND (jobname ILIKE '%receipt%' OR jobname ILIKE '%deposit%'
                   OR command ILIKE '%receipt%' OR command ILIKE '%deposit%')`,
      expect: 0,
      includeNames: true,
      hint: `Migration: SELECT cron.unschedule('<jobname>') for each leftover job. Sync src/pages/CronJobs.tsx description map with reality afterward.`,
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
      const err = (proc.stderr || "").split("\n")[0].slice(0, 100);
      const hint = /permission denied/i.test(err)
        ? `Permission denied — wrap query in a SECURITY DEFINER function (see public.get_cron_jobs() pattern in supabase/migrations/).`
        : /does not exist/i.test(err)
          ? `Table/function missing — schema drifted. Re-run latest migration or update this check's SQL.`
          : `Run the SQL manually via Lovable Cloud SQL editor to debug.`;
      record(t.id, t.label, "FAIL", `query error: ${err}`, 0, hint);
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
      record(t.id, t.label, "FAIL", detail, 0, t.hint || "");
    }
  }
}

// =================================================================
// SECTION D — EDGE FUNCTION RESIDUES
// =================================================================
function testEdgeFunctions() {
  const dir = "supabase/functions";
  const checks = [
    {
      id: "D1", label: "No daily_deposits references", regex: /\bdaily_deposits\b/,
      hint: `Phase 2 removed daily_deposits. Replace with HR-focused equivalent or delete the call. Likely in supabase/functions/portal-data/index.ts.`,
    },
    {
      id: "D2", label: "No receipt_approvers references", regex: /\breceipt_approvers\b/,
      hint: `Phase 4 removed receipt approval flow. Delete the approver lookup + any flex message that uses it. Check line-webhook/handlers/.`,
    },
    {
      id: "D3", label: "No receipt_quota table references", regex: /from\(['"]receipt_quota['"]/,
      hint: `Phase 4 removed quota system. Remove the supabase.from('receipt_quota') call and any quota-check branch.`,
    },
  ];
  for (const ch of checks) {
    const hits = grepDirRecursive(dir, ch.regex, [".ts"]);
    // Allow references inside __archived__ or .deprecated paths
    const live = hits.filter((h) => !/__archived__|\.deprecated/.test(h.file));
    if (live.length === 0) {
      record(ch.id, ch.label, "PASS", hits.length ? `(${hits.length} in archived/deprecated)` : "");
    } else {
      const locs = live.slice(0, 3).map((h) => `${h.file}:${h.line}`).join(", ");
      record(ch.id, ch.label, "FAIL", `${live.length} hit(s)`, 0,
        `Open ${locs}. ${ch.hint}`);
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

  // Actionable hints section — only for FAILs
  const fails = results.filter((r) => r.status === "FAIL");
  if (fails.length > 0) {
    console.log(c("bold", "\n  ⚠ Remediation Hints"));
    console.log("  " + "─".repeat(58));
    for (const r of fails) {
      console.log(`  ${c("red", r.id)} ${c("bold", r.label)}`);
      if (r.detail) console.log(c("dim", `      what: ${r.detail}`));
      if (r.hint) {
        // wrap hint at ~80 cols for readability
        const wrapped = r.hint.match(/.{1,80}(\s|$)/g) || [r.hint];
        wrapped.forEach((w, i) => {
          console.log(c("cyan", `      ${i === 0 ? "fix : " : "      "}${w.trim()}`));
        });
      } else {
        console.log(c("dim", "      fix : (no hint registered — see docs/SMOKE_TEST_PHASE4.md)"));
      }
      console.log("");
    }
  }

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = fails.length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  const summary =
    `  Result: ${c("green", pass + " pass")}, ` +
    `${fail > 0 ? c("red", fail + " fail") : c("dim", "0 fail")}, ` +
    `${c("yellow", skip + " skip")}`;
  console.log(line);
  console.log(summary);
  console.log(line + "\n");

  if (fail > 0) {
    console.log(c("red", `  ✗ ${fail} test(s) failed. See remediation hints above.`));
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
