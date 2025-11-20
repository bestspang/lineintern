import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================
// ANALYTICS HELPER FUNCTIONS
// =============================

async function calculateMessageVelocity(groupId: string, fromDate: Date, toDate: Date) {
  const { data, error } = await supabase
    .from('messages')
    .select('sent_at')
    .eq('group_id', groupId)
    .gte('sent_at', fromDate.toISOString())
    .lte('sent_at', toDate.toISOString())
    .order('sent_at', { ascending: true });

  if (error || !data) return [];

  const messagesByDay: Record<string, number> = {};
  data.forEach(msg => {
    const day = new Date(msg.sent_at).toISOString().split('T')[0];
    messagesByDay[day] = (messagesByDay[day] || 0) + 1;
  });

  return Object.entries(messagesByDay).map(([date, count]) => ({ date, count }));
}

async function getUserEngagement(groupId: string, fromDate: Date, toDate: Date) {
  const { data, error } = await supabase
    .from('messages')
    .select('user_id, users(display_name)')
    .eq('group_id', groupId)
    .eq('direction', 'human')
    .gte('sent_at', fromDate.toISOString())
    .lte('sent_at', toDate.toISOString());

  if (error || !data) return { topUsers: [], avgMessagesPerUser: 0, activeUsers: 0 };

  const userCounts: Record<string, { name: string; count: number }> = {};
  data.forEach((msg: any) => {
    if (msg.user_id) {
      if (!userCounts[msg.user_id]) {
        userCounts[msg.user_id] = { 
          name: msg.users?.display_name || 'Unknown', 
          count: 0 
        };
      }
      userCounts[msg.user_id].count++;
    }
  });

  const topUsers = Object.entries(userCounts)
    .map(([userId, data]) => ({ userId, name: data.name, count: data.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const activeUsers = Object.keys(userCounts).length;
  const totalMessages = data.length;
  const avgMessagesPerUser = activeUsers > 0 ? Math.round(totalMessages / activeUsers) : 0;

  return { topUsers, avgMessagesPerUser, activeUsers };
}

async function getSentimentDistribution(groupId: string, fromDate: Date, toDate: Date) {
  const { data, error } = await supabase
    .from('messages')
    .select('sentiment')
    .eq('group_id', groupId)
    .eq('direction', 'human')
    .gte('sent_at', fromDate.toISOString())
    .lte('sent_at', toDate.toISOString())
    .not('sentiment', 'is', null);

  if (error || !data) return { positive: 0, neutral: 0, negative: 0, moodScore: 0.5 };

  let positive = 0, neutral = 0, negative = 0;
  data.forEach(msg => {
    if (msg.sentiment === 'positive') positive++;
    else if (msg.sentiment === 'negative') negative++;
    else neutral++;
  });

  const total = positive + neutral + negative;
  if (total === 0) return { positive: 0, neutral: 0, negative: 0, moodScore: 0.5 };

  const moodScore = ((positive - negative) / total + 1) / 2;

  return {
    positive: positive / total,
    neutral: neutral / total,
    negative: negative / total,
    moodScore
  };
}

async function getActivityHeatmap(groupId: string, fromDate: Date, toDate: Date) {
  const { data, error } = await supabase
    .from('messages')
    .select('sent_at')
    .eq('group_id', groupId)
    .gte('sent_at', fromDate.toISOString())
    .lte('sent_at', toDate.toISOString());

  if (error || !data) return [];

  const hourCounts: Record<number, number> = {};
  for (let i = 0; i < 24; i++) hourCounts[i] = 0;

  data.forEach(msg => {
    const hour = new Date(msg.sent_at).getHours();
    hourCounts[hour]++;
  });

  return Object.entries(hourCounts).map(([hour, count]) => ({ hour: parseInt(hour), count }));
}

async function getTopKeywords(groupId: string, fromDate: Date, toDate: Date, limit: number = 10) {
  const { data, error } = await supabase
    .from('messages')
    .select('text')
    .eq('group_id', groupId)
    .eq('direction', 'human')
    .gte('sent_at', fromDate.toISOString())
    .lte('sent_at', toDate.toISOString());

  if (error || !data) return [];

  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'it', 'that', 'this', 'i', 'you', 'we', 'they']);
  
  const wordCounts: Record<string, number> = {};
  data.forEach(msg => {
    const words = msg.text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    words.forEach((word: string) => {
      if (!stopWords.has(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });
  });

  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

async function generateAiSummary(reportData: any, timeRangeDesc: string) {
  const summaryPrompt = `Analyze this group activity report and provide insights.

TIME RANGE: ${timeRangeDesc}
TOTAL MESSAGES: ${reportData.activity.totalMessages}
ACTIVE USERS: ${reportData.activity.activeUsers}

ACTIVITY:
- Messages per day: ${reportData.activity.messagesPerDay.join(', ')}
- Peak activity hours: ${reportData.activity.peakHours.join(', ')}

ENGAGEMENT:
- Avg messages per user: ${reportData.engagement.avgMessagesPerUser}
- Top contributors: ${reportData.engagement.topUsers.map((u: any) => u.name).join(', ')}

SENTIMENT:
- Positive: ${Math.round(reportData.sentiment.positive * 100)}%
- Neutral: ${Math.round(reportData.sentiment.neutral * 100)}%
- Negative: ${Math.round(reportData.sentiment.negative * 100)}%
- Mood score: ${reportData.sentiment.moodScore.toFixed(2)}/1.0

CONTENT:
- Top keywords: ${reportData.content.topKeywords.join(', ')}

SAFETY:
- Total alerts: ${reportData.safety.total}
- High severity: ${reportData.safety.bySeverity.high}

Provide a 3-4 sentence summary with:
1. Key activity trends
2. Engagement highlights
3. Mood/sentiment observation
4. Any concerns or recommendations`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are an AI assistant analyzing group activity reports." },
        { role: "user", content: summaryPrompt }
      ],
    }),
  });

  if (!response.ok) {
    console.error('[generateAiSummary] API error:', response.status);
    return "Report generated successfully. Review the metrics above for detailed insights.";
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateReportForGroup(groupId: string, period: "daily" | "weekly") {
  console.log(`[generateReportForGroup] Generating ${period} report for group ${groupId}`);

  const toDate = new Date();
  let fromDate = new Date();
  let timeRangeDesc = "";

  if (period === "daily") {
    fromDate.setDate(fromDate.getDate() - 1);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(0, 0, 0, 0);
    timeRangeDesc = "yesterday";
  } else {
    fromDate.setDate(fromDate.getDate() - 7);
    timeRangeDesc = "last 7 days";
  }

  // Fetch total messages
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .eq('group_id', groupId)
    .gte('sent_at', fromDate.toISOString())
    .lte('sent_at', toDate.toISOString());

  if (msgError || !messages || messages.length === 0) {
    console.log(`[generateReportForGroup] No messages for ${groupId}, skipping`);
    return null;
  }

  // Calculate all metrics in parallel
  const [velocity, engagement, sentiment, heatmap, keywords] = await Promise.all([
    calculateMessageVelocity(groupId, fromDate, toDate),
    getUserEngagement(groupId, fromDate, toDate),
    getSentimentDistribution(groupId, fromDate, toDate),
    getActivityHeatmap(groupId, fromDate, toDate),
    getTopKeywords(groupId, fromDate, toDate, 5)
  ]);

  // Fetch alerts
  const { data: alerts } = await supabase
    .from('alerts')
    .select('severity, resolved')
    .eq('group_id', groupId)
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString());

  const alertStats = {
    total: alerts?.length || 0,
    bySeverity: {
      low: alerts?.filter(a => a.severity === 'low').length || 0,
      medium: alerts?.filter(a => a.severity === 'medium').length || 0,
      high: alerts?.filter(a => a.severity === 'high').length || 0
    },
    resolved: alerts?.filter(a => a.resolved).length || 0
  };

  // Get command usage
  const { data: commandUsage } = await supabase
    .from('messages')
    .select('command_type')
    .eq('group_id', groupId)
    .eq('direction', 'human')
    .not('command_type', 'is', null)
    .gte('sent_at', fromDate.toISOString())
    .lte('sent_at', toDate.toISOString());

  const commandCounts: Record<string, number> = {};
  commandUsage?.forEach(cmd => {
    if (cmd.command_type) {
      commandCounts[cmd.command_type] = (commandCounts[cmd.command_type] || 0) + 1;
    }
  });

  const urlCount = messages.filter(m => m.has_url).length;
  const peakHours = heatmap.sort((a, b) => b.count - a.count).slice(0, 5).map(h => h.hour);

  // Build report data
  const reportData = {
    activity: {
      totalMessages: messages.length,
      messagesPerDay: velocity.map(v => v.count),
      peakHours,
      activeUsers: engagement.activeUsers
    },
    engagement: {
      avgMessagesPerUser: engagement.avgMessagesPerUser,
      topUsers: engagement.topUsers,
      participationRate: engagement.activeUsers > 0 ? engagement.activeUsers / (engagement.activeUsers + 5) : 0
    },
    sentiment: {
      positive: Math.round(sentiment.positive * 100) / 100,
      neutral: Math.round(sentiment.neutral * 100) / 100,
      negative: Math.round(sentiment.negative * 100) / 100,
      moodScore: Math.round(sentiment.moodScore * 100) / 100
    },
    content: {
      topKeywords: keywords.map(k => k.word),
      urlCount,
      commandUsage: commandCounts
    },
    safety: alertStats
  };

  // Generate AI summary
  const aiSummary = await generateAiSummary(reportData, timeRangeDesc);

  // Store report in database
  const { error: reportError } = await supabase.from('reports').insert({
    group_id: groupId,
    period,
    from_date: fromDate.toISOString(),
    to_date: toDate.toISOString(),
    data: reportData,
    summary_text: aiSummary
  });

  if (reportError) {
    console.error('[generateReportForGroup] Error saving report:', reportError);
    return null;
  }

  console.log(`[generateReportForGroup] Report generated for ${groupId}`);
  return { groupId, period, success: true };
}

