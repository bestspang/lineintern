import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Rate limiting: 50 messages per batch, 200ms delay between batches
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 200;

interface Broadcast {
  id: string;
  title: string;
  message_type: string;
  content: string | null;
  image_url: string | null;
  status: string;
  total_recipients: number;
}

interface Recipient {
  id: string;
  broadcast_id: string;
  recipient_type: string;
  recipient_id: string;
  line_id: string | null;
  recipient_name: string | null;
  status: string;
}

// Helper function to replace template variables
function replaceTemplateVariables(text: string, recipientName: string | null): string {
  const now = new Date();
  const bangkokOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Bangkok' };
  
  const dateStr = now.toLocaleDateString('th-TH', bangkokOptions);
  const timeStr = now.toLocaleTimeString('th-TH', { ...bangkokOptions, hour: '2-digit', minute: '2-digit' });
  const datetimeStr = now.toLocaleString('th-TH', bangkokOptions);
  
  return text
    .replace(/\{\{name\}\}/gi, recipientName || 'คุณ')
    .replace(/\{\{date\}\}/gi, dateStr)
    .replace(/\{\{time\}\}/gi, timeStr)
    .replace(/\{\{datetime\}\}/gi, datetimeStr);
}

// Build LINE message based on type (with personalization)
function buildLineMessage(broadcast: Broadcast, recipientName: string | null = null): object[] {
  const messages: object[] = [];

  if (broadcast.message_type === "text" && broadcast.content) {
    const processedContent = replaceTemplateVariables(broadcast.content, recipientName);
    messages.push({ type: "text", text: processedContent });
  } else if (broadcast.message_type === "image" && broadcast.image_url) {
    messages.push({
      type: "image",
      originalContentUrl: broadcast.image_url,
      previewImageUrl: broadcast.image_url,
    });
  } else if (broadcast.message_type === "text_image") {
    if (broadcast.content) {
      const processedContent = replaceTemplateVariables(broadcast.content, recipientName);
      messages.push({ type: "text", text: processedContent });
    }
    if (broadcast.image_url) {
      messages.push({
        type: "image",
        originalContentUrl: broadcast.image_url,
        previewImageUrl: broadcast.image_url,
      });
    }
  }

  return messages;
}

// Send message to LINE
async function sendToLine(lineId: string, messages: object[]): Promise<{ success: boolean; error?: string; response?: object }> {
  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineId,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.message || `HTTP ${response.status}`, response: errorData };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// Process a batch of recipients (with personalized messages)
async function processBatch(
  broadcast: Broadcast,
  recipients: Recipient[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    if (!recipient.line_id) {
      // Skip recipients without LINE ID
      await supabase
        .from("broadcast_recipients")
        .update({ status: "skipped", error_message: "No LINE ID" })
        .eq("id", recipient.id);
      
      await supabase.from("broadcast_logs").insert({
        broadcast_id: broadcast.id,
        recipient_id: recipient.id,
        line_id: null,
        recipient_name: recipient.recipient_name,
        delivery_status: "failed",
        error_message: "No LINE ID",
      });
      
      failed++;
      continue;
    }

    // Build personalized message for each recipient
    const messages = buildLineMessage(broadcast, recipient.recipient_name);
    
    if (messages.length === 0) {
      await supabase
        .from("broadcast_recipients")
        .update({ status: "skipped", error_message: "No message content" })
        .eq("id", recipient.id);
      failed++;
      continue;
    }

    const result = await sendToLine(recipient.line_id, messages);

    if (result.success) {
      await supabase
        .from("broadcast_recipients")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", recipient.id);

      await supabase.from("broadcast_logs").insert({
        broadcast_id: broadcast.id,
        recipient_id: recipient.id,
        line_id: recipient.line_id,
        recipient_name: recipient.recipient_name,
        delivery_status: "sent",
      });

      sent++;
    } else {
      await supabase
        .from("broadcast_recipients")
        .update({ status: "failed", error_message: result.error })
        .eq("id", recipient.id);

      await supabase.from("broadcast_logs").insert({
        broadcast_id: broadcast.id,
        recipient_id: recipient.id,
        line_id: recipient.line_id,
        recipient_name: recipient.recipient_name,
        delivery_status: "failed",
        error_message: result.error,
        line_response: result.response,
      });

      failed++;
    }
  }

  return { sent, failed };
}

