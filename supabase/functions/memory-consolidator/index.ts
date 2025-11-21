import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[Memory Consolidator] Starting consolidation process...');

    // 1. Get working memories that will expire soon (next 2 hours)
    const expiryThreshold = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data: workingMemories, error: wmError } = await supabase
      .from('working_memory')
      .select('*')
      .lt('expires_at', expiryThreshold)
      .gte('importance_score', 0.6) // Only consolidate important memories
      .order('importance_score', { ascending: false })
      .limit(50);

    if (wmError) throw wmError;

    console.log(`[Memory Consolidator] Found ${workingMemories?.length || 0} working memories to evaluate`);

    let consolidated = 0;
    let deleted = 0;

    for (const wm of workingMemories || []) {
      try {
        // Use AI to decide if this should become long-term memory
        const decision = await decideConsolidation(wm);

        if (decision.shouldConsolidate) {
          // Create or update long-term memory
          await consolidateToLongTerm(supabase, wm, decision);
          consolidated++;
        }

        // Delete working memory after processing
        await supabase.from('working_memory').delete().eq('id', wm.id);
        deleted++;
      } catch (err) {
        console.error(`[Memory Consolidator] Error processing memory ${wm.id}:`, err);
      }
    }

    // 2. Merge similar long-term memories
    await mergeSimilarMemories(supabase);

    // 3. Update thread summaries
    await updateThreadSummaries(supabase);

    console.log(`[Memory Consolidator] Completed: ${consolidated} consolidated, ${deleted} deleted`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          evaluated: workingMemories?.length || 0,
          consolidated,
          deleted,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Memory Consolidator] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function decideConsolidation(workingMemory: any): Promise<{ shouldConsolidate: boolean; keywords: string[]; category: string }> {
  const prompt = `Analyze this short-term memory and decide if it should be saved as long-term memory.

Memory Type: ${workingMemory.memory_type}
Content: ${workingMemory.content}
Importance Score: ${workingMemory.importance_score}

Criteria for long-term memory:
- Contains factual information that may be useful later
- Represents a decision, preference, or important context
- Not trivial conversation or temporary context

Respond in JSON format:
{
  "shouldConsolidate": true/false,
  "keywords": ["keyword1", "keyword2", ...],
  "category": "fact/preference/decision/context",
  "reasoning": "brief explanation"
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
      console.error('[Memory Consolidator] AI API error:', await response.text());
      return { shouldConsolidate: false, keywords: [], category: 'context' };
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    console.log(`[Memory Consolidator] AI decision: ${result.shouldConsolidate ? 'CONSOLIDATE' : 'DISCARD'} - ${result.reasoning}`);
    
    return result;
  } catch (err) {
    console.error('[Memory Consolidator] Error calling AI:', err);
    return { shouldConsolidate: false, keywords: [], category: 'context' };
  }
}

async function consolidateToLongTerm(supabase: any, workingMemory: any, decision: any) {
  // Check if similar memory exists
  const { data: existingMemories } = await supabase
    .from('memory_items')
    .select('*')
    .eq('group_id', workingMemory.group_id)
    .eq('category', decision.category)
    .limit(10);

  let shouldCreateNew = true;

  // Check for similar content using simple text matching
  for (const existing of existingMemories || []) {
    const similarity = calculateSimilarity(workingMemory.content, existing.content);
    if (similarity > 0.7) {
      // Update existing memory instead
      await supabase
        .from('memory_items')
        .update({
          content: `${existing.content}\n\nUpdate: ${workingMemory.content}`,
          memory_strength: Math.min(1.0, existing.memory_strength + 0.2),
          importance_score: Math.max(existing.importance_score, workingMemory.importance_score),
          updated_at: new Date().toISOString(),
          last_reinforced_at: new Date().toISOString(),
          keywords: Array.from(new Set([...(existing.keywords || []), ...decision.keywords])),
        })
        .eq('id', existing.id);
      
      shouldCreateNew = false;
      console.log(`[Memory Consolidator] Updated existing memory: ${existing.id}`);
      break;
    }
  }

  if (shouldCreateNew) {
    // Create new long-term memory
    const { error } = await supabase.from('memory_items').insert({
      scope: workingMemory.user_id ? 'user' : 'group',
      group_id: workingMemory.group_id,
      user_id: workingMemory.user_id,
      title: workingMemory.content.substring(0, 100),
      content: workingMemory.content,
      category: decision.category,
      source_type: 'conversation',
      importance_score: workingMemory.importance_score,
      memory_strength: 1.0,
      keywords: decision.keywords,
      related_thread_ids: workingMemory.conversation_thread_id ? [workingMemory.conversation_thread_id] : [],
      last_reinforced_at: new Date().toISOString(),
    });

    if (error) throw error;
    console.log(`[Memory Consolidator] Created new long-term memory`);
  }
}

async function mergeSimilarMemories(supabase: any) {
  // Get recent memories that might be duplicates
  const { data: recentMemories } = await supabase
    .from('memory_items')
    .select('*')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  let merged = 0;

  for (let i = 0; i < (recentMemories?.length || 0); i++) {
    for (let j = i + 1; j < (recentMemories?.length || 0); j++) {
      const mem1 = recentMemories![i];
      const mem2 = recentMemories![j];

      if (mem1.group_id === mem2.group_id && mem1.category === mem2.category) {
        const similarity = calculateSimilarity(mem1.content, mem2.content);
        
        if (similarity > 0.8) {
          // Merge mem2 into mem1 and delete mem2
          await supabase
            .from('memory_items')
            .update({
              content: `${mem1.content}\n\n${mem2.content}`,
              memory_strength: Math.min(1.0, mem1.memory_strength + mem2.memory_strength * 0.5),
              importance_score: Math.max(mem1.importance_score, mem2.importance_score),
              keywords: Array.from(new Set([...(mem1.keywords || []), ...(mem2.keywords || [])])),
              related_thread_ids: Array.from(new Set([...(mem1.related_thread_ids || []), ...(mem2.related_thread_ids || [])])),
              updated_at: new Date().toISOString(),
            })
            .eq('id', mem1.id);

          await supabase.from('memory_items').delete().eq('id', mem2.id);
          merged++;
          console.log(`[Memory Consolidator] Merged memories: ${mem2.id} → ${mem1.id}`);
          break;
        }
      }
    }
  }

  if (merged > 0) {
    console.log(`[Memory Consolidator] Merged ${merged} similar memories`);
  }
}

async function updateThreadSummaries(supabase: any) {
  // Get active threads that need summary updates
  const { data: threads } = await supabase
    .from('conversation_threads')
    .select('*')
    .eq('status', 'active')
    .gte('last_message_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .is('summary', null)
    .limit(20);

  for (const thread of threads || []) {
    if (thread.message_count >= 5) {
      // Generate summary for threads with enough messages
      const { data: messages } = await supabase.rpc('get_thread_context', {
        p_thread_id: thread.id,
        p_limit: 20,
      });

      if (messages && messages.length > 0) {
        const summary = await generateThreadSummary(messages);
        await supabase
          .from('conversation_threads')
          .update({ summary, updated_at: new Date().toISOString() })
          .eq('id', thread.id);
        
        console.log(`[Memory Consolidator] Updated thread summary: ${thread.id}`);
      }
    }
  }
}

async function generateThreadSummary(messages: any[]): Promise<string> {
  const messagesText = messages
    .map(m => `${m.user_display_name || 'Bot'}: ${m.text}`)
    .join('\n');

  const prompt = `Summarize this conversation thread in 1-2 sentences:

${messagesText}

Focus on the main topic and any conclusions or decisions reached.`;

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

    if (!response.ok) return 'Conversation thread';

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) {
    console.error('[Memory Consolidator] Error generating summary:', err);
    return 'Conversation thread';
  }
}

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}