// =============================
// AI SUMMARY GENERATION
// =============================

async function generateSummaryWithAI(messages: any[], groupId: string) {
  const messagesText = messages
    .reverse() // Oldest first for context
    .map((m: any) => `${m.users?.display_name || 'Unknown'}: ${m.text}`)
    .join('\n');

  const summaryPrompt = `สรุปการสนทนาในกลุ่มแชทนี้เป็นภาษาไทย แยกเป็น:
1. หัวข้อหลักที่พูดคุยกัน (3-5 หัวข้อ)
2. การตัดสินใจที่สำคัญ (ระบุแต่ละรายการ)
3. งานที่ต้องทำพร้อมผู้รับผิดชอบ (ระบุแต่ละรายการในรูปแบบ: "งาน - ผู้รับผิดชอบ")
4. คำถามที่ยังรอคำตอบ

ข้อความแชท (${messages.length} ข้อความ):
${messagesText}

ให้สรุปอย่างชัดเจนและกระชับในภาษาไทย`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'คุณเป็นผู้ช่วยที่สรุปการสนทนาในกลุ่มแชทได้อย่างชัดเจนและกระชับเป็นภาษาไทย' },
          { role: 'user', content: summaryPrompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error('[generateSummaryWithAI] AI API error:', response.status, await response.text());
      return 'ไม่สามารถสร้างสรุปได้เนื่องจากเกิดข้อผิดพลาดจากบริการ AI';
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) {
    console.error('[generateSummaryWithAI] Exception:', err);
    return 'ไม่สามารถสร้างสรุปได้เนื่องจากเกิดข้อผิดพลาด';
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[report-generator] Starting...');
    
    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { groupId: requestedGroupId, type, messageLimit } = body;

    // === HANDLE AUTO-SUMMARY REQUEST ===
    if (type === 'auto_summary' && requestedGroupId) {
      console.log(`[report-generator] Auto-summary for group ${requestedGroupId}`);
      
      // Fetch recent messages
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*, users(display_name)')
        .eq('group_id', requestedGroupId)
        .eq('direction', 'human')
        .order('sent_at', { ascending: false })
        .limit(messageLimit || 100);

      if (messagesError || !messages || messages.length === 0) {
        console.error('[report-generator] Error fetching messages:', messagesError);
        return new Response(
          JSON.stringify({ success: false, error: 'No messages to summarize' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Generate AI summary
      const summaryText = await generateSummaryWithAI(messages, requestedGroupId);

      // Extract structured data from messages
      const mainTopics: string[] = [];
      const decisions: any[] = [];
      const actionItems: any[] = [];
      const openQuestions: string[] = [];

      // Simple extraction logic
      messages.forEach((msg: any) => {
        if (msg.text.includes('?') && msg.text.length < 200) {
          openQuestions.push(msg.text);
        }
        if (msg.text.includes('ตกลง') || msg.text.includes('เห็นด้วย') || msg.text.includes('decide')) {
          decisions.push({ text: msg.text.substring(0, 100) });
        }
      });

      // Save summary to database
      const { error: insertError } = await supabase
        .from('chat_summaries')
        .insert({
          group_id: requestedGroupId,
          summary_text: summaryText,
          from_time: messages[messages.length - 1].sent_at,
          to_time: messages[0].sent_at,
          message_count: messages.length,
          main_topics: mainTopics.slice(0, 5),
          decisions,
          action_items: actionItems,
          open_questions: openQuestions.slice(0, 5),
        });

      if (insertError) {
        console.error('[report-generator] Error saving summary:', insertError);
        throw insertError;
      }

      console.log(`[report-generator] Auto-summary created for group ${requestedGroupId}`);
      
      return new Response(
        JSON.stringify({ success: true, message: 'Auto-summary created' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === ORIGINAL SCHEDULED REPORT GENERATION ===
    console.log('[report-generator] Scheduled report generation...');

    // Fetch all active groups with reports feature enabled
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('id, display_name, features')
      .eq('status', 'active');

    if (groupsError) {
      throw groupsError;
    }

    if (!groups || groups.length === 0) {
      console.log('[report-generator] No active groups found');
      return new Response(JSON.stringify({ message: 'No active groups' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter groups with reports enabled
    const groupsWithReports = groups.filter(g => {
      const features = g.features as any;
      return features?.reports === true;
    });

    console.log(`[report-generator] Found ${groupsWithReports.length} groups with reports enabled`);

    // Determine if we should generate daily or weekly reports
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const hour = now.getHours();

    const results = [];

    // Generate daily reports (every day at 00:05)
    if (hour === 0) {
      console.log('[report-generator] Generating daily reports...');
      for (const group of groupsWithReports) {
        const result = await generateReportForGroup(group.id, 'daily');
        if (result) results.push(result);
      }
    }

    // Generate weekly reports (every Monday at 00:10)
    if (dayOfWeek === 1 && hour === 0) {
      console.log('[report-generator] Generating weekly reports...');
      for (const group of groupsWithReports) {
        const result = await generateReportForGroup(group.id, 'weekly');
        if (result) results.push(result);
      }
    }

    console.log(`[report-generator] Generated ${results.length} reports`);

    return new Response(
      JSON.stringify({ 
        message: 'Reports generated successfully', 
        count: results.length,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[report-generator] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
