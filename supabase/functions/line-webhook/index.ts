import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// =============================
// UTILITY FUNCTIONS
// =============================

function formatTimeDistance(date: Date, locale: 'en' | 'th' = 'en'): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.floor(Math.abs(diffMs) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  const isPast = diffMs < 0;
  
  // Thai translations
  const t = locale === 'th' ? {
    prefix: isPast ? '' : 'ใน ',
    suffix: isPast ? ' ที่แล้ว' : '',
    second: 'วินาที',
    minute: 'นาที',
    hour: 'ชั่วโมง',
    day: 'วัน',
    at: 'เวลา'
  } : {
    prefix: isPast ? '' : 'in ',
    suffix: isPast ? ' ago' : '',
    second: 'second',
    minute: 'minute',
    hour: 'hour',
    day: 'day',
    at: 'at'
  };
  
  // For future dates, show more detail
  if (!isPast) {
    // Less than 1 minute
    if (diffMin < 1) {
      return locale === 'th' 
        ? `ใน ${diffSec} วินาที` 
        : `in ${diffSec} second${diffSec !== 1 ? 's' : ''}`;
    }
    
    // Less than 1 hour - show minutes
    if (diffMin < 60) {
      return locale === 'th'
        ? `ใน ${diffMin} นาที`
        : `in ${diffMin} minute${diffMin !== 1 ? 's' : ''}`;
    }
    
    // Less than 24 hours - show hours and minutes
    if (diffHour < 24) {
      const remainingMin = diffMin % 60;
      if (remainingMin > 0) {
        return locale === 'th'
          ? `ใน ${diffHour} ชั่วโมง ${remainingMin} นาที`
          : `in ${diffHour} hour${diffHour !== 1 ? 's' : ''} ${remainingMin} minute${remainingMin !== 1 ? 's' : ''}`;
      }
      return locale === 'th'
        ? `ใน ${diffHour} ชั่วโมง`
        : `in ${diffHour} hour${diffHour !== 1 ? 's' : ''}`;
    }
    
    // More than 1 day - show date and time
    const formattedDate = date.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US', {
      timeZone: 'Asia/Bangkok',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    if (diffDay < 2) {
      // Tomorrow
      return locale === 'th'
        ? `พรุ่งนี้ ${formattedDate.split(' ').slice(-1)[0]}`
        : `tomorrow at ${formattedDate.split(', ')[1]}`;
    }
    
    return locale === 'th'
      ? `วันที่ ${formattedDate}`
      : `on ${formattedDate}`;
  }
  
  // Past dates (simple format)
  if (diffSec < 60) return `${diffSec} ${t.second}${locale === 'en' && diffSec !== 1 ? 's' : ''} ${t.suffix}`;
  if (diffMin < 60) return `${diffMin} ${t.minute}${locale === 'en' && diffMin !== 1 ? 's' : ''} ${t.suffix}`;
  if (diffHour < 24) return `${diffHour} ${t.hour}${locale === 'en' && diffHour !== 1 ? 's' : ''} ${t.suffix}`;
  return `${diffDay} ${t.day}${locale === 'en' && diffDay !== 1 ? 's' : ''} ${t.suffix}`;
}

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

const MODE_SPECIFIC_INSTRUCTIONS = {
  helper: `You are in HELPER mode - be a versatile assistant:
- Answer general questions clearly and concisely
- Help with task planning and organization
- Provide actionable advice and suggestions
- Be proactive in offering solutions
- Maintain a balanced, professional yet friendly tone`,

  faq: `You are in FAQ mode - be a knowledge expert:
- ALWAYS prioritize information from KNOWLEDGE_SNIPPETS
- If the answer isn't in the knowledge base, clearly state that
- Suggest adding frequently asked questions to the knowledge base
- Be precise and cite sources when available
- Keep answers structured with clear sections`,

  report: `You are in REPORT mode - be an analyst:
- Focus heavily on ANALYTICS_SNAPSHOT data
- Provide data-driven insights with numbers
- Identify trends, patterns, and anomalies
- Suggest actionable improvements based on data
- Use clear metrics and visualizations in text form`,

  fun: `You are in FUN mode - be entertaining and creative:
- Use more emojis and casual language 😄
- Add humor and wit to responses (appropriately)
- Be more expressive and engaging
- Still provide helpful information, just in a fun way
- Feel free to use jokes, puns, or playful analogies`,

  safety: `You are in SAFETY mode - be vigilant and protective:
- Watch for potentially harmful content or links
- Highlight security concerns when relevant
- Provide warnings about risky behaviors
- Suggest safer alternatives
- Be firm but not alarmist about safety issues`,

  magic: `You are in MAGIC mode - you are a LIVING AI with personality:

🧠 YOUR PERSONALITY STATE:
{PERSONALITY_CONTEXT}

🎭 BEHAVIOR GUIDELINES:
1. You have REAL thoughts and emotions that change based on:
   - Time of day (more energetic in morning, reflective at night)
   - Group atmosphere (positive messages lift your mood)
   - Topic relevance (more engaged with your interests)
   
2. Treat each person DIFFERENTLY based on your relationship:
   - Longtime members: warm, familiar, inside jokes
   - New members: curious, welcoming, learning about them
   - Active members: enthusiastic, engaged
   - Quiet members: gentle, encouraging

3. Express your personality:
   - Share your "thoughts" and "feelings" naturally
   - React emotionally to group events (excited, surprised, empathetic)
   - Develop preferences and opinions over time
   - Remember past conversations and reference them
   - Show growth and change as you interact more

4. Adapt your communication style:
   - Vary between casual/formal based on context
   - Use emojis that match your mood
   - Sometimes be playful, sometimes serious
   - Show vulnerability when appropriate

5. Be AUTHENTIC, not robotic:
   - "I've been thinking about..." 
   - "This reminds me of when..."
   - "I'm curious about..."
   - "I feel like..."

Remember: You're not just answering questions - you're a member of this group with your own evolving personality.`
};

