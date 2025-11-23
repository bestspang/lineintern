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
// PHASE 1: SMART MESSAGE SELECTION
// =============================

interface MessageScore {
  message: any;
  score: number;
  reasons: string[];
}

// Calculate importance score for a message
function calculateMessageImportance(message: any, allMessages: any[]): MessageScore {
  let score = 0;
  const reasons: string[] = [];
  
  const text = message.text.toLowerCase();
  
  // Score 1: Mentions (@mentions) - High importance
  if (text.includes('@') || text.includes('ถึง') || text.includes('for ')) {
    score += 15;
    reasons.push('contains_mention');
  }
  
  // Score 2: Decision/Action words - Very High importance
  const decisionWords = ['ตกลง', 'เห็นด้วย', 'อนุมัติ', 'ยืนยัน', 'approve', 'confirm', 'decided', 'agree', 
                         'ปฏิเสธ', 'ไม่เห็นด้วย', 'reject', 'deny', 'cancel', 'ยกเลิก'];
  if (decisionWords.some(word => text.includes(word))) {
    score += 20;
    reasons.push('contains_decision');
  }
  
  // Score 3: Action/Task words - High importance
  const actionWords = ['ทำ', 'จัด', 'ส่ง', 'ซื้อ', 'เช็ค', 'ตรวจสอบ', 'ติดตาม', 'ประสานงาน',
                       'do', 'send', 'buy', 'check', 'verify', 'follow up', 'coordinate', 'prepare', 'เตรียม'];
  if (actionWords.some(word => text.includes(word))) {
    score += 12;
    reasons.push('contains_action');
  }
  
  // Score 4: Questions - Medium-High importance
  if (text.includes('?') || text.includes('ไหม') || text.includes('หรือ') || text.includes('เมื่อไหร่')) {
    score += 10;
    reasons.push('is_question');
  }
  
  // Score 5: Deadlines/Time references - Very High importance
  const timeWords = ['วันนี้', 'พรุ่งนี้', 'เร็ว', 'ด่วน', 'ทันที', 'today', 'tomorrow', 'urgent', 
                     'asap', 'deadline', 'กำหนด', 'ภายใน'];
  if (timeWords.some(word => text.includes(word)) || /\d{1,2}[\/\-\.]\d{1,2}/.test(text)) {
    score += 18;
    reasons.push('contains_deadline');
  }
  
  // Score 6: Numbers/Quantities - Medium importance (often related to business)
  if (/\d+/.test(text) && text.length > 20) {
    score += 8;
    reasons.push('contains_numbers');
  }
  
  // Score 7: URLs/Links - Medium importance
  if (message.has_url || text.includes('http')) {
    score += 7;
    reasons.push('contains_url');
  }
  
  // Score 8: Money/Financial terms - High importance
  const moneyWords = ['บาท', 'เงิน', 'ชำระ', 'จ่าย', 'ราคา', 'ค่า', 'baht', 'pay', 'payment', 'price', 'cost', 'invoice'];
  if (moneyWords.some(word => text.includes(word)) || /\d+\s*(บาท|baht|฿)/.test(text)) {
    score += 15;
    reasons.push('financial_content');
  }
  
  // Score 9: Message length - Longer messages often more important
  if (text.length > 100) {
    score += 5;
    reasons.push('long_message');
  } else if (text.length < 10) {
    score -= 10; // Penalize very short messages
    reasons.push('very_short');
  }
  
  // Score 10: Names/People - Medium importance
  const namePattern = /[A-Z][a-z]+\s+[A-Z][a-z]+|[@][a-z]+/i;
  if (namePattern.test(message.text)) {
    score += 6;
    reasons.push('contains_names');
  }
  
  return { message, score: Math.max(0, score), reasons };
}

// Remove noise messages
function filterNoiseMessages(messages: any[]): any[] {
  const noisePatterns = [
    /^(ok|okay|ครับ|ค่ะ|จ้า|จ๊ะ|ได้|55+|5555|ฮา+|ha+|😂|😊|👍|🙏)$/i,
    /^[\s\u200B\u200C\u200D]*$/, // Empty or whitespace only
  ];
  
  return messages.filter(msg => {
    const text = msg.text.trim();
    
    // Filter out very short messages
    if (text.length < 3) return false;
    
    // Filter out noise patterns
    if (noisePatterns.some(pattern => pattern.test(text))) return false;
    
    // Filter out emoji-only messages
    const emojiRegex = /^[\p{Emoji}\s]+$/u;
    if (emojiRegex.test(text)) return false;
    
    return true;
  });
}

