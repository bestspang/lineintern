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
    .select("id, employee_id, file_path, file_name, file_mime_type, visibility, status, document_type, upload_status")
    .eq("id", documentId)
    .maybeSingle();

  if (dErr || !doc) return jsonResponse({ error: "not_found" }, 404);

  const role = auth.role;
  const isHr = role === "owner" || role === "admin" || role === "hr";

  if (!isHr) {
    // Must be employee_visible for non-HR (blocks hr_only docs)
    if (doc.visibility !== "employee_visible") return jsonResponse({ error: "forbidden_visibility" }, 403);

    // Step 1: resolve caller's LINE id (best-effort) so employees linked only via LINE still work.
    // PostgREST .or() does NOT evaluate SQL subqueries — must do this in two steps.
    const { data: linkedUser } = await supabase
      .from("users")
      .select("line_user_id")
      .eq("id", auth.userId)
      .maybeSingle();
    const lineUserId: string | null = linkedUser?.line_user_id ?? null;

    // Step 2: must own the exact employee row referenced by the document.
    // Always pin .eq("id", doc.employee_id) so employee A can NEVER fetch employee B's docs.
    let ownEmp: { id: string } | null = null;
    if (lineUserId) {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("id", doc.employee_id)
        .or(`auth_user_id.eq.${auth.userId},line_user_id.eq.${lineUserId}`)
        .maybeSingle();
      ownEmp = data ?? null;
    } else {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("id", doc.employee_id)
        .eq("auth_user_id", auth.userId)
        .maybeSingle();
      ownEmp = data ?? null;
    }

    let allowed = !!ownEmp;

    // Manager / executive scope check (priority-based)
    if (!allowed && (role === "manager" || role === "executive" || role === "moderator")) {
      const { data: scopeOk } = await supabase.rpc("can_view_employee_by_priority", {
        viewer_user_id: auth.userId,
        target_employee_id: doc.employee_id,
      });
      allowed = !!scopeOk;
    }

    if (!allowed) return jsonResponse({ error: "forbidden_scope" }, 403);
  }

  // Phase 1A.1 — surface upload state with structured codes (after auth, before signing)
  if (doc.upload_status === "pending") {
    return jsonResponse({ error: "not_yet_uploaded", document_id: doc.id }, 409);
  }
  if (doc.upload_status === "failed") {
    return jsonResponse({ error: "upload_failed", document_id: doc.id }, 410);
  }

  // Verify the Storage object exists before signing — gives a precise code if the
  // file was deleted or never finished. Auto-flip the row to 'failed' for cleanup.
  const lastSlash = doc.file_path.lastIndexOf("/");
  const folder = lastSlash > 0 ? doc.file_path.slice(0, lastSlash) : "";
  const filename = doc.file_path.slice(lastSlash + 1);
  const { data: listing } = await supabase
    .storage.from("employee-documents")
    .list(folder, { limit: 100, search: filename });
  const objectExists = (listing ?? []).some((o) => o.name === filename);
  if (!objectExists) {
    await supabase
      .from("employee_documents")
      .update({ upload_status: "failed" })
      .eq("id", doc.id)
      .eq("upload_status", "uploaded"); // only flip if it was previously claimed uploaded
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
        error_code: "file_missing",
      },
    });
    return jsonResponse({ error: "file_missing", document_id: doc.id }, 410);
  }

  const { data: signed, error: sErr } = await supabase
    .storage.from("employee-documents")
    .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS, {
      download: doc.file_name,
    });

  if (sErr || !signed) {
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
        error_code: "storage_error",
        detail: sErr?.message,
      },
    });
    return jsonResponse({ error: "storage_error", detail: sErr?.message }, 502);
  }

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