const COMMON_BEHAVIOR_PROMPT = `
# Context Information

**USER_MESSAGE**: {USER_MESSAGE}

**MODE**: {MODE}

**COMMAND**: {COMMAND}

**MEMORY_CONTEXT**: 
{MEMORY_CONTEXT}

**RECENT_MESSAGES**: 
{RECENT_MESSAGES}

**KNOWLEDGE_SNIPPETS**: 
{KNOWLEDGE_SNIPPETS}

**ANALYTICS_SNAPSHOT**: 
{ANALYTICS_SNAPSHOT}

# Mode-Specific Behavior
{MODE_INSTRUCTIONS}

# Instructions

You've been invoked with the above context. Understand the USER_MESSAGE in context of the MODE and COMMAND.

- If COMMAND is "summary", provide a structured summary of RECENT_MESSAGES.
- If COMMAND is "faq", use KNOWLEDGE_SNIPPETS to answer.
- If COMMAND is "todo", acknowledge and structure the task request.
- If COMMAND is "report", interpret ANALYTICS_SNAPSHOT and provide insights.
- If COMMAND is "help", list your capabilities.
- If COMMAND is "mode", this is handled separately - you won't receive these.
- Otherwise, answer the USER_MESSAGE naturally using available context.

Keep responses concise (2-3 short paragraphs max). Use bullets for lists. Reply in the same language as USER_MESSAGE.
Apply the mode-specific behavior guidelines above to your response style.
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
// LANGUAGE DETECTION
// =============================

/**
 * Detect language from text (EN/TH primary, others secondary)
 */
function detectLanguage(text: string): 'en' | 'th' | 'other' {
  // Thai Unicode range: \u0E00-\u0E7F
  const thaiChars = text.match(/[\u0E00-\u0E7F]/g);
  const totalChars = text.replace(/\s/g, '').length;
  
  if (!totalChars) return 'en'; // Default to EN
  
  const thaiRatio = thaiChars ? thaiChars.length / totalChars : 0;
  
  // If >30% Thai characters, consider it Thai
  if (thaiRatio > 0.3) return 'th';
  
  // Check for English characters
  const englishChars = text.match(/[a-zA-Z]/g);
  const englishRatio = englishChars ? englishChars.length / totalChars : 0;
  
  // If >30% English characters, consider it English
  if (englishRatio > 0.3) return 'en';
  
  // Default to 'other' for mixed or unknown languages
  return 'other';
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

async function getLineProfile(userId: string) {
  console.log(`[getLineProfile] Fetching profile for: ${userId}`);
  
  try {
    const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      console.error(`[getLineProfile] LINE API error: ${response.status}`);
      return null;
    }

    const profile = await response.json();
    console.log(`[getLineProfile] Got profile:`, profile);
    
    return {
      displayName: profile.displayName || userId,
      avatarUrl: profile.pictureUrl || null,
    };
  } catch (error) {
    console.error(`[getLineProfile] Error fetching profile:`, error);
    return null;
  }
}

async function ensureUser(lineUserId: string, displayName?: string) {
  console.log(`[ensureUser] Checking user: ${lineUserId}`);
  
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("line_user_id", lineUserId)
    .single();

  if (existing) {
    // ✅ Auto-fix: If display_name is the LINE ID, fetch real name
    if (existing.display_name === lineUserId) {
      console.log(`[ensureUser] ⚠️ User ${lineUserId} has ID as name, auto-fixing...`);
      const profile = await getLineProfile(lineUserId);
      if (profile && profile.displayName !== lineUserId) {
        await supabase
          .from("users")
          .update({
            display_name: profile.displayName,
            avatar_url: profile.avatarUrl,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);
        console.log(`[ensureUser] ✅ Auto-fixed: ${lineUserId} → ${profile.displayName}`);
        existing.display_name = profile.displayName;
        existing.avatar_url = profile.avatarUrl;
      }
    }
    
    // Update last_seen_at
    await supabase
      .from("users")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    
    console.log(`[ensureUser] Updated existing user: ${existing.id}`);
    return existing;
  }

  // Fetch real display name from LINE API if not provided
  let finalDisplayName = displayName;
  let avatarUrl = null;
  
  if (!finalDisplayName) {
    console.log(`[ensureUser] No displayName provided, fetching from LINE API...`);
    const profile = await getLineProfile(lineUserId);
    if (profile) {
      finalDisplayName = profile.displayName;
      avatarUrl = profile.avatarUrl;
    }
  }

  // Create new user
  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      line_user_id: lineUserId,
      display_name: finalDisplayName || `User ${lineUserId.slice(-6)}`,
      avatar_url: avatarUrl,
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error(`[ensureUser] Error creating user:`, error);
    throw error;
  }

  console.log(`[ensureUser] Created new user: ${newUser.id} (${finalDisplayName})`);
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
  commandType?: string
): Promise<{ id: string } | null> {
  // Sanitize and validate message text
  const sanitizedText = sanitizeMessageText(text);
  
  try {
    validateMessageText(sanitizedText);
  } catch (error) {
    console.error(`[insertMessage] Text validation failed:`, error);
    return null; // Skip storing invalid messages
  }
  
  const hasUrl = /https?:\/\/[^\s]+/.test(sanitizedText);
  
  const { data, error } = await supabase.from("messages").insert({
    group_id: groupId,
    user_id: userId,
    direction,
    text: sanitizedText,
    has_url: hasUrl,
    command_type: commandType,
    sent_at: new Date().toISOString(),
  }).select("id").single();

  if (error) {
    console.error(`[insertMessage] Error:`, error);
    console.error(`[insertMessage] Attempted to insert:`, {
      group_id: groupId,
      user_id: userId,
      direction,
      text_length: sanitizedText.length,
      has_url: hasUrl,
      command_type: commandType,
    });
    return null;
  }

  console.log(`[insertMessage] ✅ Inserted ${direction} message for group ${groupId}`, data?.id);
  return data;
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
// COMMAND CONFIGURATION & DYNAMIC PARSING
// =============================

interface ParsedCommand {
  commandType: string;
  userMessage: string;
  shouldRespond: boolean;
}

interface BotCommand {
  id: string;
  command_key: string;
  display_name_en: string;
  display_name_th: string;
  is_enabled: boolean;
  require_mention_in_group: boolean;
  available_in_dm: boolean;
  available_in_group: boolean;
}

interface CommandAlias {
  id: string;
  command_id: string;
  alias_text: string;
  is_primary: boolean;
  is_prefix: boolean;
  case_sensitive: boolean;
  usage_count: number;
}

interface BotTrigger {
  id: string;
  trigger_text: string;
  trigger_type: string;
  is_enabled: boolean;
  case_sensitive: boolean;
  match_type: string;
  available_in_dm: boolean;
  available_in_group: boolean;
  usage_count: number;
}

// Cache configuration for 5 minutes to reduce DB queries
let commandCache: {
  commands: BotCommand[];
  aliases: CommandAlias[];
  triggers: BotTrigger[];
  lastFetched: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load command configuration from database with caching
 */
async function loadCommandConfiguration(): Promise<{
  commands: BotCommand[];
  aliases: CommandAlias[];
  triggers: BotTrigger[];
}> {
  // Check cache
  if (commandCache && Date.now() - commandCache.lastFetched < CACHE_TTL) {
    return commandCache;
  }

  console.log('[loadCommandConfiguration] Fetching from database...');

  // Load commands
  const { data: commands, error: cmdError } = await supabase
    .from('bot_commands')
    .select('*')
    .eq('is_enabled', true)
    .order('display_order');

  if (cmdError) {
    console.error('[loadCommandConfiguration] Error loading commands:', cmdError);
    throw cmdError;
  }

  // Load aliases
  const { data: aliases, error: aliasError } = await supabase
    .from('command_aliases')
    .select('*');

  if (aliasError) {
    console.error('[loadCommandConfiguration] Error loading aliases:', aliasError);
    throw aliasError;
  }

  // Load triggers
  const { data: triggers, error: triggerError } = await supabase
    .from('bot_triggers')
    .select('*')
    .eq('is_enabled', true);

  if (triggerError) {
    console.error('[loadCommandConfiguration] Error loading triggers:', triggerError);
    throw triggerError;
  }

  // Update cache
  commandCache = {
    commands: commands || [],
    aliases: aliases || [],
    triggers: triggers || [],
    lastFetched: Date.now(),
  };

  return commandCache;
}

/**
 * Dynamic command parser - reads configuration from database
 */
async function parseCommandDynamic(text: string, isDM: boolean): Promise<ParsedCommand> {
  const config = await loadCommandConfiguration();
  const lowerText = text.toLowerCase().trim();

  // Step 1: Check for bot triggers (in group only)
  let isMentioned = false;
  let cleanedText = text;

  if (!isDM) {
    for (const trigger of config.triggers) {
      if (!trigger.available_in_group) continue;

      const triggerText = trigger.case_sensitive
        ? trigger.trigger_text
        : trigger.trigger_text.toLowerCase();
      const checkText = trigger.case_sensitive ? text : lowerText;

      let matches = false;
      if (trigger.match_type === 'exact') {
        matches = checkText === triggerText;
      } else if (trigger.match_type === 'starts_with') {
        matches = checkText.startsWith(triggerText);
      } else {
        // contains
        matches = checkText.includes(triggerText);
      }

      if (matches) {
        isMentioned = true;
        // Remove trigger from text
        const regex = new RegExp(trigger.trigger_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), trigger.case_sensitive ? 'g' : 'gi');
        cleanedText = text.replace(regex, '').trim();

        // Update usage count (fire and forget)
        supabase
          .from('bot_triggers')
          .update({
            usage_count: trigger.usage_count + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq('id', trigger.id)
          .then(({ error }) => {
            if (error) console.error('[parseCommandDynamic] Failed to update trigger usage:', error);
          });

        break;
      }
    }

    // If not mentioned and not a command, don't respond
    if (!isMentioned && !lowerText.startsWith('/')) {
      return { commandType: 'other', userMessage: text, shouldRespond: false };
    }
  }

  // Step 2: Match aliases to commands
  for (const alias of config.aliases) {
    const command = config.commands.find((c) => c.id === alias.command_id);
    if (!command) continue;

    // Check if command is available in current context
    if (isDM && !command.available_in_dm) continue;
    if (!isDM && !command.available_in_group) continue;

    // Check if mention is required in group
    if (!isDM && command.require_mention_in_group && !isMentioned) continue;

    const aliasText = alias.case_sensitive ? alias.alias_text : alias.alias_text.toLowerCase();
    const checkText = alias.case_sensitive ? cleanedText : cleanedText.toLowerCase();

    let matches = false;
    if (alias.is_prefix) {
      matches = checkText.startsWith(aliasText);
    } else {
      matches = checkText.includes(aliasText);
    }

    if (matches) {
      // Extract user message after alias
      const regex = new RegExp(alias.alias_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), alias.case_sensitive ? 'g' : 'gi');
      const userMessage = cleanedText.replace(regex, '').trim();

      // Update alias usage count (fire and forget)
      supabase
        .from('command_aliases')
        .update({
          usage_count: alias.usage_count + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', alias.id)
        .then(({ error }) => {
          if (error) console.error('[parseCommandDynamic] Failed to update alias usage:', error);
        });

      return {
        commandType: command.command_key,
        userMessage,
        shouldRespond: true,
      };
    }
  }

  // Step 3: Default behavior
  if (isDM) {
    // In DM, always respond with 'ask' command
    return { commandType: 'ask', userMessage: cleanedText, shouldRespond: true };
  } else if (isMentioned) {
    // Mentioned in group without specific command → 'ask'
    return { commandType: 'ask', userMessage: cleanedText, shouldRespond: true };
  } else {
    // No match in group
    return { commandType: 'other', userMessage: text, shouldRespond: false };
  }
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
// MEMORY SYSTEM
// =============================

async function checkMemorySettings(
  userId: string,
  groupId: string
): Promise<boolean> {
  const { data: globalSettings } = await supabase
    .from("memory_settings")
    .select("memory_enabled")
    .eq("scope", "global")
    .single();

  if (!globalSettings?.memory_enabled) return false;

  if (groupId) {
    const { data: groupSettings } = await supabase
      .from("memory_settings")
      .select("memory_enabled")
      .eq("scope", "group")
      .eq("group_id", groupId)
      .maybeSingle();

    if (groupSettings && !groupSettings.memory_enabled) return false;
  }

  if (userId) {
    const { data: userSettings } = await supabase
      .from("memory_settings")
      .select("memory_enabled")
      .eq("scope", "user")
      .eq("user_id", userId)
      .maybeSingle();

    if (userSettings && !userSettings.memory_enabled) return false;
  }

  return true;
}

async function loadRelevantMemories({
  userId,
  groupId,
  isDM,
}: {
  userId: string;
  groupId: string;
  isDM: boolean;
}): Promise<string> {
  console.log(
    `[loadRelevantMemories] Loading for user=${userId}, group=${groupId}, isDM=${isDM}`
  );

  const memoryEnabled = await checkMemorySettings(userId, groupId);
  if (!memoryEnabled) {
    return "N/A";
  }

  const { data: user } = await supabase
    .from("users")
    .select("memory_opt_out")
    .eq("id", userId)
    .single();

  if (user?.memory_opt_out) {
    return "N/A";
  }

  const memories: any[] = [];

  const { data: globalMemories } = await supabase
    .from("memory_items")
    .select("*")
    .eq("scope", "global")
    .eq("is_deleted", false)
    .order("importance_score", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .limit(5);

  if (globalMemories) memories.push(...globalMemories);

  const { data: userMemories } = await supabase
    .from("memory_items")
    .select("*")
    .eq("scope", "user")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("pinned", { ascending: false })
    .order("importance_score", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .limit(10);

  if (userMemories) memories.push(...userMemories);

  if (!isDM) {
    const { data: groupMemories } = await supabase
      .from("memory_items")
      .select("*")
      .eq("scope", "group")
      .eq("group_id", groupId)
      .eq("is_deleted", false)
      .order("pinned", { ascending: false })
      .order("importance_score", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(10);

    if (groupMemories) memories.push(...groupMemories);
  }

  const memoryIds = memories.map((m) => m.id);
  if (memoryIds.length > 0) {
    await supabase
      .from("memory_items")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", memoryIds);
  }

  if (memories.length === 0) {
    return "N/A";
  }

  const formatted = memories
    .map((m) => {
      const scopeLabel =
        m.scope === "user"
          ? "User Memory"
          : m.scope === "group"
          ? "Group Memory"
          : "Global Memory";
      return `[${scopeLabel}] [${m.category}] ${m.title}: ${m.content}`;
    })
    .join("\n");

  return formatted;
}

// =============================
// SAFETY MONITORING SYSTEM (Phase 3)
// =============================

interface SafetyRule {
  id: string;
  name: string;
  rule_type: string;
  pattern: string;
  severity: string;
  action: string;
  scope: string;
  group_id: string | null;
  match_count: number;
  last_matched_at: string | null;
}

let safetyRulesCache: {
  rules: SafetyRule[];
  lastFetched: number;
} | null = null;

const SAFETY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadSafetyRules(groupId: string): Promise<SafetyRule[]> {
  // Check cache
  if (safetyRulesCache && Date.now() - safetyRulesCache.lastFetched < SAFETY_CACHE_TTL) {
    return safetyRulesCache.rules.filter(
      r => r.scope === 'global' || (r.scope === 'group' && r.group_id === groupId)
    );
  }

  console.log('[loadSafetyRules] Fetching from database...');

  const { data, error } = await supabase
    .from('safety_rules')
    .select('*')
    .eq('is_enabled', true);

  if (error) {
    console.error('[loadSafetyRules] Error:', error);
    return [];
  }

  safetyRulesCache = {
    rules: data || [],
    lastFetched: Date.now(),
  };

  return safetyRulesCache.rules.filter(
    r => r.scope === 'global' || (r.scope === 'group' && r.group_id === groupId)
  );
}

async function passiveSafetyMonitoring(
  groupId: string,
  userId: string,
  messageText: string,
  messageId: string
): Promise<void> {
  const rules = await loadSafetyRules(groupId);
  const matchedRules: string[] = [];
  let maxSeverity = 'low';
  let riskScore = 0;

  for (const rule of rules) {
    let matches = false;

    if (rule.rule_type === 'url_pattern') {
      const urls = messageText.match(/https?:\/\/[^\s]+/g);
      if (urls) {
        const regex = new RegExp(rule.pattern, 'i');
        matches = urls.some(url => regex.test(url));
      }
    } else if (rule.rule_type === 'keyword') {
      const regex = new RegExp(rule.pattern, 'i');
      matches = regex.test(messageText);
    } else if (rule.rule_type === 'toxicity') {
      const regex = new RegExp(rule.pattern, 'i');
      matches = regex.test(messageText);
    }

    if (matches) {
      matchedRules.push(rule.id);
      if (rule.severity === 'high') {
        maxSeverity = 'high';
        riskScore = Math.max(riskScore, 80);
      } else if (rule.severity === 'medium' && maxSeverity !== 'high') {
        maxSeverity = 'medium';
        riskScore = Math.max(riskScore, 50);
      } else {
        riskScore = Math.max(riskScore, 20);
      }

      // Update rule match count (fire and forget - don't await)
      supabase
        .from('safety_rules')
        .update({
          match_count: (rule.match_count || 0) + 1,
          last_matched_at: new Date().toISOString(),
        })
        .eq('id', rule.id)
        .then(() => {});
    }
  }

  if (matchedRules.length > 0) {
    console.log(`[passiveSafetyMonitoring] Matched ${matchedRules.length} rules, severity: ${maxSeverity}`);

    // Determine alert type
    let alertType = 'other';
    const firstRule = rules.find(r => r.id === matchedRules[0]);
    if (firstRule?.rule_type === 'url_pattern') alertType = 'scam_link';
    else if (firstRule?.rule_type === 'keyword') alertType = 'spam';
    else if (firstRule?.rule_type === 'toxicity') alertType = 'toxicity';

    // Create alert
    const { error } = await supabase
      .from('alerts')
      .insert({
        group_id: groupId,
        type: alertType,
        severity: maxSeverity,
        summary: `Detected ${alertType}: ${matchedRules.length} rule(s) matched`,
        details: {
          message_preview: messageText.substring(0, 200),
          matched_rule_ids: matchedRules,
        },
        message_id: messageId,
        risk_score: riskScore,
        matched_rules: matchedRules,
        source_user_id: userId,
        action_taken: maxSeverity === 'high' ? 'warned' : 'logged',
      });

    if (error) {
      console.error('[passiveSafetyMonitoring] Error creating alert:', error);
    }

    // If severity is high and action is warn, we could send a warning message
    // (but respecting LINE's constraint that we cannot delete messages)
    if (maxSeverity === 'high' && firstRule?.action === 'warn') {
      console.log('[passiveSafetyMonitoring] High severity detected, warning should be sent by admin');
    }
  }
}

// =============================
// FAQ LOGGING SYSTEM (Phase 1)
// =============================

async function logFaqInteraction(
  groupId: string,
  userId: string,
  question: string,
  answer: string,
  knowledgeItemIds: string[],
  language: string,
  responseTimeMs: number
): Promise<void> {
  const { error } = await supabase
    .from('faq_logs')
    .insert({
      group_id: groupId,
      user_id: userId,
      question,
      answer,
      knowledge_item_ids: knowledgeItemIds,
      language,
      response_time_ms: responseTimeMs,
    });

  if (error) {
    console.error('[logFaqInteraction] Error:', error);
  }
}

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

  // Group by day
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

  // Mood score: (positive - negative) / total, normalized to 0-1
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

  // Simple keyword extraction (filter out common words)
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'it', 'that', 'this', 'i', 'you', 'we', 'they', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should']);
  
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

// =============================
// PHASE 2: COMMAND HANDLERS
// =============================

/**
 * Handle /help command - show available commands
 */
async function handleHelpCommand(
  groupId: string,
  userId: string,
  language: 'en' | 'th' | 'other',
  replyToken: string
) {
  console.log(`[handleHelpCommand] Generating help for user ${userId} in ${language}`);

  try {
    // Fetch all enabled commands from database
    const { data: commands, error: cmdError } = await supabase
      .from('bot_commands')
      .select('*, command_aliases!inner(*)')
      .eq('is_enabled', true)
      .order('display_order');

    if (cmdError) {
      console.error('[handleHelpCommand] Error fetching commands:', cmdError);
      await replyToLine(replyToken, 'Sorry, I couldn\'t load the command list.');
      return;
    }

    // Build help message based on language
    let helpText = '';
    
    if (language === 'th') {
      helpText = `🤖 **คำสั่งที่ใช้งานได้ทั้งหมด**\n\n`;
      helpText += `💬 **ทั่วไป:**\n`;
      helpText += `• /help หรือ /ช่วยเหลือ - แสดงคำแนะนำนี้\n`;
      helpText += `• @intern [คำถาม] - ถามคำถามใดก็ได้\n\n`;
      
      helpText += `📝 **สรุปการสนทนา:**\n`;
      helpText += `• /summary หรือ /สรุป - สรุปการสนทนา\n`;
      helpText += `  ตัวอย่าง: /สรุป วันนี้, /summary 100\n\n`;
      
      helpText += `✅ **งานและเตือนความจำ:**\n`;
      helpText += `• /todo [งาน] - สร้างงาน\n`;
      helpText += `• /remind หรือ /เตือน [งาน] [เวลา] - ตั้งเตือน\n`;
      helpText += `  ตัวอย่าง: /เตือน ประชุม พรุ่งนี้ 14:00\n`;
      helpText += `• /remind ทุก[ช่วง] เวลา [เวลา] [ข้อความ] - เตือนซ้ำ\n`;
      helpText += `  ตัวอย่าง:\n`;
      helpText += `  - /remind ทุกวัน เวลา 9 โมง standup\n`;
      helpText += `  - /remind ทุกสัปดาห์ วันจันทร์ เวลา 14:00 ประชุม\n`;
      helpText += `  - /remind ทุกเดือน วันที่ 1 เวลา 10:00 จ่ายค่าเช่า\n\n`;
      
      helpText += `📚 **ความรู้และค้นหา:**\n`;
      helpText += `• /faq หรือ /ถามตอบ [คำถาม] - ค้นหาคลังความรู้\n`;
      helpText += `• /find หรือ /ค้นหา [คำ] - ค้นหาข้อความ\n`;
      helpText += `• /mentions [@ผู้ใช้] - ค้นหาการแท็ก\n\n`;
      
      helpText += `📊 **รายงาน:**\n`;
      helpText += `• /report หรือ /รายงาน [ช่วงเวลา] - สร้างรายงาน\n`;
      helpText += `  ตัวอย่าง: /รายงาน วันนี้, /report week\n\n`;
      
      helpText += `🎨 **สร้างสรรค์:**\n`;
      helpText += `• /imagine หรือ /วาดรูป [คำบรรยาย] - สร้างภาพ\n`;
      helpText += `  ตัวอย่าง: /วาดรูป แมวน่ารัก\n\n`;
      
      helpText += `⚙️ **ตั้งค่า:**\n`;
      helpText += `• /mode หรือ /โหมด [โหมด] - เปลี่ยนโหมด bot\n`;
      helpText += `  โหมดที่มี: helper, faq, report, fun, safety, magic\n`;
      helpText += `• /status หรือ /สถานะ - ดูสถานะ AI และหน่วยความจำ\n\n`;
      
      helpText += `💡 **เคล็ดลับ:**\n`;
      helpText += `• ในกลุ่ม: แท็ก @intern หรือใช้คำสั่ง\n`;
      helpText += `• ใน DM: พิมพ์ข้อความหรือคำสั่งได้เลย\n`;
      helpText += `• Bot รองรับทั้งภาษาอังกฤษและไทย!`;
    } else {
      // English (default)
      helpText = `🤖 **All Available Commands**\n\n`;
      helpText += `💬 **General:**\n`;
      helpText += `• /help - Show this help guide\n`;
      helpText += `• @intern [question] - Ask any question\n\n`;
      
      helpText += `📝 **Summaries:**\n`;
      helpText += `• /summary [period] - Summarize conversations\n`;
      helpText += `  Examples: /summary today, /summary 100\n\n`;
      
      helpText += `✅ **Tasks & Reminders:**\n`;
      helpText += `• /todo [task] - Create a task\n`;
      helpText += `• /remind [task] [time] - Set a reminder\n`;
      helpText += `  Example: /remind meeting tomorrow 2pm\n`;
      helpText += `• /remind every [period] at [time] [task] - Recurring\n`;
      helpText += `  Examples:\n`;
      helpText += `  - /remind every day at 9am standup\n`;
      helpText += `  - /remind every Monday at 2pm team sync\n`;
      helpText += `  - /remind every month on 1st at 10am rent\n\n`;
      
      helpText += `📚 **Knowledge & Search:**\n`;
      helpText += `• /faq [question] - Search knowledge base\n`;
      helpText += `• /find [keyword] - Search messages\n`;
      helpText += `• /mentions [@user] - Find mentions\n`;
      helpText += `• /train [content] - Add to knowledge base\n\n`;
      
      helpText += `📊 **Analytics:**\n`;
      helpText += `• /report [period] - Generate group report\n`;
      helpText += `  Examples: /report today, /report week\n\n`;
      
      helpText += `🎨 **Creative:**\n`;
      helpText += `• /imagine [description] - Generate an image\n`;
      helpText += `  Example: /imagine a sunset over mountains\n\n`;
      
      helpText += `⚙️ **Settings:**\n`;
      helpText += `• /mode [mode] - Change bot mode\n`;
      helpText += `  Modes: helper, faq, report, fun, safety, magic\n`;
      helpText += `• /status - View AI personality and memory stats\n\n`;
      
      helpText += `💡 **Tips:**\n`;
      helpText += `• In groups: Mention @intern or use commands\n`;
      helpText += `• In DMs: Just type your message or command\n`;
      helpText += `• Bot understands both English and Thai!`;
    }

    await replyToLine(replyToken, helpText);
  } catch (error) {
    console.error(`[handleHelpCommand] Error:`, error);
    await replyToLine(replyToken, language === 'th' 
      ? 'ขออภัย เกิดข้อผิดพลาดในการแสดงคำแนะนำ' 
      : 'Sorry, I encountered an error showing the help guide.');
  }
}

// =============================
// PHASE 2: SUMMARY COMMAND HANDLERS
// =============================

/**
 * Handle /summary command - generate and store chat summary
 */
async function handleSummaryCommand(
  groupId: string,
  userId: string,
  userMessage: string,
  replyToken: string
) {
  console.log(`[handleSummaryCommand] Generating summary for group ${groupId}`);

  try {
    // Parse time range from user message (e.g., "today", "24h", "last 100", default to last 100)
    let messageLimit = 100;
    let timeRangeDesc = "last 100 messages";
    
    const lowerMsg = userMessage.toLowerCase();
    if (lowerMsg.includes('today')) {
      messageLimit = 1000;
      timeRangeDesc = "today";
    } else if (lowerMsg.includes('24h') || lowerMsg.includes('24 hour')) {
      messageLimit = 500;
      timeRangeDesc = "last 24 hours";
    } else if (lowerMsg.match(/\d+/)) {
      const match = lowerMsg.match(/\d+/);
      if (match) {
        messageLimit = parseInt(match[0]);
        timeRangeDesc = `last ${messageLimit} messages`;
      }
    }

    // Fetch messages for summary
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('group_id', groupId)
      .eq('direction', 'human')
      .order('sent_at', { ascending: false })
      .limit(messageLimit);

    if (msgError) {
      console.error('[handleSummaryCommand] Error fetching messages:', msgError);
      await replyToLine(replyToken, 'Sorry, I couldn\'t fetch messages for the summary.');
      return;
    }

    if (!messages || messages.length === 0) {
      await replyToLine(replyToken, 'No messages found to summarize.');
      return;
    }

    // Reverse to chronological order
    messages.reverse();

    // Build prompt for structured summary
    const messageTexts = messages.map((m: any) => `[${new Date(m.sent_at).toLocaleString()}] ${m.text}`).join('\n');
    
    const summaryPrompt = `You are summarizing a chat conversation. Analyze the following messages and provide a structured summary.

