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
    // Find all pending tasks that are due now or overdue
    // Use UTC for all time comparisons
    const now = new Date();
    
    console.log(`[task-scheduler] 🕐 Current time (UTC): ${now.toISOString()}`);
    console.log(`[task-scheduler] 🔍 Checking tasks due before: ${now.toISOString()}`);

    const { data: dueTasks, error: fetchError } = await supabase
      .from("tasks")
      .select(`
        *,
        groups!tasks_group_id_fkey(line_group_id, display_name),
        users!tasks_created_by_user_id_fkey(display_name, line_user_id),
        assigned:users!tasks_assigned_to_user_id_fkey(display_name)
      `)
      .eq("status", "pending")
      .lte("due_at", now.toISOString());

    if (fetchError) {
      console.error("[task-scheduler] Error fetching due tasks:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tasks" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[task-scheduler] Found ${dueTasks?.length || 0} due tasks`);

    // Log details about each task
    if (dueTasks && dueTasks.length > 0) {
      dueTasks.forEach(task => {
        const dueDate = new Date(task.due_at);
        const minsSinceDue = (now.getTime() - dueDate.getTime()) / (1000 * 60);
        console.log(`  - Task ${task.id}: "${task.title}" (due ${minsSinceDue.toFixed(1)} mins ago)`);
      });
    }

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
        // Check if task is overdue by more than 1 hour
        const hoursSinceDue = (now.getTime() - new Date(task.due_at).getTime()) / (1000 * 60 * 60);

        if (hoursSinceDue > 1) {
          console.log(`[task-scheduler] ⚠️ Task ${task.id} is overdue by ${hoursSinceDue.toFixed(1)} hours, marking as cancelled`);
          
          // Mark as cancelled instead of sending notification
          await supabase
            .from("tasks")
            .update({ 
              status: "cancelled",
              updated_at: now.toISOString()
            })
            .eq("id", task.id);
          
          results.push({ taskId: task.id, status: "cancelled_overdue" });
          continue;
        }

        const lineGroupId = (task.groups as any)?.line_group_id;
        
        if (!lineGroupId) {
          console.error(`[task-scheduler] No LINE group ID for task ${task.id}`);
          continue;
        }

        // Validate LINE user IDs - skip test/invalid users
        const createdByLineUserId = (task.users as any)?.line_user_id;
        const isTestUser = createdByLineUserId && (
          createdByLineUserId.startsWith("U_test") || 
          createdByLineUserId.startsWith("test_") ||
          !createdByLineUserId.startsWith("U")
        );

        if (isTestUser) {
          console.warn(`[task-scheduler] ⚠️ Skipping task ${task.id} - invalid/test LINE user ID: ${createdByLineUserId}`);
          
          // Mark as cancelled to prevent future retries
          await supabase
            .from("tasks")
            .update({ 
              status: "cancelled",
              updated_at: now.toISOString()
            })
            .eq("id", task.id);
          
          results.push({ taskId: task.id, status: "skipped_invalid_user" });
          continue;
        }

        // Determine recipient (group or DM)
        let recipientId = lineGroupId;
        if (lineGroupId.startsWith("dm_")) {
          // Extract user ID from dm_<userId>
          recipientId = lineGroupId.substring(3);
        }

        const createdBy = (task.users as any)?.display_name || "Someone";
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

        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
          const errorText = JSON.stringify(responseData);
          console.error(`[task-scheduler] LINE API error for task ${task.id}:`, response.status, errorText);
          
          // Log failed delivery to bot_message_logs
          await supabase.from("bot_message_logs").insert({
            edge_function_name: "task-scheduler",
            destination_type: recipientId.startsWith("U") ? "user" : "group",
            destination_id: recipientId,
            message_type: "task_reminder",
            message_text: messageText,
            delivery_status: "failed",
            error_message: `LINE API ${response.status}: ${errorText}`,
            sent_at: now.toISOString(),
            group_id: task.group_id,
          });

          // Create alert for failed delivery
          await supabase.from("alerts").insert({
            group_id: task.group_id,
            type: "failed_reply",
            severity: "medium",
            summary: `Failed to send task reminder: ${task.title}`,
            details: {
              task_id: task.id,
              error: errorText,
              status_code: response.status,
              recipient_id: recipientId,
            },
            resolved: false,
          });

          results.push({ taskId: task.id, status: "error", error: errorText });
          continue;
        }

        console.log(`[task-scheduler] ✅ Sent notification for task ${task.id}`);

        // Log successful delivery
        await supabase.from("bot_message_logs").insert({
          edge_function_name: "task-scheduler",
          destination_type: recipientId.startsWith("U") ? "user" : "group",
          destination_id: recipientId,
          message_type: "task_reminder",
          message_text: messageText,
          delivery_status: "success",
          line_message_id: responseData.sentMessages?.[0]?.id,
          sent_at: now.toISOString(),
          group_id: task.group_id,
        });

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

    // =============================
    // PROCESS RECURRING TASKS
    // =============================
    
    console.log(`[task-scheduler] 🔄 Checking for recurring tasks...`);
    
    // Find recurring tasks that need new instances
    const { data: recurringTasks, error: recurringError } = await supabase
      .from("tasks")
      .select("*")
      .eq("is_recurring", true)
      .eq("status", "pending")
      .lte("next_occurrence_at", now.toISOString());

    let recurringCount = 0;

    if (recurringError) {
      console.error(`[task-scheduler] Error fetching recurring tasks:`, recurringError);
    } else if (recurringTasks && recurringTasks.length > 0) {
      console.log(`[task-scheduler] Found ${recurringTasks.length} recurring tasks to process`);
      
      for (const task of recurringTasks) {
        try {
          console.log(`[task-scheduler] Processing recurring task ${task.id}: ${task.title}`);
          
          // Calculate next occurrence
          const nextOccurrence = calculateNextOccurrence(
            task.recurrence_pattern,
            task.recurrence_time,
            task.recurrence_day_of_week,
            task.recurrence_day_of_month
          );
          
          console.log(`[task-scheduler] Next occurrence for ${task.id}: ${nextOccurrence.toISOString()}`);
          
          // Check if recurring should end
          if (task.recurrence_end_date && nextOccurrence > new Date(task.recurrence_end_date)) {
            const { error: completeError } = await supabase
              .from("tasks")
              .update({ status: "completed" })
              .eq("id", task.id);
            
            if (completeError) {
              console.error(`[task-scheduler] Error completing recurring task ${task.id}:`, completeError);
            } else {
              console.log(`[task-scheduler] ✅ Recurring task ${task.id} reached end date`);
              recurringCount++;
            }
          } else {
            // Create next instance
            const { error: instanceError } = await supabase
              .from('tasks')
              .insert({
                group_id: task.group_id,
                created_by_user_id: task.created_by_user_id,
                title: task.title,
                description: task.description,
                due_at: nextOccurrence.toISOString(),
                assigned_to_user_id: task.assigned_to_user_id,
                mention_all: task.mention_all,
                status: 'pending',
                is_recurring: false,
                parent_task_id: task.id
              });
            
            if (instanceError) {
              console.error(`[task-scheduler] Error creating instance:`, instanceError);
            } else {
              console.log(`[task-scheduler] ✅ Created instance for ${task.id}`);
            }
            
            // Update next occurrence
            const { error: updateError } = await supabase
              .from("tasks")
              .update({ 
                next_occurrence_at: nextOccurrence.toISOString(),
                updated_at: now.toISOString()
              })
              .eq("id", task.id);
            
            if (updateError) {
              console.error(`[task-scheduler] Error updating next occurrence:`, updateError);
            } else {
              recurringCount++;
            }
          }
        } catch (error) {
          console.error(`[task-scheduler] Error processing recurring task:`, error);
        }
      }
    } else {
      console.log(`[task-scheduler] No recurring tasks due`);
    }

    return new Response(
      JSON.stringify({
        message: "Task scheduler completed",
        processedTasks: results.length,
        processedRecurring: recurringCount,
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

// Helper for calculating next occurrence
function calculateNextOccurrence(
  pattern: string,
  time: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null
): Date {
  const now = new Date();
  const bangkokOffset = 7 * 60 * 60 * 1000;
  const localOffset = now.getTimezoneOffset() * 60 * 1000;
  const bangkokNow = new Date(now.getTime() + bangkokOffset + localOffset);
  
  const [hours, minutes] = time.split(':').map(Number);
  
  let next = new Date(bangkokNow);
  next.setHours(hours, minutes, 0, 0);
  
  switch (pattern) {
    case 'daily':
      if (next <= bangkokNow) {
        next.setDate(next.getDate() + 1);
      }
      break;
      
    case 'weekly':
      const currentDay = next.getDay();
      const targetDay = dayOfWeek!;
      let daysToAdd = (targetDay - currentDay + 7) % 7;
      
      if (daysToAdd === 0 && next <= bangkokNow) {
        daysToAdd = 7;
      }
      
      next.setDate(next.getDate() + daysToAdd);
      break;
      
    case 'monthly':
      next.setDate(dayOfMonth!);
      
      if (next <= bangkokNow) {
        next.setMonth(next.getMonth() + 1);
      }
      
      while (next.getDate() !== dayOfMonth!) {
        next.setDate(0);
      }
      break;
  }
  
  return new Date(next.getTime() - bangkokOffset - localOffset);
}
