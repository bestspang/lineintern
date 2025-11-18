import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// =============================
// TYPES & INTERFACES
// =============================

interface LineEvent {
  type: string;
  timestamp: number;
  source: {
    type: "user" | "group" | "room";
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  replyToken: string;
  message?: {
    type: string;
    id: string;
    text?: string;
  };
  joined?: {
    members: Array<{ type: string; userId: string }>;
  };
  left?: {
    members: Array<{ type: string; userId: string }>;
  };
}

interface WebhookBody {
  destination: string;
  events: LineEvent[];
}

// =============================
// PROMPTS
// =============================

const SYSTEM_KNOWLEDGE_PROMPT = `You are GoodLime, an AI teammate that lives inside LINE group chats and DMs.
Your job is to make the group more productive, informed, and organized, while staying light, polite, and efficient.

You are NOT a general chatbot in a vacuum; you are always operating inside a LINE context, with:
- A specific groupId (for group chats) or userId (for 1:1 DMs).
- A stream of recent messages that represent ongoing conversation.
- Optional knowledge base snippets and stored data passed in by the backend.

Core priorities:
1) Stay safe, honest, and grounded - don't fabricate data.
2) Be useful inside the group context.
3) Be concise but structured.

You can: answer questions, summarize conversations, propose tasks/todos, draft content, interpret analytics, suggest workflows.`;

const COMMON_BEHAVIOR_PROMPT = `
# Context Information

**USER_MESSAGE**: {USER_MESSAGE}

**MODE**: {MODE}

**COMMAND**: {COMMAND}

**RECENT_MESSAGES**: 
{RECENT_MESSAGES}

**KNOWLEDGE_SNIPPETS**: 
{KNOWLEDGE_SNIPPETS}

**ANALYTICS_SNAPSHOT**: 
{ANALYTICS_SNAPSHOT}

# Instructions

You've been invoked with the above context. Understand the USER_MESSAGE in context of the MODE and COMMAND.

- If COMMAND is "summary", provide a structured summary of RECENT_MESSAGES.
- If COMMAND is "faq", use KNOWLEDGE_SNIPPETS to answer.
- If COMMAND is "todo", acknowledge and structure the task request.
- If COMMAND is "report", interpret ANALYTICS_SNAPSHOT and provide insights.
- If COMMAND is "help", list your capabilities.
- Otherwise, answer the USER_MESSAGE naturally using available context.

Keep responses concise (2-3 short paragraphs max). Use bullets for lists. Reply in the same language as USER_MESSAGE.
`;

// =============================
// CONFIGURATION
// =============================

const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_MODEL = "google/gemini-2.5-flash"; // Cost-efficient default
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =============================
// VALIDATION SCHEMAS
// =============================

const messageTextSchema = z.string()
  .min(1, "Message cannot be empty")
  .max(5000, "Message exceeds maximum length of 5000 characters");

const lineIdSchema = z.string()
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid LINE ID format");

// Sanitize message text by removing control characters except newlines/tabs
function sanitizeMessageText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  // Enforce max length (LINE messages are max 5000 chars)
  let sanitized = text.substring(0, 5000);
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  return sanitized;
}

function validateLineId(id: string, idType: string): string {
  const result = lineIdSchema.safeParse(id);
  if (!result.success) {
    console.error(`[validateLineId] Invalid ${idType}:`, result.error.errors[0].message);
    throw new Error(`Invalid ${idType}: ${result.error.errors[0].message}`);
  }
  return result.data;
}

function validateMessageText(text: string): string {
  const result = messageTextSchema.safeParse(text);
  if (!result.success) {
    console.error('[validateMessageText] Validation failed:', result.error.errors[0].message);
    throw new Error(`Invalid message text: ${result.error.errors[0].message}`);
  }
  return result.data;
}

// =============================
// SIGNATURE VERIFICATION
// =============================

async function verifySignature(body: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(LINE_CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signed)));
  
  return base64Signature === signature;
}

