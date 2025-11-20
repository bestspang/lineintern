import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[task-scheduler] Running scheduled task check...");

  try {
    // Find all pending tasks due within the next 5 minutes
    // Use Bangkok time (UTC+7) for accurate comparison
    const now = new Date();
    const bangkokOffset = 7 * 60 * 60 * 1000; // 7 hours in milliseconds
    const localOffset = now.getTimezoneOffset() * 60 * 1000;
    const bangkokNow = new Date(now.getTime() + bangkokOffset + localOffset);
    
    const fiveMinutesFromNow = new Date(bangkokNow.getTime() + 5 * 60 * 1000);
    
    console.log(`[task-scheduler] 🕐 Current Bangkok time: ${bangkokNow.toISOString()}`);
    console.log(`[task-scheduler] 🔍 Checking tasks due before: ${fiveMinutesFromNow.toISOString()}`);

    const { data: dueTasks, error: fetchError } = await supabase
      .from("tasks")
      .select(`
        *,
        groups!tasks_group_id_fkey(line_group_id, display_name),
        users!tasks_created_by_user_id_fkey(display_name, line_user_id),
        assigned:users!tasks_assigned_to_user_id_fkey(display_name)
      `)
      .eq("status", "pending")
      .lte("due_at", fiveMinutesFromNow.toISOString())
      .gte("due_at", now.toISOString());

    if (fetchError) {
      console.error("[task-scheduler] Error fetching due tasks:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tasks" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[task-scheduler] Found ${dueTasks?.length || 0} due tasks`);

    if (!dueTasks || dueTasks.length === 0) {
      return new Response(
        JSON.stringify({ message: "No due tasks found", processedCount: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send push notifications for each due task
    const results = [];
    for (const task of dueTasks) {
      try {
        const lineGroupId = (task.groups as any)?.line_group_id;
        
        if (!lineGroupId) {
          console.error(`[task-scheduler] No LINE group ID for task ${task.id}`);
          continue;
        }

        // Determine recipient (group or DM)
        let recipientId = lineGroupId;
        if (lineGroupId.startsWith("dm_")) {
          // Extract user ID from dm_<userId>
          recipientId = lineGroupId.substring(3);
        }

        const createdBy = (task.users as any)?.display_name || "Someone";
        const createdByLineUserId = (task.users as any)?.line_user_id;
        const assignedTo = (task.assigned as any)?.display_name;
        const assignedText = assignedTo ? ` (assigned to ${assignedTo})` : "";

        // Build mention message
        let messageText = "";
        let mentionObject = null;

        if (task.mention_all) {
          // Mention everyone in group
          messageText = `@All ⏰ REMINDER!\n\n📌 ${task.title}${assignedText}\n\nCreated by: ${createdBy}${task.description ? `\n\n📝 ${task.description}` : ""}`;
          mentionObject = {
            mentionees: [
              {
                index: 0,
                length: 4,
              },
            ],
          };
          console.log(`[task-scheduler] Sending @All mention for task ${task.id}`);
        } else if (createdByLineUserId) {
          // Mention creator only
          const mentionText = `@${createdBy}`;
          messageText = `${mentionText} ⏰ REMINDER!\n\n📌 ${task.title}${assignedText}\n\nCreated by: ${createdBy}${task.description ? `\n\n📝 ${task.description}` : ""}`;
          mentionObject = {
            mentionees: [
              {
                index: 0,
                length: mentionText.length,
                userId: createdByLineUserId,
              },
            ],
          };
          console.log(`[task-scheduler] Sending mention to ${createdBy} (${createdByLineUserId}) for task ${task.id}`);
        } else {
          // No mention (fallback)
          messageText = `⏰ REMINDER!\n\n📌 ${task.title}${assignedText}\n\nCreated by: ${createdBy}${task.description ? `\n\n📝 ${task.description}` : ""}`;
          console.log(`[task-scheduler] No mention (no line_user_id found) for task ${task.id}`);
        }

        // Build message object with optional mention
        const messageObject: any = {
          type: "text",
          text: messageText,
        };
        
        if (mentionObject) {
          messageObject.mention = mentionObject;
        }

        // Send push notification
        const response = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: recipientId,
            messages: [messageObject],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[task-scheduler] LINE API error for task ${task.id}:`, response.status, errorText);
          results.push({ taskId: task.id, status: "error", error: errorText });
          continue;
        }

        console.log(`[task-scheduler] Sent notification for task ${task.id}`);

        // Mark task as completed (since it's a reminder)
        await supabase
          .from("tasks")
          .update({ status: "completed" })
          .eq("id", task.id);

        results.push({ taskId: task.id, status: "success" });
      } catch (error) {
        console.error(`[task-scheduler] Error processing task ${task.id}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ taskId: task.id, status: "error", error: errorMessage });
      }
    }

    console.log(`[task-scheduler] Processed ${results.length} tasks`);

    return new Response(
      JSON.stringify({
        message: "Task scheduler completed",
        processedCount: results.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[task-scheduler] Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
