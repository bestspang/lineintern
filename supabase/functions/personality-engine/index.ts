import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PersonalityState {
  id?: string;
  group_id: string;
  mood: string;
  energy_level: number;
  current_interests: string[];
  relationship_map: Record<string, { familiarity: number; tone: string }>;
  recent_topics: string[];
  personality_traits: { humor: number; helpfulness: number; curiosity: number };
  last_mood_change: string;
}

const MOODS = ["happy", "curious", "thoughtful", "playful", "serious", "energetic", "calm", "reflective", "enthusiastic"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, groupId, userId, messageText, messageCount } = await req.json();

    // Get or create personality state
    let { data: state, error: fetchError } = await supabase
      .from("personality_state")
      .select("*")
      .eq("group_id", groupId)
      .single();

    if (fetchError || !state) {
      // Create initial personality state
      const { data: newState, error: createError } = await supabase
        .from("personality_state")
        .insert({
          group_id: groupId,
          mood: "friendly",
          energy_level: 70,
          current_interests: ["conversations", "helping"],
          relationship_map: {},
          recent_topics: [],
          personality_traits: { humor: 60, helpfulness: 85, curiosity: 75 },
        })
        .select()
        .single();

      if (createError) throw createError;
      state = newState;
    }

    switch (action) {
      case "get_context":
        return new Response(
          JSON.stringify({
            success: true,
            context: generatePersonalityContext(state, userId),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "update":
        const updatedState = await updatePersonalityState(
          supabase,
          state,
          messageText,
          messageCount || 0
        );
        
        if (userId) {
          updatedState.relationship_map = updateRelationship(
            updatedState.relationship_map,
            userId
          );
        }

        // Save mood history
        try {
          await supabase.from('mood_history').insert({
            group_id: groupId,
            mood: updatedState.mood,
            energy_level: updatedState.energy_level,
            recorded_at: new Date().toISOString(),
          });
        } catch (historyError) {
          console.error('[personality-engine] Failed to save mood history:', historyError);
        }

        const { error: updateError } = await supabase
          .from("personality_state")
          .update({
            mood: updatedState.mood,
            energy_level: updatedState.energy_level,
            current_interests: updatedState.current_interests,
            relationship_map: updatedState.relationship_map,
            recent_topics: updatedState.recent_topics,
            last_mood_change: updatedState.last_mood_change,
          })
          .eq("id", state.id);

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ success: true, state: updatedState }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "evolve":
        const evolvedTraits = evolvePersonality(state.personality_traits, messageCount || 0);
        
        const { error: evolveError } = await supabase
          .from("personality_state")
          .update({ personality_traits: evolvedTraits })
          .eq("id", state.id);

        if (evolveError) throw evolveError;

        return new Response(
          JSON.stringify({ success: true, traits: evolvedTraits }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      default:
        throw new Error("Invalid action");
    }
  } catch (error) {
    console.error("Personality engine error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generatePersonalityContext(state: PersonalityState, userId?: string): string {
  const relationship = userId ? state.relationship_map[userId] : null;
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  let context = `🧠 PERSONALITY STATE:
- Current Mood: ${state.mood} (${getMoodEmoji(state.mood)})
- Energy Level: ${state.energy_level}/100 ${"⚡".repeat(Math.floor(state.energy_level / 20))}
- Time Context: ${timeOfDay} - ${getTimeBasedMood(hour)}
- Current Interests: ${state.current_interests.slice(0, 3).join(", ")}
- Personality Traits: Humor ${state.personality_traits.humor}/100, Helpfulness ${state.personality_traits.helpfulness}/100, Curiosity ${state.personality_traits.curiosity}/100

`;

  if (relationship) {
    context += `👥 RELATIONSHIP WITH THIS USER:
- Familiarity: ${relationship.familiarity}/100
- Tone: ${relationship.tone}
- You should be ${getToneDescription(relationship.tone)} with them

`;
  }

  context += `💭 RECENT TOPICS: ${state.recent_topics.slice(0, 5).join(", ") || "None yet"}`;

  return context;
}

async function updatePersonalityState(
  supabase: any,
  state: PersonalityState,
  messageText: string,
  messageCount: number
): Promise<PersonalityState> {
  const updated = { ...state };

  // Analyze message sentiment
  const sentiment = analyzeSentiment(messageText);
  
  // Update mood based on sentiment
  if (sentiment > 0.3) {
    updated.mood = pickRandomMood(["happy", "playful", "enthusiastic", "energetic"]);
    updated.energy_level = Math.min(100, updated.energy_level + 5);
  } else if (sentiment < -0.3) {
    updated.mood = pickRandomMood(["thoughtful", "serious", "calm"]);
    updated.energy_level = Math.max(20, updated.energy_level - 3);
  } else if (messageText.includes("?")) {
    updated.mood = "curious";
  }

  // Update energy based on activity
  const timeSinceLastChange = new Date().getTime() - new Date(state.last_mood_change).getTime();
  const hoursSince = timeSinceLastChange / (1000 * 60 * 60);
  
  if (hoursSince > 12) {
    updated.energy_level = Math.max(30, updated.energy_level - 10);
  } else if (messageCount > 10) {
    updated.energy_level = Math.min(100, updated.energy_level + 10);
  }

  // Extract topics from message
  const topics = extractTopics(messageText);
  updated.recent_topics = [...new Set([...topics, ...state.recent_topics])].slice(0, 10);
  
  // Update interests based on topics
  if (topics.length > 0) {
    updated.current_interests = [...new Set([...topics.slice(0, 2), ...state.current_interests])].slice(0, 5);
  }

  updated.last_mood_change = new Date().toISOString();

  return updated;
}

function updateRelationship(
  relationshipMap: Record<string, { familiarity: number; tone: string }>,
  userId: string
): Record<string, { familiarity: number; tone: string }> {
  const current = relationshipMap[userId] || { familiarity: 0, tone: "friendly" };
  
  // Increase familiarity with each interaction
  const newFamiliarity = Math.min(100, current.familiarity + 2);
  
  // Adjust tone based on familiarity
  let tone = "friendly";
  if (newFamiliarity > 80) tone = "warm";
  else if (newFamiliarity > 50) tone = "casual";
  else if (newFamiliarity < 20) tone = "polite";

  return {
    ...relationshipMap,
    [userId]: { familiarity: newFamiliarity, tone },
  };
}

function evolvePersonality(
  traits: { humor: number; helpfulness: number; curiosity: number },
  messageCount: number
): { humor: number; helpfulness: number; curiosity: number } {
  // Slightly evolve traits over time
  const evolution = messageCount > 20 ? 1 : 0;
  
  return {
    humor: Math.max(0, Math.min(100, traits.humor + (Math.random() > 0.5 ? evolution : -evolution))),
    helpfulness: Math.max(0, Math.min(100, traits.helpfulness + (Math.random() > 0.7 ? evolution : 0))),
    curiosity: Math.max(0, Math.min(100, traits.curiosity + (Math.random() > 0.6 ? evolution : -evolution))),
  };
}

function analyzeSentiment(text: string): number {
  const positiveWords = ["good", "great", "awesome", "happy", "love", "wonderful", "ดี", "เยี่ยม", "สุดยอด", "รัก"];
  const negativeWords = ["bad", "sad", "terrible", "hate", "awful", "แย่", "เศร้า", "เกลียด"];
  
  let score = 0;
  const lowerText = text.toLowerCase();
  
  positiveWords.forEach(word => {
    if (lowerText.includes(word)) score += 0.2;
  });
  
  negativeWords.forEach(word => {
    if (lowerText.includes(word)) score -= 0.2;
  });
  
  return Math.max(-1, Math.min(1, score));
}

function extractTopics(text: string): string[] {
  // Simple keyword extraction
  const keywords = text.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 4)
    .slice(0, 3);
  
  return keywords;
}

function getMoodEmoji(mood: string): string {
  const emojiMap: Record<string, string> = {
    happy: "😊",
    curious: "🤔",
    thoughtful: "💭",
    playful: "😄",
    serious: "🧐",
    energetic: "⚡",
    calm: "😌",
    reflective: "🌙",
    enthusiastic: "🎉",
  };
  return emojiMap[mood] || "😊";
}

function getTimeBasedMood(hour: number): string {
  if (hour < 6) return "quiet and reflective";
  if (hour < 12) return "fresh and energetic";
  if (hour < 18) return "focused and engaged";
  return "calm and thoughtful";
}

function getToneDescription(tone: string): string {
  const descriptions: Record<string, string> = {
    warm: "warm and familiar, like talking to an old friend",
    casual: "casual and friendly",
    friendly: "friendly and helpful",
    polite: "polite and welcoming",
  };
  return descriptions[tone] || "friendly";
}

function pickRandomMood(moods: string[]): string {
  return moods[Math.floor(Math.random() * moods.length)];
}