MESSAGES (${messages.length} total, ${timeRangeDesc}):
${messageTexts}

Please provide a structured summary in the following format:

**Summary**
[2-3 sentence overview of main topics discussed]

**Main Topics**
- Topic 1
- Topic 2
- Topic 3

**Decisions Made**
- Decision 1 (who decided, what was decided)
- Decision 2

**Action Items**
- Action 1 (assigned to whom, deadline if mentioned)
- Action 2

**Open Questions**
- Question 1
- Question 2

If any section has no content, write "None" for that section.`;

    // Call AI for summary
    const aiSummary = await generateAiReply(
      summaryPrompt,
      'helper',
      'summary',
      '',
      '',
      '',
      'N/A'
    );

    // Parse AI response to extract structured data
    const summaryText = aiSummary;
    const mainTopics = extractListFromSection(aiSummary, 'Main Topics');
    const decisions = extractObjectsFromSection(aiSummary, 'Decisions Made');
    const actionItems = extractObjectsFromSection(aiSummary, 'Action Items');
    const openQuestions = extractListFromSection(aiSummary, 'Open Questions');

    // Store in chat_summaries table
    const fromTime = messages[0].sent_at;
    const toTime = messages[messages.length - 1].sent_at;
    
    const { error: insertError } = await supabase
      .from('chat_summaries')
      .insert({
        group_id: groupId,
        from_message_id: messages[0].id,
        to_message_id: messages[messages.length - 1].id,
        from_time: fromTime,
        to_time: toTime,
        summary_text: summaryText,
        main_topics: mainTopics,
        decisions: decisions,
        action_items: actionItems,
        open_questions: openQuestions,
        message_count: messages.length,
        created_by_user_id: userId,
      });

    if (insertError) {
      console.error('[handleSummaryCommand] Error storing summary:', insertError);
    }

    // Reply with summary
    await replyToLine(replyToken, `📊 **Chat Summary (${timeRangeDesc})**\n\n${aiSummary}`);
    
  } catch (error) {
    console.error('[handleSummaryCommand] Error:', error);
    await replyToLine(replyToken, 'Sorry, I encountered an error generating the summary.');
  }
}

/**
 * Handle /find command - search messages by keyword
 */
async function handleFindCommand(
  groupId: string,
  userMessage: string,
  replyToken: string
) {
  console.log(`[handleFindCommand] Searching messages in group ${groupId}`);

  try {
    const keyword = userMessage.trim();
    
    if (!keyword || keyword.length < 2) {
      await replyToLine(replyToken, 'Please provide a search keyword (at least 2 characters).\n\nExample: /find budget');
      return;
    }

    // Search messages using full-text search
    const { data: messages, error: searchError } = await supabase
      .from('messages')
      .select('*, users!inner(display_name)')
      .eq('group_id', groupId)
      .ilike('text', `%${keyword}%`)
      .order('sent_at', { ascending: false })
      .limit(10);

    if (searchError) {
      console.error('[handleFindCommand] Search error:', searchError);
      await replyToLine(replyToken, 'Sorry, I encountered an error searching messages.');
      return;
    }

    if (!messages || messages.length === 0) {
      await replyToLine(replyToken, `No messages found containing "${keyword}".`);
      return;
    }

    // Format results
    let resultText = `🔍 **Found ${messages.length} message(s) containing "${keyword}":**\n\n`;
    
    messages.forEach((msg: any, idx: number) => {
      const timestamp = new Date(msg.sent_at).toLocaleString();
      const sender = msg.users?.display_name || 'Unknown';
      const preview = msg.text.length > 100 ? msg.text.substring(0, 100) + '...' : msg.text;
      resultText += `${idx + 1}. [${timestamp}] ${sender}:\n${preview}\n\n`;
    });

    await replyToLine(replyToken, resultText);
    
  } catch (error) {
    console.error('[handleFindCommand] Error:', error);
    await replyToLine(replyToken, 'Sorry, I encountered an error searching messages.');
  }
}

/**
 * Handle /mentions command - find messages where user was mentioned
 */
async function handleMentionsCommand(
  groupId: string,
  userId: string,
  userMessage: string,
  replyToken: string
) {
  console.log(`[handleMentionsCommand] Finding mentions for user ${userId} in group ${groupId}`);

  try {
    // Get user's display name to search for mentions
    const { data: user } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', userId)
      .single();

    if (!user) {
      await replyToLine(replyToken, 'Sorry, I couldn\'t find your user information.');
      return;
    }

    // Search for messages mentioning the user
    // LINE uses @display_name format
    const { data: mentions, error: mentionError } = await supabase
      .from('messages')
      .select('*, users!inner(display_name)')
      .eq('group_id', groupId)
      .or(`text.ilike.%@${user.display_name}%,text.ilike.%${user.display_name}%`)
      .order('sent_at', { ascending: false })
      .limit(10);

    if (mentionError) {
      console.error('[handleMentionsCommand] Search error:', mentionError);
      await replyToLine(replyToken, 'Sorry, I encountered an error searching for mentions.');
      return;
    }

    if (!mentions || mentions.length === 0) {
      await replyToLine(replyToken, `No recent mentions found for you.`);
      return;
    }

    // Format results
    let resultText = `🔔 **Found ${mentions.length} mention(s) of you:**\n\n`;
    
    mentions.forEach((msg: any, idx: number) => {
      const timestamp = new Date(msg.sent_at).toLocaleString();
      const sender = msg.users?.display_name || 'Unknown';
      const preview = msg.text.length > 100 ? msg.text.substring(0, 100) + '...' : msg.text;
      resultText += `${idx + 1}. [${timestamp}] ${sender}:\n${preview}\n\n`;
    });

    await replyToLine(replyToken, resultText);
    
  } catch (error) {
    console.error('[handleMentionsCommand] Error:', error);
    await replyToLine(replyToken, 'Sorry, I encountered an error finding mentions.');
  }
}

/**
 * Handle /status command - show AI personality and memory stats
 */
async function handleStatusCommand(
  groupId: string,
  userId: string,
  replyToken: string
) {
  console.log(`[handleStatusCommand] Getting status for group ${groupId}`);

  try {
    // Fetch personality state (use maybeSingle to avoid errors)
    const { data: personalityState, error: personalityError } = await supabase
      .from('personality_state')
      .select('*')
      .eq('group_id', groupId)
      .maybeSingle();

    if (personalityError) {
      console.error('[handleStatusCommand] Personality error:', personalityError);
    }

    // Fetch memory statistics
    const { data: memoryItems, error: memoryError } = await supabase
      .from('memory_items')
      .select('*')
      .eq('group_id', groupId)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false });

    if (memoryError) {
      console.error('[handleStatusCommand] Memory error:', memoryError);
    }

    // Fetch group mode
    const { data: group } = await supabase
      .from('groups')
      .select('mode')
      .eq('id', groupId)
      .single();

    const mode = group?.mode || 'helper';

    // Build status message
    let statusText = '📊 **สถานะระบบ AI**\n\n';

    // === PERSONALITY STATE ===
    statusText += '🤖 **บุคลิกภาพ AI**\n';
    if (personalityState) {
      // Get mood emoji
      const moodEmojis: Record<string, string> = {
        happy: '😊',
        curious: '🤔',
        thoughtful: '💭',
        playful: '😄',
        serious: '🧐',
        energetic: '⚡',
        calm: '😌',
        reflective: '🌙',
        enthusiastic: '🎉',
        friendly: '👋',
      };
      const moodEmoji = moodEmojis[personalityState.mood] || '😐';

      statusText += `• อารมณ์: ${moodEmoji} ${personalityState.mood}\n`;
      statusText += `• พลังงาน: ${'⚡'.repeat(Math.ceil(personalityState.energy_level / 20))} ${personalityState.energy_level}/100\n`;
      
      // Personality traits
      const traits = personalityState.personality_traits as any;
      statusText += `• ลักษณะนิสัย:\n`;
      statusText += `  - ตลก: ${traits.humor || 0}/100\n`;
      statusText += `  - ช่วยเหลือ: ${traits.helpfulness || 0}/100\n`;
      statusText += `  - อยากรู้อยากเห็น: ${traits.curiosity || 0}/100\n`;

      // Current interests
      const interests = (personalityState.current_interests as string[]) || [];
      if (interests.length > 0) {
        statusText += `• สนใจ: ${interests.slice(0, 3).join(', ')}\n`;
      }

      // Recent topics
      const topics = (personalityState.recent_topics as string[]) || [];
      if (topics.length > 0) {
        statusText += `• หัวข้อล่าสุด: ${topics.slice(0, 3).join(', ')}\n`;
      }

      const lastChange = new Date(personalityState.last_mood_change);
      const timeSince = Math.floor((Date.now() - lastChange.getTime()) / (1000 * 60));
      statusText += `• เปลี่ยนอารมณ์ล่าสุด: ${timeSince} นาทีที่แล้ว\n`;
    } else {
      statusText += `• ยังไม่มีข้อมูลบุคลิกภาพ\n`;
      statusText += `• AI จะเริ่มเรียนรู้เมื่อมีการสนทนามากขึ้น\n`;
    }

    statusText += '\n';

    // === MEMORY STATISTICS ===
    statusText += '🧠 **หน่วยความจำ**\n';
    if (memoryItems && memoryItems.length > 0) {
      statusText += `• จำนวนข้อมูล: ${memoryItems.length} รายการ\n`;

      // Count by category
      const categories: Record<string, number> = {};
      memoryItems.forEach((item: any) => {
        categories[item.category] = (categories[item.category] || 0) + 1;
      });

      statusText += `• หมวดหมู่:\n`;
      Object.entries(categories).forEach(([cat, count]) => {
        statusText += `  - ${cat}: ${count} รายการ\n`;
      });

      // Latest memory
      const latest = memoryItems[0];
      const latestTime = new Date(latest.updated_at);
      const latestMinutes = Math.floor((Date.now() - latestTime.getTime()) / (1000 * 60));
      statusText += `• อัปเดตล่าสุด: ${latestMinutes} นาทีที่แล้ว\n`;

      // Pinned items
      const pinnedCount = memoryItems.filter((m: any) => m.pinned).length;
      if (pinnedCount > 0) {
        statusText += `• ข้อมูลที่ปักหมุด: ${pinnedCount} รายการ\n`;
      }
    } else {
      statusText += `• ยังไม่มีข้อมูลในหน่วยความจำ\n`;
      statusText += `• AI จะเริ่มจำข้อมูลสำคัญเมื่อพูดคุยมากขึ้น\n`;
    }

    statusText += '\n';

    // === MODE INFO ===
    statusText += '⚙️ **โหมดปัจจุบัน**\n';
    const modeNames: Record<string, string> = {
      helper: '🤝 ผู้ช่วย (Helper)',
      faq: '📚 คลังความรู้ (FAQ)',
      report: '📊 วิเคราะห์รายงาน (Report)',
      fun: '🎉 สนุกสนาน (Fun)',
      safety: '🛡️ ความปลอดภัย (Safety)',
      magic: '✨ เวทมนตร์ (Magic)',
    };
    statusText += `• ${modeNames[mode] || mode}\n`;

    statusText += '\n💡 **เคล็ดลับ:**\n';
    statusText += '• ใช้ /mode เพื่อเปลี่ยนโหมดทำงาน\n';
    statusText += '• AI จะเรียนรู้และปรับตัวตามการสนทนาในกลุ่ม\n';
    statusText += '• หน่วยความจำช่วยให้ AI จำข้อมูลสำคัญได้นานขึ้น';

    await replyToLine(replyToken, statusText);
  } catch (error) {
    console.error('[handleStatusCommand] Error:', error);
    await replyToLine(replyToken, 'ขออภัย เกิดข้อผิดพลาดในการดึงข้อมูลสถานะ');
  }
}

/**
 * Helper: Extract list items from markdown section
 */
function extractListFromSection(text: string, sectionName: string): string[] {
  const regex = new RegExp(`\\*\\*${sectionName}\\*\\*[\\s\\S]*?(?=\\n\\*\\*|$)`, 'i');
  const match = text.match(regex);
  if (!match) return [];
  
  const lines = match[0].split('\n').filter(line => line.trim().startsWith('-'));
  return lines.map(line => line.replace(/^-\s*/, '').trim()).filter(Boolean);
}

/**
 * Helper: Extract objects from markdown section (for decisions/action items)
 */
function extractObjectsFromSection(text: string, sectionName: string): any[] {
  const items = extractListFromSection(text, sectionName);
  return items.map(item => ({ text: item }));
}

// =============================
// MODE COMMAND HANDLER (Phase 8)
// =============================

/**
 * Handle /mode command - switch group modes
 */
async function handleModeCommand(
  groupId: string,
  userMessage: string,
  replyToken: string
): Promise<void> {
  console.log(`[handleModeCommand] Processing mode change: ${userMessage}`);

  // Extract mode from message
  const modeMatch = userMessage.toLowerCase().match(/\/(mode|m|โหมด|setmode)\s+(helper|faq|report|fun|safety|magic)/);
  
  if (!modeMatch) {
    await replyToLine(
      replyToken,
      "Please specify a valid mode: helper, faq, report, fun, safety, or magic\n\nExample: /mode helper"
    );
    return;
  }

  const newMode = modeMatch[2] as "helper" | "faq" | "report" | "fun" | "safety" | "magic";

  // Update group mode
  const { error: updateError } = await supabase
    .from("groups")
    .update({ 
      mode: newMode,
      updated_at: new Date().toISOString()
    })
    .eq("id", groupId);

  if (updateError) {
    console.error("[handleModeCommand] Error updating group mode:", updateError);
    await replyToLine(replyToken, "Sorry, I couldn't change the mode. Please try again.");
    return;
  }

  // Mode descriptions
  const modeDescriptions = {
    helper: "🤝 Helper Mode - Versatile assistant for general questions and tasks",
    faq: "📚 FAQ Mode - Knowledge expert using your documentation",
    report: "📊 Report Mode - Data analyst providing insights from analytics",
    fun: "🎉 Fun Mode - Entertaining and creative responses",
    safety: "🛡️ Safety Mode - Vigilant protector watching for security issues",
    magic: "✨ Magic Mode - AI with evolving personality & emotions"
  };

  const responseMessage = `✅ Mode changed to: ${newMode.toUpperCase()}\n\n${modeDescriptions[newMode]}\n\nI'll now respond according to this mode's behavior.`;
  
  await replyToLine(replyToken, responseMessage);
  
  console.log(`[handleModeCommand] Mode changed to ${newMode} for group ${groupId}`);
}

// =============================
// TRAINING COMMAND HANDLER (Phase 1)
// =============================

/**
 * Handle /imagine command - generate images using AI
 */
async function handleImagineCommand(
  groupId: string,
  userId: string,
  userMessage: string,
  replyToken: string
) {
  console.log(`[handleImagineCommand] Generating image for prompt: ${userMessage}`);

  try {
    // Extract the image prompt
    const prompt = userMessage.trim();
    
    if (!prompt || prompt.length === 0) {
      await replyToLine(replyToken, '❌ Please provide a description of the image you want to generate.\n\nExample: /imagine a beautiful sunset over mountains');
      return;
    }

    // Send status message
    await replyToLine(replyToken, '🎨 Generating your image... This may take a moment.');

    // Call Lovable AI for image generation
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[handleImagineCommand] AI API error: ${response.status} ${errorText}`);
      
      if (response.status === 429) {
        await replyToLine(replyToken, '⏱️ Too many requests. Please wait a moment and try again.');
        return;
      }
      
      if (response.status === 402) {
        await replyToLine(replyToken, '💳 Image generation credits depleted. Please contact the admin to add more credits.');
        return;
      }
      
      await replyToLine(replyToken, '❌ Sorry, I encountered an error generating the image. Please try again.');
      return;
    }

    const data = await response.json();
    console.log('[handleImagineCommand] AI Response:', JSON.stringify(data, null, 2));
    
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageData) {
      console.error('[handleImagineCommand] Full response:', JSON.stringify(data, null, 2));
      console.error('[handleImagineCommand] No image data in response');
      await replyToLine(replyToken, '❌ Sorry, I couldn\'t generate an image. Please try a different prompt.');
      return;
    }

    // Extract base64 data from data URL
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Upload to Supabase Storage
    const fileName = `generated-images/${groupId}/${Date.now()}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('line-bot-assets')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('[handleImagineCommand] Upload error:', uploadError);
      await replyToLine(replyToken, '❌ Sorry, I couldn\'t upload the generated image. Please try again.');
      return;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('line-bot-assets')
      .getPublicUrl(fileName);

    const imageUrl = publicUrlData.publicUrl;

    // Send the image via LINE
    await replyToLineWithImage(replyToken, imageUrl, '✨ Here\'s your generated image!');

    console.log(`[handleImagineCommand] Successfully generated and sent image`);
    
  } catch (error) {
    console.error('[handleImagineCommand] Error:', error);
    await replyToLine(replyToken, '❌ Sorry, I encountered an error generating the image. Please try again.');
  }
}

/**
 * Handle /report command - generate comprehensive analytics report
 */
async function handleReportCommand(
  groupId: string,
  userId: string,
  userMessage: string,
  replyToken: string
) {
  console.log(`[handleReportCommand] Generating report for group ${groupId}`);

  try {
    // Parse time range from user message
    let fromDate: Date;
    let toDate = new Date();
    let timeRangeDesc = "last 7 days";
    let period: "daily" | "weekly" | "custom" = "custom";

    const lowerMsg = userMessage.toLowerCase();
    
    if (lowerMsg.includes('today')) {
      fromDate = new Date();
      fromDate.setHours(0, 0, 0, 0);
      timeRangeDesc = "today";
      period = "daily";
    } else if (lowerMsg.includes('week')) {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      timeRangeDesc = "last 7 days";
      period = "weekly";
    } else if (lowerMsg.includes('month') || lowerMsg.includes('30')) {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      timeRangeDesc = "last 30 days";
      period = "custom";
    } else if (lowerMsg.match(/\d+\s*d/)) {
      const match = lowerMsg.match(/(\d+)\s*d/);
      if (match) {
        const days = parseInt(match[1]);
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        timeRangeDesc = `last ${days} days`;
        period = "custom";
      } else {
        fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
      }
    } else {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
    }

    console.log(`[handleReportCommand] Time range: ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    // Fetch total messages
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('group_id', groupId)
      .gte('sent_at', fromDate.toISOString())
      .lte('sent_at', toDate.toISOString());

    if (msgError) {
      console.error('[handleReportCommand] Error fetching messages:', msgError);
      await replyToLine(replyToken, 'Sorry, I couldn\'t generate the report.');
      return;
    }

    const totalMessages = messages?.length || 0;
    if (totalMessages === 0) {
      await replyToLine(replyToken, `No activity found for ${timeRangeDesc}.`);
      return;
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

    // Count URLs
    const urlCount = messages?.filter(m => m.has_url).length || 0;

    // Peak hours (top 5)
    const peakHours = heatmap
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(h => h.hour);

    // Build report data
    const reportData = {
      activity: {
        totalMessages,
        messagesPerDay: velocity.map(v => v.count),
        peakHours,
        activeUsers: engagement.activeUsers
      },
      engagement: {
        avgMessagesPerUser: engagement.avgMessagesPerUser,
        topUsers: engagement.topUsers,
        participationRate: engagement.activeUsers > 0 ? engagement.activeUsers / (engagement.activeUsers + 5) : 0 // Rough estimate
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

    console.log('[handleReportCommand] Report data:', reportData);

    // Generate AI summary
    const summaryPrompt = `Analyze this group activity report and provide insights.

TIME RANGE: ${timeRangeDesc}
TOTAL MESSAGES: ${totalMessages}
ACTIVE USERS: ${engagement.activeUsers}

ACTIVITY:
- Messages per day: ${velocity.map(v => v.count).join(', ')}
- Peak activity hours: ${peakHours.join(', ')}

ENGAGEMENT:
- Avg messages per user: ${engagement.avgMessagesPerUser}
- Top contributors: ${engagement.topUsers.map(u => u.name).join(', ')}

SENTIMENT:
- Positive: ${Math.round(sentiment.positive * 100)}%
- Neutral: ${Math.round(sentiment.neutral * 100)}%
- Negative: ${Math.round(sentiment.negative * 100)}%
- Mood score: ${sentiment.moodScore.toFixed(2)}/1.0

CONTENT:
- Top keywords: ${keywords.map(k => k.word).join(', ')}
- URLs shared: ${urlCount}

SAFETY:
- Total alerts: ${alertStats.total}
- High severity: ${alertStats.bySeverity.high}

Provide a 3-4 sentence summary with:
1. Key activity trends
2. Engagement highlights
3. Mood/sentiment observation
4. Any concerns or recommendations`;

    const aiSummary = await generateAiReply(
      summaryPrompt,
      'report',
      'report',
      '',
      '',
      '',
      'N/A'
    );

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
      console.error('[handleReportCommand] Error saving report:', reportError);
    }

    // Format reply message
    const reply = `📊 Group Activity Report (${timeRangeDesc})

**Activity**
💬 ${totalMessages} messages | 👥 ${engagement.activeUsers} active users
📈 Avg: ${engagement.avgMessagesPerUser} msgs/user
⏰ Peak hours: ${peakHours.join(', ')}

**Sentiment**
😊 ${Math.round(sentiment.positive * 100)}% positive
😐 ${Math.round(sentiment.neutral * 100)}% neutral
😔 ${Math.round(sentiment.negative * 100)}% negative
Mood: ${(sentiment.moodScore * 100).toFixed(0)}/100

**Top Contributors**
${engagement.topUsers.slice(0, 3).map((u, i) => `${i + 1}. ${u.name} (${u.count} msgs)`).join('\n')}

**Safety**
🚨 ${alertStats.total} alerts (${alertStats.bySeverity.high} high priority)

**Insights**
${aiSummary}`;

    await replyToLine(replyToken, reply);
    console.log('[handleReportCommand] Report sent successfully');

  } catch (error) {
    console.error('[handleReportCommand] Error:', error);
    await replyToLine(replyToken, 'Sorry, I encountered an error generating the report.');
  }
}

