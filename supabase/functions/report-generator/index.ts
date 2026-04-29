import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';
import { getBangkokDateString, toBangkokTime } from '../_shared/timezone.ts';
import { requireRole, authzErrorResponse } from '../_shared/authz.ts';
import { writeAuditLog } from '../_shared/audit.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const BANGKOK_TIMEZONE = 'Asia/Bangkok';

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
    const day = getBangkokDateString(new Date(msg.sent_at));
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
    const bangkokTime = toBangkokTime(msg.sent_at);
    const hour = bangkokTime.getHours();
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

interface EnrichedContext {
  messages: any[];
  threads: any[][];
  workingMemories: any[];
  longTermMemories: any[];
  userProfiles: any[];
  businessContext: {
    topics: string[];
    urgency: string;
    hasFinancial: boolean;
    hasDeadlines: boolean;
  };
}

// =============================
// PHASE 2: CONTEXT ENRICHMENT
// =============================

async function getThreadContext(groupId: string, messageIds: string[]): Promise<any[]> {
  if (messageIds.length === 0) return [];
  
  const { data, error } = await supabase
    .rpc('get_thread_context', {
      p_thread_id: messageIds[0], // Simplified - in real scenario would need proper thread tracking
      p_limit: 50
    });
  
  if (error) {
    console.error('[getThreadContext] Error:', error);
    return [];
  }
  
  return data || [];
}

async function getWorkingMemoryContext(groupId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('working_memory')
    .select('*')
    .eq('group_id', groupId)
    .gt('expires_at', new Date().toISOString())
    .order('importance_score', { ascending: false })
    .limit(20);
  
  if (error) {
    console.error('[getWorkingMemoryContext] Error:', error);
    return [];
  }
  
  return data || [];
}

async function searchRelevantMemories(groupId: string, keywords: string[]): Promise<any[]> {
  if (keywords.length === 0) return [];
  
  const { data, error } = await supabase
    .rpc('search_memories_by_keywords', {
      p_group_id: groupId,
      p_keywords: keywords,
      p_limit: 15
    });
  
  if (error) {
    console.error('[searchRelevantMemories] Error:', error);
    return [];
  }
  
  return data || [];
}

async function getUserProfiles(groupId: string, userIds: string[]): Promise<any[]> {
  if (userIds.length === 0) return [];
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*, users(display_name, line_user_id)')
    .eq('group_id', groupId)
    .in('user_id', userIds);
  
  if (error) {
    console.error('[getUserProfiles] Error:', error);
    return [];
  }
  
  return data || [];
}

function detectBusinessContext(messages: any[]): any {
  const allText = messages.map(m => m.text.toLowerCase()).join(' ');
  
  const topics = [];
  const topicKeywords = {
    'sales': ['ขาย', 'ลูกค้า', 'sales', 'customer', 'quote', 'ใบเสนอราคา'],
    'inventory': ['สต็อก', 'สินค้า', 'stock', 'inventory', 'product', 'ของ'],
    'hr': ['สมัครงาน', 'พนักงาน', 'employee', 'hr', 'recruitment', 'hiring'],
    'finance': ['เงิน', 'ชำระ', 'บาท', 'invoice', 'payment', 'budget'],
    'operations': ['จัด', 'ทำ', 'operate', 'process', 'workflow'],
  };
  
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(kw => allText.includes(kw))) {
      topics.push(topic);
    }
  }
  
  const urgencyWords = ['ด่วน', 'urgent', 'asap', 'ทันที', 'เร็ว'];
  const urgency = urgencyWords.some(w => allText.includes(w)) ? 'high' : 'normal';
  
  const hasFinancial = /\d+\s*(บาท|baht|฿)/.test(allText) || 
                       ['เงิน', 'ชำระ', 'จ่าย', 'payment'].some(w => allText.includes(w));
  
  const hasDeadlines = /\d{1,2}[\/\-\.]\d{1,2}/.test(allText) ||
                      ['วันนี้', 'พรุ่งนี้', 'deadline', 'กำหนด'].some(w => allText.includes(w));
  
  return { topics, urgency, hasFinancial, hasDeadlines };
}