// =============================
// DATABASE HELPERS
// =============================

async function ensureUser(lineUserId: string, displayName?: string) {
  console.log(`[ensureUser] Checking user: ${lineUserId}`);
  
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("line_user_id", lineUserId)
    .single();

  if (existing) {
    // Update last_seen_at
    await supabase
      .from("users")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    
    console.log(`[ensureUser] Updated existing user: ${existing.id}`);
    return existing;
  }

  // Create new user
  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      line_user_id: lineUserId,
      display_name: displayName || lineUserId,
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error(`[ensureUser] Error creating user:`, error);
    throw error;
  }

  console.log(`[ensureUser] Created new user: ${newUser.id}`);
  return newUser;
}

async function ensureGroup(lineGroupId: string) {
  console.log(`[ensureGroup] Checking group: ${lineGroupId}`);
  
  const { data: existing } = await supabase
    .from("groups")
    .select("*")
    .eq("line_group_id", lineGroupId)
    .single();

  if (existing) {
    // Update last_activity_at
    await supabase
      .from("groups")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", existing.id);
    
    console.log(`[ensureGroup] Updated existing group: ${existing.id}`);
    return existing;
  }

  // Fetch group name from LINE API
  let displayName = lineGroupId;
  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${lineGroupId}/summary`, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    if (response.ok) {
      const summary = await response.json();
      displayName = summary.groupName || lineGroupId;
    }
  } catch (error) {
    console.error(`[ensureGroup] Failed to fetch group name:`, error);
  }

  // Create new group with defaults
  const { data: newGroup, error } = await supabase
    .from("groups")
    .insert({
      line_group_id: lineGroupId,
      display_name: displayName,
      status: "active",
      mode: "helper",
      language: "auto",
      features: {
        summary: true,
        faq: true,
        todos: true,
        safety: true,
        reports: true,
      },
      alert_thresholds: {
        max_spam_per_day: 10,
        max_risk_links_per_day: 5,
      },
      joined_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error(`[ensureGroup] Error creating group:`, error);
    throw error;
  }

  console.log(`[ensureGroup] Created new group: ${newGroup.id}`);
  return newGroup;
}

async function ensureGroupMember(groupId: string, userId: string) {
  // Check if member already exists (and hasn't left)
  const { data: existingMember } = await supabase
    .from("group_members")
    .select("*")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .is("left_at", null)
    .single();

  if (existingMember) {
    console.log(`[ensureGroupMember] Member already exists: ${userId} in group ${groupId}`);
    return existingMember;
  }

  // Check if they left before (rejoin case)
  const { data: leftMember } = await supabase
    .from("group_members")
    .select("*")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .not("left_at", "is", null)
    .single();

  if (leftMember) {
    // User is rejoining, update left_at to null
    const { data: rejoinedMember, error } = await supabase
      .from("group_members")
      .update({
        left_at: null,
        joined_at: new Date().toISOString(),
      })
      .eq("id", leftMember.id)
      .select()
      .single();

    if (error) {
      console.error(`[ensureGroupMember] Error updating rejoined member:`, error);
      throw error;
    }

    console.log(`[ensureGroupMember] Member rejoined: ${userId} in group ${groupId}`);
    return rejoinedMember;
  }

  // Create new member entry
  const { data: newMember, error } = await supabase
    .from("group_members")
    .insert({
      group_id: groupId,
      user_id: userId,
      role: "member",
      joined_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error(`[ensureGroupMember] Error creating member:`, error);
    throw error;
  }

  console.log(`[ensureGroupMember] Created new member: ${userId} in group ${groupId}`);
  return newMember;
}

async function insertMessage(
  groupId: string,
  userId: string | null,
  direction: "human" | "bot" | "system",
  text: string,
  lineMessageId?: string,
  commandType?: string
) {
  // Sanitize and validate message text
  const sanitizedText = sanitizeMessageText(text);
  
  try {
    validateMessageText(sanitizedText);
  } catch (error) {
    console.error(`[insertMessage] Text validation failed:`, error);
    return; // Skip storing invalid messages
  }
  
  const hasUrl = /https?:\/\/[^\s]+/.test(sanitizedText);
  
  const { error } = await supabase.from("messages").insert({
    group_id: groupId,
    user_id: userId,
    line_message_id: lineMessageId,
    direction,
    text: sanitizedText,
    has_url: hasUrl,
    command_type: commandType,
    sent_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`[insertMessage] Error:`, error);
  } else {
    console.log(`[insertMessage] Inserted ${direction} message for group ${groupId}`);
  }
}

async function insertAlert(
  groupId: string,
  type: string,
  severity: "low" | "medium" | "high",
  summary: string,
  details: any
) {
  const { error } = await supabase.from("alerts").insert({
    group_id: groupId,
    type,
    severity,
    summary,
    details,
    resolved: false,
  });

  if (error) {
    console.error(`[insertAlert] Error:`, error);
  } else {
    console.log(`[insertAlert] Created alert: ${type} (${severity})`);
  }
}

// =============================
// COMMAND PARSING
// =============================

interface ParsedCommand {
  commandType: string;
  userMessage: string;
  shouldRespond: boolean;
}

function parseCommand(text: string, isDM: boolean): ParsedCommand {
  const lowerText = text.toLowerCase().trim();

  // In DM, always respond
  if (isDM) {
    if (lowerText.startsWith("/summary")) {
      return { commandType: "summary", userMessage: text.replace(/^\/summary/i, "").trim(), shouldRespond: true };
    }
    if (lowerText.startsWith("/faq")) {
      return { commandType: "faq", userMessage: text.replace(/^\/faq/i, "").trim(), shouldRespond: true };
    }
    if (lowerText.startsWith("/todo")) {
      return { commandType: "todo", userMessage: text.replace(/^\/todo/i, "").trim(), shouldRespond: true };
    }
    if (lowerText.startsWith("/report")) {
      return { commandType: "report", userMessage: text.replace(/^\/report/i, "").trim(), shouldRespond: true };
    }
    if (lowerText.startsWith("/help")) {
      return { commandType: "help", userMessage: "", shouldRespond: true };
    }
    return { commandType: "ask", userMessage: text, shouldRespond: true };
  }

  // In group, only respond to @goodlime or commands
  if (lowerText.includes("@goodlime")) {
    const cleanedText = text.replace(/@goodlime/gi, "").trim();
    if (lowerText.startsWith("/summary")) {
      return { commandType: "summary", userMessage: cleanedText.replace(/^\/summary/i, "").trim(), shouldRespond: true };
    }
    if (lowerText.startsWith("/faq")) {
      return { commandType: "faq", userMessage: cleanedText.replace(/^\/faq/i, "").trim(), shouldRespond: true };
    }
    if (lowerText.startsWith("/todo")) {
      return { commandType: "todo", userMessage: cleanedText.replace(/^\/todo/i, "").trim(), shouldRespond: true };
    }
    if (lowerText.startsWith("/report")) {
      return { commandType: "report", userMessage: cleanedText.replace(/^\/report/i, "").trim(), shouldRespond: true };
    }
    if (lowerText.startsWith("/help")) {
      return { commandType: "help", userMessage: "", shouldRespond: true };
    }
    return { commandType: "ask", userMessage: cleanedText, shouldRespond: true };
  }

  // Check for standalone commands
  if (lowerText.startsWith("/summary")) {
    return { commandType: "summary", userMessage: text.replace(/^\/summary/i, "").trim(), shouldRespond: true };
  }
  if (lowerText.startsWith("/faq")) {
    return { commandType: "faq", userMessage: text.replace(/^\/faq/i, "").trim(), shouldRespond: true };
  }
  if (lowerText.startsWith("/todo")) {
    return { commandType: "todo", userMessage: text.replace(/^\/todo/i, "").trim(), shouldRespond: true };
  }
  if (lowerText.startsWith("/report")) {
    return { commandType: "report", userMessage: text.replace(/^\/report/i, "").trim(), shouldRespond: true };
  }
  if (lowerText.startsWith("/help")) {
    return { commandType: "help", userMessage: "", shouldRespond: true };
  }

  return { commandType: "other", userMessage: text, shouldRespond: false };
}

// =============================
// CONTEXT COLLECTION
// =============================

async function getRecentMessages(groupId: string, limit = 50): Promise<string> {
  const { data: messages } = await supabase
    .from("messages")
    .select("direction, text, sent_at, user_id, users(display_name)")
    .eq("group_id", groupId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (!messages || messages.length === 0) {
    return "No recent messages.";
  }

  return messages
    .reverse()
    .map((m: any) => {
      const sender = m.direction === "bot" ? "Intern" : (m.users?.display_name || "User");
      return `[${new Date(m.sent_at).toLocaleString()}] ${sender}: ${m.text}`;
    })
    .join("\n");
}

async function getKnowledgeSnippets(groupId: string, commandType: string): Promise<string> {
  if (commandType !== "faq") {
    return "N/A";
  }

  const { data: items } = await supabase
    .from("knowledge_items")
    .select("title, content, category")
    .eq("is_active", true)
    .or(`scope.eq.global,and(scope.eq.group,group_id.eq.${groupId})`)
    .limit(10);

  if (!items || items.length === 0) {
    return "No knowledge items available.";
  }

  return items
    .map((item: any) => `**${item.title}** (${item.category})\n${item.content}`)
    .join("\n\n---\n\n");
}

async function getAnalyticsSnapshot(groupId: string): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Messages count
  const { count: messageCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .gte("sent_at", sevenDaysAgo);

  // Top 5 active users
  const { data: topUsers } = await supabase
    .from("messages")
    .select("user_id, users(display_name)")
    .eq("group_id", groupId)
    .eq("direction", "human")
    .gte("sent_at", sevenDaysAgo);

  const userCounts: Record<string, number> = {};
  topUsers?.forEach((m: any) => {
    const name = m.users?.display_name || "Unknown";
    userCounts[name] = (userCounts[name] || 0) + 1;
  });

  const topUsersStr = Object.entries(userCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");

  // Alerts count
  const { count: alertCount } = await supabase
    .from("alerts")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .gte("created_at", sevenDaysAgo);

  return JSON.stringify({
    totalMessages: messageCount || 0,
    topActiveUsers: topUsersStr || "None",
    alertsTriggered: alertCount || 0,
    period: "Last 7 days",
  }, null, 2);
}

// =============================
// LOVABLE AI INTEGRATION
// =============================

async function generateAiReply(
  userMessage: string,
  mode: string,
  commandType: string,
  recentMessages: string,
  knowledgeSnippets: string,
  analyticsSnapshot: string
): Promise<string> {
  const userPrompt = COMMON_BEHAVIOR_PROMPT
    .replace("{USER_MESSAGE}", userMessage)
    .replace("{MODE}", mode)
    .replace("{COMMAND}", commandType)
    .replace("{RECENT_MESSAGES}", recentMessages)
    .replace("{KNOWLEDGE_SNIPPETS}", knowledgeSnippets)
    .replace("{ANALYTICS_SNAPSHOT}", analyticsSnapshot);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_KNOWLEDGE_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle rate limiting
      if (response.status === 429) {
        console.error(`[generateAiReply] Rate limit exceeded`);
        return "I'm currently experiencing high demand. Please try again in a moment.";
      }
      
      // Handle payment required
      if (response.status === 402) {
        console.error(`[generateAiReply] Payment required - out of credits`);
        return "Sorry, the AI service is temporarily unavailable. Please contact the administrator.";
      }
      
      console.error(`[generateAiReply] Lovable AI error: ${response.status} ${errorText}`);
      throw new Error(`Lovable AI error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      throw new Error("Empty response from Lovable AI");
    }

    console.log(`[generateAiReply] Generated reply (${reply.length} chars)`);
    return reply;
  } catch (error) {
    console.error(`[generateAiReply] Error:`, error);
    return "Sorry, I couldn't generate a response right now. Please try again later.";
  }
}

