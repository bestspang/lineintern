import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const lineAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PendingTask {
  task_id: string;
  task_title: string;
  task_due_at: string;
  assignee_user_id: string;
  assignee_display_name: string;
  assignee_line_user_id: string;
  assigner_display_name: string;
  group_id: string;
  group_line_id: string;
  days_remaining: number;
  check_in_count: number;
  last_check_in_date: string | null;
}

function generateCheckInQuestion(
  task: PendingTask,
  locale: 'th' | 'en' = 'th'
): string {
  const { task_title, days_remaining, check_in_count, assigner_display_name } = task;
  
  if (locale === 'th') {
    if (days_remaining <= 1) {
      return `🔴 *งานใกล้ส่งแล้ว!* 🔴\n\n` +
             `งาน: "${task_title}"\n` +
             `ผู้มอบหมาย: ${assigner_display_name}\n` +
             `เหลือเวลา: ${days_remaining === 0 ? 'วันนี้!' : 'พรุ่งนี้!'}\n\n` +
             `⚠️ งานเสร็จแล้วหรือยัง? ถ้ายังก็รีบเลยนะ!\n` +
             `รายงานความคืบหน้าล่าสุดด้วยครับ 📝`;
    } else if (days_remaining <= 3) {
      return `🟡 *รายงานความคืบหน้างาน* 🟡\n\n` +
             `งาน: "${task_title}"\n` +
             `ผู้มอบหมาย: ${assigner_display_name}\n` +
             `เหลือเวลา: ${days_remaining} วัน\n\n` +
             `ทำไปถึงไหนแล้ว? มีอะไรติดขัดไหม? 💪`;
    } else {
      if (check_in_count === 0) {
        return `✨ *เช็คอินงานใหม่* ✨\n\n` +
               `งาน: "${task_title}"\n` +
               `ผู้มอบหมาย: ${assigner_display_name}\n` +
               `เหลือเวลา: ${days_remaining} วัน\n\n` +
               `เริ่มทำแล้วหรือยัง? วางแผนจะทำยังไง? 🎯`;
      } else {
        return `📋 *สอบถามความคืบหน้างาน* 📋\n\n` +
               `งาน: "${task_title}"\n` +
               `ผู้มอบหมาย: ${assigner_display_name}\n` +
               `เหลือเวลา: ${days_remaining} วัน\n\n` +
               `วันนี้ทำไปถึงไหนแล้ว? เป็นยังไงบ้าง? 😊`;
      }
    }
  } else {
    if (days_remaining <= 1) {
      return `🔴 *Urgent: Task Due Soon!* 🔴\n\n` +
             `Task: "${task_title}"\n` +
             `Assigned by: ${assigner_display_name}\n` +
             `Time left: ${days_remaining === 0 ? 'Today!' : 'Tomorrow!'}\n\n` +
             `⚠️ Is it done? If not, hurry up!\n` +
             `Please report your latest progress 📝`;
    } else if (days_remaining <= 3) {
      return `🟡 *Progress Check-In* 🟡\n\n` +
             `Task: "${task_title}"\n` +
             `Assigned by: ${assigner_display_name}\n` +
             `Time left: ${days_remaining} days\n\n` +
             `How far along are you? Any blockers? 💪`;
    } else {
      if (check_in_count === 0) {
        return `✨ *New Task Check-In* ✨\n\n` +
               `Task: "${task_title}"\n` +
               `Assigned by: ${assigner_display_name}\n` +
               `Time left: ${days_remaining} days\n\n` +
               `Have you started? What's your plan? 🎯`;
      } else {
        return `📋 *Progress Update* 📋\n\n` +
               `Task: "${task_title}"\n` +
               `Assigned by: ${assigner_display_name}\n` +
               `Time left: ${days_remaining} days\n\n` +
               `What progress have you made today? How is it going? 😊`;
      }
    }
  }
}

async function pushToLine(to: string, text: string) {
  console.log(`[pushToLine] Sending to ${to}`);
  
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[pushToLine] Error: ${response.status} ${errorText}`);
    throw new Error(`LINE API error: ${response.status}`);
  }
  
  console.log(`[pushToLine] Success`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[work-check-in] Starting daily check-in job...");

    // Get pending work tasks that need check-in
    const { data: pendingTasks, error } = await supabase
      .rpc("get_pending_work_tasks");

    if (error) {
      console.error("[work-check-in] Error fetching tasks:", error);
      throw error;
    }

    if (!pendingTasks || pendingTasks.length === 0) {
      console.log("[work-check-in] No pending tasks found");
      return new Response(
        JSON.stringify({ success: true, checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[work-check-in] Found ${pendingTasks.length} tasks to check in`);

    let sentCount = 0;
    let errorCount = 0;

    for (const task of pendingTasks as PendingTask[]) {
      try {
        // Determine locale from group
        const { data: group } = await supabase
          .from("groups")
          .select("language")
          .eq("id", task.group_id)
          .maybeSingle();
        
        const locale = group?.language === 'en' ? 'en' : 'th';
        
        // Generate personalized check-in question
        const question = generateCheckInQuestion(task, locale);
        
        // Send push message to assignee
        await pushToLine(task.assignee_line_user_id, question);
        
        // Update task metadata
        const { data: currentTask } = await supabase
          .from("tasks")
          .select("work_metadata")
          .eq("id", task.task_id)
          .maybeSingle();
        
        const metadata = currentTask?.work_metadata || {};
        const updatedMetadata = {
          ...metadata,
          check_in_count: (metadata.check_in_count || 0) + 1,
          last_check_in_at: new Date().toISOString(),
        };
        
        await supabase
          .from("tasks")
          .update({ work_metadata: updatedMetadata })
          .eq("id", task.task_id);
        
        sentCount++;
        console.log(`[work-check-in] Sent check-in for task ${task.task_id}`);
      } catch (error) {
        console.error(`[work-check-in] Error processing task ${task.task_id}:`, error);
        errorCount++;
      }
    }

    console.log(`[work-check-in] Completed: ${sentCount} sent, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: pendingTasks.length,
        sent: sentCount,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[work-check-in] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
