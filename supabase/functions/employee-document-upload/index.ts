// Phase 1A — Employee Document upload (HR/Admin/Owner only)
// Issues a signed upload URL for the private `employee-documents` bucket
// and creates the corresponding employee_documents row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TYPES = new Set([
  "employment_contract", "id_card", "house_registration", "bank_book",
  "work_permit", "certificate", "warning_letter", "probation",
  "salary_adjustment", "resignation", "other",
]);
const ALLOWED_VISIBILITY = new Set(["hr_only", "employee_visible"]);
const ALLOWED_MIME = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/jpg",
  "image/webp", "image/heic", "image/heif",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeFilename(name: string): string {
  const trimmed = (name || "file").slice(0, 120);
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let auth;
  try {
    auth = await requireRole(req, ["owner", "admin", "hr"], { functionName: "employee-document-upload" });
  } catch (e) {
    const r = authzErrorResponse(e, corsHeaders);
    if (r) return r;
    throw e;
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

  const {
    employee_id, document_type, title, description,
    issue_date, expiry_date, visibility,
    file_name, file_mime_type, file_size_bytes,
  } = body || {};

  if (!employee_id || typeof employee_id !== "string") return jsonResponse({ error: "employee_id required" }, 400);
  if (!document_type || !ALLOWED_TYPES.has(document_type)) return jsonResponse({ error: "invalid document_type" }, 400);
  if (!title || typeof title !== "string" || title.length > 200) return jsonResponse({ error: "invalid title" }, 400);
  if (!visibility || !ALLOWED_VISIBILITY.has(visibility)) return jsonResponse({ error: "invalid visibility" }, 400);
  if (!file_name || typeof file_name !== "string") return jsonResponse({ error: "file_name required" }, 400);
  if (file_mime_type && !ALLOWED_MIME.has(file_mime_type)) return jsonResponse({ error: "mime type not allowed" }, 400);
  if (typeof file_size_bytes === "number" && file_size_bytes > MAX_BYTES) return jsonResponse({ error: "file too large (max 10MB)" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Verify employee exists
  const { data: emp, error: empErr } = await supabase
    .from("employees").select("id").eq("id", employee_id).maybeSingle();
  if (empErr || !emp) return jsonResponse({ error: "employee not found" }, 404);

  // Generate id ourselves so we can build the storage path before insert
  const documentId = crypto.randomUUID();
  const safeName = safeFilename(file_name);
  const filePath = `${employee_id}/${documentId}/${safeName}`;

  // Insert row first (file will be uploaded next via signed URL)
  const { data: doc, error: insErr } = await supabase
    .from("employee_documents")
    .insert({
      id: documentId,
      employee_id,
      document_type,
      title,
      description: description ?? null,
      file_path: filePath,
      file_name: safeName,
      file_mime_type: file_mime_type ?? null,
      file_size_bytes: file_size_bytes ?? null,
      issue_date: issue_date ?? null,
      expiry_date: expiry_date ?? null,
      visibility,
      uploaded_by_user_id: auth.userId,
    })
    .select("*")
    .single();

  if (insErr || !doc) {
    console.error("insert failed:", insErr);
    return jsonResponse({ error: "insert failed", detail: insErr?.message }, 500);
  }

  // Create signed upload URL (valid ~2h by default)
  const { data: signed, error: sErr } = await supabase
    .storage.from("employee-documents")
    .createSignedUploadUrl(filePath);

  if (sErr || !signed) {
    // Roll back the row so we don't leave dangling metadata
    await supabase.from("employee_documents").delete().eq("id", documentId);
    return jsonResponse({ error: "could not create upload url", detail: sErr?.message }, 500);
  }

  await writeAuditLog(supabase, {
    functionName: "employee-document-upload",
    actionType: "upload",
    resourceType: "employee_document",
    resourceId: documentId,
    performedByUserId: auth.userId,
    callerRole: auth.role ?? undefined,
    metadata: {
      employee_id, document_type, visibility,
      file_size_bytes: file_size_bytes ?? null,
      expiry_date: expiry_date ?? null,
    },
  });

  return jsonResponse({
    success: true,
    document_id: documentId,
    file_path: filePath,
    upload_token: signed.token,
    upload_url: signed.signedUrl,
    document: doc,
  });
});
