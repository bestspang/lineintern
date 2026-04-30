// Phase 1A.1 — Confirm an employee document upload finished successfully.
// Phase 1A.3 — Adds activity-log breadcrumbs (audit_logs + per-row metadata.confirm_history)
// for every confirm attempt so HR can troubleshoot pending/failed documents.
//
// HR/Admin/Owner only. Verifies the Storage object exists, then sets
// employee_documents.upload_status = 'uploaded'. If the upload truly failed,
// the caller may pass { failed: true } to mark it 'failed' for cleanup.

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
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const HISTORY_CAP = 20;

type ConfirmOutcome = "uploaded" | "failed" | "file_missing";

interface ConfirmHistoryEntry {
  at: string; // ISO Bangkok time
  outcome: ConfirmOutcome;
  reason?: string | null;
  by_user_id?: string | null;
}

function bangkokIsoNow(): string {
  // Format: 2026-04-29T15:04:05+07:00 — readable, sortable, explicit offset.
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+07:00`;
}

async function appendConfirmHistory(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  existingMetadata: Record<string, unknown> | null | undefined,
  entry: ConfirmHistoryEntry,
): Promise<void> {
  try {
    const meta = (existingMetadata && typeof existingMetadata === "object")
      ? { ...(existingMetadata as Record<string, unknown>) }
      : {};
    const prev = Array.isArray((meta as any).confirm_history)
      ? ((meta as any).confirm_history as ConfirmHistoryEntry[])
      : [];
    const next = [...prev, entry].slice(-HISTORY_CAP);
    (meta as any).confirm_history = next;
    await supabase
      .from("employee_documents")
      .update({ metadata: meta })
      .eq("id", documentId);
  } catch (e) {
    console.warn("[confirm-upload] failed to append confirm_history:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let auth;
  try {
    auth = await requireRole(req, ["owner", "admin", "hr"], { functionName: "employee-document-confirm-upload" });
  } catch (e) {
    const r = authzErrorResponse(e, corsHeaders);
    if (r) return r;
    throw e;
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }

  const documentId: string | undefined = body?.document_id;
  const failed: boolean = body?.failed === true;
  const failureReason: string | null =
    typeof body?.failure_reason === "string" ? body.failure_reason.slice(0, 500) : null;

  if (!documentId || typeof documentId !== "string") {
    return jsonResponse({ error: "document_id_required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: doc, error: dErr } = await supabase
    .from("employee_documents")
    .select("id, employee_id, file_path, document_type, visibility, upload_status, metadata")
    .eq("id", documentId)
    .maybeSingle();

  if (dErr || !doc) return jsonResponse({ error: "not_found" }, 404);

  const attemptAt = bangkokIsoNow();

  // Explicit failure path — caller knows the upload failed.
  if (failed) {
    await supabase
      .from("employee_documents")
      .update({ upload_status: "failed" })
      .eq("id", documentId);

    await appendConfirmHistory(supabase, documentId, doc.metadata as any, {
      at: attemptAt,
      outcome: "failed",
      reason: failureReason,
      by_user_id: auth.userId,
    });

    await writeAuditLog(supabase, {
      functionName: "employee-document-confirm-upload",
      actionType: "upload_failed",
      resourceType: "employee_document",
      resourceId: documentId,
      performedByUserId: auth.userId,
      callerRole: auth.role ?? undefined,
      reason: failureReason,
      metadata: {
        employee_id: doc.employee_id,
        document_type: doc.document_type,
        visibility: doc.visibility,
        previous_upload_status: doc.upload_status,
        attempt_at: attemptAt,
        outcome: "failed",
      },
    });

    return jsonResponse({ success: true, upload_status: "failed" });
  }

  // Verify the Storage object actually exists. Use list() against the parent
  // folder rather than download() to avoid pulling bytes into the function.
  const lastSlash = doc.file_path.lastIndexOf("/");
  const folder = lastSlash > 0 ? doc.file_path.slice(0, lastSlash) : "";
  const filename = doc.file_path.slice(lastSlash + 1);

  const { data: listing, error: lErr } = await supabase
    .storage
    .from("employee-documents")
    .list(folder, { limit: 100, search: filename });

  if (lErr) {
    return jsonResponse({ error: "storage_error", detail: lErr.message }, 502);
  }

  const found = (listing ?? []).some((o) => o.name === filename);
  if (!found) {
    // Storage object missing — leave row as 'pending' so a retry can still finish it,
    // but record the attempt so HR can see how many retries have happened.
    await appendConfirmHistory(supabase, documentId, doc.metadata as any, {
      at: attemptAt,
      outcome: "file_missing",
      reason: "storage object not found at confirm time",
      by_user_id: auth.userId,
    });
    await writeAuditLog(supabase, {
      functionName: "employee-document-confirm-upload",
      actionType: "upload_pending_check",
      resourceType: "employee_document",
      resourceId: documentId,
      performedByUserId: auth.userId,
      callerRole: auth.role ?? undefined,
      metadata: {
        employee_id: doc.employee_id,
        document_type: doc.document_type,
        visibility: doc.visibility,
        previous_upload_status: doc.upload_status,
        attempt_at: attemptAt,
        outcome: "file_missing",
      },
    });
    return jsonResponse({ error: "file_missing", document_id: documentId }, 410);
  }

  const { error: uErr } = await supabase
    .from("employee_documents")
    .update({ upload_status: "uploaded" })
    .eq("id", documentId);

  if (uErr) return jsonResponse({ error: "update_failed", detail: uErr.message }, 500);

  await appendConfirmHistory(supabase, documentId, doc.metadata as any, {
    at: attemptAt,
    outcome: "uploaded",
    by_user_id: auth.userId,
  });

  await writeAuditLog(supabase, {
    functionName: "employee-document-confirm-upload",
    actionType: "upload_confirmed",
    resourceType: "employee_document",
    resourceId: documentId,
    performedByUserId: auth.userId,
    callerRole: auth.role ?? undefined,
    metadata: {
      employee_id: doc.employee_id,
      document_type: doc.document_type,
      visibility: doc.visibility,
      file_path: doc.file_path,
      attempt_at: attemptAt,
      outcome: "uploaded",
    },
  });

  return jsonResponse({ success: true, upload_status: "uploaded" });
});
