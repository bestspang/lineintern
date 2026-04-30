// Phase 1A — Archive an employee document (HR/Admin/Owner). Soft delete only.

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
    auth = await requireRole(req, ["owner", "admin", "hr"], { functionName: "employee-document-archive" });
  } catch (e) {
    const r = authzErrorResponse(e, corsHeaders);
    if (r) return r;
    throw e;
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const documentId = body?.document_id;
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 200) : null;
  if (!documentId) return jsonResponse({ error: "document_id required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: doc } = await supabase
    .from("employee_documents")
    .select("id, employee_id, document_type, visibility, status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return jsonResponse({ error: "not found" }, 404);
  if (doc.status === "archived") return jsonResponse({ success: true, already_archived: true });

  const { error: uErr } = await supabase
    .from("employee_documents")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      archived_by_user_id: auth.userId,
    })
    .eq("id", documentId);

  if (uErr) return jsonResponse({ error: "update failed", detail: uErr.message }, 500);

  await writeAuditLog(supabase, {
    functionName: "employee-document-archive",
    actionType: "archive",
    resourceType: "employee_document",
    resourceId: documentId,
    performedByUserId: auth.userId,
    callerRole: auth.role ?? undefined,
    reason,
    metadata: {
      employee_id: doc.employee_id,
      document_type: doc.document_type,
      visibility: doc.visibility,
    },
  });

  return jsonResponse({ success: true });
});