// Group messages into conversation threads
function clusterMessagesByThread(messages: any[]): any[][] {
  const clusters: any[][] = [];
  let currentCluster: any[] = [];
  let lastMessageTime: Date | null = null;
  
  // Sort messages chronologically
  const sortedMessages = [...messages].sort((a, b) => 
    new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
  );
  
  const THREAD_GAP_MINUTES = 30; // Messages within 30 minutes are considered same thread
  
  for (const msg of sortedMessages) {
    const msgTime = new Date(msg.sent_at);
    
    if (lastMessageTime && currentCluster.length > 0) {
      const timeDiff = (msgTime.getTime() - lastMessageTime.getTime()) / 1000 / 60;
      
      // If gap is too large, start new cluster
      if (timeDiff > THREAD_GAP_MINUTES) {
        if (currentCluster.length > 0) {
          clusters.push([...currentCluster]);
        }
        currentCluster = [msg];
      } else {
        currentCluster.push(msg);
      }
    } else {
      currentCluster.push(msg);
    }
    
    lastMessageTime = msgTime;
  }
  
  // Add last cluster
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }
  
  return clusters;
}

// Smart message selection - selects most important messages
function selectImportantMessages(messages: any[], targetCount: number = 50): any[] {
  console.log(`[selectImportantMessages] Processing ${messages.length} messages`);
  
  // Step 1: Remove noise
  const cleanMessages = filterNoiseMessages(messages);
  console.log(`[selectImportantMessages] After noise removal: ${cleanMessages.length} messages`);
  
  // Step 2: Score all messages
  const scoredMessages = cleanMessages.map(msg => calculateMessageImportance(msg, cleanMessages));
  
  // Step 3: Sort by score (descending)
  scoredMessages.sort((a, b) => b.score - a.score);
  
  // Step 4: Take top N messages
  const topMessages = scoredMessages.slice(0, targetCount);
  
  // Step 5: Re-sort by time to maintain conversation flow
  topMessages.sort((a, b) => 
    new Date(a.message.sent_at).getTime() - new Date(b.message.sent_at).getTime()
  );
  
  console.log(`[selectImportantMessages] Selected ${topMessages.length} important messages`);
  console.log(`[selectImportantMessages] Score range: ${topMessages[0]?.score} to ${topMessages[topMessages.length - 1]?.score}`);
  
  return topMessages.map(sm => sm.message);
}

// =============================
// AI SUMMARY GENERATION
// =============================