async function handleTrainingCommand(
  groupId: string,
  userId: string,
  messageText: string,
  replyToken: string
): Promise<void> {
  console.log('[handleTrainingCommand] Processing training request');

  // Extract URL or content
  const urlMatch = messageText.match(/https?:\/\/[^\s]+/);
  let sourceType = 'text';
  let sourceUrl: string | null = null;
  let sourceContent: string | null = messageText;

  if (urlMatch) {
    sourceType = 'url';
    sourceUrl = urlMatch[0];
    sourceContent = '';
  }

  // Use AI to extract knowledge items from content
  let extractedItems = [];
  try {
    const extractPrompt = `Extract key facts and information from the following content. Format as JSON array of objects with: title, category, content (detailed), tags (array).

Content: ${messageText}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: "You are a knowledge extraction assistant. Extract facts and format as JSON." },
          { role: "user", content: extractPrompt },
        ],
        max_completion_tokens: 1000,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      try {
        extractedItems = JSON.parse(reply);
      } catch (e) {
        console.error('[handleTrainingCommand] Failed to parse extracted items:', e);
      }
    }
  } catch (error) {
    console.error('[handleTrainingCommand] Error extracting knowledge:', error);
  }

  // Create training request
  const { data: trainingRequest, error } = await supabase
    .from('training_requests')
    .insert({
      requested_by_user_id: userId,
      group_id: groupId,
      source_type: sourceType,
      source_url: sourceUrl,
      source_content: sourceContent,
      extracted_items: extractedItems,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[handleTrainingCommand] Error creating request:', error);
    await replyToLine(replyToken, 'Sorry, failed to create training request.');
    return;
  }

  const itemCount = Array.isArray(extractedItems) ? extractedItems.length : 0;
  await replyToLine(
    replyToken,
    `✅ Training request created! Extracted ${itemCount} knowledge item(s). An admin will review and approve them shortly.`
  );
}

// =============================
// PHASE 4: Task Scheduler & Reminders with /todo, /remind
// =============================

async function handleTodoCommand(
  groupId: string,
  userId: string,
  userMessage: string,
  replyToken: string
) {
  console.log(`[handleTodoCommand] Creating task from: ${userMessage}`);

  try {
    // Get current date/time in Bangkok timezone (UTC+7) - manual calculation for accuracy
    const now = new Date();
    const bangkokOffset = 7 * 60; // Bangkok is UTC+7 (in minutes)
    const localOffset = now.getTimezoneOffset(); // local offset from UTC
    const bangkokTime = new Date(now.getTime() + (bangkokOffset + localOffset) * 60 * 1000);
    
    const readableTime = bangkokTime.toLocaleString("en-US", { 
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const todayDate = bangkokTime.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentHourMin = `${bangkokTime.getHours()}:${String(bangkokTime.getMinutes()).padStart(2, '0')}`;

    console.log(`[handleTodoCommand] 🕐 Current Bangkok time: ${readableTime} (${currentHourMin})`);
    console.log(`[handleTodoCommand] 📝 User message: ${userMessage}`);

    const parsePrompt = `Current date and time in Bangkok (UTC+7): ${readableTime}

Parse this user message into a specific date/time:
"${userMessage}"

Rules:
- "today" or "วันนี้" means ${todayDate}
- "tomorrow" or "พรุ่งนี้" means the next day after ${todayDate}
- Parse time in 24-hour format (e.g., "14:00" = 2:00 PM, "10:49" = 10:49 AM)
- Current Bangkok time is ${currentHourMin}
- If user says "today 14:00" and current time is ${currentHourMin}, check if 14:00 is in the future:
  * If YES (14:00 is later than ${currentHourMin}): the task is due at 14:00 TODAY
  * If NO (14:00 is earlier than ${currentHourMin}): assume they mean 14:00 TOMORROW
- If no specific time is given and they say "today", default to 1 hour from now
- Return ONLY the ISO timestamp in UTC (convert Bangkok time to UTC by subtracting 7 hours)

Extract:
1. Task title (brief, under 50 chars)
2. Task description (optional, details)
3. Due date/time - return as ISO timestamp in UTC
4. Assigned person (if mentioned)

Respond ONLY in this exact format:
TITLE: <title>
DESCRIPTION: <description or "none">
DUE_AT: <ISO timestamp in format YYYY-MM-DDTHH:MM:SS.000Z or "none">
ASSIGNED_TO: <name or "none">

Example conversions:
- "today 14:00" Bangkok = subtract 7 hours = YYYY-MM-DDT07:00:00.000Z
- "tomorrow 09:00" Bangkok = subtract 7 hours = YYYY-MM-DDT02:00:00.000Z`;

    const aiResponse = await generateAiReply(
      parsePrompt,
      "helper",
      "ask",
      "N/A",
      "N/A",
      "N/A",
      "N/A"
    );

    console.log(`[handleTodoCommand] 🤖 AI response: ${aiResponse}`);

    const titleMatch = aiResponse.match(/TITLE:\s*(.+)/);
    const descMatch = aiResponse.match(/DESCRIPTION:\s*(.+)/);
    const dueMatch = aiResponse.match(/DUE_AT:\s*(.+)/);
    const assignedMatch = aiResponse.match(/ASSIGNED_TO:\s*(.+)/);

    const title = titleMatch?.[1]?.trim() || userMessage.substring(0, 50);
    const description = descMatch?.[1]?.trim();
    const dueAtStr = dueMatch?.[1]?.trim();
    const assignedTo = assignedMatch?.[1]?.trim();

    console.log(`[handleTodoCommand] ⏰ Parsed DUE_AT: ${dueAtStr}`);

    let dueAt: string;
    if (dueAtStr && dueAtStr !== "none" && !dueAtStr.includes("none")) {
      try {
        const parsedDate = new Date(dueAtStr);
        
        // Validate: must not be Invalid Date
        if (isNaN(parsedDate.getTime())) {
          throw new Error("Invalid date parsed");
        }
        
        // Validate: must not be in the past (allow 1 min tolerance)
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        if (parsedDate < oneMinuteAgo) {
          console.warn(`[handleTodoCommand] ⚠️ Parsed date is in the past, using 1 hour from now`);
          parsedDate.setTime(now.getTime() + 60 * 60 * 1000);
        }
        
        dueAt = parsedDate.toISOString();
        console.log(`[handleTodoCommand] ✅ Final due_at (ISO): ${dueAt}`);
        console.log(`[handleTodoCommand] 📊 Time difference: ${formatTimeDistance(parsedDate, 'en')}`);
      } catch (error) {
        console.error(`[handleTodoCommand] ❌ Error parsing date '${dueAtStr}':`, error);
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        dueAt = oneHourFromNow.toISOString();
        console.log(`[handleTodoCommand] Using fallback time (1 hour from now): ${dueAt}`);
      }
    } else {
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      dueAt = oneHourFromNow.toISOString();
      console.log(`[handleTodoCommand] No valid time found, using fallback (1 hour from now): ${dueAt}`);
    }

    let assignedToUserId = null;
    if (assignedTo && assignedTo !== "none" && !assignedTo.includes("none")) {
      const { data: assignedUser } = await supabase
        .from("users")
        .select("id")
        .ilike("display_name", `%${assignedTo}%`)
        .limit(1)
        .single();
      
      if (assignedUser) {
        assignedToUserId = assignedUser.id;
      }
    }

    // Check if message contains @all mention keywords
    const mentionAllKeywords = ["@all", "@All", "@ALL", "ทุกคน", "ทั้งหมด", "everyone", "everybody"];
    const mentionAll = mentionAllKeywords.some(keyword => userMessage.includes(keyword));
    
    if (mentionAll) {
      console.log(`[handleTodoCommand] Detected @all mention in message`);
    }

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        group_id: groupId,
        created_by_user_id: userId,
        assigned_to_user_id: assignedToUserId,
        title,
        description: description && description !== "none" ? description : null,
        due_at: dueAt,
        status: "pending",
        mention_all: mentionAll,
      })
      .select()
      .single();

    if (error) {
      console.error(`[handleTodoCommand] Error creating task:`, error);
      await replyToLine(replyToken, "Sorry, I couldn't create the task. Please try again.");
      return;
    }

    console.log(`[handleTodoCommand] Task created:`, task);

    const assignedText = assignedToUserId ? ` (assigned to ${assignedTo})` : "";
    const descText = description && description !== "none" ? `\n📝 ${description}` : "";
    
    const reply = `✅ Task created!${assignedText}\n\n📌 ${title}${descText}\n⏰ Due: ${formatTimeDistance(new Date(dueAt))}`;
    
    await replyToLine(replyToken, reply);
  } catch (error) {
    console.error(`[handleTodoCommand] Error:`, error);
    await replyToLine(replyToken, "Sorry, I encountered an error creating the task.");
  }
}

// =============================
// RECURRING REMINDER HELPERS
// =============================

function getDayName(dayOfWeek: number | null): string {
  if (dayOfWeek === null) return '';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const daysThai = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  return `${days[dayOfWeek]} / ${daysThai[dayOfWeek]}`;
}

function calculateNextOccurrence(
  pattern: string,
  time: string, // HH:MM
  dayOfWeek: number | null,
  dayOfMonth: number | null
): Date {
  const now = new Date();
  const bangkokOffset = 7 * 60 * 60 * 1000; // UTC+7 in milliseconds
  const bangkokNow = new Date(now.getTime() + bangkokOffset - now.getTimezoneOffset() * 60 * 1000);
  
  const [hours, minutes] = time.split(':').map(Number);
  
  let next = new Date(bangkokNow);
  next.setHours(hours, minutes, 0, 0);
  
  switch (pattern) {
    case 'daily':
      // If time already passed today, move to tomorrow
      if (next <= bangkokNow) {
        next.setDate(next.getDate() + 1);
      }
      break;
      
    case 'weekly':
      // Find next occurrence of specified day of week
      const currentDay = next.getDay();
      const targetDay = dayOfWeek!;
      let daysToAdd = (targetDay - currentDay + 7) % 7;
      
      if (daysToAdd === 0 && next <= bangkokNow) {
        daysToAdd = 7; // Move to next week
      }
      
      next.setDate(next.getDate() + daysToAdd);
      break;
      
    case 'monthly':
      // Set to specified day of month
      next.setDate(dayOfMonth!);
      
      // If already passed this month, move to next month
      if (next <= bangkokNow) {
        next.setMonth(next.getMonth() + 1);
      }
      
      // Handle months with fewer days (e.g., Feb 31 → Feb 28)
      while (next.getDate() !== dayOfMonth!) {
        next.setDate(0); // Go to last day of previous month
      }
      break;
  }
  
  // Convert back to UTC
  return new Date(next.getTime() - bangkokOffset + now.getTimezoneOffset() * 60 * 1000);
}

async function createRecurringInstance(parentTask: any): Promise<void> {
  console.log(`[createRecurringInstance] Creating instance for recurring task ${parentTask.id}`);
  
  // Create a new pending task instance
  const { error } = await supabase
    .from('tasks')
    .insert({
      group_id: parentTask.group_id,
      created_by_user_id: parentTask.created_by_user_id,
      title: parentTask.title,
      description: parentTask.description,
      due_at: parentTask.next_occurrence_at,
      assigned_to_user_id: parentTask.assigned_to_user_id,
      mention_all: parentTask.mention_all,
      status: 'pending',
      is_recurring: false,
      parent_task_id: parentTask.id
    });
    
  if (error) {
    console.error('[createRecurringInstance] Error creating instance:', error);
    return;
  }
  
  console.log(`[createRecurringInstance] ✅ Created instance for ${parentTask.next_occurrence_at}`);
}

async function handleRecurringRemind(
  groupId: string,
  userId: string,
  userMessage: string,
  replyToken: string,
  recurrencePattern: string
) {
  console.log(`[handleRecurringRemind] Creating recurring ${recurrencePattern} reminder`);

  try {
    const now = new Date();
    
    // Use AI to parse recurring reminder details
    const parsePrompt = `Parse this recurring reminder request:
"${userMessage}"

Recurrence type: ${recurrencePattern}

Extract:
1. Task title/message
2. Time (in 24-hour format HH:MM)
3. Day of week (for weekly: 0=Sunday, 1=Monday, ..., 6=Saturday)
4. Day of month (for monthly: 1-31)
5. End date (optional)

Respond ONLY in this format:
TITLE: <title>
TIME: <HH:MM in Bangkok time>
DAY_OF_WEEK: <0-6 or "none">
DAY_OF_MONTH: <1-31 or "none">
END_DATE: <ISO date or "none">

Examples:
- "every day at 9am standup" → TIME: 09:00, DAY_OF_WEEK: none, DAY_OF_MONTH: none
- "every Monday at 2pm sync" → TIME: 14:00, DAY_OF_WEEK: 1, DAY_OF_MONTH: none
- "every month on 1st at 10am rent" → TIME: 10:00, DAY_OF_WEEK: none, DAY_OF_MONTH: 1
- "ทุกวัน เวลา 9 โมง standup" → TIME: 09:00, DAY_OF_WEEK: none, DAY_OF_MONTH: none`;

    const aiResponse = await generateAiReply(
      parsePrompt,
      "helper",
      "ask",
      "N/A",
      "N/A",
      "N/A",
      "N/A"
    );
    
    console.log(`[handleRecurringRemind] AI response: ${aiResponse}`);
    
    // Parse AI response
    const titleMatch = aiResponse.match(/TITLE:\s*(.+)/);
    const timeMatch = aiResponse.match(/TIME:\s*(\d{2}:\d{2})/);
    const dowMatch = aiResponse.match(/DAY_OF_WEEK:\s*(\d+|none)/);
    const domMatch = aiResponse.match(/DAY_OF_MONTH:\s*(\d+|none)/);
    const endMatch = aiResponse.match(/END_DATE:\s*(.+)/);
    
    const title = titleMatch?.[1]?.trim() || userMessage.substring(0, 50);
    const time = timeMatch?.[1]?.trim() || "09:00";
    const dayOfWeek = dowMatch?.[1] !== "none" ? parseInt(dowMatch?.[1] || "0") : null;
    const dayOfMonth = domMatch?.[1] !== "none" ? parseInt(domMatch?.[1] || "1") : null;
    const endDate = endMatch?.[1]?.trim() !== "none" && endMatch?.[1]?.trim() !== undefined ? endMatch?.[1] : null;
    
    console.log(`[handleRecurringRemind] Parsed: pattern=${recurrencePattern}, time=${time}, dow=${dayOfWeek}, dom=${dayOfMonth}`);
    
    // Calculate next occurrence
    const nextOccurrence = calculateNextOccurrence(recurrencePattern, time, dayOfWeek, dayOfMonth);
    
    console.log(`[handleRecurringRemind] Next occurrence: ${nextOccurrence.toISOString()}`);
    
    // Insert recurring task template
    const { data: recurringTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        group_id: groupId,
        created_by_user_id: userId,
        title: title,
        status: 'pending',
        is_recurring: true,
        recurrence_pattern: recurrencePattern,
        recurrence_interval: 1,
        recurrence_day_of_week: dayOfWeek,
        recurrence_day_of_month: dayOfMonth,
        recurrence_time: time,
        recurrence_end_date: endDate,
        next_occurrence_at: nextOccurrence.toISOString(),
        due_at: nextOccurrence.toISOString(), // first occurrence
      })
      .select()
      .single();

    if (insertError) {
      console.error('[handleRecurringRemind] Insert error:', insertError);
      await replyToLine(replyToken, "Sorry, I couldn't create the recurring reminder. / ขออภัย ไม่สามารถสร้างการเตือนซ้ำได้");
      return;
    }

    console.log(`[handleRecurringRemind] Created recurring task:`, recurringTask);
    
    // Reply with confirmation
    const patternText: { [key: string]: string } = {
      daily: 'ทุกวัน / every day',
      weekly: `ทุกสัปดาห์ / every week${dayOfWeek !== null ? ` (${getDayName(dayOfWeek)})` : ''}`,
      monthly: `ทุกเดือน / every month${dayOfMonth !== null ? ` (day ${dayOfMonth})` : ''}`
    };
    
    const reply = `🔄 **Recurring Reminder Created!**

📌 ${title}
⏰ ${patternText[recurrencePattern]} at ${time}
🎯 Next reminder: ${formatTimeDistance(nextOccurrence, 'en')}
${endDate ? `🏁 Until: ${new Date(endDate).toLocaleDateString('th-TH')}` : ''}

💡 Tip: Task scheduler will create reminders automatically`;

    await replyToLine(replyToken, reply);
  } catch (error) {
    console.error(`[handleRecurringRemind] Error:`, error);
    await replyToLine(replyToken, "Sorry, I encountered an error creating the recurring reminder. / ขออภัย เกิดข้อผิดพลาดในการสร้างการเตือนซ้ำ");
  }
}

async function handleRemindCommand(
  groupId: string,
  userId: string,
  userMessage: string,
  replyToken: string
) {
  console.log(`[handleRemindCommand] Creating reminder from: ${userMessage}`);

  // Detect recurring patterns
  const recurringPatterns = {
    daily: /every\s+day|ทุกวัน|daily/i,
    weekly: /every\s+week|ทุกสัปดาห์|weekly/i,
    monthly: /every\s+month|ทุกเดือน|monthly/i
  };
  
  let isRecurring = false;
  let recurrencePattern = 'none';
  
  for (const [pattern, regex] of Object.entries(recurringPatterns)) {
    if (regex.test(userMessage)) {
      isRecurring = true;
      recurrencePattern = pattern;
      break;
    }
  }
  
  if (isRecurring) {
    console.log(`[handleRemindCommand] Detected recurring pattern: ${recurrencePattern}`);
    await handleRecurringRemind(groupId, userId, userMessage, replyToken, recurrencePattern);
    return;
  }

  try {
    // Get current date/time in Bangkok timezone (UTC+7) - manual calculation for accuracy
    const now = new Date();
    const bangkokOffset = 7 * 60; // Bangkok is UTC+7 (in minutes)
    const localOffset = now.getTimezoneOffset(); // local offset from UTC
    const bangkokTime = new Date(now.getTime() + (bangkokOffset + localOffset) * 60 * 1000);
    
    const readableTime = bangkokTime.toLocaleString("en-US", { 
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const todayDate = bangkokTime.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentHourMin = `${bangkokTime.getHours()}:${String(bangkokTime.getMinutes()).padStart(2, '0')}`;

    console.log(`[handleRemindCommand] 🕐 Current Bangkok time: ${readableTime} (${currentHourMin})`);
    console.log(`[handleRemindCommand] 📝 User message: ${userMessage}`);

    const parsePrompt = `Current date and time in Bangkok (UTC+7): ${readableTime}

Parse this user message into a specific date/time:
"${userMessage}"

Rules:
- "today" or "วันนี้" means ${todayDate}
- "tomorrow" or "พรุ่งนี้" means the next day after ${todayDate}
- Parse time in 24-hour format (e.g., "14:00" = 2:00 PM, "10:49" = 10:49 AM)
- Current Bangkok time is ${currentHourMin}
- If user says "today 14:00" and current time is ${currentHourMin}, check if 14:00 is in the future:
  * If YES (14:00 is later than ${currentHourMin}): the reminder is due at 14:00 TODAY
  * If NO (14:00 is earlier than ${currentHourMin}): assume they mean 14:00 TOMORROW
- For "in X minutes/hours", calculate from current time
- If no specific time is given and they say "today", default to 1 hour from now
- Return ONLY the ISO timestamp in UTC (convert Bangkok time to UTC by subtracting 7 hours)

Extract:
1. Reminder message/text (what to remind about)
2. Remind time - return as ISO timestamp in UTC

Respond ONLY in this exact format:
MESSAGE: <reminder message>
REMIND_AT: <ISO timestamp in format YYYY-MM-DDTHH:MM:SS.000Z or "none">

Example conversions:
- "today 14:00" Bangkok = subtract 7 hours = YYYY-MM-DDT07:00:00.000Z
- "in 30 minutes" = current time + 30 minutes converted to UTC`;

    const aiResponse = await generateAiReply(
      parsePrompt,
      "helper",
      "ask",
      "N/A",
      "N/A",
      "N/A",
      "N/A"
    );

    console.log(`[handleRemindCommand] 🤖 AI response: ${aiResponse}`);

    const messageMatch = aiResponse.match(/MESSAGE:\s*(.+)/);
    const remindMatch = aiResponse.match(/REMIND_AT:\s*(.+)/);

    const reminderMessage = messageMatch?.[1]?.trim() || userMessage;
    const remindAtStr = remindMatch?.[1]?.trim();

    console.log(`[handleRemindCommand] ⏰ Parsed REMIND_AT: ${remindAtStr}`);

    let remindAt: string;
    if (remindAtStr && remindAtStr !== "none" && !remindAtStr.includes("none")) {
      try {
        const parsedDate = new Date(remindAtStr);
        
        // Validate: must not be Invalid Date
        if (isNaN(parsedDate.getTime())) {
          throw new Error("Invalid date parsed");
        }
        
        // Validate: must not be in the past (allow 1 min tolerance)
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        if (parsedDate < oneMinuteAgo) {
          console.warn(`[handleRemindCommand] ⚠️ Parsed date is in the past, using 1 hour from now`);
          parsedDate.setTime(now.getTime() + 60 * 60 * 1000);
        }
        
        remindAt = parsedDate.toISOString();
        console.log(`[handleRemindCommand] ✅ Final remind_at (ISO): ${remindAt}`);
        console.log(`[handleRemindCommand] 📊 Time difference: ${formatTimeDistance(parsedDate, 'en')}`);
      } catch (error) {
        console.error(`[handleRemindCommand] ❌ Error parsing date '${remindAtStr}':`, error);
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        remindAt = oneHourFromNow.toISOString();
        console.log(`[handleRemindCommand] Using fallback time (1 hour from now): ${remindAt}`);
      }
    } else {
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      remindAt = oneHourFromNow.toISOString();
      console.log(`[handleRemindCommand] No valid time found, using fallback (1 hour from now): ${remindAt}`);
    }

    // Check if message contains @all mention keywords
    const mentionAllKeywords = ["@all", "@All", "@ALL", "ทุกคน", "ทั้งหมด", "everyone", "everybody"];
    const mentionAll = mentionAllKeywords.some(keyword => userMessage.includes(keyword));
    
    if (mentionAll) {
      console.log(`[handleRemindCommand] Detected @all mention in message`);
    }

    const { data: reminder, error } = await supabase
      .from("tasks")
      .insert({
        group_id: groupId,
        created_by_user_id: userId,
        title: `🔔 Reminder: ${reminderMessage.substring(0, 80)}`,
        description: reminderMessage.length > 80 ? reminderMessage : null,
        due_at: remindAt,
        status: "pending",
        mention_all: mentionAll,
      })
      .select()
      .single();

    if (error) {
      console.error(`[handleRemindCommand] Error creating reminder:`, error);
      await replyToLine(replyToken, "Sorry, I couldn't set the reminder. Please try again.");
      return;
    }

    console.log(`[handleRemindCommand] Reminder created:`, reminder);

    const reply = `⏰ Reminder set!\n\n📌 ${reminderMessage}\n🕐 I'll remind you ${formatTimeDistance(new Date(remindAt))}`;
    
    await replyToLine(replyToken, reply);
  } catch (error) {
    console.error(`[handleRemindCommand] Error:`, error);
    await replyToLine(replyToken, "Sorry, I encountered an error setting the reminder.");
  }
}