async function buildEnrichedContext(
  groupId: string, 
  messages: any[], 
  threadClusters: any[][]
): Promise<EnrichedContext> {
  console.log('[buildEnrichedContext] Building enriched context...');
  
  // Extract keywords from important messages for memory search
  const keywords = new Set<string>();
  messages.forEach(msg => {
    const words = msg.text.toLowerCase()
      .match(/[ก-๙a-z]{3,}/g) || [];
    words.forEach((w: string) => keywords.add(w));
  });
  
  const topKeywords = Array.from(keywords).slice(0, 20);
  
  // Extract unique user IDs
  const userIds = [...new Set(messages.map(m => m.user_id).filter(Boolean))];
  
  // Fetch all context in parallel
  const [workingMemories, longTermMemories, userProfiles] = await Promise.all([
    getWorkingMemoryContext(groupId),
    searchRelevantMemories(groupId, topKeywords),
    getUserProfiles(groupId, userIds)
  ]);
  
  const businessContext = detectBusinessContext(messages);
  
  console.log('[buildEnrichedContext] Context gathered:', {
    workingMemories: workingMemories.length,
    longTermMemories: longTermMemories.length,
    userProfiles: userProfiles.length,
    businessTopics: businessContext.topics
  });
  
  return {
    messages,
    threads: threadClusters,
    workingMemories,
    longTermMemories,
    userProfiles,
    businessContext
  };
}

// =============================
// PHASE 3: MULTI-STAGE AI PROMPTING
// =============================

interface SummaryQuality {
  completeness: number; // 0-1: How much of important content is covered
  actionability: number; // 0-1: How clear and actionable are items
  insightfulness: number; // 0-1: Depth of analysis
  confidence: number; // 0-1: Overall confidence in summary
  coverage: {
    messagesAnalyzed: number;
    threadsAnalyzed: number;
    usersInvolved: number;
    importantTopicsCovered: number;
  };
}

// =============================
// PHASE 4: QUALITY SCORING & VALIDATION
// =============================

function calculateSummaryQuality(
  context: EnrichedContext,
  structuredData: any,
  summaryText: string,
  originalMessageCount: number
): SummaryQuality {
  console.log('[calculateSummaryQuality] Analyzing summary quality...');
  
  // 1. COMPLETENESS SCORE (0-1)
  // Based on: decisions extracted, actions identified, questions captured, key info found
  let completeness = 0;
  const hasDecisions = (structuredData?.key_decisions?.length || 0) > 0;
  const hasActions = (structuredData?.action_items?.length || 0) > 0;
  const hasQuestions = (structuredData?.open_questions?.length || 0) > 0;
  const hasKeyInfo = (structuredData?.key_information?.length || 0) > 0;
  
  completeness += hasDecisions ? 0.3 : 0;
  completeness += hasActions ? 0.3 : 0;
  completeness += hasQuestions ? 0.2 : 0;
  completeness += hasKeyInfo ? 0.2 : 0;
  
  // Bonus if we found memories
  if (context.longTermMemories.length > 0) {
    completeness = Math.min(1.0, completeness + 0.1);
  }
  
  // 2. ACTIONABILITY SCORE (0-1)
  // Based on: clarity of action items, presence of assignees, deadlines
  let actionability = 0;
  const actions = structuredData?.action_items || [];
  if (actions.length > 0) {
    const withAssignee = actions.filter((a: any) => a.assignee && a.assignee !== 'ไม่ระบุ').length;
    const withDeadline = actions.filter((a: any) => a.deadline && a.deadline !== 'ไม่ระบุ').length;
    const withPriority = actions.filter((a: any) => a.priority && a.priority !== 'unclear').length;
    
    actionability = (
      (withAssignee / actions.length) * 0.4 +
      (withDeadline / actions.length) * 0.3 +
      (withPriority / actions.length) * 0.3
    );
  } else {
    // No actions = neutral score (not necessarily bad)
    actionability = 0.5;
  }
  
  // 3. INSIGHTFULNESS SCORE (0-1)
  // Based on: depth of summary, use of context, business understanding
  let insightfulness = 0;
  
  // Summary length (longer = more detailed, but not too long)
  const summaryLength = summaryText.length;
  if (summaryLength > 300 && summaryLength < 3000) {
    insightfulness += 0.3;
  } else if (summaryLength >= 200) {
    insightfulness += 0.15;
  }
  
  // Used business context
  if (context.businessContext.topics.length > 0) {
    insightfulness += 0.2;
  }
  
  // Used long-term memories
  if (context.longTermMemories.length > 0) {
    insightfulness += 0.2;
  }
  
  // Detected urgency
  if (context.businessContext.urgency === 'high') {
    insightfulness += 0.15;
  }
  
  // Multiple threads analyzed (shows deep understanding)
  if (context.threads.length > 2) {
    insightfulness += 0.15;
  }
  
  insightfulness = Math.min(1.0, insightfulness);
  
  // 4. CONFIDENCE SCORE (0-1)
  // Based on: data quality, coverage, consistency
  let confidence = 0;
  
  // Message coverage ratio
  const coverageRatio = context.messages.length / originalMessageCount;
  confidence += coverageRatio * 0.3;
  
  // Thread detection (good clustering = high confidence)
  if (context.threads.length > 0) {
    confidence += 0.2;
  }
  
  // Context enrichment (more context = higher confidence)
  const hasWorkingMem = context.workingMemories.length > 0;
  const hasLongTermMem = context.longTermMemories.length > 0;
  const hasProfiles = context.userProfiles.length > 0;
  
  if (hasWorkingMem) confidence += 0.15;
  if (hasLongTermMem) confidence += 0.15;
  if (hasProfiles) confidence += 0.1;
  
  // Consistency check (if decisions and actions exist, they should be related)
  if (hasDecisions && hasActions) {
    confidence += 0.1;
  }
  
  confidence = Math.min(1.0, confidence);
  
  // 5. COVERAGE METRICS
  const uniqueUsers = new Set(context.messages.map(m => m.user_id).filter(Boolean)).size;
  
  const coverage = {
    messagesAnalyzed: context.messages.length,
    threadsAnalyzed: context.threads.length,
    usersInvolved: uniqueUsers,
    importantTopicsCovered: context.businessContext.topics.length
  };
  
  console.log('[calculateSummaryQuality] Quality scores:', {
    completeness: completeness.toFixed(2),
    actionability: actionability.toFixed(2),
    insightfulness: insightfulness.toFixed(2),
    confidence: confidence.toFixed(2)
  });
  
  return {
    completeness,
    actionability,
    insightfulness,
    confidence,
    coverage
  };
}