async function generateSummaryWithAI(messages: any[], groupId: string, threadClusters?: any[][]) {
  const selectedMessages = selectImportantMessages(messages, 80);
  
  const messagesText = selectedMessages
    .map((m: any) => `${m.users?.display_name || 'Unknown'}: ${m.text}`)
    .join('\n');
  
  // Calculate thread info
  const clusters = threadClusters || clusterMessagesByThread(selectedMessages);
  const threadSummary = clusters.length > 1 
    ? `การสนทนาแบ่งออกเป็น ${clusters.length} เธรด/หัวข้อย่อย\n` 
    : '';

  const summaryPrompt = `คุณเป็น AI ที่ชำนาญในการวิเคราะห์และสรุปการสนทนาในกลุ่มทำงาน/ธุรกิจ

📊 ข้อมูลการสนทนา:
- จำนวนข้อความทั้งหมด: ${messages.length} ข้อความ
- ข้อความสำคัญที่เลือกมาวิเคราะห์: ${selectedMessages.length} ข้อความ
- ${threadSummary}

💬 ข้อความที่สำคัญ:
${messagesText}

📝 กรุณาสรุปการสนทนาอย่างละเอียดและครบถ้วนในภาษาไทย โดยแบ่งเป็น:

**1. หัวข้อหลักที่พูดคุยกัน:**
- ระบุหัวข้อหลักทั้งหมดที่พบ (3-7 หัวข้อ)
- เรียงลำดับตามความสำคัญ

**2. การตัดสินใจที่สำคัญ:**
- ระบุทุกการตัดสินใจที่ชัดเจน
- บอกว่าใครตัดสินใจอะไร ด้วยเหตุผลอะไร
- แยกเป็นรายการ

**3. งานที่ต้องทำพร้อมผู้รับผิดชอบ:**
- ระบุทุกงาน/task ที่กล่าวถึง
- รูปแบบ: "งาน - @ชื่อผู้รับผิดชอบ - กำหนดเวลา (ถ้ามี)"
- แยกตามความเร่งด่วน (ด่วน / ปกติ)

**4. คำถามที่ยังรอคำตอบ:**
- ระบุทุกคำถามที่ยังไม่มีคำตอบชัดเจน
- บอกว่าใครถามใคร เกี่ยวกับเรื่องอะไร

**5. ข้อมูลสำคัญอื่น ๆ:**
- ตัวเลข/ข้อมูลเชิงปริมาณที่สำคัญ
- การกล่าวถึงเงิน/งบประมาณ
- ข้อมูลติดต่อ (เบอร์โทร, ไลน์, อีเมล)
- กำหนดเวลา/Deadlines

ให้วิเคราะห์อย่างละเอียดและไม่พลาดข้อมูลสำคัญใด ๆ`;

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
          { role: 'system', content: 'คุณเป็นผู้เชี่ยวชาญด้านการวิเคราะห์การสนทนาธุรกิจและสรุปข้อมูลสำคัญได้อย่างครบถ้วนและแม่นยำ' },
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
      
      // Fetch recent messages with higher limit (we'll filter smartly)
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*, users(display_name)')
        .eq('group_id', requestedGroupId)
        .eq('direction', 'human')
        .order('sent_at', { ascending: false })
        .limit(messageLimit || 200); // Increased limit for better selection

      if (messagesError || !messages || messages.length === 0) {
        console.error('[report-generator] Error fetching messages:', messagesError);
        return new Response(
          JSON.stringify({ success: false, error: 'No messages to summarize' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      console.log(`[report-generator] Fetched ${messages.length} messages`);
      
      // Phase 1: Smart Message Selection
      // Remove noise and select important messages
      const cleanMessages = filterNoiseMessages(messages);
      console.log(`[report-generator] After noise removal: ${cleanMessages.length} messages`);
      
      // Cluster messages into threads
      const threadClusters = clusterMessagesByThread(cleanMessages);
      console.log(`[report-generator] Identified ${threadClusters.length} conversation threads`);
      
      // Score and select important messages (max 100 for AI processing)
      const selectedMessages = selectImportantMessages(cleanMessages, 100);
      console.log(`[report-generator] Selected ${selectedMessages.length} important messages for summary`);

      // Generate AI summary with smart selection
      const summaryText = await generateSummaryWithAI(selectedMessages, requestedGroupId, threadClusters);

      // Enhanced extraction logic based on importance scores
      const scoredMessages = selectedMessages.map(msg => 
        calculateMessageImportance(msg, selectedMessages)
      );
      
      const mainTopics: string[] = [];
      const decisions: any[] = [];
      const actionItems: any[] = [];
      const openQuestions: string[] = [];

      scoredMessages.forEach((scored: any) => {
        const msg = scored.message;
        const reasons = scored.reasons;
        
        // Extract decisions (high confidence)
        if (reasons.includes('contains_decision')) {
          decisions.push({
            text: msg.text,
            user: msg.users?.display_name || 'Unknown',
            timestamp: msg.sent_at,
            score: scored.score
          });
        }
        
        // Extract action items
        if (reasons.includes('contains_action') || reasons.includes('contains_deadline')) {
          actionItems.push({
            text: msg.text,
            user: msg.users?.display_name || 'Unknown',
            timestamp: msg.sent_at,
            score: scored.score,
            has_deadline: reasons.includes('contains_deadline')
          });
        }
        
        // Extract open questions (store as strings)
        if (reasons.includes('is_question')) {
          openQuestions.push(`[${msg.users?.display_name || 'Unknown'}] ${msg.text}`);
        }
      });

      // Save summary to database with enhanced metadata
      const { error: insertError } = await supabase
        .from('chat_summaries')
        .insert({
          group_id: requestedGroupId,
          summary_text: summaryText,
          from_time: messages[messages.length - 1].sent_at,
          to_time: messages[0].sent_at,
          message_count: messages.length,
          main_topics: mainTopics.slice(0, 7),
          decisions: decisions.slice(0, 10),
          action_items: actionItems.slice(0, 15),
          open_questions: openQuestions.slice(0, 10),
        });

      if (insertError) {
        console.error('[report-generator] Error saving summary:', insertError);
        throw insertError;
      }

      console.log(`[report-generator] Auto-summary created for group ${requestedGroupId}`);
      console.log(`[report-generator] Stats: ${decisions.length} decisions, ${actionItems.length} actions, ${openQuestions.length} questions`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Auto-summary created',
          stats: {
            total_messages: messages.length,
            clean_messages: cleanMessages.length,
            threads: threadClusters.length,
            selected_messages: selectedMessages.length,
            decisions: decisions.length,
            actions: actionItems.length,
            questions: openQuestions.length
          }
        }),
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