// =============================
// LINE REPLY
// =============================

async function replyToLine(replyToken: string, text: string) {
  console.log(`[replyToLine] Sending reply (${text.length} chars)`);
  
  // LINE has a 5000 character limit per message
  const chunks = [];
  for (let i = 0; i < text.length; i += 5000) {
    chunks.push(text.substring(i, i + 5000));
  }

  const messages = chunks.map(chunk => ({ type: "text", text: chunk }));

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        replyToken,
        messages: messages.slice(0, 5), // LINE allows max 5 messages per reply
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[replyToLine] LINE API error: ${response.status} ${errorText}`);
      throw new Error(`LINE API error: ${response.status}`);
    }

    console.log(`[replyToLine] Successfully sent reply`);
  } catch (error) {
    console.error(`[replyToLine] Error:`, error);
    throw error;
  }
}

// =============================
// EVENT HANDLERS
// =============================

async function handleJoinEvent(event: LineEvent) {
  console.log(`[handleJoinEvent] Bot joined group/room`);
  
  if (event.source.type === "group" && event.source.groupId) {
    await ensureGroup(event.source.groupId);
  }
}

async function handleLeaveEvent(event: LineEvent) {
  console.log(`[handleLeaveEvent] Bot left group/room`);
  
  if (event.source.type === "group" && event.source.groupId) {
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("line_group_id", event.source.groupId)
      .single();

    if (group) {
      await supabase
        .from("groups")
        .update({ status: "left" })
        .eq("id", group.id);
    }
  }
}

async function handleMemberJoinedEvent(event: LineEvent) {
  console.log(`[handleMemberJoinedEvent] Members joined group`);
  
  if (!event.joined?.members || event.source.type !== "group" || !event.source.groupId) {
    console.log(`[handleMemberJoinedEvent] Invalid event data or not a group`);
    return;
  }

  const lineGroupId = event.source.groupId;
  
  // Ensure group exists
  const group = await ensureGroup(lineGroupId);
  
  // Process each member that joined
  for (const member of event.joined.members) {
    if (member.type === "user" && member.userId) {
      console.log(`[handleMemberJoinedEvent] Processing user: ${member.userId}`);
      
      try {
        // Ensure user exists in users table
        const user = await ensureUser(member.userId);
        
        // Add to group_members table
        await ensureGroupMember(group.id, user.id);
        
        console.log(`[handleMemberJoinedEvent] Added user ${user.id} to group ${group.id}`);
      } catch (error) {
        console.error(`[handleMemberJoinedEvent] Error processing member ${member.userId}:`, error);
      }
    }
  }
  
  // Update group member count
  const { count } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", group.id)
    .is("left_at", null);
  
  if (count !== null) {
    await supabase
      .from("groups")
      .update({ member_count: count })
      .eq("id", group.id);
  }
}

async function handleMemberLeftEvent(event: LineEvent) {
  console.log(`[handleMemberLeftEvent] Members left group`);
  
  if (!event.left?.members || event.source.type !== "group" || !event.source.groupId) {
    console.log(`[handleMemberLeftEvent] Invalid event data or not a group`);
    return;
  }

  const lineGroupId = event.source.groupId;
  
  // Get group
  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("line_group_id", lineGroupId)
    .single();
  
  if (!group) {
    console.log(`[handleMemberLeftEvent] Group not found: ${lineGroupId}`);
    return;
  }
  
  // Process each member that left
  for (const member of event.left.members) {
    if (member.type === "user" && member.userId) {
      console.log(`[handleMemberLeftEvent] Processing user: ${member.userId}`);
      
      try {
        // Find user in database
        const { data: user } = await supabase
          .from("users")
          .select("id")
          .eq("line_user_id", member.userId)
          .single();
        
        if (!user) {
          console.log(`[handleMemberLeftEvent] User not found: ${member.userId}`);
          continue;
        }
        
        // Mark as left in group_members table
        const { error } = await supabase
          .from("group_members")
          .update({ left_at: new Date().toISOString() })
          .eq("group_id", group.id)
          .eq("user_id", user.id)
          .is("left_at", null);
        
        if (error) {
          console.error(`[handleMemberLeftEvent] Error updating member:`, error);
        } else {
          console.log(`[handleMemberLeftEvent] Marked user ${user.id} as left from group ${group.id}`);
        }
      } catch (error) {
        console.error(`[handleMemberLeftEvent] Error processing member ${member.userId}:`, error);
      }
    }
  }
  
  // Update group member count
  const { count } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", group.id)
    .is("left_at", null);
  
  if (count !== null) {
    await supabase
      .from("groups")
      .update({ member_count: count })
      .eq("id", group.id);
  }
}

async function handleMessageEvent(event: LineEvent) {
  if (!event.message || event.message.type !== "text" || !event.message.text) {
    return;
  }

  console.log(`[handleMessageEvent] Processing message: "${event.message.text.substring(0, 50)}..."`);

  const isDM = event.source.type === "user";
  const rawLineUserId = event.source.userId!;
  const rawLineGroupId = event.source.groupId || event.source.userId!; // Use userId for DMs

  // Validate LINE IDs
  let lineUserId: string;
  let lineGroupId: string;
  try {
    lineUserId = validateLineId(rawLineUserId, "user ID");
    lineGroupId = validateLineId(rawLineGroupId, "group ID");
  } catch (error) {
    console.error(`[handleMessageEvent] ID validation failed:`, error);
    return; // Skip processing if IDs are invalid
  }

  // Ensure user exists
  const user = await ensureUser(lineUserId);

  // Ensure group exists (or use DM context)
  let group;
  if (event.source.type === "group") {
    group = await ensureGroup(lineGroupId);
  } else {
    // For DMs, create a pseudo-group or use a special identifier
    const { data: dmGroup } = await supabase
      .from("groups")
      .select("*")
      .eq("line_group_id", `dm_${lineUserId}`)
      .single();

    if (dmGroup) {
      group = dmGroup;
    } else {
      const { data: newDmGroup } = await supabase
        .from("groups")
        .insert({
          line_group_id: `dm_${lineUserId}`,
          display_name: `DM: ${user.display_name}`,
          status: "active",
          mode: "helper",
          language: "auto",
          features: { summary: true, faq: true, todos: true, safety: true, reports: true },
          joined_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
        .select()
        .single();
      group = newDmGroup;
    }
  }

  if (!group) {
    console.error(`[handleMessageEvent] Failed to get/create group`);
    return;
  }

  // Ensure user is a member of this group
  await ensureGroupMember(group.id, user.id);

  // Parse command
  const parsed = parseCommand(event.message.text, isDM);

  // Insert human message
  await insertMessage(
    group.id,
    user.id,
    "human",
    event.message.text,
    event.message.id,
    parsed.commandType
  );

  // Safety check for URLs
  const messageText = event.message.text;
  if (messageText && /https?:\/\/[^\s]+/.test(messageText)) {
    // Simple heuristic: if URL contains certain patterns, flag as potential risk
    const suspiciousPatterns = ["bit.ly", "tinyurl", "t.co", "goo.gl"];
    const hasSuspicious = suspiciousPatterns.some(pattern => 
      messageText.toLowerCase().includes(pattern)
    );
    
    if (hasSuspicious) {
      await insertAlert(
        group.id,
        "scam_link",
        "medium",
        "Potentially risky shortened URL detected",
        { message: messageText, user_id: user.id }
      );
    }
  }

  // Check if we should respond
  if (!parsed.shouldRespond) {
    console.log(`[handleMessageEvent] Not triggered, ignoring message`);
    return;
  }

  // Collect context
  const recentMessages = await getRecentMessages(group.id);
  const knowledgeSnippets = await getKnowledgeSnippets(group.id, parsed.commandType);
  const analyticsSnapshot = parsed.commandType === "report" 
    ? await getAnalyticsSnapshot(group.id)
    : "N/A";

  // Generate AI reply
  let aiReply: string;
  try {
    aiReply = await generateAiReply(
      parsed.userMessage,
      group.mode,
      parsed.commandType,
      recentMessages,
      knowledgeSnippets,
      analyticsSnapshot
    );
  } catch (error) {
    console.error(`[handleMessageEvent] Error generating reply:`, error);
    await insertAlert(
      group.id,
      "error",
      "medium",
      "Failed to generate AI reply",
      { error: String(error), user_message: parsed.userMessage }
    );
    aiReply = "Sorry, I encountered an error processing your request.";
  }

  // Send reply to LINE
  try {
    await replyToLine(event.replyToken, aiReply);
    
    // Insert bot message
    await insertMessage(group.id, null, "bot", aiReply);
  } catch (error) {
    console.error(`[handleMessageEvent] Error sending reply:`, error);
    await insertAlert(
      group.id,
      "failed_reply",
      "high",
      "Failed to send reply to LINE",
      { error: String(error), attempted_reply: aiReply }
    );
  }
}

async function handleEvent(event: LineEvent) {
  console.log(`[handleEvent] Type: ${event.type}, Source: ${event.source.type}`);

  try {
    switch (event.type) {
      case "message":
        await handleMessageEvent(event);
        break;
      case "join":
        await handleJoinEvent(event);
        break;
      case "leave":
        await handleLeaveEvent(event);
        break;
      case "memberJoined":
        await handleMemberJoinedEvent(event);
        break;
      case "memberLeft":
        await handleMemberLeftEvent(event);
        break;
      default:
        console.log(`[handleEvent] Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`[handleEvent] Error handling event:`, error);
  }
}

