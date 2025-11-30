/**
 * ⚠️ CRITICAL PAYROLL NOTIFICATION - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This edge function sends payroll notifications to employees via LINE.
 * Called when admin approves/processes payroll period.
 * 
 * INVARIANTS:
 * 1. Only sends to employees with valid line_user_id
 * 2. Message format includes: base salary, OT, allowances, deductions, net pay
 * 3. All monetary values formatted with Thai locale (฿ symbol, comma separators)
 * 4. Logs all sent messages to bot_message_logs table
 * 5. Returns detailed results (sent, failed, skipped counts)
 * 
 * COMMON BUGS TO AVOID:
 * - Sending to employees without LINE user ID (causes LINE API error)
 * - Wrong number formatting (use .toLocaleString() not .toFixed())
 * - Missing period name in message
 * - Not logging failed sends to bot_message_logs
 * 
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * □ Employee LINE user ID checked before send?
 * □ All monetary values properly formatted?
 * □ Bot message logged with correct destination_type?
 * □ Error handling for LINE API failures?
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Send LINE push message
async function sendLinePush(userId: string, message: string): Promise<boolean> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.error("LINE_CHANNEL_ACCESS_TOKEN not configured");
    return false;
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`LINE API error: ${response.status} - ${errorText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending LINE push:", error);
    return false;
  }
}

// Format payroll message
function formatPayrollMessage(record: any, periodName: string, employeeName: string): string {
  const lines = [
    `💰 แจ้งเตือนเงินเดือน`,
    ``,
    `สวัสดีคุณ ${employeeName}`,
    `รอบเงินเดือน: ${periodName}`,
    ``,
    `📋 รายละเอียด:`,
    `• เงินเดือน: ฿${Number(record.base_salary || 0).toLocaleString()}`,
  ];

  if (record.ot_pay > 0) {
    lines.push(`• OT (${Number(record.ot_hours || 0).toFixed(1)} ชม.): ฿${Number(record.ot_pay).toLocaleString()}`);
  }

  if (record.total_allowances > 0) {
    lines.push(`• เบี้ยเลี้ยง: +฿${Number(record.total_allowances).toLocaleString()}`);
  }

  if (record.total_deductions > 0) {
    lines.push(`• หักรวม: -฿${Number(record.total_deductions).toLocaleString()}`);
  }

  lines.push(``);
  lines.push(`✅ เงินสุทธิ: ฿${Number(record.net_pay || 0).toLocaleString()}`);

  return lines.join("\n");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { period_id, employee_ids, action } = await req.json();

    if (action !== "send_payroll_notification") {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!period_id) {
      return new Response(
        JSON.stringify({ error: "period_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[payroll-notification] Processing period: ${period_id}`);

    // Fetch period info
    const { data: period, error: periodError } = await supabase
      .from("payroll_periods")
      .select("name")
      .eq("id", period_id)
      .single();

    if (periodError || !period) {
      return new Response(
        JSON.stringify({ error: "Period not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch payroll records with employee info
    let query = supabase
      .from("payroll_records")
      .select(`
        *,
        employee:employees (
          id,
          full_name,
          line_user_id
        )
      `)
      .eq("period_id", period_id);

    // Filter by employee_ids if provided
    if (employee_ids?.length) {
      query = query.in("employee_id", employee_ids);
    }

    const { data: records, error: recordsError } = await query;

    if (recordsError) {
      console.error("Error fetching records:", recordsError);
      return new Response(
        JSON.stringify({ error: recordsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = {
      total: records?.length || 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [] as any[],
    };

    for (const record of records || []) {
      const employee = record.employee;
      
      if (!employee?.line_user_id) {
        results.skipped++;
        results.details.push({
          employee_id: record.employee_id,
          name: employee?.full_name || "Unknown",
          status: "skipped",
          reason: "No LINE user ID",
        });
        continue;
      }

      const message = formatPayrollMessage(record, period.name, employee.full_name);
      const success = await sendLinePush(employee.line_user_id, message);

      if (success) {
        results.sent++;
        results.details.push({
          employee_id: record.employee_id,
          name: employee.full_name,
          status: "sent",
        });

        // Log to bot_message_logs
        await supabase.from("bot_message_logs").insert({
          destination_type: "user",
          destination_id: employee.line_user_id,
          destination_name: employee.full_name,
          message_type: "push",
          message_text: message,
          edge_function_name: "payroll-notification",
          triggered_by: "payroll_approval",
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
        });
      } else {
        results.failed++;
        results.details.push({
          employee_id: record.employee_id,
          name: employee.full_name,
          status: "failed",
        });
      }
    }

    console.log(`[payroll-notification] Results: sent=${results.sent}, failed=${results.failed}, skipped=${results.skipped}`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[payroll-notification] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
