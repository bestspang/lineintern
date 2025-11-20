import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const lineAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function pushToLine(to: string, text: string) {
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
    throw new Error(`LINE API error: ${response.status}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[work-reminder] Starting reminder check...");
    
    const now = new Date();
    
    // Find tasks that need reminders (1 day, 6 hours, 1 hour before due)
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*, users!tasks_assigned_to_user_id_fkey(line_user_id, display_name), groups!tasks_group_id_fkey(language)")
      .eq("task_type", "work_assignment")
      .eq("status", "pending")
      .gte("due_at", now.toISOString())
      .order("due_at", { ascending: true });

    if (error) throw error;
    if (!tasks || tasks.length === 0) {
      console.log("[work-reminder] No tasks to remind");
      return new Response(JSON.stringify({ success: true, reminded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let remindedCount = 0;

    for (const task of tasks) {
      const dueAt = new Date(task.due_at);
      const hoursUntilDue = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      const metadata = task.work_metadata || {};
      const reminderCount = metadata.reminder_count || 0;
      const customHours = metadata.custom_reminder_hours || [24, 6, 1];
      
      // Check if we should send a reminder
      let shouldRemind = false;
      let reminderType = "";
      
      if (reminderCount === 0 && hoursUntilDue <= 24 && hoursUntilDue > 6) {
        shouldRemind = true;
        reminderType = "24h";
      } else if (reminderCount === 1 && hoursUntilDue <= 6 && hoursUntilDue > 1) {
        shouldRemind = true;
        reminderType = "6h";
      } else if (reminderCount === 2 && hoursUntilDue <= 1) {
        shouldRemind = true;
        reminderType = "1h";
      }
      
      if (shouldRemind && reminderCount < 3) {
        const user = task.users as any;
        const group = task.groups as any;
        const locale = group?.language === 'en' ? 'en' : 'th';
        
        let message = "";
        if (locale === 'th') {
          if (reminderType === "24h") {
            message = `⏰ *เตือนงาน* ⏰\n\nงาน: "${task.title}"\nเหลือเวลาอีก 1 วัน\n\nเตรียมตัวให้พร้อมนะ! 💪`;
          } else if (reminderType === "6h") {
            message = `⏰ *เตือนงานด่วน!* ⏰\n\nงาน: "${task.title}"\nเหลือเวลาอีก 6 ชั่วโมง\n\nรีบทำให้เสร็จนะ! ⚡`;
          } else {
            message = `🔥 *เตือนงานเร่งด่วน!* 🔥\n\nงาน: "${task.title}"\nเหลือเวลาอีก 1 ชั่วโมง!\n\nรีบส่งเดี๋ยวนี้! 🚨`;
          }
        } else {
          if (reminderType === "24h") {
            message = `⏰ *Task Reminder* ⏰\n\nTask: "${task.title}"\n1 day remaining\n\nGet ready! 💪`;
          } else if (reminderType === "6h") {
            message = `⏰ *Urgent Reminder!* ⏰\n\nTask: "${task.title}"\n6 hours remaining\n\nFinish it up! ⚡`;
          } else {
            message = `🔥 *URGENT REMINDER!* 🔥\n\nTask: "${task.title}"\n1 hour remaining!\n\nSubmit now! 🚨`;
          }
        }
        
        await pushToLine(user.line_user_id, message);
        
        // Update reminder count
        await supabase
          .from("tasks")
          .update({
            work_metadata: {
              ...metadata,
              reminder_count: reminderCount + 1,
            },
          })
          .eq("id", task.id);
        
        remindedCount++;
        console.log(`[work-reminder] Sent ${reminderType} reminder for task ${task.id}`);
      }
    }

    console.log(`[work-reminder] Completed: ${remindedCount} reminders sent`);
    
    return new Response(JSON.stringify({ success: true, reminded: remindedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[work-reminder] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
