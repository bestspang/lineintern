import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RelationshipInference {
  relationship_type: string;
  confidence: number;
  evidence: string[];
  user_a_role?: string;
  user_b_role?: string;
  formality: number;
  power_dynamic?: string;
}

interface ProfileInference {
  age_indicators?: string[];
  occupation_indicators?: string[];
  personality_traits: Record<string, number>;
  preferences: Record<string, string[]>;
  behavioral_patterns: Record<string, any>;
  confidence_scores: Record<string, number>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, groupId, userId, messageData, conversationContext } = await req.json();

    console.log("[cognitive-processor] Processing action:", action);

    let result;

    switch (action) {
      case "analyze_interaction":
        result = await analyzeInteraction(supabase, groupId, messageData, conversationContext);
        break;
      
      case "infer_relationships":
        result = await inferRelationships(supabase, groupId, conversationContext);
        break;
      
      case "update_profiles":
        result = await updateUserProfiles(supabase, groupId, userId, messageData);
        break;
      
      case "get_social_context":
        result = await getSocialContext(supabase, groupId, userId);
        break;
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[cognitive-processor] Error:", error);
    console.error("[cognitive-processor] Error type:", error?.constructor?.name);
    console.error("[cognitive-processor] Error message:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error("[cognitive-processor] Stack trace:", error.stack);
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function analyzeInteraction(
  supabase: any,
  groupId: string,
  messageData: any,
  conversationContext: any[]
) {
  console.log("[cognitive-processor] Analyzing interaction for group:", groupId);
  console.log("[cognitive-processor] Context messages:", conversationContext.length);
  console.log("[cognitive-processor] Message data:", messageData ? "present" : "missing");

  // Get recent messages for context
  const recentMessages = conversationContext.slice(-10);
  
  // Identify users involved in the conversation
  const involvedUsers = new Set(recentMessages.map(m => m.user_id).filter(Boolean));
  
  console.log(`[cognitive-processor] Recent messages: ${recentMessages.length}, Involved users: ${involvedUsers.size}`);
  
  // If we have at least 2 users, analyze relationships
  if (involvedUsers.size >= 2) {
    const users = Array.from(involvedUsers);
    console.log(`[cognitive-processor] Analyzing ${users.length} users for relationships...`);
    
    // Analyze each pair of users
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const userA = users[i];
        const userB = users[j];
        
        // Get interactions between these two users
        const theirMessages = recentMessages.filter(
          m => (m.user_id === userA || m.user_id === userB)
        );
        
        if (theirMessages.length >= 2) {
          console.log(`[cognitive-processor] Found ${theirMessages.length} messages between user ${userA} and ${userB}, analyzing...`);
          await analyzeRelationship(supabase, groupId, userA, userB, theirMessages);
        } else {
          console.log(`[cognitive-processor] Not enough messages (${theirMessages.length}) between users ${userA} and ${userB}`);
        }
      }
    }
  }

  // Update individual profiles
  if (messageData.user_id) {
    console.log(`[cognitive-processor] Updating profile for user ${messageData.user_id}...`);
    await updateProfileFromMessage(supabase, groupId, messageData.user_id, messageData, recentMessages);
    console.log(`[cognitive-processor] ✓ Profile updated for user ${messageData.user_id}`);
  } else {
    console.log(`[cognitive-processor] No user_id in messageData, skipping profile update`);
  }

  return { success: true, analyzed: true };
}

