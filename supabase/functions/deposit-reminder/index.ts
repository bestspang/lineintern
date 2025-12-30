import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Send LINE notification
async function sendLineNotification(groupId: string, message: string): Promise<string | null> {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !groupId) {
    console.log("LINE notification skipped - no token or group ID");
    return null;
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!response.ok) {
      console.error("LINE API error:", response.status, await response.text());
      return null;
    }

    return "sent";
  } catch (error) {
    console.error("Error sending LINE notification:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const currentTime = bangkokTime.toTimeString().slice(0, 5);

    console.log(`Running deposit reminder check at ${currentTime} for ${today}`);

    // Get global settings
    const { data: globalSettings } = await supabase
      .from('deposit_settings')
      .select('*')
      .eq('scope', 'global')
      .maybeSingle();

    if (!globalSettings?.enable_reminder) {
      console.log("Deposit reminders are disabled");
      return new Response(
        JSON.stringify({ success: true, message: "Reminders disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all active branches
    const { data: branches } = await supabase
      .from('branches')
      .select('id, name')
      .eq('is_deleted', false);

    if (!branches || branches.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active branches" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get deposits for today
    const { data: todayDeposits } = await supabase
      .from('daily_deposits')
      .select('branch_id')
      .eq('deposit_date', today);

    const depositedBranchIds = new Set((todayDeposits || []).map(d => d.branch_id));

    // Find branches without deposits
    const missingBranches = branches.filter(b => !depositedBranchIds.has(b.id));

    if (missingBranches.length === 0) {
      console.log("All branches have submitted deposits");
      return new Response(
        JSON.stringify({ success: true, message: "All branches submitted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if we already sent a reminder today
    const { data: existingReminder } = await supabase
      .from('deposit_reminders')
      .select('id')
      .eq('reminder_date', today)
      .eq('reminder_type', 'missing_deposit')
      .eq('status', 'sent')
      .maybeSingle();

    if (existingReminder) {
      console.log("Already sent reminder today");
      return new Response(
        JSON.stringify({ success: true, message: "Already reminded today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare reminder message
    const branchList = missingBranches.map(b => `• ${b.name}`).join('\n');
    const reminderMessage = `⚠️ แจ้งเตือน: ยังไม่มีการฝากเงิน
━━━━━━━━━━━━━━━━
สาขาที่ยังไม่ฝากเงินวันนี้:
${branchList}

กรุณาตรวจสอบ`;

    // Send notification
    let lineMessageId = null;
    if (globalSettings.notify_line_group_id) {
      lineMessageId = await sendLineNotification(globalSettings.notify_line_group_id, reminderMessage);
    }

    // Log reminder
    await supabase
      .from('deposit_reminders')
      .insert({
        branch_id: null, // Global reminder
        reminder_date: today,
        reminder_type: 'missing_deposit',
        sent_at: lineMessageId ? new Date().toISOString() : null,
        line_message_id: lineMessageId,
        status: lineMessageId ? 'sent' : 'failed',
        branches_notified: missingBranches.map(b => ({ id: b.id, name: b.name }))
      });

    console.log(`Reminder sent for ${missingBranches.length} branches`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        missingBranches: missingBranches.length,
        notified: !!lineMessageId
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in deposit-reminder:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});