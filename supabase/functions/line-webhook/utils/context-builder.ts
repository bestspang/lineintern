// =============================
// CONTEXT BUILDING UTILITIES
// =============================

import { supabase } from "./db-helpers.ts";
import { logger } from "../../_shared/logger.ts";
import { getBangkokDateString } from "../../_shared/timezone.ts";

export interface RecentMessage {
  senderDisplayName: string;
  direction: string;
  text: string;
  timestamp: string;
}

export interface KnowledgeSnippet {
  title: string;
  category: string;
  content: string;
  scope: string;
}

export interface AnalyticsSnapshot {
  totalMessages: number;
  messagesPerDay: Record<string, number>;
  topActiveUsers: Array<{ displayName: string; messageCount: number }>;
  alertsBySecvity: Record<string, number>;
}

export interface AIPayload {
  userMessage: string;
  recentMessages: RecentMessage[];
  mode: string;
  command: string | null;
  knowledgeSnippets: KnowledgeSnippet[];
  analyticsSnapshot: AnalyticsSnapshot | null;
  groupContext: {
    groupId: string;
    groupName: string;
    language: string;
    mode: string;
  };
}

export async function fetchRecentMessages(
  groupId: string,
  limit: number = 50
): Promise<RecentMessage[]> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select(`
        text,
        direction,
        sent_at,
        user:users(display_name)
      `)
      .eq("group_id", groupId)
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Error fetching recent messages", { error });
      return [];
    }

    return (data || []).reverse().map((msg: any) => ({
      senderDisplayName: msg.user?.display_name || "Unknown",
      direction: msg.direction,
      text: msg.text,
      timestamp: msg.sent_at,
    }));
  } catch (error) {
    logger.error("Error in fetchRecentMessages", { error });
    return [];
  }
}

export async function fetchKnowledgeSnippets(
  commandType: string | null,
  groupId: string
): Promise<KnowledgeSnippet[]> {
  // Only fetch knowledge for FAQ or general queries
  if (commandType !== "faq" && commandType !== "ask") {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("knowledge_items")
      .select("title, category, content, scope")
      .eq("is_active", true)
      .or(`scope.eq.global,and(scope.eq.group,group_id.eq.${groupId})`)
      .limit(10);

    if (error) {
      logger.error("Error fetching knowledge snippets", { error });
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error("Error in fetchKnowledgeSnippets", { error });
    return [];
  }
}

export async function fetchAnalyticsSnapshot(
  groupId: string
): Promise<AnalyticsSnapshot | null> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Fetch message stats
    const { data: messageStats, error: msgError } = await supabase
      .from("messages")
      .select("sent_at, user_id, users(display_name)")
      .eq("group_id", groupId)
      .gte("sent_at", sevenDaysAgo.toISOString());

    if (msgError) {
      logger.error("Error fetching message stats", { error: msgError });
      return null;
    }

    // Fetch alert stats
    const { data: alertStats, error: alertError } = await supabase
      .from("alerts")
      .select("severity")
      .eq("group_id", groupId)
      .gte("created_at", sevenDaysAgo.toISOString());

    if (alertError) {
      logger.error("Error fetching alert stats", { error: alertError });
    }

    // Process stats
    const totalMessages = messageStats?.length || 0;
    const messagesPerDay: Record<string, number> = {};
    const userCounts: Record<string, { displayName: string; count: number }> = {};

    messageStats?.forEach((msg: any) => {
      const date = getBangkokDateString(msg.sent_at);
      messagesPerDay[date] = (messagesPerDay[date] || 0) + 1;

      if (msg.user_id && msg.users?.display_name) {
        if (!userCounts[msg.user_id]) {
          userCounts[msg.user_id] = {
            displayName: msg.users.display_name,
            count: 0,
          };
        }
        userCounts[msg.user_id].count++;
      }
    });

    const topActiveUsers = Object.values(userCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((u) => ({ displayName: u.displayName, messageCount: u.count }));

    const alertsBySeverity: Record<string, number> = {};
    alertStats?.forEach((alert: any) => {
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;
    });

    return {
      totalMessages,
      messagesPerDay,
      topActiveUsers,
      alertsBySecvity: alertsBySeverity,
    };
  } catch (error) {
    logger.error("Error in fetchAnalyticsSnapshot", { error });
    return null;
  }
}

export async function buildAIPayload(
  userMessage: string,
  commandType: string | null,
  groupId: string,
  groupName: string,
  groupLanguage: string,
  groupMode: string
): Promise<AIPayload> {
  // Fetch context in parallel
  const [recentMessages, knowledgeSnippets, analyticsSnapshot] = await Promise.all([
    fetchRecentMessages(groupId, 50),
    fetchKnowledgeSnippets(commandType, groupId),
    commandType === "report" ? fetchAnalyticsSnapshot(groupId) : Promise.resolve(null),
  ]);

  return {
    userMessage,
    recentMessages,
    mode: groupMode,
    command: commandType,
    knowledgeSnippets,
    analyticsSnapshot,
    groupContext: {
      groupId,
      groupName,
      language: groupLanguage,
      mode: groupMode,
    },
  };
}