async function analyzeRelationship(
  supabase: any,
  groupId: string,
  userAId: string,
  userBId: string,
  messages: any[]
) {
  console.log(`[cognitive-processor] ===== Analyzing relationship =====`);
  console.log(`[cognitive-processor] Group ID: ${groupId}`);
  console.log(`[cognitive-processor] User A ID: ${userAId}`);
  console.log(`[cognitive-processor] User B ID: ${userBId}`);
  console.log(`[cognitive-processor] Messages: ${messages.length}`);

  // Get user display names
  const { data: users } = await supabase
    .from("users")
    .select("id, display_name")
    .in("id", [userAId, userBId]);

  console.log(`[cognitive-processor] Fetched ${users?.length || 0} user records`);
  
  const userAName = users?.find((u: any) => u.id === userAId)?.display_name || "User A";
  const userBName = users?.find((u: any) => u.id === userBId)?.display_name || "User B";
  
  console.log(`[cognitive-processor] User A: ${userAName}, User B: ${userBName}`);

  // Build conversation context
  const conversationText = messages
    .map(m => `${m.user_id === userAId ? userAName : userBName}: ${m.text}`)
    .join("\n");

  // Call AI to infer relationship
  console.log(`[cognitive-processor] Calling AI to infer relationship...`);
  const inference = await inferRelationshipWithAI(conversationText, userAName, userBName);
  console.log(`[cognitive-processor] AI inference result:`, inference);

  // Get or create relationship record
  const { data: existingRel } = await supabase
    .from("user_relationships")
    .select("*")
    .eq("group_id", groupId)
    .eq("user_a_id", userAId)
    .eq("user_b_id", userBId)
    .single();

  const interactionCount = (existingRel?.interaction_count || 0) + messages.length;
  
  // Calculate updated confidence (weighted average)
  const newConfidence = existingRel 
    ? (existingRel.confidence_score * 0.7 + inference.confidence * 0.3)
    : inference.confidence;

  const relationshipData: any = {
    group_id: groupId,
    user_a_id: userAId,
    user_b_id: userBId,
    relationship_type: inference.relationship_type,
    confidence_score: Math.min(1, newConfidence),
    interaction_count: interactionCount,
    last_interaction_at: new Date().toISOString(),
    communication_style: {
      formality: inference.formality,
      power_dynamic: inference.power_dynamic,
    },
    inferred_data: {
      evidence: inference.evidence,
      user_a_role: inference.user_a_role,
      user_b_role: inference.user_b_role,
      last_analysis: new Date().toISOString(),
    },
  };

  if (existingRel) {
    console.log(`[cognitive-processor] Updating existing relationship: ${existingRel.id}`);
    await supabase
      .from("user_relationships")
      .update(relationshipData)
      .eq("id", existingRel.id);
  } else {
    console.log(`[cognitive-processor] Creating new relationship record`);
    relationshipData.first_interaction_at = new Date().toISOString();
    const { data: newRel, error: insertError } = await supabase
      .from("user_relationships")
      .insert(relationshipData)
      .select()
      .single();
    
    if (insertError) {
      console.error(`[cognitive-processor] Error inserting relationship:`, insertError);
      throw insertError;
    }
    console.log(`[cognitive-processor] ✓ Created relationship: ${newRel.id}`);
  }

  console.log(`[cognitive-processor] ✓ Relationship updated: ${inference.relationship_type} (confidence: ${newConfidence.toFixed(2)})`);
}

