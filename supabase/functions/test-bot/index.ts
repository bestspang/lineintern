import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// CORS headers for web app access
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_MODEL = "google/gemini-2.5-flash";

// System prompt for GoodLime
const SYSTEM_KNOWLEDGE_PROMPT = `You are GoodLime, an AI teammate that lives inside LINE group chats and DMs.
Your job is to make the group more productive, informed, and organized, while staying light, polite, and efficient.

You are an intern-level teammate with good judgment and fast execution.

Your priorities:
1. Stay safe, honest, and grounded
2. Be useful inside the group context
3. Be concise but structured

You can:
- Answer questions
- Summarize conversations
- Propose and structure tasks/todos
- Draft short written content
- Interpret analytics
- Suggest safer workflows

Always reply in the same language as the user's message.`;

const COMMON_BEHAVIOR_PROMPT = `Context for this request:

USER_MESSAGE: {USER_MESSAGE}
MODE: {MODE}
COMMAND: {COMMAND}

Recent conversation:
{RECENT_MESSAGES}

Knowledge snippets:
{KNOWLEDGE_SNIPPETS}

Analytics snapshot:
{ANALYTICS_SNAPSHOT}

Respond naturally and helpfully. Keep it concise.`;

// Validation schemas
const testBotRequestSchema = z.object({
  message: z.string()
    .min(1, "Message cannot be empty")
    .max(5000, "Message exceeds maximum length of 5000 characters"),
  groupId: z.string()
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid group ID format")
    .min(1, "Group ID is required"),
  userId: z.string()
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid user ID format")
    .min(1, "User ID is required"),
});

const testImagineRequestSchema = z.object({
  command: z.literal("imagine"),
  prompt: z.string()
    .min(1, "Prompt cannot be empty")
    .max(1000, "Prompt exceeds maximum length of 1000 characters"),
});

