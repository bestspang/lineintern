import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokNow, getBangkokDateString } from "../_shared/timezone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SentimentResult {
  score: number; // -1 to 1
  emotion: string;
}

// Enhanced sentiment analysis with emotion detection
function analyzeSentiment(text: string): SentimentResult {
  const lowerText = text.toLowerCase();
  
  const emotionKeywords = {
    joy: ["happy", "great", "awesome", "love", "amazing", "wonderful", "excellent", "ดีใจ", "สุดยอด", "รัก", "ดีมาก", "เยี่ยม", "555", "haha", "😊", "😄", "🎉"],
    anger: ["angry", "hate", "stupid", "annoying", "โกรธ", "เกลียด", "โง่", "น่ารำคาญ", "ห่า", "😡", "🤬"],
    sadness: ["sad", "sorry", "disappointed", "miss", "เศร้า", "เสียใจ", "คิดถึง", "ผิดหวัง", "😢", "😭"],
    fear: ["scared", "worried", "afraid", "nervous", "กลัว", "เป็นห่วง", "กังวล", "😰", "😨"],
    surprise: ["wow", "omg", "really", "โอ้", "จริงหรอ", "ไม่จริง", "เหรอ", "😱", "😮"],
    neutral: [],
  };
  
  let maxScore = 0;
  let dominantEmotion = "neutral";
  let sentimentScore = 0;
  
  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    let emotionScore = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw)) {
        emotionScore += 1;
      }
    }
    if (emotionScore > maxScore) {
      maxScore = emotionScore;
      dominantEmotion = emotion;
    }
  }
  
  // Calculate sentiment score
  const positiveEmotions = ["joy", "surprise"];
  const negativeEmotions = ["anger", "sadness", "fear"];
  
  if (positiveEmotions.includes(dominantEmotion)) {
    sentimentScore = Math.min(1, maxScore * 0.3);
  } else if (negativeEmotions.includes(dominantEmotion)) {
    sentimentScore = Math.max(-1, -maxScore * 0.3);
  }
  
  return { score: sentimentScore, emotion: dominantEmotion };
}

// Calculate network centrality metrics
function calculateNetworkMetrics(interactions: any[]): Record<string, any> {
  const userInteractions: Record<string, { outbound: Set<string>; inbound: Set<string>; total: number }> = {};
  
  // Build interaction graph
  for (const msg of interactions) {
    const userId = msg.user_id;
    if (!userId) continue;
    
    if (!userInteractions[userId]) {
      userInteractions[userId] = { outbound: new Set(), inbound: new Set(), total: 0 };
    }
    userInteractions[userId].total++;
    
    // If message mentions another user, count as outbound
    if (msg.reply_to_user_id) {
      userInteractions[userId].outbound.add(msg.reply_to_user_id);
      if (!userInteractions[msg.reply_to_user_id]) {
        userInteractions[msg.reply_to_user_id] = { outbound: new Set(), inbound: new Set(), total: 0 };
      }
      userInteractions[msg.reply_to_user_id].inbound.add(userId);
    }
  }
  
  const totalUsers = Object.keys(userInteractions).length;
  const maxConnections = Math.max(1, totalUsers - 1);
  
  const metrics: Record<string, any> = {};
  
  for (const [userId, data] of Object.entries(userInteractions)) {
    const uniqueContacts = new Set([...data.outbound, ...data.inbound]).size;
    const degreeCentrality = uniqueContacts / maxConnections;
    
    // Determine network role
    let networkRole = "regular";
    if (degreeCentrality > 0.7 && data.total > 10) {
      networkRole = "influencer";
    } else if (degreeCentrality > 0.5 && data.outbound.size > data.inbound.size) {
      networkRole = "connector";
    } else if (degreeCentrality < 0.2 && data.total < 5) {
      networkRole = "outsider";
    }
    
    metrics[userId] = {
      degree_centrality: Math.round(degreeCentrality * 10000) / 10000,
      unique_contacts: uniqueContacts,
      total_interactions: data.total,
      communication_direction: {
        outbound: data.outbound.size,
        inbound: data.inbound.size,
      },
      network_role: networkRole,
    };
  }
  
  return metrics;
}

