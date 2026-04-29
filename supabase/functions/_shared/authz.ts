/**
 * Phase 0A — Edge Function authorization helper.
 *
 * Minimal, additive role guard for HTTP-invoked Edge Functions that
 * previously relied only on the platform `verify_jwt` default and a
 * service-role Supabase client. Mirrors the existing SQL helpers
 * (`has_admin_access`, `has_management_access`, `has_hr_access`) by
 * resolving the caller's role through `user_roles` + `role_access_levels`.
 *
 * Usage:
 *   import { requireRole, AuthzError } from "../_shared/authz.ts";
 *   try {
 *     const { userId, role } = await requireRole(req, ['admin','owner']);
 *   } catch (e) {
 *     if (e instanceof AuthzError) {
 *       return new Response(JSON.stringify({ error: e.message }), {
 *         status: e.status,
 *         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
 *       });
 *     }
 *     throw e;
 *   }
 *
 * Notes:
 * - This helper does NOT change business logic. It only verifies the JWT
 *   and the caller's `user_roles.role`.
 * - Cron-invoked functions should check `CRON_SECRET` first and only call
 *   this guard on the human-invoked path.
 * - Logs `[authz] <function_name> actor=<user_id> role=<role> decision=<allow|deny:<reason>>`
 *   — no secrets, no PII beyond user id.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AppRole =
  | "admin"
  | "owner"
  | "hr"
  | "executive"
  | "manager"
  | "moderator"
  | "field"
  | "user"
  | "employee";

export class AuthzError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 403, code = "forbidden") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequireRoleOptions {
  /** Used only for log labelling. */
  functionName?: string;
  /**
   * If true (default), the helper rejects when the caller's role is not
   * in the allowed list. If false, returns null role instead of throwing
   * — useful for action-discriminated handlers.
   */
  strict?: boolean;
}

export interface AuthzResult {
  userId: string;
  role: AppRole | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Verify the request bearer JWT, look up the caller's role, and confirm
 * it is in `allowedRoles`. Throws `AuthzError` (401 / 403) on failure.
 */
export async function requireRole(
  req: Request,
  allowedRoles: AppRole[],
  opts: RequireRoleOptions = {},
): Promise<AuthzResult> {
  const fnLabel = opts.functionName ?? "edge-fn";
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    console.warn(`[authz] ${fnLabel} actor=- role=- decision=deny:no-bearer`);
    throw new AuthzError("Missing bearer token", 401, "unauthorized");
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    console.warn(`[authz] ${fnLabel} actor=- role=- decision=deny:empty-bearer`);
    throw new AuthzError("Empty bearer token", 401, "unauthorized");
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[authz] ${fnLabel} server-misconfigured: missing SUPABASE env`);
    throw new AuthzError("Server misconfigured", 500, "server_error");
  }

  // Service-role client used only to read user_roles.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify JWT via getClaims (preferred for signing-keys system).
  // Falls back to getUser if getClaims is unavailable in this SDK build.
  let userId: string | null = null;
  try {
    // @ts-ignore — getClaims is available on @supabase/supabase-js >= 2.45
    if (typeof admin.auth.getClaims === "function") {
      // @ts-ignore
      const { data, error } = await admin.auth.getClaims(token);
      if (error || !data?.claims?.sub) {
        console.warn(`[authz] ${fnLabel} actor=- role=- decision=deny:invalid-jwt`);
        throw new AuthzError("Invalid token", 401, "unauthorized");
      }
      userId = data.claims.sub as string;
    } else {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data?.user?.id) {
        console.warn(`[authz] ${fnLabel} actor=- role=- decision=deny:invalid-jwt`);
        throw new AuthzError("Invalid token", 401, "unauthorized");
      }
      userId = data.user.id;
    }
  } catch (e) {
    if (e instanceof AuthzError) throw e;
    console.warn(`[authz] ${fnLabel} actor=- role=- decision=deny:jwt-exception`);
    throw new AuthzError("Invalid token", 401, "unauthorized");
  }

  // Look up role.
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (roleErr) {
    console.error(`[authz] ${fnLabel} actor=${userId} role=? decision=deny:role-lookup-error`);
    throw new AuthzError("Role lookup failed", 500, "server_error");
  }

  const role = (roleRow?.role ?? null) as AppRole | null;
  const strict = opts.strict !== false;

  if (!role) {
    if (strict) {
      console.warn(`[authz] ${fnLabel} actor=${userId} role=- decision=deny:no-role`);
      throw new AuthzError("No role assigned", 403, "forbidden");
    }
    return { userId, role: null };
  }

  if (allowedRoles.includes(role)) {
    console.log(`[authz] ${fnLabel} actor=${userId} role=${role} decision=allow`);
    return { userId, role };
  }

  if (strict) {
    console.warn(`[authz] ${fnLabel} actor=${userId} role=${role} decision=deny:role-not-allowed`);
    throw new AuthzError("Insufficient role", 403, "forbidden");
  }
  return { userId, role };
}

/**
 * Convenience wrapper: returns a Response body for the AuthzError without
 * the caller having to import the error class.
 */
export function authzErrorResponse(e: unknown, corsHeaders: Record<string, string>): Response | null {
  if (e instanceof AuthzError) {
    return new Response(
      JSON.stringify({ success: false, error: e.message, code: e.code }),
      {
        status: e.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  return null;
}
