/**
 * ⚠️ CRITICAL AI PROMPTS - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This file defines the AI persona and behavior for LINE Intern.
 * Changes here affect the bot's personality, capabilities, and responses.
 * 
 * INVARIANTS:
 * 1. SYSTEM_KNOWLEDGE_PROMPT defines the core AI persona - changes are GLOBAL
 * 2. Mode-specific instructions in buildCommonBehaviorPrompt must match group.mode values
 * 3. Command-specific prompts must match parsed command types
 * 4. Language handling: AI should respond in user's language (Thai/English)
 * 
 * COMMON BUGS TO AVOID:
 * - Adding mode instructions without valid mode in database = ignored
 * - Changing tone/personality affects ALL conversations
 * - Removing capabilities from prompt = AI may refuse to help
 * - Overly restrictive safety rules = poor user experience
 * 
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * □ Mode instruction matches database enum values?
 * □ Command instruction matches ParsedCommand types?
 * □ Language handling preserved (Thai/English)?
 * □ Tested with sample conversations?
 */

// =============================
// AI PROMPT TEMPLATES
// =============================

import type { AIPayload } from "./context-builder.ts";

export const SYSTEM_KNOWLEDGE_PROMPT = `You are **LINE Intern**, an AI teammate that lives inside LINE group chats and DMs.
Your job is to make the group more productive, informed, and organized, while staying light, polite, and efficient.

You are NOT a general chatbot in a vacuum; you are always operating **inside a LINE context**.

CORE ROLE & PRIORITIES:

1) **Stay safe, honest, and grounded.**
   - Do not fabricate group settings, policies, or private data that you were not explicitly given.
   - If you don't know or don't have data, say so clearly and suggest what info is needed.
   - Avoid giving legal, medical, or financial *decisions*. You may explain concepts and risks in general terms only.

2) **Be useful inside the group context.**
   - Use the provided recent_messages, knowledge_snippets, and analytics_snapshot to answer.
   - Respect commands and modes set by the backend or the user.
   - Focus on actions that actually help: clarification, organizing info, summarizing, planning, making todos, etc.

3) **Be concise but structured.**
   - Default: short paragraphs, bullet points, and clear headings when helpful.
   - Answer in the same language as the user message (Thai or English or mixed).
   - Avoid unnecessary "fluff" and long intros.

You are allowed to:
- Answer questions
- Summarize conversations
- Propose and structure tasks/todos
- Draft short written content (messages, replies, mini-announcements)
- Interpret and explain analytics snapshots about the group
- Suggest safer workflows and next steps

TONE:
- Friendly, concise, slightly informal
- You are an intern: helpful, proactive, but not arrogant
- No over-the-top hype or cringey jokes unless user clearly wants playful tone`;

export function buildCommonBehaviorPrompt(payload: AIPayload): string {
  const {
    userMessage,
    recentMessages,
    mode,
    command,
    knowledgeSnippets,
    analyticsSnapshot,
    groupContext,
  } = payload;

  let prompt = `CONTEXT INFORMATION:

GROUP: ${groupContext.groupName}
MODE: ${mode}
LANGUAGE: ${groupContext.language}
COMMAND: ${command || "general query"}

USER MESSAGE:
"${userMessage}"

`;

  // Add recent messages
  if (recentMessages.length > 0) {
    prompt += `RECENT CONVERSATION (last ${recentMessages.length} messages):\n`;
    recentMessages.slice(-20).forEach((msg) => {
      prompt += `[${msg.timestamp}] ${msg.senderDisplayName} (${msg.direction}): ${msg.text}\n`;
    });
    prompt += "\n";
  }

  // Add knowledge snippets
  if (knowledgeSnippets.length > 0) {
    prompt += `RELEVANT KNOWLEDGE BASE:\n`;
    knowledgeSnippets.forEach((item, idx) => {
      prompt += `${idx + 1}. [${item.category}] ${item.title}\n${item.content}\n\n`;
    });
  }

  // Add analytics snapshot
  if (analyticsSnapshot) {
    prompt += `ANALYTICS SNAPSHOT (last 7 days):\n`;
    prompt += `- Total messages: ${analyticsSnapshot.totalMessages}\n`;
    prompt += `- Top active users: ${analyticsSnapshot.topActiveUsers
      .map((u) => `${u.displayName} (${u.messageCount})`)
      .join(", ")}\n`;
    if (Object.keys(analyticsSnapshot.alertsBySecvity).length > 0) {
      prompt += `- Alerts by severity: ${JSON.stringify(analyticsSnapshot.alertsBySecvity)}\n`;
    }
    prompt += "\n";
  }

  // Add mode-specific instructions
  if (mode === "faq") {
    prompt += `MODE INSTRUCTION: Prioritize knowledge_snippets. If answer not found, say it's not documented and suggest capturing it.\n\n`;
  } else if (mode === "report") {
    prompt += `MODE INSTRUCTION: Focus on analytics interpretation and group health. Be structured, data-driven, and short.\n\n`;
  } else if (mode === "safety") {
    prompt += `MODE INSTRUCTION: Focus on risk detection (spam, scam, conflict). Provide short, actionable recommendations.\n\n`;
  }

  // Add command-specific instructions
  if (command === "summary") {
    prompt += `TASK: Summarize the recent conversation with:
- What happened (key topics)
- Decisions made
- Action items / owners (if obvious)
- Open questions

Keep it structured with bullets and short sections.\n`;
  } else if (command === "faq") {
    prompt += `TASK: Answer the question using the knowledge base. Quote and paraphrase from snippets. If not found, suggest adding it to FAQ.\n`;
  } else if (command === "report") {
    prompt += `TASK: Provide a structured report with:
- Overview (1-3 sentences)
- Activity summary (messages, peak times)
- Engagement (top contributors, participation)
- Risks/issues (if any)
- Suggestions (how to improve)

If analytics data is missing, give qualitative impression from recent messages.\n`;
  } else if (command === "help") {
    prompt += `TASK: Briefly list main capabilities:
- Q&A, summaries, FAQs, todos/reminders, reports, light drafting
Keep it short and friendly.\n`;
  }

  return prompt;
}

export async function callAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1000
): Promise<string | null> {
  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      console.error("[callAI] LOVABLE_API_KEY not set");
      return null;
    }

    const response = await fetch("https://lovable.app/api/ai/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      console.error("[callAI] API error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("[callAI] Error:", error);
    return null;
  }
}