// Calculate next run time for recurring broadcasts
function calculateNextRunAt(pattern: string, currentDate: Date): Date {
  const next = new Date(currentDate);
  
  switch (pattern) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "every_3_days":
      next.setDate(next.getDate() + 3);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  
  return next;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { broadcast_id, dry_run = false } = await req.json();

    if (!broadcast_id) {
      return new Response(
        JSON.stringify({ success: false, error: "broadcast_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[broadcast-send] Starting broadcast ${broadcast_id}, dry_run: ${dry_run}`);

    // Fetch broadcast
    const { data: broadcast, error: broadcastError } = await supabase
      .from("broadcasts")
      .select("*")
      .eq("id", broadcast_id)
      .single();

    if (broadcastError || !broadcast) {
      return new Response(
        JSON.stringify({ success: false, error: "Broadcast not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (broadcast.status === "cancelled") {
      return new Response(
        JSON.stringify({ success: false, error: "Broadcast was cancelled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Dry run - return recipients list with preview
    if (dry_run) {
      const { data: recipients, count } = await supabase
        .from("broadcast_recipients")
        .select("id, recipient_type, recipient_id, recipient_name, line_id", { count: "exact" })
        .eq("broadcast_id", broadcast_id)
        .limit(100);

      // Generate sample message with first recipient's name
      const sampleName = recipients?.[0]?.recipient_name || "Sample User";
      const sampleMessage = broadcast.content 
        ? replaceTemplateVariables(broadcast.content, sampleName)
        : null;

      return new Response(
        JSON.stringify({ 
          success: true, 
          dry_run: true, 
          recipient_count: count,
          recipients: recipients || [],
          sample_message: sampleMessage
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to sending
    await supabase
      .from("broadcasts")
      .update({ status: "sending" })
      .eq("id", broadcast_id);

    // Check if message has content
    const testMessages = buildLineMessage(broadcast, null);
    if (testMessages.length === 0) {
      await supabase
        .from("broadcasts")
        .update({ status: "failed" })
        .eq("id", broadcast_id);

      return new Response(
        JSON.stringify({ success: false, error: "No message content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all pending recipients
    const { data: recipients, error: recipientsError } = await supabase
      .from("broadcast_recipients")
      .select("*")
      .eq("broadcast_id", broadcast_id)
      .eq("status", "pending");

    if (recipientsError) {
      console.error("[broadcast-send] Error fetching recipients:", recipientsError);
      throw recipientsError;
    }

    console.log(`[broadcast-send] Processing ${recipients?.length || 0} recipients`);

    let totalSent = 0;
    let totalFailed = 0;

    // Process in batches
    for (let i = 0; i < (recipients?.length || 0); i += BATCH_SIZE) {
      const batch = recipients!.slice(i, i + BATCH_SIZE);
      const { sent, failed } = await processBatch(broadcast, batch);
      totalSent += sent;
      totalFailed += failed;

      // Update progress
      await supabase
        .from("broadcasts")
        .update({
          sent_count: totalSent,
          failed_count: totalFailed,
        })
        .eq("id", broadcast_id);

      // Delay between batches
      if (i + BATCH_SIZE < (recipients?.length || 0)) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Determine final status
    let finalStatus = "completed";
    if (broadcast.is_recurring && broadcast.recurrence_pattern) {
      const now = new Date();
      const nextRun = calculateNextRunAt(broadcast.recurrence_pattern, now);
      
      // Check if we've passed the end date
      if (broadcast.recurrence_end_date && nextRun > new Date(broadcast.recurrence_end_date)) {
        finalStatus = "completed";
      } else {
        finalStatus = "scheduled";
        
        // Reset recipients for next run
        await supabase
          .from("broadcast_recipients")
          .update({ status: "pending", sent_at: null, error_message: null })
          .eq("broadcast_id", broadcast_id);

        await supabase
          .from("broadcasts")
          .update({ next_run_at: nextRun.toISOString(), last_run_at: now.toISOString() })
          .eq("id", broadcast_id);
      }
    }

    // Update final status
    await supabase
      .from("broadcasts")
      .update({
        status: finalStatus,
        sent_count: totalSent,
        failed_count: totalFailed,
        last_run_at: new Date().toISOString(),
      })
      .eq("id", broadcast_id);

    console.log(`[broadcast-send] Completed. Sent: ${totalSent}, Failed: ${totalFailed}`);

    return new Response(
      JSON.stringify({
        success: true,
        broadcast_id,
        sent_count: totalSent,
        failed_count: totalFailed,
        status: finalStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[broadcast-send] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