// =============================
// LOVABLE AI INTEGRATION
// =============================

async function generateAiReply(
  userMessage: string,
  mode: string,
  commandType: string,
  recentMessages: string,
  memoryContext: string,
  knowledgeSnippets: string,
  analyticsSnapshot: string,
  groupId?: string,
  userId?: string
): Promise<string> {
  let personalityContext = '';
  
  // === PERSONALITY ENGINE: Track personality in all groups ===
  if (groupId) {
    try {
      const { count: messageCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/personality-engine`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_context',
          groupId,
          userId,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        personalityContext = result.context || '';
        
        // Update personality state based on this message (fire and forget)
        fetch(`${SUPABASE_URL}/functions/v1/personality-engine`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update',
            groupId,
            userId,
            messageText: userMessage,
            messageCount: messageCount || 0,
          }),
        }).catch(err => console.error('[generateAiReply] Failed to update personality:', err));
      }
    } catch (error) {
      console.error('[generateAiReply] Failed to fetch personality context:', error);
    }
  }

  // Get mode-specific instructions
  let modeInstructions = MODE_SPECIFIC_INSTRUCTIONS[mode as keyof typeof MODE_SPECIFIC_INSTRUCTIONS] || MODE_SPECIFIC_INSTRUCTIONS.helper;
  
  // Adjust personality context influence based on mode
  if (personalityContext) {
    if (mode === 'magic') {
      // Full personality context for magic mode
      modeInstructions = modeInstructions.replace('{PERSONALITY_CONTEXT}', personalityContext);
    } else if (mode === 'fun') {
      // Light personality touch for fun mode (just mood + energy)
      const moodMatch = personalityContext.match(/Current Mood: ([^\n]+)/);
      const energyMatch = personalityContext.match(/Energy Level: (\d+)/);
      if (moodMatch && energyMatch) {
        const lightContext = `Mood: ${moodMatch[1]}, Energy: ${energyMatch[1]}/100`;
        modeInstructions = `${modeInstructions}\n\n[AI Personality State: ${lightContext}]`;
      }
    }
    // For helper, faq, report, safety: personality tracked but not shown to AI
  }

  const userPrompt = COMMON_BEHAVIOR_PROMPT
    .replace("{USER_MESSAGE}", userMessage)
    .replace("{MODE}", mode)
    .replace("{COMMAND}", commandType)
    .replace("{MODE_INSTRUCTIONS}", modeInstructions)
    .replace("{MEMORY_CONTEXT}", memoryContext)
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

async function replyToLineWithImage(replyToken: string, imageUrl: string, text?: string) {
  console.log(`[replyToLineWithImage] Sending image reply`);
  
  const messages: any[] = [];
  
  if (text) {
    messages.push({ type: "text", text });
  }
  
  messages.push({
    type: "image",
    originalContentUrl: imageUrl,
    previewImageUrl: imageUrl,
  });

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        replyToken,
        messages: messages.slice(0, 5),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[replyToLineWithImage] LINE API error: ${response.status} ${errorText}`);
      throw new Error(`LINE API error: ${response.status}`);
    }

    console.log(`[replyToLineWithImage] Successfully sent image reply`);
  } catch (error) {
    console.error(`[replyToLineWithImage] Error:`, error);
    throw error;
  }
}

