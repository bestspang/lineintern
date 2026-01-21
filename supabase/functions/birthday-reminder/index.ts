import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logBotMessage } from "../_shared/bot-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface UpcomingBirthday {
  id: string;
  full_name: string;
  birth_date: string;
  branch_id: string | null;
  branch_name: string | null;
  days_until: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    
    if (cronSecret !== expectedSecret) {
      console.error("Invalid cron secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lineAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Bangkok date
    const now = new Date();
    const bangkokOffset = 7 * 60 * 60 * 1000;
    const bangkokNow = new Date(now.getTime() + bangkokOffset);
    const todayStr = bangkokNow.toISOString().split("T")[0];

    console.log(`[birthday-reminder] Running for date: ${todayStr}`);

    // Idempotency check - don't send if already sent today
    const { data: alreadySent } = await supabase
      .from("bot_message_logs")
      .select("id")
      .eq("edge_function_name", "birthday-reminder")
      .eq("message_type", "reminder")
      .gte("created_at", `${todayStr}T00:00:00+07:00`)
      .limit(1);

    if (alreadySent && alreadySent.length > 0) {
      console.log("[birthday-reminder] Already sent today, skipping");
      return new Response(
        JSON.stringify({ success: true, message: "Already sent today", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get birthday reminder settings
    const { data: settings } = await supabase
      .from("attendance_settings")
      .select(`
        birthday_reminder_enabled,
        birthday_reminder_days_ahead,
        birthday_reminder_line_group_id,
        admin_line_group_id
      `)
      .eq("scope", "global")
      .single();

    // Check if birthday reminder is enabled
    if (settings?.birthday_reminder_enabled === false) {
      console.log("[birthday-reminder] Feature disabled, skipping");
      return new Response(
        JSON.stringify({ success: true, message: "Birthday reminder disabled", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get days ahead from settings (default 7)
    const daysAhead = settings?.birthday_reminder_days_ahead ?? 7;

    // Determine target LINE group
    const targetGroupId = settings?.birthday_reminder_line_group_id || settings?.admin_line_group_id;

    // Generate MM-DD strings for the next N days
    const dateStrings: string[] = [];
    for (let i = 0; i <= daysAhead; i++) {
      const futureDate = new Date(bangkokNow.getTime() + i * 24 * 60 * 60 * 1000);
      const mm = String(futureDate.getMonth() + 1).padStart(2, "0");
      const dd = String(futureDate.getDate()).padStart(2, "0");
      dateStrings.push(`${mm}-${dd}`);
    }

    console.log(`[birthday-reminder] Checking dates (${daysAhead} days ahead): ${dateStrings.join(", ")}`);

    // Query employees with birthdays in the next 7 days
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select(`
        id,
        full_name,
        birth_date,
        branch_id,
        branches(name)
      `)
      .eq("is_active", true)
      .not("birth_date", "is", null);

    if (empError) {
      console.error("[birthday-reminder] Error fetching employees:", empError);
      throw empError;
    }

    // Filter and calculate days until birthday
    const upcomingBirthdays: UpcomingBirthday[] = [];
    
    for (const emp of employees || []) {
      if (!emp.birth_date) continue;
      
      const birthDate = new Date(emp.birth_date);
      const birthMM = String(birthDate.getMonth() + 1).padStart(2, "0");
      const birthDD = String(birthDate.getDate()).padStart(2, "0");
      const birthMMDD = `${birthMM}-${birthDD}`;
      
      const daysUntil = dateStrings.indexOf(birthMMDD);
      
      if (daysUntil >= 0) {
        // branches can be array or object depending on join type
        const branchData = emp.branches as unknown;
        let branchName: string | null = null;
        if (Array.isArray(branchData) && branchData.length > 0) {
          branchName = (branchData[0] as { name?: string })?.name || null;
        } else if (branchData && typeof branchData === "object") {
          branchName = (branchData as { name?: string }).name || null;
        }
        
        upcomingBirthdays.push({
          id: emp.id,
          full_name: emp.full_name,
          birth_date: emp.birth_date,
          branch_id: emp.branch_id,
          branch_name: branchName,
          days_until: daysUntil,
        });
      }
    }

    console.log(`[birthday-reminder] Found ${upcomingBirthdays.length} upcoming birthdays`);

    if (upcomingBirthdays.length === 0) {
      console.log("[birthday-reminder] No upcoming birthdays, skipping notification");
      return new Response(
        JSON.stringify({ success: true, message: "No upcoming birthdays", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sort by days until birthday
    upcomingBirthdays.sort((a, b) => a.days_until - b.days_until);

    // Build message
    const thaiMonths = [
      "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
      "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
    ];

    const formatDateThai = (daysUntil: number): string => {
      const futureDate = new Date(bangkokNow.getTime() + daysUntil * 24 * 60 * 60 * 1000);
      const day = futureDate.getDate();
      const month = thaiMonths[futureDate.getMonth()];
      return `${day} ${month}`;
    };

    const getDaysLabel = (days: number): string => {
      if (days === 0) return "🎉 วันนี้";
      if (days === 1) return "🎈 พรุ่งนี้";
      return `🗓️ อีก ${days} วัน`;
    };

    // Group by days_until
    const grouped: Map<number, UpcomingBirthday[]> = new Map();
    for (const bday of upcomingBirthdays) {
      if (!grouped.has(bday.days_until)) {
        grouped.set(bday.days_until, []);
      }
      grouped.get(bday.days_until)!.push(bday);
    }

    let messageText = "🎂 แจ้งเตือนวันเกิดพนักงาน\n\n";

    // Add week range
    const weekEnd = new Date(bangkokNow.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startDay = bangkokNow.getDate();
    const startMonth = thaiMonths[bangkokNow.getMonth()];
    const endDay = weekEnd.getDate();
    const endMonth = thaiMonths[weekEnd.getMonth()];
    messageText += `📅 ${startDay} ${startMonth} - ${endDay} ${endMonth}\n\n`;

    // Add each group
    const sortedDays = Array.from(grouped.keys()).sort((a, b) => a - b);
    for (const days of sortedDays) {
      const birthdays = grouped.get(days)!;
      const dateStr = formatDateThai(days);
      const label = getDaysLabel(days);
      
      messageText += `${label} (${dateStr})\n`;
      for (const bday of birthdays) {
        const branchInfo = bday.branch_name ? ` - ${bday.branch_name}` : "";
        messageText += `   • ${bday.full_name}${branchInfo}\n`;
      }
      messageText += "\n";
    }

    messageText += "💡 อย่าลืมอวยพรพนักงานด้วยนะคะ!";

    console.log("[birthday-reminder] Message prepared:", messageText.substring(0, 100) + "...");

    if (!targetGroupId) {
      console.log("[birthday-reminder] No admin LINE group configured, skipping");
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "No admin LINE group configured",
          birthdays_found: upcomingBirthdays.length 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send LINE message
    const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lineAccessToken}`,
      },
      body: JSON.stringify({
        to: targetGroupId,
        messages: [{ type: "text", text: messageText }],
      }),
    });

    const lineResult = await lineResponse.text();
    const deliveryStatus = lineResponse.ok ? "sent" : "failed";

    console.log(`[birthday-reminder] LINE response: ${lineResponse.status} - ${lineResult}`);

    // Log to bot_message_logs
    await logBotMessage({
      edgeFunctionName: "birthday-reminder",
      messageType: "reminder",
      messageText: messageText,
      destinationType: "group",
      destinationId: targetGroupId,
      destinationName: "Admin Group",
      deliveryStatus: deliveryStatus,
      errorMessage: lineResponse.ok ? undefined : lineResult,
      commandType: "birthday_reminder",
      triggeredBy: "cron",
    });

    return new Response(
      JSON.stringify({
        success: lineResponse.ok,
        message: lineResponse.ok ? "Birthday reminder sent" : "Failed to send",
        birthdays_found: upcomingBirthdays.length,
        delivery_status: deliveryStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[birthday-reminder] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
