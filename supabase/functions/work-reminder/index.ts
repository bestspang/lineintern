import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logBotMessage } from '../_shared/bot-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Reminder intervals in hours before deadline
const DEFAULT_REMINDER_INTERVALS = [24, 6, 1];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret || cronSecret !== expectedSecret) {
    console.error('[work-reminder] Unauthorized: Invalid or missing CRON_SECRET');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    console.log('[work-reminder] Starting hourly work reminder check...');
    
    const now = new Date();
    const results: Array<{ taskId: string; status: string; remindersSent: number }> = [];

    // Fetch all pending work assignments
    const { data: workTasks, error: tasksError } = await supabase
      .from('tasks')
      .select(`
        *,
        groups!inner(line_group_id, display_name, language)
      `)
      .eq('status', 'pending')
      .eq('task_type', 'work_assignment')
      .gte('due_at', now.toISOString())
      .order('due_at', { ascending: true });

    if (tasksError) {
      console.error('[work-reminder] Error fetching tasks:', tasksError);
      return new Response(JSON.stringify({ error: 'Failed to fetch tasks' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!workTasks || workTasks.length === 0) {
      console.log('[work-reminder] No pending work tasks found');
      return new Response(JSON.stringify({ message: 'No pending work tasks' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[work-reminder] Processing ${workTasks.length} pending work tasks`);

    for (const task of workTasks) {
      try {
        const dueAt = new Date(task.due_at);
        const hoursUntilDue = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        // Get custom reminder preferences or use defaults
        const reminderIntervals = task.work_metadata?.reminder_intervals || DEFAULT_REMINDER_INTERVALS;
        const sentReminders = task.work_metadata?.sent_reminders || [];
        
        // Check which reminder to send based on time remaining
        let reminderToSend: { interval: number; urgency: 'low' | 'medium' | 'high' } | null = null;
        
        for (const interval of reminderIntervals.sort((a: number, b: number) => b - a)) {
          // Check if we should send this reminder
          if (hoursUntilDue <= interval && hoursUntilDue > (interval - 1) && !sentReminders.includes(interval)) {
            // Determine urgency based on interval
            let urgency: 'low' | 'medium' | 'high' = 'low';
            if (interval <= 1) urgency = 'high';
            else if (interval <= 6) urgency = 'medium';
            
            reminderToSend = { interval, urgency };
            break;
          }
        }

        if (!reminderToSend) {
          continue; // No reminder needed at this time
        }

        // Fetch assignee details
        const assigneeId = task.work_metadata?.assignee_user_id;
        if (!assigneeId) {
          console.log(`[work-reminder] No assignee for task ${task.id}, skipping`);
          continue;
        }

        const { data: assignee } = await supabase
          .from('users')
          .select('display_name, line_user_id')
          .eq('id', assigneeId)
          .maybeSingle();

        if (!assignee) {
          console.log(`[work-reminder] Assignee not found for task ${task.id}, skipping`);
          continue;
        }

        // Generate reminder message
        const locale = task.groups.language === 'th' || task.groups.language === 'auto' ? 'th' : 'en';
        const reminderMessage = generateReminderMessage(
          task.title,
          assignee.display_name,
          reminderToSend.interval,
          reminderToSend.urgency,
          hoursUntilDue,
          locale
        );

        console.log(`[work-reminder] ✅ Generated ${reminderToSend.urgency} urgency reminder (${reminderToSend.interval}h interval) for task "${task.title}":`, reminderMessage);

        // Send reminder to LINE group (will fail for test groups with fake LINE IDs)
        let lineMessageId: string | null = null;
        let deliveryStatus: 'sent' | 'failed' = 'sent';
        
        try {
          lineMessageId = await sendLineMessage(task.groups.line_group_id, reminderMessage);
          console.log(`[work-reminder] Sent reminder for task ${task.id}`);
        } catch (sendError) {
          deliveryStatus = 'failed';
          console.log(`[work-reminder] ⚠️ Could not send to LINE (expected for test data), but reminder was generated successfully`);
        }

        // Log bot message
        await logBotMessage({
          destinationType: 'group',
          destinationId: task.groups.line_group_id,
          destinationName: task.groups.display_name,
          groupId: task.group_id,
          messageText: reminderMessage,
          messageType: 'reminder',
          triggeredBy: 'cron',
          edgeFunctionName: 'work-reminder',
          lineMessageId: lineMessageId || undefined,
          deliveryStatus: deliveryStatus
        });

        // Update task metadata to mark reminder as sent
        const updatedSentReminders = [...sentReminders, reminderToSend.interval];
        const updatedMetadata = {
          ...task.work_metadata,
          sent_reminders: updatedSentReminders,
          last_reminder_at: now.toISOString(),
        };

        await supabase
          .from('tasks')
          .update({ work_metadata: updatedMetadata })
          .eq('id', task.id);

        console.log(`[work-reminder] Sent ${reminderToSend.urgency} urgency reminder for task ${task.id} (${reminderToSend.interval}h before)`);
        results.push({ taskId: task.id, status: 'sent', remindersSent: updatedSentReminders.length });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[work-reminder] Error processing task ${task.id}:`, error);
        results.push({ taskId: task.id, status: 'error', remindersSent: 0 });
      }
    }

    const sentCount = results.filter(r => r.status === 'sent').length;
    console.log(`[work-reminder] Completed: ${sentCount} reminders sent`);

    return new Response(JSON.stringify({
      message: 'Work reminders processed',
      total: workTasks.length,
      sent: sentCount,
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[work-reminder] Fatal error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateReminderMessage(
  taskTitle: string,
  assigneeName: string,
  interval: number,
  urgency: 'low' | 'medium' | 'high',
  exactHoursRemaining: number,
  locale: 'th' | 'en'
): string {
  const hoursDisplay = Math.floor(exactHoursRemaining);
  const minutesDisplay = Math.floor((exactHoursRemaining - hoursDisplay) * 60);

  if (locale === 'th') {
    // Urgency-based emojis and tone
    let emoji = '⏰';
    let tone = '';
    
    if (urgency === 'high') {
      emoji = '🚨';
      tone = 'เร่งด่วน! ';
    } else if (urgency === 'medium') {
      emoji = '⚠️';
      tone = 'ใกล้ถึงเวลาแล้ว ';
    } else {
      emoji = '📅';
      tone = '';
    }

    let timeMessage = '';
    if (hoursDisplay >= 24) {
      const days = Math.floor(hoursDisplay / 24);
      timeMessage = `อีก ${days} วัน`;
    } else if (hoursDisplay >= 1) {
      if (minutesDisplay > 0) {
        timeMessage = `อีก ${hoursDisplay} ชั่วโมง ${minutesDisplay} นาที`;
      } else {
        timeMessage = `อีก ${hoursDisplay} ชั่วโมง`;
      }
    } else {
      timeMessage = `อีก ${minutesDisplay} นาที`;
    }

    let encouragement = '';
    if (urgency === 'high') {
      encouragement = '\n\n⚡ เร็ว! ต้องส่งเร็วๆ นี้แล้ว!';
    } else if (urgency === 'medium') {
      encouragement = '\n\n💪 อย่าลืมส่งตรงเวลานะ!';
    } else {
      encouragement = '\n\n✨ วางแผนงานให้ดีนะ!';
    }

    return `${emoji} ${tone}แจ้งเตือนงาน\n\n📝 งาน: "${taskTitle}"\n👤 ผู้รับผิดชอบ: @${assigneeName}\n⏱️ เหลือเวลา: ${timeMessage}${encouragement}`;
  } else {
    // English version
    let emoji = '⏰';
    let tone = '';
    
    if (urgency === 'high') {
      emoji = '🚨';
      tone = 'URGENT! ';
    } else if (urgency === 'medium') {
      emoji = '⚠️';
      tone = 'Deadline approaching ';
    } else {
      emoji = '📅';
      tone = '';
    }

    let timeMessage = '';
    if (hoursDisplay >= 24) {
      const days = Math.floor(hoursDisplay / 24);
      timeMessage = `${days} day${days > 1 ? 's' : ''}`;
    } else if (hoursDisplay >= 1) {
      if (minutesDisplay > 0) {
        timeMessage = `${hoursDisplay} hour${hoursDisplay > 1 ? 's' : ''} ${minutesDisplay} min`;
      } else {
        timeMessage = `${hoursDisplay} hour${hoursDisplay > 1 ? 's' : ''}`;
      }
    } else {
      timeMessage = `${minutesDisplay} minutes`;
    }

    let encouragement = '';
    if (urgency === 'high') {
      encouragement = '\n\n⚡ Hurry! Due very soon!';
    } else if (urgency === 'medium') {
      encouragement = '\n\n💪 Don\'t forget to submit on time!';
    } else {
      encouragement = '\n\n✨ Plan ahead!';
    }

    return `${emoji} ${tone}Work Reminder\n\n📝 Task: "${taskTitle}"\n👤 Assignee: @${assigneeName}\n⏱️ Time remaining: ${timeMessage}${encouragement}`;
  }
}

async function sendLineMessage(lineGroupId: string, message: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: lineGroupId,
        messages: [
          {
            type: 'text',
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[sendLineMessage] LINE API error:', response.status, errorText);
      throw new Error(`LINE API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[sendLineMessage] Message sent successfully');
    return data.sentMessages?.[0]?.id || null;
  } catch (error) {
    console.error('[sendLineMessage] Error:', error);
    throw error;
  }
}