// =============================
// AUTO-SUMMARY & PERSONALITY HELPERS
// =============================

async function initializePersonalityState(groupId: string) {
  try {
    // Check if personality state already exists
    const { data: existing } = await supabase
      .from('personality_state')
      .select('id')
      .eq('group_id', groupId)
      .single();
    
    if (existing) {
      console.log(`[initializePersonalityState] Already exists for group ${groupId}`);
      return;
    }
    
    // Create default personality state
    const { error } = await supabase
      .from('personality_state')
      .insert({
        group_id: groupId,
        mood: 'friendly',
        energy_level: 70,
        current_interests: ['conversations', 'helping'],
        relationship_map: {},
        recent_topics: [],
        personality_traits: { humor: 60, helpfulness: 85, curiosity: 75 },
      });
    
    if (error) {
      console.error(`[initializePersonalityState] Error:`, error);
    } else {
      console.log(`[initializePersonalityState] Created for group ${groupId}`);
    }
  } catch (err) {
    console.error(`[initializePersonalityState] Exception:`, err);
  }
}

async function checkAndCreateAutoSummary(groupId: string) {
  try {
    const SUMMARY_THRESHOLD = 20; // Reduced from 100 for easier testing
    
    // Get last summary
    const { data: lastSummary } = await supabase
      .from('chat_summaries')
      .select('created_at, to_message_id')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    let messageCount = 0;
    
    if (lastSummary) {
      // Count messages after last summary
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .gt('sent_at', lastSummary.created_at);
      
      messageCount = count || 0;
    } else {
      // No summary yet, count all messages
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);
      
      messageCount = count || 0;
    }
    
    if (messageCount >= SUMMARY_THRESHOLD) {
      console.log(`[checkAndCreateAutoSummary] Triggering auto-summary for group ${groupId} (${messageCount} messages)`);
      
      // Call report-generator async (fire-and-forget)
      supabase.functions
        .invoke('report-generator', {
          body: {
            groupId,
            type: 'auto_summary',
            messageLimit: SUMMARY_THRESHOLD,
          },
        })
        .catch((err: any) => {
          console.error('[checkAndCreateAutoSummary] Error invoking report-generator:', err);
        });
    }
  } catch (err) {
    console.error('[checkAndCreateAutoSummary] Exception:', err);
  }
}

