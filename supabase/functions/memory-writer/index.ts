import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MEMORY_EXTRACTION_PROMPT = `You are a Memory Extraction Assistant. Your job is to analyze conversations and identify facts worth remembering about users and groups.

Guidelines:
1. Extract 0-5 memory items per conversation
2. Focus on:
   - User personality traits and communication style
   - User preferences (answer format, topics, tone)
   - Recurring topics and ongoing projects
   - Group atmosphere and dynamics
   - Relationships and roles in the group
   - Inside jokes or repeated references
3. Avoid:
   - Trivial one-time facts
   - Highly sensitive personal data (health, finances, passwords)
   - Temporary states or emotions
   - Overly specific details

For each memory, provide:
- scope: "user" or "group"
- category: "trait" | "preference" | "topic" | "project" | "context" | "relationship" | "meta"
- title: Short summary (10-120 chars)
- content: 1-3 sentences describing the memory (20-500 chars)
- importance_score: 0.0-1.0 (how important is this to remember?)

Return a JSON object with a "memories" array containing 0-5 memory objects.

Example output:
{
  "memories": [
    {
      "scope": "user",
      "category": "preference",
      "title": "Prefers concise bullet-point answers",
      "content": "User consistently asks for summaries and shorter responses. Appreciates bullet points over paragraphs.",
      "importance_score": 0.8
    },
    {
      "scope": "group",
      "category": "project",
      "title": "Planning team trip to Osaka",
      "content": "Group is actively planning a team trip to Osaka next month. Multiple discussions about dates, hotels, and activities.",
      "importance_score": 0.9
    }
  ]
}`;

interface ExtractedMemory {
  scope: 'user' | 'group';
  category: string;
  title: string;
  content: string;
  importance_score: number;
}

