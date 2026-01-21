import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { logger } from "../_shared/logger.ts";
import { logBotMessage } from "../_shared/bot-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ManualStreakNotifyRequest {
  transaction_id?: string;
  /** Optional override (rare) */
  destination_group_id?: string;
  /** Default true */
  notify_group?: boolean;
  /** Default false */
  notify_dm?: boolean;
}

function replaceTemplateVariables(
  template: string,
  vars: Record<string, string | number | null | undefined>
): string {
  return template
    .replace(/{name}/g, String(vars.name ?? "พนักงาน"))
    .replace(/{points}/g, String(vars.points ?? 0))
    .replace(/{balance}/g, String(vars.balance ?? 0))
    .replace(/{streak}/g, String(vars.streak ?? 0))
    .replace(/{shields_remaining}/g, String(vars.shields_remaining ?? 0));
}

async function pushText(accessToken: string, to: string, text: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE API error: ${res.status} ${body}`);
  }
}

function hasServiceRoleKey(): boolean {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // basic sanity check to avoid creating a "service" client with an empty key
  return k.trim().length > 20;
}

function createAuthedSupabaseClient(req: Request) {
  // Uses caller JWT (admin/owner) so RLS can still allow access where appropriate.
  // NOTE: Some clients might not send Authorization; we guard before using it.
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    }
  );
}

function createServiceSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

async function insertBotLogViaClient(
  supabase: any,
  entry: Parameters<typeof logBotMessage>[0]
) {
  // Prefer writing directly with the provided client so idempotency/backfill works
  // even if the shared bot-logger (service-role) isn't available.
  const { error } = await supabase.from("bot_message_logs").insert({
    destination_type: entry.destinationType,
    destination_id: entry.destinationId,
    destination_name: entry.destinationName,
    group_id: entry.groupId,
    recipient_user_id: entry.recipientUserId,
    recipient_employee_id: entry.recipientEmployeeId,
    message_text: entry.messageText,
    message_type: entry.messageType,
    triggered_by: entry.triggeredBy,
    trigger_message_id: entry.triggerMessageId,
    command_type: entry.commandType,
    edge_function_name: entry.edgeFunctionName,
    line_message_id: entry.lineMessageId,
    delivery_status: entry.deliveryStatus || "sent",
    error_message: entry.errorMessage,
  });
  if (error) {
    logger.error("[manual-streak-notify] Failed to insert bot_message_logs", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: "LINE not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticated client (uses caller JWT)
    const supabaseClient = createAuthedSupabaseClient(req);

    // DB client: use service role if configured; otherwise fall back to admin JWT client.
    // This makes the function resilient if the environment is missing the service key.
    const supabase = hasServiceRoleKey() ? createServiceSupabaseClient() : supabaseClient;

    const { data: auth, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !auth?.user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin/Owner guard
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id)
      .in("role", ["admin", "owner"])
      .maybeSingle();

    if (!role) {
      return new Response(JSON.stringify({ success: false, error: "Admin/Owner access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ManualStreakNotifyRequest = await req.json();
    const transactionId = body.transaction_id;
    if (!transactionId) {
      return new Response(JSON.stringify({ success: false, error: "transaction_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifyGroup = body.notify_group ?? true;
    const notifyDm = body.notify_dm ?? false;

    // Idempotency: do nothing if already sent successfully for this transaction
    const { data: alreadySent } = await supabase
      .from("bot_message_logs")
      .select("id")
      .eq("trigger_message_id", transactionId)
      .eq("command_type", "streak_weekly")
      .eq("message_type", "notification")
      .eq("delivery_status", "sent")
      .limit(1);

    if ((alreadySent?.length ?? 0) > 0) {
      return new Response(JSON.stringify({ success: true, status: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load transaction
    const { data: tx, error: txError } = await supabase
      .from("point_transactions")
      .select("id, employee_id, category, transaction_type, amount, balance_after, description, metadata, created_at")
      .eq("id", transactionId)
      .maybeSingle();

    if (txError || !tx) {
      return new Response(JSON.stringify({ success: false, error: "Transaction not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Safety: ensure this is a streak weekly bonus
    const meta = (tx as any).metadata ?? {};
    const streakType = meta?.streak_type;
    const streakCount = meta?.streak_count;

    const isWeeklyStreak =
      tx.category === "streak" &&
      tx.transaction_type === "bonus" &&
      (streakType === "weekly" || typeof streakCount === "number");

    if (!isWeeklyStreak) {
      return new Response(
        JSON.stringify({ success: false, error: "Only weekly streak bonus transactions can be sent" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load rule template (streak_weekly)
    const { data: rule } = await supabase
      .from("point_rules")
      .select("notify_enabled, notify_message_template, notify_group, notify_dm")
      .eq("rule_key", "streak_weekly")
      .maybeSingle();

    const ruleNotifyEnabled = Boolean(rule?.notify_enabled);
    const template = rule?.notify_message_template as string | null;

    if (!ruleNotifyEnabled || !template) {
      return new Response(
        JSON.stringify({ success: false, error: "streak_weekly notification is disabled or has no template" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load employee + branch group
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, full_name, line_user_id, announcement_group_line_id, branch:branches(line_group_id)")
      .eq("id", tx.employee_id)
      .maybeSingle();

    if (employeeError) {
      logger.error("[manual-streak-notify] employee query error", {
        employee_id: tx.employee_id,
        error: employeeError,
        using_service_role: hasServiceRoleKey(),
      });
    }

    if (!employee) {
      return new Response(JSON.stringify({ success: false, error: "Employee not found", employee_id: tx.employee_id }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = replaceTemplateVariables(template, {
      name: employee.full_name,
      points: tx.amount,
      balance: tx.balance_after,
      streak: streakCount ?? 0,
      shields_remaining: meta?.shields_remaining ?? 0,
    });

    const groupId =
      body.destination_group_id || employee.announcement_group_line_id || (employee as any).branch?.line_group_id;

    const results: Array<{ channel: "group" | "dm"; status: "sent" | "failed"; error?: string }> = [];

    // Group
    if (notifyGroup) {
      if (!groupId) {
        results.push({ channel: "group", status: "failed", error: "No group id" });
      } else {
        try {
          await pushText(accessToken, groupId, message);
          results.push({ channel: "group", status: "sent" });
        } catch (e) {
          results.push({ channel: "group", status: "failed", error: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    // DM
    if (notifyDm) {
      if (!employee.line_user_id) {
        results.push({ channel: "dm", status: "failed", error: "Employee has no line_user_id" });
      } else {
        try {
          await pushText(accessToken, employee.line_user_id, message);
          results.push({ channel: "dm", status: "sent" });
        } catch (e) {
          results.push({ channel: "dm", status: "failed", error: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    // Log each attempt so backfill/idempotency works
    for (const r of results) {
      const destinationType: "group" | "dm" = r.channel === "group" ? "group" : "dm";
      const deliveryStatus: "sent" | "failed" | "pending" = r.status;
      const entry = {
        destinationType,
        destinationId: r.channel === "group" ? (groupId || tx.employee_id) : (employee.line_user_id || tx.employee_id),
        destinationName: employee.full_name || undefined,
        groupId: groupId || undefined,
        recipientEmployeeId: tx.employee_id,
        recipientUserId: employee.line_user_id || undefined,
        messageText: message,
        messageType: "notification" as const,
        triggeredBy: "manual" as const,
        triggerMessageId: transactionId,
        commandType: "streak_weekly",
        edgeFunctionName: "manual-streak-notify",
        deliveryStatus,
        errorMessage: r.error,
      };

      // 1) Write via the same client we used for DB reads (ensures idempotency marker exists)
      await insertBotLogViaClient(supabase, entry);

      // 2) Also try the shared logger (service-role) for compatibility/centralization.
      //    (If service role is unavailable, bot-logger will fail silently.)
      await logBotMessage(entry);
    }

    const anySent = results.some((r) => r.status === "sent");
    if (!anySent) {
      return new Response(JSON.stringify({ success: false, error: "Failed to send", results }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, status: "sent", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logger.error("[manual-streak-notify] error", error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