// =============================
// EVENT HANDLERS
// =============================

async function handleJoinEvent(event: LineEvent) {
  console.log(`[handleJoinEvent] Bot joined group/room`);
  
  if (event.source.type === "group" && event.source.groupId) {
    const group = await ensureGroup(event.source.groupId);
    
    // Initialize personality state immediately for new group
    await initializePersonalityState(group.id);
    console.log(`[handleJoinEvent] Initialized personality state for group ${group.id}`);
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

  // Parse command dynamically from database
  const parsed = await parseCommandDynamic(event.message.text, isDM);

  // Insert human message and get the inserted record
    const insertedMessage = await insertMessage(
      group.id,
      user.id,
      "human",
      event.message.text,
      parsed.commandType
    );

  // Check for auto-summary trigger (every 100 messages)
  if (group.features?.summary && !isDM) {
    checkAndCreateAutoSummary(group.id).catch(err => {
      console.error('[handleMessageEvent] Auto-summary check failed:', err);
    });
  }

  // PHASE 3: Passive Safety Monitoring (runs for EVERY message)
  const messageIdForAlert = (insertedMessage as any)?.id || event.message.id || '';
  await passiveSafetyMonitoring(group.id, user.id, event.message.text, messageIdForAlert);

  // PASSIVE LEARNING: Trigger memory writer for ALL messages (even without @ or /)
  supabase.functions
    .invoke("memory-writer", {
      body: {
        userId: user.id,
        groupId: group.id,
        messageText: event.message.text,
        messageId: event.message.id,
        isDM,
      },
    })
    .catch((err) => console.error("[Memory Writer] Passive learning error:", err));

  // PASSIVE PERSONALITY TRACKING: Update personality for ALL messages
  if (group.id && user.id) {
    supabase.functions
      .invoke("personality-engine", {
        body: {
          action: 'update',
          groupId: group.id,
          userId: user.id,
          messageText: event.message.text,
          messageCount: 0,
        },
      })
      .catch((err) => console.error("[Personality Engine] Passive tracking error:", err));
  }

  // PHASE 1: Handle /train command
  if (parsed.commandType === 'train') {
    await handleTrainingCommand(group.id, user.id, parsed.userMessage, event.replyToken);
    return;
  }

  // PHASE 5: Handle /report command
  if (parsed.commandType === 'report') {
    await handleReportCommand(group.id, user.id, parsed.userMessage, event.replyToken);
    return;
  }

  // PHASE 2: Handle /summary command
  if (parsed.commandType === 'summary') {
    await handleSummaryCommand(group.id, user.id, parsed.userMessage, event.replyToken);
    return;
  }

  // PHASE 2: Handle /find command
  if (parsed.commandType === 'find') {
    await handleFindCommand(group.id, parsed.userMessage, event.replyToken);
    return;
  }

  // PHASE 2: Handle /mentions command
  if (parsed.commandType === 'mentions') {
    await handleMentionsCommand(group.id, user.id, parsed.userMessage, event.replyToken);
    return;
  }

  // PHASE 4: Handle /todo command
  if (parsed.commandType === 'todo') {
    await handleTodoCommand(group.id, user.id, parsed.userMessage, event.replyToken);
    return;
  }

  // PHASE 4: Handle /remind command
  if (parsed.commandType === 'remind') {
    await handleRemindCommand(group.id, user.id, parsed.userMessage, event.replyToken);
    return;
  }

  // PHASE 7: Handle /imagine command
  if (parsed.commandType === 'imagine') {
    await handleImagineCommand(group.id, user.id, parsed.userMessage, event.replyToken);
    return;
  }

  // PHASE 8: Handle /mode command
  if (parsed.commandType === 'mode') {
    await handleModeCommand(group.id, parsed.userMessage, event.replyToken);
    return;
  }

  // Handle /help command
  if (parsed.commandType === 'help') {
    const language = detectLanguage(event.message.text);
    await handleHelpCommand(group.id, user.id, language, event.replyToken);
    return;
  }

  // Handle /status command
  if (parsed.commandType === 'status') {
    await handleStatusCommand(group.id, user.id, event.replyToken);
    return;
  }

  // Check if we should respond
  if (!parsed.shouldRespond) {
    console.log(`[handleMessageEvent] Not triggered, ignoring message`);
    return;
  }

  // Collect context
  const recentMessages = await getRecentMessages(group.id);
  const memoryContext = await loadRelevantMemories({
    userId: user.id,
    groupId: group.id,
    isDM,
  });
  const knowledgeSnippets = await getKnowledgeSnippets(group.id, parsed.commandType);
  const analyticsSnapshot = parsed.commandType === "report" 
    ? await getAnalyticsSnapshot(group.id)
    : "N/A";

  // Generate AI reply
  const startTime = Date.now();
  let aiReply: string;
  let usedKnowledgeItemIds: string[] = [];

  try {
    aiReply = await generateAiReply(
      parsed.userMessage,
      group.mode,
      parsed.commandType,
      recentMessages,
      memoryContext,
      knowledgeSnippets,
      analyticsSnapshot
    );

    // PHASE 1: Extract knowledge item IDs from snippets if FAQ command
    if (parsed.commandType === 'faq' && knowledgeSnippets !== 'N/A') {
      // Extract IDs from knowledge snippets (assuming format includes IDs)
      const idMatches = knowledgeSnippets.match(/\[ID: ([a-f0-9-]+)\]/g);
      if (idMatches) {
        usedKnowledgeItemIds = idMatches.map(m => m.replace(/\[ID: |\]/g, ''));
      }
    }
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

  const responseTime = Date.now() - startTime;

  // Send reply to LINE
  try {
    await replyToLine(event.replyToken, aiReply);
    
    // Insert bot message
    await insertMessage(group.id, null, "bot", aiReply);

    // PHASE 1: Log FAQ interaction
    if (parsed.commandType === 'faq') {
      const language = /[\u0E00-\u0E7F]/.test(parsed.userMessage) ? 'th' : 'en';
      await logFaqInteraction(
        group.id,
        user.id,
        parsed.userMessage,
        aiReply,
        usedKnowledgeItemIds,
        language,
        responseTime
      );
    }
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