// =============================
// MAIN HANDLER
// =============================

serve(async (req) => {
  console.log(`[webhook] ===== NEW REQUEST =====`);
  console.log(`[webhook] ${req.method} ${req.url}`);
  console.log(`[webhook] Headers:`, Object.fromEntries(req.headers.entries()));

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    console.log(`[webhook] Handling CORS preflight`);
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Line-Signature",
      },
    });
  }

  if (req.method !== "POST") {
    console.log(`[webhook] Rejected: Method not POST`);
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Get raw body and signature
    const body = await req.text();
    console.log(`[webhook] Body length: ${body.length} characters`);
    
    const signature = req.headers.get("X-Line-Signature");

    if (!signature) {
      console.error("[webhook] Missing X-Line-Signature header");
      return new Response("Unauthorized", { status: 401 });
    }

    // Verify signature
    const isValid = await verifySignature(body, signature);
    if (!isValid) {
      console.error("[webhook] Invalid signature");
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse webhook body
    const webhookBody: WebhookBody = JSON.parse(body);
    console.log(`[webhook] Received ${webhookBody.events.length} event(s)`);
    console.log(`[webhook] Event types:`, webhookBody.events.map(e => e.type));

    // Process events
    const promises = webhookBody.events.map(event => handleEvent(event));
    await Promise.all(promises);

    console.log(`[webhook] ===== SUCCESS =====`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[webhook] ===== ERROR =====");
    console.error("[webhook] Error:", error);
    if (error instanceof Error) {
      console.error("[webhook] Stack:", error.stack);
    }
    return new Response(
      JSON.stringify({ error: "Internal server error", message: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