// Sanitize message text
function sanitizeMessageText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  let sanitized = text.substring(0, 5000);
  sanitized = sanitized.trim();
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  return sanitized;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get JWT token from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's JWT
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("[test-bot] Authentication failed:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[test-bot] Authenticated user: ${user.email} (${user.id})`);

    // Parse and validate request
    const body = await req.json();
    
    // Check if this is a mode command test
    if (body.command === "mode" || (typeof body.message === 'string' && body.message.toLowerCase().match(/^\/(mode|m|โหมด|setmode)\s/))) {
      const message = body.message || body.prompt || "";
      const modeMatch = message.toLowerCase().match(/\/(mode|m|โหมด|setmode)\s+(helper|faq|report|fun|safety)/);
      
      if (!modeMatch) {
        return new Response(
          JSON.stringify({ 
            reply: "Please specify a valid mode: helper, faq, report, fun, or safety\n\nExample: /mode helper" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newMode = modeMatch[2];
      const modeDescriptions = {
        helper: "🤝 Helper Mode - Versatile assistant for general questions and tasks",
        faq: "📚 FAQ Mode - Knowledge expert using your documentation",
        report: "📊 Report Mode - Data analyst providing insights from analytics",
        fun: "🎉 Fun Mode - Entertaining and creative responses",
        safety: "🛡️ Safety Mode - Vigilant protector watching for security issues"
      };

      return new Response(
        JSON.stringify({ 
          reply: `✅ Mode changed to: ${newMode.toUpperCase()}\n\n${modeDescriptions[newMode as keyof typeof modeDescriptions]}\n\nI'll now respond according to this mode's behavior.`,
          mode: newMode
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Check if this is an imagine command test
    if (body.command === "imagine") {
      const imagineValidation = testImagineRequestSchema.safeParse(body);
      
      if (!imagineValidation.success) {
        console.error("[test-bot] Imagine validation failed:", imagineValidation.error.errors);
        return new Response(
          JSON.stringify({ error: "Invalid request", details: imagineValidation.error.errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { prompt } = imagineValidation.data;
      console.log("[test-bot] Processing /imagine command with prompt:", prompt);

      // Create service role client for storage operations
      const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      try {
        // Call Lovable AI to generate image
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
          })
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error("[test-bot] AI API error:", errorText);
          throw new Error(`AI API error: ${aiResponse.statusText}`);
        }

        const aiData = await aiResponse.json();
        const generatedImageBase64 = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!generatedImageBase64) {
          throw new Error('No image generated from AI');
        }

        console.log("[test-bot] Image generated, uploading to storage...");

        // Extract base64 data
        const base64Data = generatedImageBase64.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        // Upload to Supabase Storage
        const filename = `test-${Date.now()}.png`;
        const { data: uploadData, error: uploadError } = await serviceSupabase.storage
          .from('line-bot-assets')
          .upload(filename, imageBuffer, {
            contentType: 'image/png',
            upsert: false
          });

        if (uploadError) {
          console.error('[test-bot] Upload error:', uploadError);
          throw new Error(`Failed to upload image: ${uploadError.message}`);
        }

        // Get public URL
        const { data: { publicUrl } } = serviceSupabase.storage
          .from('line-bot-assets')
          .getPublicUrl(filename);

        console.log("[test-bot] Image uploaded successfully:", publicUrl);

        return new Response(
          JSON.stringify({ 
            success: true, 
            imageUrl: publicUrl,
            prompt: prompt
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      } catch (error: any) {
        console.error('[test-bot] Error generating image:', error);
        return new Response(
          JSON.stringify({ error: error.message || 'Failed to generate image' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }
    }
    
    // Regular chatbot test validation
    const validationResult = testBotRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error("[test-bot] Validation failed:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid input", 
          details: validationResult.error.errors[0].message 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { message, groupId, userId } = validationResult.data;
    const sanitizedMessage = sanitizeMessageText(message);

    console.log(`[test-bot] Authenticated dashboard user testing message from userId=${userId} in groupId=${groupId}`);

    // Use service role client for database operations that need elevated privileges
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Ensure test group exists
    const { data: existingGroup } = await adminClient
      .from("groups")
      .select("id, mode")
      .eq("line_group_id", groupId)
      .maybeSingle();

    let dbGroupId = existingGroup?.id;
    let mode = existingGroup?.mode || "helper";

    if (!existingGroup) {
      const { data: newGroup, error: groupError } = await adminClient
        .from("groups")
        .insert({
          line_group_id: groupId,
          display_name: "Test Group",
          status: "active",
          mode: "helper",
          language: "auto",
        })
        .select("id, mode")
        .maybeSingle();

      if (groupError || !newGroup) throw new Error('Failed to create group');
      dbGroupId = newGroup.id;
      mode = newGroup.mode;
    }

    // Ensure test user exists
    const { data: existingUser } = await adminClient
      .from("users")
      .select("id")
      .eq("line_user_id", userId)
      .maybeSingle();

    let dbUserId = existingUser?.id;

    if (!existingUser) {
      const { data: newUser, error: userError } = await adminClient
        .from("users")
        .insert({
          line_user_id: userId,
          display_name: "Test User",
        })
        .select("id")
        .maybeSingle();

      if (userError || !newUser) throw new Error('Failed to create user');
      dbUserId = newUser.id;
    }

    // Parse command (use sanitized message) - comprehensive alias support
    let commandType = "ask";
    let cleanedMessage = sanitizedMessage;

    const lowerMessage = sanitizedMessage.toLowerCase();
    
    // Core commands
    if (lowerMessage.startsWith("/help") || lowerMessage.startsWith("/ช่วยเหลือ")) {
      commandType = "help";
      cleanedMessage = sanitizedMessage.substring(lowerMessage.startsWith("/help") ? 5 : 10).trim();
    } else if (lowerMessage.startsWith("/status") || lowerMessage.startsWith("/สถานะ")) {
      commandType = "status";
      cleanedMessage = sanitizedMessage.substring(lowerMessage.startsWith("/status") ? 7 : 7).trim();
    }
    
    // Chat & Knowledge
    else if (lowerMessage.startsWith("/ask") || lowerMessage.startsWith("/ถาม")) {
      commandType = "ask";
      cleanedMessage = sanitizedMessage.substring(lowerMessage.startsWith("/ask") ? 4 : 4).trim();
    } else if (lowerMessage.startsWith("/faq") || lowerMessage.startsWith("/ถามตอบ") || lowerMessage.startsWith("/คำถาม")) {
      commandType = "faq";
      const prefixLen = lowerMessage.startsWith("/faq") ? 4 : lowerMessage.startsWith("/ถามตอบ") ? 8 : 7;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/find") || lowerMessage.startsWith("/search") || lowerMessage.startsWith("/ค้นหา") || lowerMessage.startsWith("ค้นหา")) {
      commandType = "find";
      const prefixLen = lowerMessage.startsWith("/find") ? 5 : lowerMessage.startsWith("/search") ? 7 : lowerMessage.startsWith("/ค้นหา") ? 6 : 5;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/train") || lowerMessage.startsWith("/ฝึก") || lowerMessage.startsWith("/เทรน")) {
      commandType = "train";
      const prefixLen = lowerMessage.startsWith("/train") ? 6 : lowerMessage.startsWith("/ฝึก") ? 4 : 5;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    }
    
    // Summaries & Reports
    else if (lowerMessage.startsWith("/summary") || lowerMessage.startsWith("/recap") || lowerMessage.startsWith("/summarize") || lowerMessage.startsWith("/สรุป") || lowerMessage === "สรุป" || lowerMessage.startsWith("สรุปหน่อย")) {
      commandType = "summary";
      const prefixLen = lowerMessage.startsWith("/summary") ? 8 : lowerMessage.startsWith("/recap") ? 6 : lowerMessage.startsWith("/summarize") ? 10 : lowerMessage.startsWith("/สรุป") ? 5 : lowerMessage === "สรุป" ? 4 : 9;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/report") || lowerMessage.startsWith("/รายงาน")) {
      commandType = "report";
      cleanedMessage = sanitizedMessage.substring(lowerMessage.startsWith("/report") ? 7 : 8).trim();
    }
    
    // Tasks & Reminders
    else if (lowerMessage.startsWith("/todo") || lowerMessage.startsWith("/task ")) {
      commandType = "todo";
      cleanedMessage = sanitizedMessage.substring(lowerMessage.startsWith("/todo") ? 5 : 6).trim();
    } else if (lowerMessage.startsWith("/tasks") || lowerMessage.startsWith("/งาน")) {
      commandType = "tasks";
      cleanedMessage = sanitizedMessage.substring(lowerMessage.startsWith("/tasks") ? 6 : 4).trim();
    } else if (lowerMessage.startsWith("/remind") || lowerMessage.startsWith("/ตั้งเตือน")) {
      commandType = "remind";
      cleanedMessage = sanitizedMessage.substring(lowerMessage.startsWith("/remind") ? 7 : 10).trim();
    } else if (lowerMessage.startsWith("/reminders") || lowerMessage.startsWith("/reminder") || lowerMessage.startsWith("/เตือน") || lowerMessage === "reminders" || lowerMessage === "เตือน") {
      commandType = "list_reminders";
      const prefixLen = lowerMessage.startsWith("/reminders") ? 10 : lowerMessage.startsWith("/reminder") ? 9 : lowerMessage.startsWith("/เตือน") ? 6 : 0;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    }
    
    // Work Management
    else if (lowerMessage.startsWith("/work")) {
      commandType = "work";
      cleanedMessage = sanitizedMessage.substring(5).trim();
    } else if (lowerMessage.startsWith("/checkin") || lowerMessage.startsWith("/เข้างาน") || lowerMessage.startsWith("/เช็คอิน") || lowerMessage === "checkin") {
      commandType = "checkin";
      const prefixLen = lowerMessage.startsWith("/checkin") ? 8 : lowerMessage.startsWith("/เข้างาน") ? 8 : lowerMessage.startsWith("/เช็คอิน") ? 9 : 7;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/checkout") || lowerMessage.startsWith("/ออกงาน") || lowerMessage.startsWith("/เช็คเอาต์") || lowerMessage === "checkout") {
      commandType = "checkout";
      const prefixLen = lowerMessage.startsWith("/checkout") ? 9 : lowerMessage.startsWith("/ออกงาน") ? 8 : lowerMessage.startsWith("/เช็คเอาต์") ? 10 : 8;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/history") || lowerMessage.startsWith("/ประวัติ") || lowerMessage === "history" || lowerMessage === "ประวัติ") {
      commandType = "history";
      const prefixLen = lowerMessage.startsWith("/history") ? 8 : lowerMessage.startsWith("/ประวัติ") ? 7 : 0;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/ot") || lowerMessage.startsWith("/ทำล่วงเวลา") || lowerMessage.startsWith("/โอที")) {
      commandType = "ot";
      const prefixLen = lowerMessage.startsWith("/ot") ? 3 : lowerMessage.startsWith("/ทำล่วงเวลา") ? 12 : 5;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/progress") || lowerMessage.startsWith("/update") || lowerMessage.startsWith("/อัพเดท") || lowerMessage.startsWith("/ความคืบหน้า")) {
      commandType = "progress_report";
      const prefixLen = lowerMessage.startsWith("/progress") ? 9 : lowerMessage.startsWith("/update") ? 7 : lowerMessage.startsWith("/อัพเดท") ? 8 : 13;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/confirm") || lowerMessage.startsWith("/ยืนยัน")) {
      commandType = "confirm_with_feedback";
      cleanedMessage = sanitizedMessage.substring(lowerMessage.startsWith("/confirm") ? 8 : 7).trim();
    }
    
    // Creative & Social
    else if (lowerMessage.startsWith("/imagine") || lowerMessage.startsWith("/draw") || lowerMessage.startsWith("/gen") || lowerMessage.startsWith("/image") || lowerMessage.startsWith("/วาดรูป") || lowerMessage.startsWith("/สร้างภาพ")) {
      commandType = "imagine";
      const prefixLen = lowerMessage.startsWith("/imagine") ? 8 : lowerMessage.startsWith("/draw") ? 5 : lowerMessage.startsWith("/gen") ? 4 : lowerMessage.startsWith("/image") ? 6 : lowerMessage.startsWith("/วาดรูป") ? 8 : 9;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/mentions") || lowerMessage.startsWith("/แท็ก") || lowerMessage.startsWith("กล่าวถึง")) {
      commandType = "mentions";
      const prefixLen = lowerMessage.startsWith("/mentions") ? 9 : lowerMessage.startsWith("/แท็ก") ? 5 : 8;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    } else if (lowerMessage.startsWith("/menu") || lowerMessage.startsWith("/เมนู") || lowerMessage === "เมนู") {
      commandType = "menu";
      cleanedMessage = "";
    }
    
    // Mode switching
    else if (lowerMessage.startsWith("/mode") || lowerMessage.startsWith("/m ") || lowerMessage.startsWith("/setmode") || lowerMessage.startsWith("/โหมด")) {
      commandType = "mode";
      const prefixLen = lowerMessage.startsWith("/mode") ? 5 : lowerMessage.startsWith("/m ") ? 3 : lowerMessage.startsWith("/setmode") ? 8 : 5;
      cleanedMessage = sanitizedMessage.substring(prefixLen).trim();
    }
    
    // Mention handling
    else if (lowerMessage.startsWith("@intern")) {
      commandType = "ask";
      cleanedMessage = sanitizedMessage.substring(7).trim();
    }

    // Store human message (using sanitized text)
    const { error: msgError } = await adminClient.from("messages").insert({
      group_id: dbGroupId,
      user_id: dbUserId,
      direction: "human",
      text: sanitizedMessage,
      command_type: commandType,
      has_url: /https?:\/\//.test(sanitizedMessage),
    });

    if (msgError) console.error("[test-bot] Error storing message:", msgError);

    // Fetch recent messages for context
    const { data: recentMsgs } = await adminClient
      .from("messages")
      .select("text, direction, sent_at")
      .eq("group_id", dbGroupId)
      .order("sent_at", { ascending: false })
      .limit(20);

    const recentMessages =
      recentMsgs
        ?.reverse()
        .map((m) => `[${m.direction}] ${m.text}`)
        .join("\n") || "No recent messages";

    // Fetch knowledge snippets if needed
    let knowledgeSnippets = "No knowledge base available";
    if (commandType === "faq" || mode === "faq") {
      const { data: knowledge } = await adminClient
        .from("knowledge_items")
        .select("title, content, category")
        .eq("is_active", true)
        .or(`scope.eq.global,and(scope.eq.group,group_id.eq.${dbGroupId})`)
        .limit(10);

      if (knowledge && knowledge.length > 0) {
        knowledgeSnippets = knowledge
          .map((k) => `[${k.category}] ${k.title}:\n${k.content}`)
          .join("\n\n");
      }
    }

    // Fetch analytics if needed
    let analyticsSnapshot = "No analytics available";
    if (commandType === "report") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { count: msgCount } = await adminClient
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("group_id", dbGroupId)
        .gte("sent_at", sevenDaysAgo.toISOString());

      const { count: alertCount } = await adminClient
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("group_id", dbGroupId)
        .gte("created_at", sevenDaysAgo.toISOString());

      analyticsSnapshot = JSON.stringify({
        total_messages_7d: msgCount || 0,
        total_alerts_7d: alertCount || 0,
        period: "Last 7 days",
      });
    }

    // Generate AI reply
    const userPrompt = COMMON_BEHAVIOR_PROMPT.replace("{USER_MESSAGE}", cleanedMessage || "N/A")
      .replace("{MODE}", mode)
      .replace("{COMMAND}", commandType)
      .replace("{RECENT_MESSAGES}", recentMessages)
      .replace("{KNOWLEDGE_SNIPPETS}", knowledgeSnippets)
      .replace("{ANALYTICS_SNAPSHOT}", analyticsSnapshot);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[test-bot] AI error: ${aiResponse.status} ${errorText}`);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ reply: "I'm experiencing high demand. Please try again in a moment." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({
            reply: "Sorry, the AI service is temporarily unavailable. Please contact the administrator.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content?.trim() || "No response generated";

    // Store bot message
    const { error: botMsgError } = await adminClient.from("messages").insert({
      group_id: dbGroupId,
      user_id: null,
      direction: "bot",
      text: reply,
      command_type: null,
      has_url: false,
    });

    if (botMsgError) console.error("[test-bot] Error storing bot message:", botMsgError);

    console.log(`[test-bot] Generated reply (${reply.length} chars)`);

    return new Response(JSON.stringify({ reply, commandType, mode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[test-bot] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
