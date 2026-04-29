// Phase 1A — Mark an old employee document as replaced by a newly-uploaded one.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let auth;
  try {
    auth = await requireRole(req, ["owner", "admin", "hr"], { functionName: "employee-document-replace" });
  } catch (e) {
    const r = authzErrorResponse(e, corsHeaders);
    if (r) return r;
    throw e;
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const oldId = body?.old_document_id;
  const newId = body?.new_document_id;
  if (!oldId || !newId) return jsonResponse({ error: "old_document_id and new_document_id required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: oldDoc } = await supabase
    .from("employee_documents")
    .select("id, employee_id, document_type, visibility")
    .eq("id", oldId).maybeSingle();
  if (!oldDoc) return jsonResponse({ error: "old document not found" }, 404);

  const { error: uErr } = await supabase
    .from("employee_documents")
    .update({ status: "replaced", replaced_by_document_id: newId })
    .eq("id", oldId);
  if (uErr) return jsonResponse({ error: "update failed", detail: uErr.message }, 500);

  await writeAuditLog(supabase, {
    functionName: "employee-document-replace",
    actionType: "replace",
    resourceType: "employee_document",
    resourceId: oldId,
    performedByUserId: auth.userId,
    callerRole: auth.role ?? undefined,
    metadata: {
      employee_id: oldDoc.employee_id,
      document_type: oldDoc.document_type,
      visibility: oldDoc.visibility,
      replaced_by_document_id: newId,
    },
  });

  return jsonResponse({ success: true });
});