// Detect burnout signals
function detectBurnoutSignals(
  avgSentiment: number,
  negativeRatio: number,
  messageCount: number,
  prevMessageCount: number
): { score: number; signals: string[] } {
  const signals: string[] = [];
  let burnoutScore = 0;
  
  // Very negative sentiment
  if (avgSentiment < -0.3) {
    signals.push("high_negativity");
    burnoutScore += 0.25;
  }
  
  // High negative message ratio
  if (negativeRatio > 0.4) {
    signals.push("frequent_negative_messages");
    burnoutScore += 0.2;
  }
  
  // Significant drop in engagement
  if (prevMessageCount > 0 && messageCount < prevMessageCount * 0.5) {
    signals.push("declining_engagement");
    burnoutScore += 0.3;
  }
  
  // Low engagement
  if (messageCount < 3) {
    signals.push("low_engagement");
    burnoutScore += 0.15;
  }
  
  // Late night activity (if messages are timestamped late)
  // This would require timestamp analysis
  
  return {
    score: Math.min(1, Math.round(burnoutScore * 100) / 100),
    signals,
  };
}

// Check if time is within working hours
function isWithinWorkingHours(timestamp: Date, shiftStart = "08:00", shiftEnd = "18:00"): boolean {
  const bangkokTime = new Date(timestamp.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const hours = bangkokTime.getHours();
  const minutes = bangkokTime.getMinutes();
  const currentTime = hours * 60 + minutes;
  
  const [startH, startM] = shiftStart.split(":").map(Number);
  const [endH, endM] = shiftEnd.split(":").map(Number);
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;
  
  // Also check if it's a weekday (Mon-Fri)
  const dayOfWeek = bangkokTime.getDay();
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  
  return isWeekday && currentTime >= startTime && currentTime <= endTime;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, groupId, date } = await req.json();
    const targetDate = date || getBangkokDateString(getBangkokNow());

    console.log(`[sentiment-tracker] Action: ${action}, Group: ${groupId || 'all'}, Date: ${targetDate}`);

    switch (action) {
      case "aggregate_daily": {
        // Aggregate daily sentiment for all users in a group (or all groups)
        let groupFilter = groupId ? `group_id.eq.${groupId}` : undefined;
        
        // Get messages from the target date
        const startOfDay = `${targetDate}T00:00:00+07:00`;
        const endOfDay = `${targetDate}T23:59:59+07:00`;
        
        let query = supabase
          .from("messages")
          .select("id, user_id, group_id, text, sentiment, sent_at, direction, response_time_seconds, is_within_work_hours")
          .gte("sent_at", startOfDay)
          .lte("sent_at", endOfDay)
          .eq("direction", "incoming");
        
        if (groupId) {
          query = query.eq("group_id", groupId);
        }
        
        const { data: messages, error: msgError } = await query;
        
        if (msgError) throw msgError;
        
        if (!messages || messages.length === 0) {
          return new Response(
            JSON.stringify({ success: true, message: "No messages to process", processed: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Group messages by user and group
        const userGroupMessages: Record<string, any[]> = {};
        
        for (const msg of messages) {
          if (!msg.user_id || !msg.group_id) continue;
          const key = `${msg.user_id}|${msg.group_id}`;
          if (!userGroupMessages[key]) userGroupMessages[key] = [];
          userGroupMessages[key].push(msg);
        }
        
        // Process each user-group combination
        const results: any[] = [];
        
        for (const [key, msgs] of Object.entries(userGroupMessages)) {
          const [userId, gId] = key.split("|");
          
          // Analyze sentiment for each message
          let totalSentiment = 0;
          let positiveCount = 0;
          let negativeCount = 0;
          let neutralCount = 0;
          const emotionBreakdown: Record<string, number> = {};
          
          for (const msg of msgs) {
            const result = analyzeSentiment(msg.text || "");
            totalSentiment += result.score;
            
            if (result.score > 0.1) positiveCount++;
            else if (result.score < -0.1) negativeCount++;
            else neutralCount++;
            
            emotionBreakdown[result.emotion] = (emotionBreakdown[result.emotion] || 0) + 1;
          }
          
          const avgSentiment = msgs.length > 0 ? totalSentiment / msgs.length : 0;
          const negativeRatio = msgs.length > 0 ? negativeCount / msgs.length : 0;
          
          // Get previous day's message count for burnout detection
          const prevDate = new Date(targetDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const prevDateStr = prevDate.toISOString().split("T")[0];
          
          const { data: prevSentiment } = await supabase
            .from("user_sentiment_history")
            .select("message_count")
            .eq("user_id", userId)
            .eq("group_id", gId)
            .eq("date", prevDateStr)
            .maybeSingle();
          
          const prevMessageCount = prevSentiment?.message_count || 0;
          
          // Detect burnout signals
          const burnout = detectBurnoutSignals(avgSentiment, negativeRatio, msgs.length, prevMessageCount);
          
          // Upsert sentiment history
          const { error: upsertError } = await supabase
            .from("user_sentiment_history")
            .upsert({
              user_id: userId,
              group_id: gId,
              date: targetDate,
              message_count: msgs.length,
              avg_sentiment: Math.round(avgSentiment * 100) / 100,
              positive_count: positiveCount,
              negative_count: negativeCount,
              neutral_count: neutralCount,
              emotion_breakdown: emotionBreakdown,
              burnout_score: burnout.score,
              burnout_signals: burnout.signals,
            }, {
              onConflict: "user_id,group_id,date",
            });
          
          if (upsertError) {
            console.error(`[sentiment-tracker] Error upserting sentiment for ${userId}:`, upsertError);
          } else {
            results.push({ userId, groupId: gId, avgSentiment, burnoutScore: burnout.score });
          }
        }
        
        console.log(`[sentiment-tracker] Processed ${results.length} user-group combinations`);
        
        return new Response(
          JSON.stringify({ success: true, processed: results.length, results }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "calculate_network": {
        // Calculate network metrics for a group
        if (!groupId) {
          throw new Error("groupId required for network calculation");
        }
        
        const now = getBangkokNow();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const periodStart = weekAgo.toISOString().split("T")[0];
        const periodEnd = now.toISOString().split("T")[0];
        
        // Get messages from the past week
        const { data: messages, error: msgError } = await supabase
          .from("messages")
          .select("id, user_id, group_id, text, sent_at, reply_to_message_id")
          .eq("group_id", groupId)
          .eq("direction", "incoming")
          .gte("sent_at", `${periodStart}T00:00:00+07:00`)
          .lte("sent_at", `${periodEnd}T23:59:59+07:00`);
        
        if (msgError) throw msgError;
        
        // Get reply target users
        const messagesWithReplyUser = [];
        for (const msg of messages || []) {
          let replyToUserId = null;
          if (msg.reply_to_message_id) {
            const { data: replyMsg } = await supabase
              .from("messages")
              .select("user_id")
              .eq("id", msg.reply_to_message_id)
              .maybeSingle();
            replyToUserId = replyMsg?.user_id;
          }
          messagesWithReplyUser.push({ ...msg, reply_to_user_id: replyToUserId });
        }
        
        const networkMetrics = calculateNetworkMetrics(messagesWithReplyUser);
        
        // Upsert network metrics for each user
        const results: any[] = [];
        for (const [userId, metrics] of Object.entries(networkMetrics)) {
          const { error: upsertError } = await supabase
            .from("user_network_metrics")
            .upsert({
              user_id: userId,
              group_id: groupId,
              period_start: periodStart,
              period_end: periodEnd,
              degree_centrality: metrics.degree_centrality,
              unique_contacts: metrics.unique_contacts,
              total_interactions: metrics.total_interactions,
              communication_direction: metrics.communication_direction,
              network_role: metrics.network_role,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "user_id,group_id,period_start,period_end",
            });
          
          if (upsertError) {
            console.error(`[sentiment-tracker] Error upserting network for ${userId}:`, upsertError);
          } else {
            results.push({ userId, ...metrics });
          }
        }
        
        console.log(`[sentiment-tracker] Calculated network metrics for ${results.length} users`);
        
        return new Response(
          JSON.stringify({ success: true, processed: results.length, results }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "aggregate_response_analytics": {
        // Aggregate response time analytics
        let query = supabase
          .from("messages")
          .select("id, user_id, group_id, sent_at, response_time_seconds, is_within_work_hours, direction")
          .gte("sent_at", `${targetDate}T00:00:00+07:00`)
          .lte("sent_at", `${targetDate}T23:59:59+07:00`);
        
        if (groupId) {
          query = query.eq("group_id", groupId);
        }
        
        const { data: messages, error: msgError } = await query;
        
        if (msgError) throw msgError;
        
        // Group by user and group
        const userGroupStats: Record<string, any> = {};
        
        for (const msg of messages || []) {
          if (!msg.user_id || !msg.group_id) continue;
          const key = `${msg.user_id}|${msg.group_id}`;
          
          if (!userGroupStats[key]) {
            userGroupStats[key] = {
              user_id: msg.user_id,
              group_id: msg.group_id,
              sent: 0,
              replies_received: 0,
              response_times: [],
              work_hours: 0,
              outside_work_hours: 0,
            };
          }
          
          if (msg.direction === "incoming") {
            userGroupStats[key].sent++;
            if (msg.is_within_work_hours) {
              userGroupStats[key].work_hours++;
            } else {
              userGroupStats[key].outside_work_hours++;
            }
          }
          
          if (msg.response_time_seconds) {
            userGroupStats[key].replies_received++;
            userGroupStats[key].response_times.push(msg.response_time_seconds);
          }
        }
        
        // Calculate and upsert analytics
        const results: any[] = [];
        for (const stats of Object.values(userGroupStats)) {
          const responseTimes = stats.response_times;
          const avgResponseTime = responseTimes.length > 0
            ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
            : null;
          const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : null;
          const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : null;
          
          // Calculate ghost score using database function
          const ghostScore = calculateGhostScore(stats.sent, stats.replies_received, avgResponseTime);
          
          const { error: upsertError } = await supabase
            .from("response_analytics")
            .upsert({
              user_id: stats.user_id,
              group_id: stats.group_id,
              date: targetDate,
              total_messages_sent: stats.sent,
              total_replies_received: stats.replies_received,
              avg_response_time_seconds: avgResponseTime,
              min_response_time_seconds: minResponseTime,
              max_response_time_seconds: maxResponseTime,
              messages_during_work_hours: stats.work_hours,
              messages_outside_work_hours: stats.outside_work_hours,
              ghost_score: ghostScore,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "user_id,group_id,date",
            });
          
          if (!upsertError) {
            results.push({ userId: stats.user_id, ghostScore, avgResponseTime });
          }
        }
        
        return new Response(
          JSON.stringify({ success: true, processed: results.length, results }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      case "get_team_health": {
        // Get team health summary for a group
        if (!groupId) {
          throw new Error("groupId required for team health");
        }
        
        // Get latest sentiment data
        const { data: sentimentData, error: sentErr } = await supabase
          .from("user_sentiment_history")
          .select("*, users!inner(display_name, avatar_url)")
          .eq("group_id", groupId)
          .gte("date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
          .order("date", { ascending: false });
        
        if (sentErr) throw sentErr;
        
        // Get network metrics
        const { data: networkData, error: netErr } = await supabase
          .from("user_network_metrics")
          .select("*, users!inner(display_name, avatar_url)")
          .eq("group_id", groupId)
          .order("updated_at", { ascending: false });
        
        if (netErr) throw netErr;
        
        // Get response analytics
        const { data: responseData, error: respErr } = await supabase
          .from("response_analytics")
          .select("*, users!inner(display_name, avatar_url)")
          .eq("group_id", groupId)
          .gte("date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
          .order("date", { ascending: false });
        
        if (respErr) throw respErr;
        
        // Calculate team health metrics
        const uniqueUsers = new Set([
          ...sentimentData?.map((s: any) => s.user_id) || [],
          ...networkData?.map((n: any) => n.user_id) || [],
        ]);
        
        const burnoutRiskUsers = sentimentData?.filter((s: any) => s.burnout_score > 0.5) || [];
        const ghostUsers = responseData?.filter((r: any) => r.ghost_score > 0.7) || [];
        const outsiders = networkData?.filter((n: any) => n.network_role === "outsider") || [];
        const influencers = networkData?.filter((n: any) => n.network_role === "influencer") || [];
        
        const avgSentiment = sentimentData?.length
          ? sentimentData.reduce((sum: number, s: any) => sum + (s.avg_sentiment || 0), 0) / sentimentData.length
          : 0;
        
        return new Response(
          JSON.stringify({
            success: true,
            teamHealth: {
              totalUsers: uniqueUsers.size,
              avgSentiment: Math.round(avgSentiment * 100) / 100,
              burnoutRiskCount: burnoutRiskUsers.length,
              burnoutRiskUsers: burnoutRiskUsers.slice(0, 5),
              ghostCount: ghostUsers.length,
              ghostUsers: ghostUsers.slice(0, 5),
              outsiderCount: outsiders.length,
              outsiders: outsiders.slice(0, 5),
              influencerCount: influencers.length,
              influencers: influencers.slice(0, 5),
              sentimentHistory: sentimentData?.slice(0, 50),
              networkMetrics: networkData?.slice(0, 20),
              responseAnalytics: responseData?.slice(0, 50),
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      default:
        throw new Error(`Invalid action: ${action}`);
    }
  } catch (error) {
    console.error("[sentiment-tracker] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Calculate ghost score (mirrors database function)
function calculateGhostScore(totalSent: number, repliesReceived: number, avgResponseTime: number | null): number {
  if (totalSent === 0) return 0;
  
  const replyRatio = Math.min(1, (repliesReceived || 0) / totalSent);
  const timePenalty = Math.min(1, (avgResponseTime || 0) / 14400); // 4 hours = max penalty
  
  const ghostScore = (1 - replyRatio) * 0.6 + timePenalty * 0.4;
  return Math.round(ghostScore * 100) / 100;
}