function containsSensitiveData(text: string): boolean {
  const patterns = [
    /password/i,
    /credit card/i,
    /ssn|social security/i,
    /bank account/i,
    /\b\d{16}\b/,
    /medical|diagnosis|prescription/i,
  ];
  return patterns.some((p) => p.test(text));
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

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

async function checkUserOptOut(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("memory_opt_out")
    .eq("id", userId)
    .single();

  return data?.memory_opt_out || false;
}

async function getExistingMemories(userId: string, groupId: string) {
  const { data } = await supabase
    .from("memory_items")
    .select("*")
    .or(`user_id.eq.${userId},group_id.eq.${groupId}`)
    .eq("is_deleted", false)
    .order("importance_score", { ascending: false })
    .limit(50);

  return data || [];
}

async function extractMemoriesWithAI(
  messageText: string,
  recentMessages: string,
  existingMemories: any[],
  isDM: boolean
): Promise<ExtractedMemory[]> {
  const existingMemoriesText = existingMemories
    .map((m) => `[${m.category}] ${m.title}: ${m.content}`)
    .join("\n");

  const contextPrompt = `
Recent conversation:
${recentMessages}

Existing memories:
${existingMemoriesText || "None yet"}

New message from user:
${messageText}

Context: This is ${isDM ? "a 1-1 DM" : "a group chat mention"}.

Extract 0-5 memories worth storing.
`;

  try {
    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: MEMORY_EXTRACTION_PROMPT },
            { role: "user", content: contextPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!response.ok) {
      console.error("[extractMemoriesWithAI] API error:", response.status);
      return [];
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return parsed.memories || [];
  } catch (error) {
    console.error("[extractMemoriesWithAI] Error:", error);
    return [];
  }
}

async function findSimilarMemory(
  memory: ExtractedMemory,
  userId: string,
  groupId: string
): Promise<any> {
  const existing = await getExistingMemories(userId, groupId);

  return existing.find(
    (e) =>
      e.scope === memory.scope &&
      e.category === memory.category &&
      levenshteinDistance(
        e.title.toLowerCase(),
        memory.title.toLowerCase()
      ) < 20
  );
}

async function upsertMemory(
  memory: ExtractedMemory,
  userId: string,
  groupId: string,
  sourceMessageId: string,
  sourceType: string
) {
  if (containsSensitiveData(memory.content)) {
    console.log("[upsertMemory] Rejected sensitive memory");
    return;
  }

  const similar = await findSimilarMemory(memory, userId, groupId);

  if (similar) {
    await supabase
      .from("memory_items")
      .update({
        content: memory.content,
        importance_score: memory.importance_score,
        source_message_ids: [...similar.source_message_ids, sourceMessageId],
        updated_at: new Date().toISOString(),
      })
      .eq("id", similar.id);

    console.log(`[upsertMemory] Updated existing memory: ${similar.id}`);
  } else {
    await supabase.from("memory_items").insert({
      scope: memory.scope,
      user_id: memory.scope === "user" ? userId : null,
      group_id: memory.scope === "group" ? groupId : null,
      category: memory.category,
      title: memory.title,
      content: memory.content,
      importance_score: memory.importance_score,
      source_type: sourceType,
      source_message_ids: [sourceMessageId],
    });

    console.log(`[upsertMemory] Created new memory: ${memory.title}`);
  }
}

async function enforceMemoryLimits(userId: string, groupId: string) {
  const { data: settings } = await supabase
    .from("memory_settings")
    .select("*")
    .eq("scope", "global")
    .single();

  if (!settings) return;

  const { data: userMemories } = await supabase
    .from("memory_items")
    .select("id")
    .eq("scope", "user")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .eq("pinned", false)
    .order("importance_score", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true });

  if (
    userMemories &&
    userMemories.length > settings.max_items_per_user
  ) {
    const toDelete = userMemories.slice(
      0,
      userMemories.length - settings.max_items_per_user
    );
    await supabase
      .from("memory_items")
      .update({ is_deleted: true })
      .in(
        "id",
        toDelete.map((m) => m.id)
      );
    console.log(`[enforceMemoryLimits] Deleted ${toDelete.length} user memories`);
  }

  const { data: groupMemories } = await supabase
    .from("memory_items")
    .select("id")
    .eq("scope", "group")
    .eq("group_id", groupId)
    .eq("is_deleted", false)
    .eq("pinned", false)
    .order("importance_score", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true });

  if (
    groupMemories &&
    groupMemories.length > settings.max_items_per_group
  ) {
    const toDelete = groupMemories.slice(
      0,
      groupMemories.length - settings.max_items_per_group
    );
    await supabase
      .from("memory_items")
      .update({ is_deleted: true })
      .in(
        "id",
        toDelete.map((m) => m.id)
      );
    console.log(`[enforceMemoryLimits] Deleted ${toDelete.length} group memories`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  try {
    const { userId, groupId, messageText, messageId, isDM, recentMessages } =
      await req.json();

    console.log(`[memory-writer] Processing for user=${userId}, group=${groupId}`);

    const memoryEnabled = await checkMemorySettings(userId, groupId);
    if (!memoryEnabled) {
      console.log("[memory-writer] Memory disabled");
      return new Response(
        JSON.stringify({ success: true, reason: "memory_disabled" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const userOptedOut = await checkUserOptOut(userId);
    if (userOptedOut) {
      console.log("[memory-writer] User opted out");
      return new Response(
        JSON.stringify({ success: true, reason: "user_opted_out" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const existingMemories = await getExistingMemories(userId, groupId);

    const extractedMemories = await extractMemoriesWithAI(
      messageText,
      recentMessages || "",
      existingMemories,
      isDM
    );

    console.log(`[memory-writer] Extracted ${extractedMemories.length} memories`);

    for (const memory of extractedMemories) {
      await upsertMemory(
        memory,
        userId,
        groupId,
        messageId,
        isDM ? "dm" : "mention"
      );
    }

    await enforceMemoryLimits(userId, groupId);

    return new Response(
      JSON.stringify({
        success: true,
        memories_processed: extractedMemories.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[memory-writer] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