async function inferRelationshipWithAI(
  conversationText: string,
  userAName: string,
  userBName: string
): Promise<RelationshipInference> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.warn("[cognitive-processor] No LOVABLE_API_KEY, using heuristics");
    return inferRelationshipHeuristic(conversationText, userAName, userBName);
  }

  const prompt = `Analyze this conversation and infer the relationship between ${userAName} and ${userBName}:

${conversationText}

Extract:
1. Relationship type (boss-employee, friends, romantic, family, colleagues, customer-service, teacher-student, or unknown)
2. Evidence for this relationship (specific patterns or phrases)
3. Formality level (0-1, where 0 is very casual and 1 is very formal)
4. Power dynamic (who appears to have authority, if any)
5. Roles of each person

Consider Thai cultural context:
- "พี่" (phi) indicates seniority or respect
- "ค่ะ/ครับ" (ka/krap) indicates politeness
- Direct commands may indicate authority
- Question about food, tasks may indicate specific relationships

Return ONLY valid JSON:
{
  "relationship_type": "boss-employee",
  "confidence": 0.8,
  "evidence": ["uses respectful language", "gives tasks"],
  "user_a_role": "senior",
  "user_b_role": "junior",
  "formality": 0.7,
  "power_dynamic": "user_a_leads"
}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a social relationship analyzer. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    
    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || content.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    
    const result = JSON.parse(jsonStr);
    
    return {
      relationship_type: result.relationship_type || "unknown",
      confidence: result.confidence || 0.5,
      evidence: result.evidence || [],
      user_a_role: result.user_a_role,
      user_b_role: result.user_b_role,
      formality: result.formality || 0.5,
      power_dynamic: result.power_dynamic,
    };
  } catch (error) {
    console.error("[cognitive-processor] AI inference failed:", error);
    return inferRelationshipHeuristic(conversationText, userAName, userBName);
  }
}

function inferRelationshipHeuristic(
  conversationText: string,
  userAName: string,
  userBName: string
): RelationshipInference {
  const text = conversationText.toLowerCase();
  const evidence: string[] = [];
  let relationshipType = "unknown";
  let formality = 0.5;
  let confidence = 0.4;

  // Check for Thai politeness markers
  if (text.includes("ค่ะ") || text.includes("ครับ")) {
    evidence.push("uses polite language");
    formality += 0.2;
  }

  // Check for seniority markers
  if (text.includes("พี่")) {
    evidence.push("uses seniority terms");
    formality += 0.1;
    relationshipType = "colleagues";
    confidence = 0.6;
  }

  // Check for task/command patterns
  if (text.match(/ให้.*ท[ำำ]|ช่วย.*หน่อย|ได้.*ไหม/)) {
    evidence.push("task assignment patterns");
    relationshipType = "boss-employee";
    confidence = 0.7;
  }

  // Check for friendly patterns
  if (text.match(/😊|😄|555|ฮ่าๆ/)) {
    evidence.push("casual friendly expressions");
    formality = Math.max(0, formality - 0.2);
    if (relationshipType === "unknown") {
      relationshipType = "friends";
      confidence = 0.5;
    }
  }

  return {
    relationship_type: relationshipType,
    confidence: Math.min(1, confidence),
    evidence,
    formality: Math.min(1, Math.max(0, formality)),
  };
}

async function updateProfileFromMessage(
  supabase: any,
  groupId: string,
  userId: string,
  messageData: any,
  recentMessages: any[]
) {
  console.log(`[cognitive-processor] ===== Updating profile =====`);
  console.log(`[cognitive-processor] User ID: ${userId}, Group ID: ${groupId}`);

  // Get or create profile
  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();

  const userMessages = recentMessages.filter(m => m.user_id === userId);
  
  // Analyze personality traits from messages
  const traits = analyzePersonalityTraits(userMessages);
  const preferences = extractPreferences(messageData.text);
  const patterns = analyzeBehavioralPatterns(userMessages);

  const profileData = {
    group_id: groupId,
    user_id: userId,
    personality_traits: existingProfile
      ? mergeTraits(existingProfile.personality_traits, traits)
      : traits,
    preferences: existingProfile
      ? mergePreferences(existingProfile.preferences, preferences)
      : preferences,
    behavioral_patterns: existingProfile
      ? mergePatterns(existingProfile.behavioral_patterns, patterns)
      : patterns,
    observation_count: (existingProfile?.observation_count || 0) + 1,
    last_updated_at: new Date().toISOString(),
  };

  if (existingProfile) {
    console.log(`[cognitive-processor] Updating existing profile: ${existingProfile.id}`);
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update(profileData)
      .eq("id", existingProfile.id);
    
    if (updateError) {
      console.error(`[cognitive-processor] Error updating profile:`, updateError);
      throw updateError;
    }
    console.log(`[cognitive-processor] ✓ Profile updated`);
  } else {
    console.log(`[cognitive-processor] Creating new profile`);
    const { data: newProfile, error: insertError } = await supabase
      .from("user_profiles")
      .insert(profileData)
      .select()
      .single();
    
    if (insertError) {
      console.error(`[cognitive-processor] Error inserting profile:`, insertError);
      throw insertError;
    }
    console.log(`[cognitive-processor] ✓ Created profile: ${newProfile.id}`);
  }
}

function analyzePersonalityTraits(messages: any[]): Record<string, number> {
  const traits: Record<string, number> = {
    humor: 0.5,
    formality: 0.5,
    responsiveness: 0.5,
    initiative: 0.5,
    helpfulness: 0.5,
  };

  const allText = messages.map(m => m.text).join(" ").toLowerCase();

  // Humor indicators
  if (allText.match(/😂|😄|555|ฮ่า|ตลก/)) {
    traits.humor = 0.7;
  }

  // Formality indicators
  const politeMarkers = (allText.match(/ค่ะ|ครับ|พี่|คุณ/g) || []).length;
  const casualMarkers = (allText.match(/เว้ย|ว่ะ|อะ|จ้า/g) || []).length;
  if (politeMarkers > casualMarkers * 2) {
    traits.formality = 0.8;
  } else if (casualMarkers > politeMarkers) {
    traits.formality = 0.3;
  }

  // Initiative indicators (asking questions, suggesting)
  if (allText.match(/[?？]|ไหม|เหรอ|มั้ย|เสนอ|ว่า.*ไหม/)) {
    traits.initiative = 0.7;
  }

  // Helpfulness indicators
  if (allText.match(/ช่วย|ให้|อะไร.*ให้|ช่วยเหลือ/)) {
    traits.helpfulness = 0.7;
  }

  return traits;
}

function extractPreferences(text: string): Record<string, string[]> {
  const preferences: Record<string, string[]> = {};
  const lowerText = text.toLowerCase();

  // Food preferences
  const foodKeywords = ["ชอบ", "กิน", "อร่อย", "เมนู", "ทาน"];
  if (foodKeywords.some(k => lowerText.includes(k))) {
    preferences.food = preferences.food || [];
    if (lowerText.includes("เผ็ด")) preferences.food.push("spicy");
    if (lowerText.includes("หวาน")) preferences.food.push("sweet");
    if (lowerText.includes("กาแฟ")) preferences.food.push("coffee");
  }

  return preferences;
}

function analyzeBehavioralPatterns(messages: any[]): Record<string, any> {
  const patterns: Record<string, any> = {};

  if (messages.length > 0) {
    const avgLength = messages.reduce((sum, m) => sum + m.text.length, 0) / messages.length;
    patterns.message_length_avg = Math.round(avgLength);
    
    const hasQuestions = messages.some(m => m.text.includes("?") || m.text.includes("ไหม"));
    patterns.topic_initiator = hasQuestions;
  }

  return patterns;
}

function mergeTraits(existing: any, newTraits: Record<string, number>): Record<string, number> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(newTraits)) {
    merged[key] = existing[key] ? (existing[key] * 0.8 + value * 0.2) : value;
  }
  return merged;
}

function mergePreferences(existing: any, newPrefs: Record<string, string[]>): Record<string, string[]> {
  const merged = { ...existing };
  for (const [key, values] of Object.entries(newPrefs)) {
    merged[key] = [...new Set([...(merged[key] || []), ...values])];
  }
  return merged;
}

function mergePatterns(existing: any, newPatterns: Record<string, any>): Record<string, any> {
  return { ...existing, ...newPatterns };
}

async function inferRelationships(supabase: any, groupId: string, conversationContext: any[]) {
  // This is called by memory consolidation or scheduled tasks
  return await analyzeInteraction(supabase, groupId, {}, conversationContext);
}

async function updateUserProfiles(supabase: any, groupId: string, userId: string, messageData: any) {
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("*")
    .eq("group_id", groupId)
    .order("sent_at", { ascending: false })
    .limit(20);

  await updateProfileFromMessage(supabase, groupId, userId, messageData, recentMessages || []);
  
  return { success: true };
}

async function getSocialContext(supabase: any, groupId: string, userId?: string) {
  console.log(`[cognitive-processor] Getting social context for group ${groupId}`);

  // Get user profile if userId provided
  let userProfile = null;
  if (userId) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .single();
    userProfile = profile;
  }

  // Get relationships involving this user
  const { data: relationships } = await supabase
    .from("user_relationships")
    .select(`
      *,
      user_a:users!user_relationships_user_a_id_fkey(id, display_name),
      user_b:users!user_relationships_user_b_id_fkey(id, display_name)
    `)
    .eq("group_id", groupId)
    .or(userId ? `user_a_id.eq.${userId},user_b_id.eq.${userId}` : "")
    .order("confidence_score", { ascending: false })
    .limit(10);

  return {
    userProfile,
    relationships: relationships || [],
    contextText: buildContextText(userProfile, relationships || []),
  };
}

function buildContextText(userProfile: any, relationships: any[]): string {
  let context = "";

  if (userProfile) {
    context += "User Profile:\n";
    if (userProfile.personality_traits) {
      const traits = Object.entries(userProfile.personality_traits)
        .map(([k, v]) => `${k}: ${((v as number) * 100).toFixed(0)}%`)
        .join(", ");
      context += `- Personality: ${traits}\n`;
    }
    if (userProfile.preferences && Object.keys(userProfile.preferences).length > 0) {
      context += `- Preferences: ${JSON.stringify(userProfile.preferences)}\n`;
    }
  }

  if (relationships.length > 0) {
    context += "\nRelationships:\n";
    for (const rel of relationships) {
      const userA = rel.user_a?.display_name || "Unknown";
      const userB = rel.user_b?.display_name || "Unknown";
      context += `- ${userA} ↔ ${userB}: ${rel.relationship_type} (confidence: ${(rel.confidence_score * 100).toFixed(0)}%)\n`;
      if (rel.inferred_data?.evidence) {
        context += `  Evidence: ${rel.inferred_data.evidence.slice(0, 2).join(", ")}\n`;
      }
    }
  }

  return context || "No social context available yet.";
}