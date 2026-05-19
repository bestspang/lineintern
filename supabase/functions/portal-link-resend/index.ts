// Admin-only: resend Member Portal link to an employee via LINE Push API.
// Mirrors logic from line-webhook /menu handler (do not modify that handler).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { success: false, error: "UNAUTHORIZED", message: "Missing auth token" });
    }
    const jwt = authHeader.replace("Bearer ", "");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

    if (!LINE_TOKEN) {
      return json(500, { success: false, error: "CONFIG", message: "LINE token not configured" });
    }

    // 1) Verify caller JWT
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(jwt);
    if (claimsErr || !claims?.claims?.sub) {
      return json(401, { success: false, error: "UNAUTHORIZED", message: "Invalid token" });
    }
    const userId = claims.claims.sub as string;

    // 2) Check admin/owner/hr role
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: roles, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) {
      console.error("[portal-link-resend] role lookup error:", roleErr);
      return json(500, { success: false, error: "ROLE_LOOKUP_FAILED" });
    }
    const allowed = new Set(["admin", "owner", "hr"]);
    const hasRole = (roles || []).some((r: any) => allowed.has(r.role));
    if (!hasRole) {
      return json(403, { success: false, error: "FORBIDDEN", message: "Admin/Owner/HR only" });
    }

    // 3) Parse body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json(400, { success: false, error: "BAD_JSON" });
    }
    const employeeId = typeof body?.employee_id === "string" ? body.employee_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId)) {
      return json(400, { success: false, error: "INVALID_EMPLOYEE_ID" });
    }

    // 4) Load employee
    const { data: employee, error: empErr } = await admin
      .from("employees")
      .select("id, full_name, line_user_id, is_active")
      .eq("id", employeeId)
      .maybeSingle();
    if (empErr || !employee) {
      return json(404, { success: false, error: "EMPLOYEE_NOT_FOUND" });
    }
    if (!employee.line_user_id) {
      return json(400, { success: false, error: "NO_LINE_USER_ID", message: "พนักงานยังไม่ผูกบัญชี LINE" });
    }

    // 5) Determine portal access mode + LIFF
    const [{ data: portalSetting }, { data: liffConfig }] = await Promise.all([
      admin.from("system_settings").select("setting_value").eq("setting_key", "portal_access_mode").maybeSingle(),
      admin.from("api_configurations").select("key_value").eq("key_name", "LIFF_ID").maybeSingle(),
    ]);
    const accessMode = (portalSetting as any)?.setting_value?.mode || "liff";
    const liffId = (liffConfig as any)?.key_value as string | undefined;

    let portalUrl = "";
    let mode: "liff" | "token" = "token";

    if ((accessMode === "liff" || accessMode === "both") && liffId) {
      portalUrl = `https://liff.line.me/${liffId}`;
      mode = "liff";
    } else {
      // Token mode — mirror /menu handler format
      const token = `emp_${employee.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error: tokenErr } = await admin.from("employee_menu_tokens").insert({
        employee_id: employee.id,
        token,
        expires_at: expiresAt,
      });
      if (tokenErr) {
        console.error("[portal-link-resend] token insert error:", tokenErr);
        return json(500, { success: false, error: "TOKEN_CREATE_FAILED" });
      }
      const appUrl = Deno.env.get("APP_URL") || "https://lineintern.lovable.app";
      portalUrl = `${appUrl}/portal?token=${token}`;
      mode = "token";
    }

    // 6) Push message via LINE
    const message =
      mode === "liff"
        ? `📋 เมนูพนักงาน (ส่งจาก Admin)\n\nคลิกเพื่อเปิด Portal:\n${portalUrl}\n\n✅ เข้าสู่ระบบอัตโนมัติผ่าน LINE`
        : `📋 เมนูพนักงาน (ส่งจาก Admin)\n\nคลิกลิงก์ด้านล่างเพื่อเปิด Portal:\n${portalUrl}\n\n⏰ ลิงก์นี้ใช้ได้ 30 นาที`;

    const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: employee.line_user_id,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!pushRes.ok) {
      const errText = await pushRes.text();
      console.error("[portal-link-resend] LINE push failed:", pushRes.status, errText);
      return json(502, { success: false, error: "LINE_PUSH_FAILED", detail: errText });
    }

    // 7) Audit log (best-effort)
    try {
      await admin.from("audit_logs").insert({
        action_type: "portal_link_resend",
        resource_type: "employee",
        resource_id: employee.id,
        performed_by_user_id: userId,
        metadata: { mode, line_user_id: employee.line_user_id },
      });
    } catch (e) {
      console.warn("[portal-link-resend] audit log skipped:", e);
    }

    return json(200, {
      success: true,
      mode,
      sent_at: new Date().toISOString(),
      employee_id: employee.id,
    });
  } catch (err) {
    console.error("[portal-link-resend] unexpected:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json(500, { success: false, error: "INTERNAL", message: msg });
  }
});
