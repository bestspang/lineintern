import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokNow, getBangkokDateString, formatBangkokTime } from "../_shared/timezone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TeamHealthReport {
  weeklyStats: {
    totalMessages: number;
    activeUsers: number;
    avgSentiment: number;
    avgResponseTimeWorkHours: number | null;
    avgResponseTimeOutsideHours: number | null;
  };
  burnoutRisk: { name: string; score: number; signals: string[] }[];
  topGhosters: { name: string; ghostScore: number; avgResponseTime: number | null }[];
  influencers: { name: string; centrality: number; role: string }[];
  outsiders: { name: string; interactions: number }[];
  sentimentTrend: { date: string; avgSentiment: number }[];
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "N/A";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function getSentimentEmoji(sentiment: number): string {
  if (sentiment > 0.3) return "😊";
  if (sentiment > 0.1) return "🙂";
  if (sentiment > -0.1) return "😐";
  if (sentiment > -0.3) return "😟";
  return "😢";
}

function getBurnoutEmoji(score: number): string {
  if (score >= 0.7) return "🔴";
  if (score >= 0.5) return "🟠";
  if (score >= 0.3) return "🟡";
  return "🟢";
}

async function generateTeamHealthReport(
  supabase: any,
  groupId?: string
): Promise<TeamHealthReport> {
  const now = getBangkokNow();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoStr = getBangkokDateString(weekAgo);
  const todayStr = getBangkokDateString(now);

  // 1. Get message stats
  let msgQuery = supabase
    .from("messages")
    .select("id, user_id, sent_at, response_time_seconds, is_within_work_hours", { count: "exact" })
    .eq("direction", "human")
    .gte("sent_at", `${weekAgoStr}T00:00:00+07:00`)
    .lte("sent_at", `${todayStr}T23:59:59+07:00`);

  if (groupId) {
    msgQuery = msgQuery.eq("group_id", groupId);
  }

  const { data: messages, count: totalMessages } = await msgQuery;

  // Calculate active users
  const uniqueUsers = new Set((messages || []).map((m: any) => m.user_id).filter(Boolean));
  const activeUsers = uniqueUsers.size;

  // Calculate response times by work hours
  const workHoursTimes: number[] = [];
  const outsideHoursTimes: number[] = [];
  
  for (const msg of messages || []) {
    if (msg.response_time_seconds) {
      if (msg.is_within_work_hours) {
        workHoursTimes.push(msg.response_time_seconds);
      } else {
        outsideHoursTimes.push(msg.response_time_seconds);
      }
    }
  }

  const avgResponseTimeWorkHours = workHoursTimes.length > 0
    ? Math.round(workHoursTimes.reduce((a, b) => a + b, 0) / workHoursTimes.length)
    : null;
  const avgResponseTimeOutsideHours = outsideHoursTimes.length > 0
    ? Math.round(outsideHoursTimes.reduce((a, b) => a + b, 0) / outsideHoursTimes.length)
    : null;

  // 2. Get sentiment history
  let sentimentQuery = supabase
    .from("user_sentiment_history")
    .select("*, users!inner(display_name)")
    .gte("date", weekAgoStr)
    .lte("date", todayStr)
    .order("date", { ascending: false });

  if (groupId) {
    sentimentQuery = sentimentQuery.eq("group_id", groupId);
  }

  const { data: sentimentData } = await sentimentQuery;

  // Calculate average sentiment
  const avgSentiment = sentimentData?.length > 0
    ? sentimentData.reduce((sum: number, s: any) => sum + (s.avg_sentiment || 0), 0) / sentimentData.length
    : 0;

  // Get sentiment trend by date
  const sentimentByDate: Record<string, { total: number; count: number }> = {};
  for (const s of sentimentData || []) {
    if (!sentimentByDate[s.date]) {
      sentimentByDate[s.date] = { total: 0, count: 0 };
    }
    sentimentByDate[s.date].total += s.avg_sentiment || 0;
    sentimentByDate[s.date].count++;
  }
  const sentimentTrend = Object.entries(sentimentByDate)
    .map(([date, data]) => ({
      date,
      avgSentiment: Math.round((data.total / data.count) * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Get burnout risk users
  const burnoutRisk = (sentimentData || [])
    .filter((s: any) => s.burnout_score >= 0.5)
    .map((s: any) => ({
      name: s.users?.display_name || "Unknown",
      score: s.burnout_score,
      signals: Array.isArray(s.burnout_signals) ? s.burnout_signals : [],
    }))
    .slice(0, 5);

  // 3. Get response analytics (ghosters)
  let responseQuery = supabase
    .from("response_analytics")
    .select("*, users!inner(display_name)")
    .gte("date", weekAgoStr)
    .order("ghost_score", { ascending: false })
    .limit(10);

  if (groupId) {
    responseQuery = responseQuery.eq("group_id", groupId);
  }

  const { data: responseData } = await responseQuery;

  const topGhosters = (responseData || [])
    .filter((r: any) => r.ghost_score > 0.3)
    .map((r: any) => ({
      name: r.users?.display_name || "Unknown",
      ghostScore: Math.round(r.ghost_score * 100),
      avgResponseTime: r.avg_response_time_seconds,
    }))
    .slice(0, 5);

  // 4. Get network metrics
  let networkQuery = supabase
    .from("user_network_metrics")
    .select("*, users!inner(display_name)")
    .order("degree_centrality", { ascending: false });

  if (groupId) {
    networkQuery = networkQuery.eq("group_id", groupId);
  }

  const { data: networkData } = await networkQuery;

  const influencers = (networkData || [])
    .filter((n: any) => n.network_role === "influencer" || n.degree_centrality > 0.5)
    .map((n: any) => ({
      name: n.users?.display_name || "Unknown",
      centrality: Math.round(n.degree_centrality * 100) / 100,
      role: n.network_role,
    }))
    .slice(0, 5);

  const outsiders = (networkData || [])
    .filter((n: any) => n.network_role === "outsider" || n.degree_centrality < 0.2)
    .map((n: any) => ({
      name: n.users?.display_name || "Unknown",
      interactions: n.total_interactions,
    }))
    .slice(0, 5);

  return {
    weeklyStats: {
      totalMessages: totalMessages || 0,
      activeUsers,
      avgSentiment: Math.round(avgSentiment * 100) / 100,
      avgResponseTimeWorkHours,
      avgResponseTimeOutsideHours,
    },
    burnoutRisk,
    topGhosters,
    influencers,
    outsiders,
    sentimentTrend,
  };
}

function formatReportForLINE(report: TeamHealthReport, weekStart: string, weekEnd: string): string {
  const { weeklyStats, burnoutRisk, topGhosters, influencers, outsiders } = report;

  let message = `📊 Weekly Team Health Report\n`;
  message += `📅 ${weekStart} - ${weekEnd}\n\n`;

  // Overview
  message += `📈 Overview:\n`;
  message += `• Messages: ${weeklyStats.totalMessages}\n`;
  message += `• Active Users: ${weeklyStats.activeUsers}\n`;
  message += `• Team Mood: ${getSentimentEmoji(weeklyStats.avgSentiment)} (${weeklyStats.avgSentiment.toFixed(2)})\n\n`;

  // Response Times
  message += `⏱ Response Time:\n`;
  message += `• Work Hours: ${formatDuration(weeklyStats.avgResponseTimeWorkHours)}\n`;
  message += `• Outside Hours: ${formatDuration(weeklyStats.avgResponseTimeOutsideHours)}\n\n`;

  // Burnout Risk
  if (burnoutRisk.length > 0) {
    message += `⚠️ Burnout Risk (${burnoutRisk.length}):\n`;
    burnoutRisk.forEach((u, i) => {
      message += `${i + 1}. ${getBurnoutEmoji(u.score)} ${u.name} (${Math.round(u.score * 100)}%)\n`;
    });
    message += `\n`;
  }

  // Ghost Alert
  if (topGhosters.length > 0) {
    message += `👻 Ghost Alert (${topGhosters.length}):\n`;
    topGhosters.forEach((u, i) => {
      message += `${i + 1}. ${u.name} - ${u.ghostScore}%`;
      if (u.avgResponseTime) {
        message += ` (${formatDuration(u.avgResponseTime)})`;
      }
      message += `\n`;
    });
    message += `\n`;
  }

  // Influencers
  if (influencers.length > 0) {
    message += `🌟 Top Influencers:\n`;
    influencers.forEach((u, i) => {
      message += `${i + 1}. ${u.name} (${u.centrality})\n`;
    });
    message += `\n`;
  }

  // Outsiders needing attention
  if (outsiders.length > 0) {
    message += `🔍 Needs Attention:\n`;
    outsiders.forEach((u, i) => {
      message += `${i + 1}. ${u.name} (${u.interactions} interactions)\n`;
    });
    message += `\n`;
  }

  // Recommendations
  const recommendations: string[] = [];
  if (burnoutRisk.length > 0) {
    recommendations.push(`Check in with ${burnoutRisk[0].name} regarding workload`);
  }
  if (topGhosters.length > 0) {
    recommendations.push(`Engage ${topGhosters.map(g => g.name).join(", ")} in team discussions`);
  }
  if (weeklyStats.avgSentiment < 0) {
    recommendations.push(`Consider team morale activities`);
  }

  if (recommendations.length > 0) {
    message += `💡 Recommendations:\n`;
    recommendations.forEach(r => {
      message += `• ${r}\n`;
    });
  }

  return message.trim();
}

async function sendToLINE(lineGroupId: string, message: string): Promise<boolean> {
  const channelAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  if (!channelAccessToken) {
    console.error("[team-health-report] LINE_CHANNEL_ACCESS_TOKEN not set");
    return false;
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: lineGroupId,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[team-health-report] LINE API error:", response.status, errorText);
      return false;
    }

    console.log("[team-health-report] Successfully sent report to LINE group");
    return true;
  } catch (error) {
    console.error("[team-health-report] Error sending to LINE:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { action, groupId } = body;

    console.log(`[team-health-report] Action: ${action || "send_weekly_report"}, GroupId: ${groupId || "all"}`);

    const now = getBangkokNow();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStart = formatBangkokTime(weekAgo, "MMM d");
    const weekEnd = formatBangkokTime(now, "MMM d, yyyy");

    if (action === "generate_report" || action === "preview") {
      // Just generate and return the report (for API/UI use)
      const report = await generateTeamHealthReport(supabase, groupId);
      const formattedReport = formatReportForLINE(report, weekStart, weekEnd);

      return new Response(
        JSON.stringify({
          success: true,
          report,
          formattedReport,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: send_weekly_report - send to admin LINE group
    const report = await generateTeamHealthReport(supabase, groupId);
    const formattedReport = formatReportForLINE(report, weekStart, weekEnd);

    // Get admin LINE group ID from settings
    const { data: settings } = await supabase
      .from("attendance_settings")
      .select("admin_line_group_id")
      .eq("scope", "global")
      .maybeSingle();

    const adminGroupId = settings?.admin_line_group_id;

    if (!adminGroupId) {
      console.warn("[team-health-report] No admin_line_group_id configured in attendance_settings");
      return new Response(
        JSON.stringify({
          success: false,
          message: "No admin LINE group configured. Set admin_line_group_id in attendance_settings.",
          report,
          formattedReport,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sent = await sendToLINE(adminGroupId, formattedReport);

    return new Response(
      JSON.stringify({
        success: sent,
        message: sent ? "Report sent to LINE" : "Failed to send report",
        report,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[team-health-report] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
