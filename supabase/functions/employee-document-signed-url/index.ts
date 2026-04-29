// Phase 1A — Issue a short-lived signed download URL for an employee document.
// Authorization:
//   - owner/admin/hr: any document
//   - manager: only employee_visible docs for employees in scope
//   - employee/user: only employee_visible docs they own

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse, AuthzError } from "../_shared/authz.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNED_URL_TTL_SECONDS = 60;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let auth;
  try {
    auth = await requireRole(
      req,
      ["owner", "admin", "hr", "manager", "executive", "moderator", "field", "user", "employee"],
      { functionName: "employee-document-signed-url", strict: false },
    );
  } catch (e) {
    const r = authzErrorResponse(e, corsHeaders);
    if (r) return r;
    throw e;
  }
  if (!auth.userId) return jsonResponse({ error: "unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const documentId = body?.document_id;
  if (!documentId || typeof documentId !== "string") return jsonResponse({ error: "document_id required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: doc, error: dErr } = await supabase
    .from("employee_documents")
    .select("id, employee_id, file_path, file_name, file_mime_type, visibility, status, document_type")
    .eq("id", documentId)
    .maybeSingle();

  if (dErr || !doc) return jsonResponse({ error: "not found" }, 404);

  const role = auth.role;
  const isHr = role === "owner" || role === "admin" || role === "hr";

  if (!isHr) {
    // Must be employee_visible for non-HR
    if (doc.visibility !== "employee_visible") return jsonResponse({ error: "forbidden" }, 403);

    // Employee path: must own it
    const { data: ownEmp } = await supabase
      .from("employees")
      .select("id")
      .or(`auth_user_id.eq.${auth.userId},line_user_id.in.(select line_user_id from users where id = '${auth.userId}')`)
      .eq("id", doc.employee_id)
      .maybeSingle();

    let allowed = !!ownEmp;

    // Manager / executive scope check
    if (!allowed && (role === "manager" || role === "executive" || role === "moderator")) {
      const { data: scopeOk } = await supabase.rpc("can_view_employee_by_priority", {
        viewer_user_id: auth.userId,
        target_employee_id: doc.employee_id,
      });
      allowed = !!scopeOk;
    }

    if (!allowed) return jsonResponse({ error: "forbidden" }, 403);
  }

  const { data: signed, error: sErr } = await supabase
    .storage.from("employee-documents")
    .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS, {
      download: doc.file_name,
    });

  if (sErr || !signed) return jsonResponse({ error: "could not sign url", detail: sErr?.message }, 500);

  await writeAuditLog(supabase, {
    functionName: "employee-document-signed-url",
    actionType: "view",
    resourceType: "employee_document",
    resourceId: doc.id,
    performedByUserId: auth.userId,
    callerRole: role ?? undefined,
    metadata: {
      employee_id: doc.employee_id,
      document_type: doc.document_type,
      visibility: doc.visibility,
      ttl_seconds: SIGNED_URL_TTL_SECONDS,
    },
  });

  return jsonResponse({
    success: true,
    signed_url: signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SECONDS,
    file_name: doc.file_name,
    mime_type: doc.file_mime_type,
  });
});
