import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Valid categories for memory extraction
const VALID_CATEGORIES = [
  'trait', 'preference', 'topic', 'project', 'context', 'relationship', 'meta',
  'name', 'birthday', 'hobby', 'habit', 'life_event', 'food_preference', 'work_info', 'skill',
  'decision', 'policy', 'task', 'metric', 'fact', 'general'
];

function validateCategory(category: string): string {
  if (!category) return 'general';
  const normalized = category.toLowerCase().trim();
  if (VALID_CATEGORIES.includes(normalized)) return normalized;
  
  const categoryMap: Record<string, string> = {
    'information': 'fact', 'data': 'fact', 'note': 'fact',
    'personal': 'trait', 'person': 'trait', 'work': 'work_info',
    'food': 'food_preference', 'event': 'life_event',
    'rule': 'policy', 'action': 'task', 'todo': 'task',
  };
  
  return categoryMap[normalized] || 'general';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Phase 0A guard: admin/owner only — backfill writes memory items.
    try {
      await requireRole(
        req,
        ['admin', 'owner'],
        { functionName: 'memory-backfill' },
      );
    } catch (e) {
      const r = authzErrorResponse(e, corsHeaders);
      if (r) return r;
      throw e;
    }

    const body = await req.json().catch(() => ({}));
    const { days_back = 7, limit = 200, group_id } = body;

    console.log(`\n========== MEMORY BACKFILL START ==========`);
    console.log(`[Memory Backfill] Processing ${days_back} days of messages, limit=${limit}`);
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the target group - either specified or default to most active group
    let targetGroupId = group_id;
    
    if (!targetGroupId) {
      // Find the most active group
      const { data: groups } = await supabase
        .from('groups')
        .select('id, display_name, line_group_id')
        .eq('status', 'active')
        .order('last_activity_at', { ascending: false })
        .limit(1);
      
      if (groups && groups.length > 0) {
        targetGroupId = groups[0].id;
        console.log(`[Memory Backfill] Using most active group: ${groups[0].display_name} (${targetGroupId})`);
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'No active groups found' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get messages from the specified time range
    const startDate = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select(`
        id,
        text,
        sent_at,
        direction,
        user_id,
        group_id,
        users (
          id,
          display_name,
          line_user_id
        )
      `)
      .eq('group_id', targetGroupId)
      .eq('direction', 'human') // human = incoming messages from users
      .gte('sent_at', startDate)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (messagesError) {
      console.error('[Memory Backfill] Error fetching messages:', messagesError);
      throw messagesError;
    }

    console.log(`[Memory Backfill] Found ${messages?.length || 0} messages to process`);

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No messages to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group messages by user for batch processing
    const messagesByUser = new Map<string, any[]>();
    for (const msg of messages) {
      const userId = msg.user_id || 'unknown';
      if (!messagesByUser.has(userId)) {
        messagesByUser.set(userId, []);
      }
      messagesByUser.get(userId)!.push(msg);
    }

    console.log(`[Memory Backfill] Messages grouped by ${messagesByUser.size} users`);

    let workingMemoriesCreated = 0;
    let memoriesExtracted = 0;

    // Process messages in batches by user
    for (const [userId, userMessages] of messagesByUser) {
      console.log(`\n--- Processing user ${userId.substring(0, 8)}... (${userMessages.length} messages) ---`);
      
      // Combine messages for batch extraction (up to 20 at a time)
      const batchSize = 20;
      for (let i = 0; i < userMessages.length; i += batchSize) {
        const batch = userMessages.slice(i, i + batchSize);
        const combinedText = batch.map(m => `[${m.users?.display_name || 'User'}]: ${m.text}`).join('\n');
        
        // Extract memories using AI
        const extracted = await extractMemoriesFromBatch(combinedText, targetGroupId, userId);
        
        if (extracted && extracted.length > 0) {
          memoriesExtracted += extracted.length;
          
          // Create working memories
          for (const memory of extracted) {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h expiry
            
            const { error: insertError } = await supabase.from('working_memory').insert({
              group_id: targetGroupId,
              user_id: userId !== 'unknown' ? userId : null,
              memory_type: validateCategory(memory.category),
              content: memory.content.substring(0, 2000),
              importance_score: memory.importance || 0.5,
              metadata: { source: 'backfill', batch_index: i },
              expires_at: expiresAt,
            });

            if (insertError) {
              console.error('[Memory Backfill] Error inserting working memory:', insertError);
            } else {
              workingMemoriesCreated++;
            }
          }
        }
      }
    }

    console.log(`\n========== MEMORY BACKFILL COMPLETE ==========`);
    console.log(`[Memory Backfill] Results: ${messages.length} messages processed, ${memoriesExtracted} memories extracted, ${workingMemoriesCreated} working memories created`);

    // Optionally trigger consolidation
    if (body.auto_consolidate !== false && workingMemoriesCreated > 0) {
      console.log(`[Memory Backfill] Triggering consolidation...`);
      
      try {
        const consolidateResponse = await fetch(`${supabaseUrl}/functions/v1/memory-consolidator`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trigger: 'manual' }),
        });
        
        const consolidateResult = await consolidateResponse.json();
        console.log(`[Memory Backfill] Consolidation result:`, consolidateResult);
        
        return new Response(
          JSON.stringify({
            success: true,
            stats: {
              messages_processed: messages.length,
              memories_extracted: memoriesExtracted,
              working_memories_created: workingMemoriesCreated,
              consolidation: consolidateResult.stats || consolidateResult,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (consolidateError) {
        console.error('[Memory Backfill] Consolidation error:', consolidateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          messages_processed: messages.length,
          memories_extracted: memoriesExtracted,
          working_memories_created: workingMemoriesCreated,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Memory Backfill] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function extractMemoriesFromBatch(
  messagesText: string,
  groupId: string,
  userId: string
): Promise<Array<{ content: string; category: string; importance: number }>> {
  const prompt = `วิเคราะห์ข้อความแชทเหล่านี้และดึงข้อมูลสำคัญที่ควรจดจำไว้ใช้ในอนาคต

ข้อความ:
${messagesText}

ดึง memories ที่เป็น:
- ข้อมูลส่วนตัว (ชื่อ, วันเกิด, ความชอบ, งานอดิเรก)
- การตัดสินใจของทีม/กลุ่ม
- นโยบายหรือกฎที่สำคัญ
- งานที่ได้รับมอบหมาย หรือสิ่งที่ต้องทำ
- ตัวเลขหรือสถิติทางธุรกิจที่สำคัญ
- ความสัมพันธ์ระหว่างบุคคล

สำหรับแต่ละ memory ให้ระบุ:
- content: ข้อมูลที่ดึงมา (1-2 ประโยค) **ภาษาไทย**
- category: หนึ่งใน: trait, preference, topic, project, context, relationship, name, birthday, hobby, habit, life_event, food_preference, work_info, skill, decision, policy, task, metric, fact, general
- importance: 0.0 ถึง 1.0 (สำคัญแค่ไหนที่จะจดจำ)

สำคัญ: ดึงเฉพาะข้อมูลที่มีประโยชน์จริงๆ ข้ามข้อความทั่วไปและการทักทาย
ถ้าไม่มีอะไรที่ควรจดจำ ให้ return array ว่าง
**ตอบเป็นภาษาไทยทั้งหมด**

ตอบในรูปแบบ JSON เท่านั้น (ไม่ใช้ markdown):
{
  "memories": [
    {"content": "...", "category": "...", "importance": 0.7},
    ...
  ]
}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('[Memory Backfill] AI API error:', await response.text());
      return [];
    }

    const data = await response.json();
    let content = data.choices[0].message.content;
    
    // Strip markdown code blocks
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Memory Backfill] No JSON in AI response');
      return [];
    }
    
    const result = JSON.parse(jsonMatch[0]);
    const memories = result.memories || [];
    
    console.log(`[Memory Backfill] Extracted ${memories.length} memories from batch`);
    
    // Validate categories
    return memories.map((m: any) => ({
      content: m.content || '',
      category: validateCategory(m.category),
      importance: Math.min(1, Math.max(0, m.importance || 0.5)),
    })).filter((m: any) => m.content.length > 10);
    
  } catch (err) {
    console.error('[Memory Backfill] Error extracting memories:', err);
    return [];
  }
}
