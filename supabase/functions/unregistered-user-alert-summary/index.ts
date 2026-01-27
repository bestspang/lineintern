import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getBangkokDateString, formatBangkokTime, getBangkokNow } from "../_shared/timezone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lineChannelAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[unregistered-user-alert-summary] Starting daily summary...");

    // Check if aggregate mode is enabled
    const { data: settingData } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "bot_alert_unregistered_user")
      .maybeSingle();

    const setting = settingData?.setting_value as {
      enabled: boolean;
      mode: string;
      aggregate_interval_hours: number;
    } | null;

    if (!setting?.enabled || setting.mode !== "aggregate") {
      console.log("[unregistered-user-alert-summary] Aggregate mode not enabled, skipping");
      return new Response(
        JSON.stringify({ success: true, message: "Aggregate mode not enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unprocessed alerts from queue
    const { data: alerts, error: alertsError } = await supabase
      .from("unregistered_user_alerts")
      .select("*")
      .eq("is_processed", false)
      .order("created_at", { ascending: true });

    if (alertsError) {
      console.error("[unregistered-user-alert-summary] Error fetching alerts:", alertsError);
      throw alertsError;
    }

    if (!alerts || alerts.length === 0) {
      console.log("[unregistered-user-alert-summary] No pending alerts to summarize");
      return new Response(
        JSON.stringify({ success: true, message: "No pending alerts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[unregistered-user-alert-summary] Found ${alerts.length} pending alerts`);

    // Group alerts by group_id and line_user_id
    const groupedAlerts = new Map<string, Map<string, { count: number; userName?: string }>>();
    const groupNames = new Map<string, string>();

    for (const alert of alerts) {
      if (!groupedAlerts.has(alert.group_id)) {
        groupedAlerts.set(alert.group_id, new Map());
        groupNames.set(alert.group_id, alert.group_name || alert.branch_name || alert.group_id);
      }
      
      const groupMap = groupedAlerts.get(alert.group_id)!;
      const shortUserId = alert.line_user_id.substring(0, 6);
      const displayName = alert.user_display_name || `User ${shortUserId}`;
      
      if (groupMap.has(alert.line_user_id)) {
        groupMap.get(alert.line_user_id)!.count++;
      } else {
        groupMap.set(alert.line_user_id, { count: 1, userName: displayName });
      }
    }

    // Build summary message
    const bangkokNow = getBangkokNow();
    const dateStr = formatBangkokTime(bangkokNow).split(" ")[0];
    
    let summaryMessage = `📊 สรุป Bot Alert ประจำวัน\n`;
    summaryMessage += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    summaryMessage += `📅 วันที่: ${dateStr}\n`;
    summaryMessage += `📸 ผู้ใช้ที่ไม่ได้ลงทะเบียนส่งรูป: ${alerts.length} ครั้ง\n\n`;

    for (const [groupId, userMap] of groupedAlerts) {
      const groupName = groupNames.get(groupId) || groupId;
      const totalInGroup = Array.from(userMap.values()).reduce((sum, u) => sum + u.count, 0);
      
      summaryMessage += `🔹 ${groupName}: ${totalInGroup} ครั้ง\n`;
      
      for (const [userId, userData] of userMap) {
        summaryMessage += `   • ${userData.userName}: ${userData.count} ครั้ง\n`;
      }
      summaryMessage += `\n`;
    }

    summaryMessage += `💡 ลงทะเบียนพนักงานใหม่ได้ที่ Dashboard`;

    // Get admin LINE group ID
    const { data: adminGroupSetting } = await supabase
      .from("attendance_settings")
      .select("admin_line_group_id")
      .eq("scope", "global")
      .maybeSingle();

    const adminGroupId = adminGroupSetting?.admin_line_group_id;

    if (!adminGroupId) {
      console.warn("[unregistered-user-alert-summary] No admin group configured");
    } else if (lineChannelAccessToken) {
      // Send summary to admin group
      const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lineChannelAccessToken}`,
        },
        body: JSON.stringify({
          to: adminGroupId,
          messages: [{ type: "text", text: summaryMessage }],
        }),
      });

      if (lineResponse.ok) {
        console.log("[unregistered-user-alert-summary] Summary sent to admin group");
      } else {
        const errorText = await lineResponse.text();
        console.error("[unregistered-user-alert-summary] Failed to send LINE message:", errorText);
      }
    }

    // Mark alerts as processed
    const alertIds = alerts.map((a) => a.id);
    const { error: updateError } = await supabase
      .from("unregistered_user_alerts")
      .update({ is_processed: true, processed_at: new Date().toISOString() })
      .in("id", alertIds);

    if (updateError) {
      console.error("[unregistered-user-alert-summary] Error updating alerts:", updateError);
    }

    console.log(`[unregistered-user-alert-summary] Processed ${alertIds.length} alerts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Summary sent with ${alerts.length} alerts`,
        alertsProcessed: alertIds.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[unregistered-user-alert-summary] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
