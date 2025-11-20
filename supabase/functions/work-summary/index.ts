import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[work-summary] Starting daily work summary generation...');

    // Fetch all active groups with work assignments enabled
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('*')
      .eq('status', 'active')
      .not('line_group_id', 'is', null);

    if (groupsError) {
      console.error('[work-summary] Error fetching groups:', groupsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch groups' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!groups || groups.length === 0) {
      console.log('[work-summary] No active groups found');
      return new Response(JSON.stringify({ message: 'No active groups' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[work-summary] Processing ${groups.length} active groups`);
    const results: Array<{ groupId: string; status: string; message?: string }> = [];

    for (const group of groups) {
      try {
        const locale = group.language === 'th' || group.language === 'auto' ? 'th' : 'en';
        
        // Check if group has any work tasks
        const { data: workTasks, error: tasksError } = await supabase
          .from('tasks')
          .select('*')
          .eq('group_id', group.id)
          .eq('task_type', 'work_assignment')
          .in('status', ['pending'])
          .order('due_at', { ascending: true });

        if (tasksError) {
          console.error(`[work-summary] Error fetching tasks for group ${group.id}:`, tasksError);
          results.push({ groupId: group.id, status: 'error', message: 'Failed to fetch tasks' });
          continue;
        }

        // Skip groups with no work tasks
        if (!workTasks || workTasks.length === 0) {
          console.log(`[work-summary] No work tasks for group ${group.id}, skipping`);
          results.push({ groupId: group.id, status: 'skipped', message: 'No work tasks' });
          continue;
        }

        // Generate work summary
        const summary = await generateWorkSummary(group.id, workTasks, locale);
        
        if (!summary) {
          console.error(`[work-summary] Failed to generate summary for group ${group.id}`);
          results.push({ groupId: group.id, status: 'error', message: 'Failed to generate summary' });
          continue;
        }

        // Send summary to LINE group
        await sendLineMessage(group.line_group_id, summary);
        
        console.log(`[work-summary] Sent work summary to group ${group.id} (${group.display_name})`);
        results.push({ groupId: group.id, status: 'success' });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[work-summary] Error processing group ${group.id}:`, error);
        results.push({ groupId: group.id, status: 'error', message: errorMessage });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    console.log(`[work-summary] Completed: ${successCount}/${groups.length} groups successful`);

    return new Response(JSON.stringify({ 
      message: 'Work summaries processed',
      total: groups.length,
      successful: successCount,
      results 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[work-summary] Fatal error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateWorkSummary(
  groupId: string,
  workTasks: any[],
  locale: 'th' | 'en'
): Promise<string | null> {
  try {
    const now = new Date();
    
    // Categorize tasks
    const overdueTasks = workTasks.filter(t => new Date(t.due_at) < now);
    const todayTasks = workTasks.filter(t => {
      const dueDate = new Date(t.due_at);
      return dueDate >= now && dueDate < new Date(now.getTime() + 24 * 60 * 60 * 1000);
    });
    const upcomingTasks = workTasks.filter(t => {
      const dueDate = new Date(t.due_at);
      return dueDate >= new Date(now.getTime() + 24 * 60 * 60 * 1000);
    });

    // Fetch personality state for work relationships
    const { data: personalityState } = await supabase
      .from('personality_state')
      .select('relationship_map')
      .eq('group_id', groupId)
      .single();

    const relationshipMap = (personalityState?.relationship_map as Record<string, any>) || {};

    // Fetch user details for tasks
    const userIds = [...new Set(workTasks.map(t => t.work_metadata?.assignee_user_id).filter(Boolean))];
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name, line_user_id')
      .in('id', userIds);

    const userMap = new Map(users?.map(u => [u.id, u]) || []);

    // Build context for AI
    const contextParts: string[] = [];
    
    if (locale === 'th') {
      contextParts.push('# สรุปงานประจำวัน 📋\n');
      
      if (overdueTasks.length > 0) {
        contextParts.push(`\n**งานที่เลยกำหนด (${overdueTasks.length} งาน):**`);
        for (const task of overdueTasks.slice(0, 5)) {
          const assigneeId = task.work_metadata?.assignee_user_id;
          const user = userMap.get(assigneeId);
          const relationship = relationshipMap[assigneeId] || {};
          const reliability = (relationship.work_reliability || 0.5) * 100;
          const daysOverdue = Math.ceil((now.getTime() - new Date(task.due_at).getTime()) / (1000 * 60 * 60 * 24));
          contextParts.push(`  • "${task.title}" - @${user?.display_name || 'Unknown'} (เลยมา ${daysOverdue} วัน, ความเชื่อถือ: ${reliability.toFixed(0)}%)`);
        }
      }

      if (todayTasks.length > 0) {
        contextParts.push(`\n**งานที่ต้องส่งวันนี้ (${todayTasks.length} งาน):**`);
        for (const task of todayTasks.slice(0, 5)) {
          const assigneeId = task.work_metadata?.assignee_user_id;
          const user = userMap.get(assigneeId);
          const dueTime = new Date(task.due_at).toLocaleTimeString('th-TH', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Bangkok'
          });
          contextParts.push(`  • "${task.title}" - @${user?.display_name || 'Unknown'} (กำหนดส่ง ${dueTime})`);
        }
      }

      if (upcomingTasks.length > 0) {
        contextParts.push(`\n**งานที่กำลังมา (${upcomingTasks.length} งาน):**`);
        for (const task of upcomingTasks.slice(0, 5)) {
          const assigneeId = task.work_metadata?.assignee_user_id;
          const user = userMap.get(assigneeId);
          const dueDate = new Date(task.due_at);
          const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          contextParts.push(`  • "${task.title}" - @${user?.display_name || 'Unknown'} (อีก ${daysRemaining} วัน)`);
        }
      }
    } else {
      contextParts.push('# Daily Work Summary 📋\n');
      
      if (overdueTasks.length > 0) {
        contextParts.push(`\n**Overdue Tasks (${overdueTasks.length}):**`);
        for (const task of overdueTasks.slice(0, 5)) {
          const assigneeId = task.work_metadata?.assignee_user_id;
          const user = userMap.get(assigneeId);
          const relationship = relationshipMap[assigneeId] || {};
          const reliability = (relationship.work_reliability || 0.5) * 100;
          const daysOverdue = Math.ceil((now.getTime() - new Date(task.due_at).getTime()) / (1000 * 60 * 60 * 24));
          contextParts.push(`  • "${task.title}" - @${user?.display_name || 'Unknown'} (${daysOverdue} days overdue, reliability: ${reliability.toFixed(0)}%)`);
        }
      }

      if (todayTasks.length > 0) {
        contextParts.push(`\n**Due Today (${todayTasks.length}):**`);
        for (const task of todayTasks.slice(0, 5)) {
          const assigneeId = task.work_metadata?.assignee_user_id;
          const user = userMap.get(assigneeId);
          const dueTime = new Date(task.due_at).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Bangkok'
          });
          contextParts.push(`  • "${task.title}" - @${user?.display_name || 'Unknown'} (due at ${dueTime})`);
        }
      }

      if (upcomingTasks.length > 0) {
        contextParts.push(`\n**Upcoming Tasks (${upcomingTasks.length}):**`);
        for (const task of upcomingTasks.slice(0, 5)) {
          const assigneeId = task.work_metadata?.assignee_user_id;
          const user = userMap.get(assigneeId);
          const dueDate = new Date(task.due_at);
          const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          contextParts.push(`  • "${task.title}" - @${user?.display_name || 'Unknown'} (in ${daysRemaining} days)`);
        }
      }
    }

    const workContext = contextParts.join('\n');

    // Generate AI summary
    const aiPrompt = locale === 'th' 
      ? `คุณคือ AI ผู้ช่วยที่กำลังสรุปงานประจำวันให้กับกลุ่มในตอนเช้า (9:00 น.)

${workContext}

**คำแนะนำ:**
1. เริ่มด้วยทักทายและบอกสรุปภาพรวม (1-2 ประโยค)
2. เน้นงานที่เร่งด่วนและควรทำก่อน
3. หากมีงานเลยกำหนด ให้เตือนอย่างนุ่มนวลแต่ชัดเจน พูดถึงความเชื่อถือของผู้ทำงาน
4. ให้คำแนะนำในการจัดลำดับความสำคัญ
5. จบด้วยกำลังใจหรือคำแนะนำสั้นๆ
6. ใช้อีโมจิอย่างเหมาะสม
7. รวมความยาวไม่เกิน 300 คำ

โทนเสียง: เป็นกันเอง มีไมตรีจิต แต่ตรงไปตรงมาเรื่องงานที่ล่าช้า`
      : `You are an AI assistant providing a morning work summary (9:00 AM) to a group.

${workContext}

**Instructions:**
1. Start with a greeting and overall summary (1-2 sentences)
2. Highlight urgent tasks and priorities
3. If there are overdue tasks, remind diplomatically but clearly, mentioning reliability scores
4. Provide advice on task prioritization
5. End with encouragement or brief advice
6. Use emojis appropriately
7. Keep under 300 words total

Tone: Friendly, supportive, but direct about delays`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: locale === 'th' 
              ? "คุณคือ LINE Intern ผู้ช่วยที่เป็นมิตรและมีประสิทธิภาพ"
              : "You are LINE Intern, a friendly and efficient AI assistant"
          },
          { role: "user", content: aiPrompt },
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generateWorkSummary] Lovable AI error:', response.status, errorText);
      
      // Fallback to simple summary
      return locale === 'th'
        ? `☀️ สวัสดีตอนเช้า!\n\n${workContext}\n\n💪 ขอให้ทุกคนโชคดีกับงานวันนี้!`
        : `☀️ Good morning!\n\n${workContext}\n\n💪 Good luck with today's tasks!`;
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content;

    if (!summary) {
      console.error('[generateWorkSummary] Empty AI response');
      return null;
    }

    return summary;

  } catch (error) {
    console.error('[generateWorkSummary] Error:', error);
    return null;
  }
}

async function sendLineMessage(lineGroupId: string, message: string): Promise<void> {
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

    console.log('[sendLineMessage] Message sent successfully');
  } catch (error) {
    console.error('[sendLineMessage] Error:', error);
    throw error;
  }
}
