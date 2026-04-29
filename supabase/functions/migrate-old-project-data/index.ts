// Migration: pull data from old Supabase project (bjzzqfzgnslefqhnsmla) into current project
// Period: 2026-03-05 → now
// Modes: ?dry_run=true (default) | ?dry_run=false to actually insert
// Auth: requires admin JWT

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OLD_PROJECT_URL = "https://bjzzqfzgnslefqhnsmla.supabase.co";
const SINCE = "2026-03-05T00:00:00Z";

// table → { timestamp_col, conflict_cols (for skip-on-duplicate), select_cols ('*' default) }
const TABLES = [
  { name: "groups", ts: "updated_at", upsert_on: "line_group_id" },
  { name: "users", ts: "updated_at", upsert_on: "line_user_id" },
  { name: "messages", ts: "sent_at", upsert_on: "line_message_id" },
  { name: "attendance_logs", ts: "server_time", upsert_on: null /* composite handled below */ },
  { name: "point_transactions", ts: "created_at", upsert_on: null /* by id */ },
  { name: "happy_points", ts: "updated_at", upsert_on: "employee_id" },
] as const;

interface TableResult {
  table: string;
  fetched: number;
  to_insert: number;
  to_skip_existing: number;
  inserted: number;
  errors: string[];
  sample_error?: string;
}

async function fetchOld(token: string, table: string, ts: string, since: string, offset: number, limit: number) {
  const url = `${OLD_PROJECT_URL}/rest/v1/${table}?${ts}=gte.${since}&order=${ts}.asc&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { apikey: token, Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Old ${table} fetch ${res.status}: ${txt.slice(0, 200)}`);
  }
  return await res.json() as any[];
}

async function getExistingIds(supabase: any, table: string, col: string, values: any[]): Promise<Set<string>> {
  if (values.length === 0) return new Set();
  const set = new Set<string>();
  // chunk to avoid URL length limits
  const chunkSize = 200;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize).filter(v => v !== null && v !== undefined);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase.from(table).select(col).in(col, chunk);
    if (error) throw new Error(`Existing fetch ${table}.${col}: ${error.message}`);
    (data || []).forEach((r: any) => set.add(String(r[col])));
  }
  return set;
}

async function processTable(
  supabase: any,
  oldKey: string,
  table: string,
  ts: string,
  upsertOn: string | null,
  dryRun: boolean,
): Promise<TableResult> {
  const result: TableResult = {
    table, fetched: 0, to_insert: 0, to_skip_existing: 0, inserted: 0, errors: [],
  };

  // Page through old data
  const PAGE = 1000;
  let offset = 0;
  const allRows: any[] = [];
  while (true) {
    const batch = await fetchOld(oldKey, table, ts, SINCE, offset, PAGE);
    allRows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
    if (allRows.length > 50000) {
      result.errors.push(`stopped at 50k rows for safety`);
      break;
    }
  }
  result.fetched = allRows.length;
  if (allRows.length === 0) return result;

  // Determine conflict key column for dedup
  let dedupCol: string | null = upsertOn;
  if (!dedupCol) dedupCol = "id";

  // Find existing rows in current DB
  const keys = allRows.map(r => r[dedupCol!]).filter(v => v !== null && v !== undefined);
  const existing = await getExistingIds(supabase, table, dedupCol, keys);

  const toInsert = allRows.filter(r => !existing.has(String(r[dedupCol!])));
  result.to_skip_existing = allRows.length - toInsert.length;
  result.to_insert = toInsert.length;

  if (dryRun || toInsert.length === 0) return result;

  // Insert in chunks
  const INS_CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += INS_CHUNK) {
    const slice = toInsert.slice(i, i + INS_CHUNK);
    const { error } = await supabase.from(table).insert(slice);
    if (error) {
      result.errors.push(`chunk ${i}: ${error.message}`);
      if (!result.sample_error) result.sample_error = error.message;
      // try one-by-one to salvage
      for (const row of slice) {
        const { error: e2 } = await supabase.from(table).insert(row);
        if (!e2) result.inserted += 1;
      }
    } else {
      result.inserted += slice.length;
    }
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth check — admin only
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: roles } = await supabase
    .from("user_roles").select("role").eq("user_id", userData.user.id);
  const isAdmin = (roles || []).some((r: any) => ["owner", "admin"].includes(r.role));
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden — admin/owner only" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const oldKey = Deno.env.get("OLD_PROJECT_SERVICE_KEY");
  if (!oldKey) {
    return new Response(JSON.stringify({ error: "OLD_PROJECT_SERVICE_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") !== "false"; // default true
  const onlyTable = url.searchParams.get("table"); // optional filter

  const results: TableResult[] = [];
  const errors: string[] = [];

  for (const cfg of TABLES) {
    if (onlyTable && cfg.name !== onlyTable) continue;
    try {
      const r = await processTable(supabase, oldKey, cfg.name, cfg.ts, cfg.upsert_on, dryRun);
      results.push(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${cfg.name}: ${msg}`);
      results.push({ table: cfg.name, fetched: 0, to_insert: 0, to_skip_existing: 0, inserted: 0, errors: [msg] });
    }
  }

  return new Response(JSON.stringify({
    dry_run: dryRun,
    since: SINCE,
    results,
    errors,
    summary: {
      total_fetched: results.reduce((s, r) => s + r.fetched, 0),
      total_to_insert: results.reduce((s, r) => s + r.to_insert, 0),
      total_inserted: results.reduce((s, r) => s + r.inserted, 0),
      total_skipped: results.reduce((s, r) => s + r.to_skip_existing, 0),
    },
  }, null, 2), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