async function extractStructuredData(context: EnrichedContext): Promise<any> {
  const messagesText = context.messages
    .map((m: any) => `[${m.users?.display_name || 'Unknown'}] ${m.text}`)
    .join('\n');
  
  const memoriesText = context.longTermMemories.length > 0
    ? '\n\n🧠 ความจำระยะยาว:\n' + context.longTermMemories
        .slice(0, 10)
        .map(mem => `- ${mem.title}: ${mem.content.substring(0, 150)}`)
        .join('\n')
    : '';
  
  const workingMemText = context.workingMemories.length > 0
    ? '\n\n💭 ความจำชั่วคราว:\n' + context.workingMemories
        .slice(0, 5)
        .map(wm => `- ${wm.content}`)
        .join('\n')
    : '';

  const extractionPrompt = `คุณเป็น AI Expert ในการวิเคราะห์การสนทนาธุรกิจ กรุณาแยกข้อมูลสำคัญจากการสนทนาต่อไปนี้

📊 METADATA:
- จำนวนข้อความ: ${context.messages.length}
- จำนวน Threads: ${context.threads.length}
- Business Context: ${context.businessContext.topics.join(', ') || 'General'}
- Urgency Level: ${context.businessContext.urgency}
- มีข้อมูลทางการเงิน: ${context.businessContext.hasFinancial ? 'ใช่' : 'ไม่'}
- มี Deadlines: ${context.businessContext.hasDeadlines ? 'ใช่' : 'ไม่'}
${memoriesText}
${workingMemText}

💬 MESSAGES:
${messagesText}

กรุณาวิเคราะห์และแยกข้อมูลเป็น JSON ตามรูปแบบนี้:

{
  "key_decisions": [
    {
      "decision": "คำอธิบายการตัดสินใจ",
      "who": "ชื่อผู้ตัดสินใจ",
      "impact": "high/medium/low",
      "reasoning": "เหตุผล"
    }
  ],
  "action_items": [
    {
      "task": "งานที่ต้องทำ",
      "assignee": "@ชื่อผู้รับผิดชอบ",
      "deadline": "กำหนดเวลา หรือ null",
      "priority": "urgent/high/medium/low",
      "status": "pending/mentioned/unclear"
    }
  ],
  "open_questions": [
    {
      "question": "คำถาม",
      "asker": "ผู้ถาม",
      "context": "บริบท",
      "importance": "high/medium/low"
    }
  ],
  "key_information": [
    {
      "type": "financial/contact/deadline/data/other",
      "content": "ข้อมูล",
      "relevance": "high/medium/low"
    }
  ]
}

ตอบเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบายเพิ่ม`;

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
          { role: 'system', content: 'คุณเป็น AI ที่เชี่ยวชาญในการแยกและจัดโครงสร้างข้อมูลจากการสนทนา ตอบเป็น JSON เท่านั้น' },
          { role: 'user', content: extractionPrompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error('[extractStructuredData] API error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Try to parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return null;
  } catch (err) {
    console.error('[extractStructuredData] Exception:', err);
    return null;
  }
}

async function generateExecutiveSummary(context: EnrichedContext, structuredData: any): Promise<string> {
  const decisionsText = structuredData?.key_decisions?.length > 0
    ? structuredData.key_decisions
        .map((d: any, i: number) => `${i + 1}. **${d.decision}** (โดย ${d.who})\n   - Impact: ${d.impact}\n   - เหตุผล: ${d.reasoning}`)
        .join('\n\n')
    : 'ไม่มีการตัดสินใจที่ชัดเจน';

  const actionsText = structuredData?.action_items?.length > 0
    ? structuredData.action_items
        .map((a: any, i: number) => `${i + 1}. ${a.task}\n   - ผู้รับผิดชอบ: ${a.assignee}\n   - Deadline: ${a.deadline || 'ไม่ระบุ'}\n   - Priority: ${a.priority}`)
        .join('\n\n')
    : 'ไม่มีงานที่ระบุชัดเจน';

  const questionsText = structuredData?.open_questions?.length > 0
    ? structuredData.open_questions
        .map((q: any, i: number) => `${i + 1}. ${q.question}\n   - ผู้ถาม: ${q.asker}\n   - บริบท: ${q.context}`)
        .join('\n\n')
    : 'ไม่มีคำถามค้างคำตอบ';

  const keyInfoText = structuredData?.key_information?.length > 0
    ? structuredData.key_information
        .filter((k: any) => k.relevance === 'high')
        .map((k: any, i: number) => `${i + 1}. [${k.type}] ${k.content}`)
        .join('\n')
    : 'ไม่มีข้อมูลสำคัญเพิ่มเติม';

  const summaryPrompt = `สร้างสรุปการสนทนาแบบ Executive Summary ที่ครบถ้วนและเป็นมืออาชีพ

📊 CONTEXT:
- Business Topics: ${context.businessContext.topics.join(', ') || 'General Discussion'}
- Urgency: ${context.businessContext.urgency === 'high' ? '🔴 สูง' : '🟢 ปกติ'}
- Threads: ${context.threads.length} conversation threads
- Messages Analyzed: ${context.messages.length}

📋 DECISIONS (${structuredData?.key_decisions?.length || 0}):
${decisionsText}

✅ ACTION ITEMS (${structuredData?.action_items?.length || 0}):
${actionsText}

❓ OPEN QUESTIONS (${structuredData?.open_questions?.length || 0}):
${questionsText}

💡 KEY INFORMATION:
${keyInfoText}

กรุณาสร้างสรุปที่:
1. เริ่มด้วย Executive Summary 2-3 ประโยค (ภาพรวมสำคัญที่สุด)
2. สรุปหัวข้อหลัก (3-7 หัวข้อ) พร้อมรายละเอียดย่อ
3. ยกประเด็นสำคัญที่ต้องติดตาม
4. ชี้ Red Flags หรือความเสี่ยง (ถ้ามี)
5. แนะนำ Next Steps

ใช้ภาษาไทยที่เป็นมืออาชีพ กระชับ และอ่านง่าย`;

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
          { role: 'system', content: 'คุณเป็น Executive Assistant ที่เชี่ยวชาญในการสรุปการประชุมและการสนทนาธุรกิจอย่างเป็นมืออาชีพ' },
          { role: 'user', content: summaryPrompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error('[generateExecutiveSummary] API error:', response.status);
      return 'ไม่สามารถสร้างสรุปได้';
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) {
    console.error('[generateExecutiveSummary] Exception:', err);
    return 'เกิดข้อผิดพลาดในการสร้างสรุป';
  }
}

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[report-generator] Starting...');
    
    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { groupId: requestedGroupId, type, messageLimit } = body;

    // Phase 0A: HTTP-invoked admin reports require role check.
    // The 'auto_summary' type is invoked internally by line-webhook (service role),
    // so we skip the human role guard for that path only.
    let callerUserId: string | null = null;
    let callerRole: string | null = null;
    if (type !== 'auto_summary') {
      try {
        const r = await requireRole(
          req,
          ['admin', 'owner', 'hr', 'manager', 'executive'],
          { functionName: 'report-generator' },
        );
        callerUserId = r.userId;
        callerRole = r.role;
      } catch (e) {
        const r = authzErrorResponse(e, corsHeaders);
        if (r) return r;
        throw e;
      }
    }

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
      const cleanMessages = filterNoiseMessages(messages);
      console.log(`[report-generator] After noise removal: ${cleanMessages.length} messages`);
      
      // Cluster messages into threads
      const threadClusters = clusterMessagesByThread(cleanMessages);
      console.log(`[report-generator] Identified ${threadClusters.length} conversation threads`);
      
      // Score and select important messages (max 100 for AI processing)
      const selectedMessages = selectImportantMessages(cleanMessages, 100);
      console.log(`[report-generator] Selected ${selectedMessages.length} important messages for summary`);

      // Phase 2: Build Enriched Context
      const enrichedContext = await buildEnrichedContext(requestedGroupId, selectedMessages, threadClusters);
      console.log(`[report-generator] Context enriched with memories and profiles`);

      // Phase 3: Multi-Stage AI Processing
      // Stage 1: Extract structured data
      const structuredData = await extractStructuredData(enrichedContext);
      console.log(`[report-generator] Structured data extracted:`, {
        decisions: structuredData?.key_decisions?.length || 0,
        actions: structuredData?.action_items?.length || 0,
        questions: structuredData?.open_questions?.length || 0
      });

      // Stage 2: Generate executive summary
      const summaryText = await generateExecutiveSummary(enrichedContext, structuredData);
      console.log(`[report-generator] Executive summary generated`);

      // Phase 4: Calculate Quality Scores
      const qualityMetrics = calculateSummaryQuality(
        enrichedContext,
        structuredData,
        summaryText,
        messages.length
      );
      console.log(`[report-generator] Quality assessment completed`);

      // Enhanced extraction logic based on importance scores
      const decisions = structuredData?.key_decisions || [];
      const actionItems = structuredData?.action_items || [];
      const openQuestions = (structuredData?.open_questions || []).map((q: any) => 
        `[${q.asker}] ${q.question}`
      );

      // Save summary to database with enhanced metadata
      const { error: insertError } = await supabase
        .from('chat_summaries')
        .insert({
          group_id: requestedGroupId,
          summary_text: summaryText,
          from_time: messages[messages.length - 1].sent_at,
          to_time: messages[0].sent_at,
          message_count: messages.length,
          main_topics: enrichedContext.businessContext.topics,
          decisions: decisions,
          action_items: actionItems,
          open_questions: openQuestions,
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
          message: 'Auto-summary created with enriched context',
          stats: {
            total_messages: messages.length,
            clean_messages: cleanMessages.length,
            threads: threadClusters.length,
            selected_messages: selectedMessages.length,
            decisions: decisions.length,
            actions: actionItems.length,
            questions: openQuestions.length,
            context: {
              working_memories: enrichedContext.workingMemories.length,
              long_term_memories: enrichedContext.longTermMemories.length,
              user_profiles: enrichedContext.userProfiles.length,
              business_topics: enrichedContext.businessContext.topics
            },
            quality: {
              completeness: Math.round(qualityMetrics.completeness * 100),
              actionability: Math.round(qualityMetrics.actionability * 100),
              insightfulness: Math.round(qualityMetrics.insightfulness * 100),
              confidence: Math.round(qualityMetrics.confidence * 100),
              coverage: qualityMetrics.coverage
            }
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
    const bangkokNow = toZonedTime(now, BANGKOK_TIMEZONE);
    const dayOfWeek = bangkokNow.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const hour = bangkokNow.getHours();

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

    // Phase 0B — best-effort audit on the human-invoked manual path only.
    // The cron/internal `auto_summary` path is intentionally NOT audited (returns earlier at line ~1169).
    if (type !== 'auto_summary') {
      await writeAuditLog(supabase, {
        functionName: 'report-generator',
        actionType: 'generate',
        resourceType: 'group_report',
        resourceId: requestedGroupId ?? null,
        performedByUserId: callerUserId,
        callerRole,
        metadata: {
          count: results.length,
          mode: 'manual',
          requested_group_id: requestedGroupId ?? null,
          source: 'admin_ui',
        },
      });
    }

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
