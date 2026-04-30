/**
 * Phase 0A.1 — structured audit logger for guarded edge functions.
 *
 * Best-effort write into public.audit_logs. Never throws — a failed
 * audit insert logs a warning and returns null so the caller can
 * continue serving its normal response.
 *
 * Schema reference (public.audit_logs):
 *   action_type text NOT NULL
 *   resource_type text NOT NULL
 *   resource_id uuid NULL
 *   performed_by_user_id uuid NULL
 *   performed_by_employee_id uuid NULL
 *   metadata jsonb NULL
 *   reason text NULL
 *
 * PII rules:
 *   - Never store LINE access tokens, photo URLs, or full message bodies.
 *   - Truncate any free-text in metadata to 200 chars (caller is expected
 *     to pre-truncate, but we re-clip strings defensively).
 */

export interface AuditLogEntry {
  /** Edge function name, e.g. "broadcast-send". Stored in metadata.function. */
  functionName: string;
  /** Domain action: approve|reject|backfill|send|import|... */
  actionType: string;
  /** Domain resource: remote_checkout_request|broadcast|memory|... */
  resourceType: string;
  /** Optional resource UUID (request_id / broadcast_id / etc.) */
  resourceId?: string | null;
  /** Acting auth user (null for internal-source calls). */
  performedByUserId?: string | null;
  /** Acting employee, if known. */
  performedByEmployeeId?: string | null;
  /** Caller role: 'admin'|'owner'|... or 'internal:<source>'. Stored in metadata.caller_role. */
  callerRole?: string | null;
  /** Optional human-readable reason. */
  reason?: string | null;
  /** Function-specific structured context. */
  metadata?: Record<string, unknown>;
}

const MAX_STRING = 200;

function clipStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + "…" : value;
  }
  if (Array.isArray(value)) return value.map(clipStrings);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = clipStrings(v);
    }
    return out;
  }
  return value;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Insert one structured audit row. Returns the inserted row id, or null on failure.
 * Never throws.
 */
// deno-lint-ignore no-explicit-any
export async function writeAuditLog(supabase: any, entry: AuditLogEntry): Promise<string | null> {
  try {
    const meta = {
      function: entry.functionName,
      caller_role: entry.callerRole ?? null,
      ...(clipStrings(entry.metadata ?? {}) as Record<string, unknown>),
    };

    const row = {
      action_type: entry.actionType,
      resource_type: entry.resourceType,
      resource_id: isUuid(entry.resourceId) ? entry.resourceId : null,
      performed_by_user_id: isUuid(entry.performedByUserId) ? entry.performedByUserId : null,
      performed_by_employee_id: isUuid(entry.performedByEmployeeId) ? entry.performedByEmployeeId : null,
      reason: entry.reason ?? null,
      metadata: meta,
    };

    const { data, error } = await supabase
      .from("audit_logs")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.warn(`[audit] ${entry.functionName} insert failed:`, error.message);
      return null;
    }
    console.log(
      `[audit] ${entry.functionName} action=${entry.actionType} resource=${entry.resourceType}` +
        `${entry.resourceId ? ` id=${entry.resourceId}` : ""} actor=${entry.performedByUserId ?? "-"}` +
        ` role=${entry.callerRole ?? "-"} ok=true`,
    );
    return data?.id ?? null;
  } catch (e) {
    console.warn(`[audit] ${entry.functionName} insert exception:`, (e as Error).message);
    return null;
  }
}

/**
 * Mask a LINE user id for logs/audit: keep first 2 + last 4 characters.
 * Example: "Uabcdef1234567890" -> "Ua…7890"
 */
export function maskLineUserId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 6) return "***";
  return `${id.slice(0, 2)}…${id.slice(-4)}`;
}
