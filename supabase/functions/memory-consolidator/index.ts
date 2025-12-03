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

  // Parse body first for manual trigger check
  let body: any = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // Body parse error is fine for cron requests
  }

  // Mode 1: Cron job with CRON_SECRET header
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  const isCronRequest = cronSecret && cronSecret === expectedSecret;
  
  // Mode 2: Manual trigger from UI (body.trigger === 'manual')
  const isManualTrigger = body.trigger === 'manual';

  // Allow either authentication method
  if (!isCronRequest && !isManualTrigger) {
    console.error('[memory-consolidator] Unauthorized: No valid auth method (need CRON_SECRET header or manual trigger)');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[Memory Consolidator] Starting consolidation process (${isManualTrigger ? 'manual' : 'cron'} trigger)...`);

    // Phase 1: Age-based selection instead of expiry-based
    // - High Priority (importance >= 0.9): Consolidate immediately
    // - Normal Priority (importance >= 0.6): Wait 1 hour before consolidating
    // - Low Priority (importance < 0.6): Let expire naturally (24h)
    
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    
    // Get high-priority memories (immediate consolidation)
    const { data: highPriorityMemories } = await supabase
      .from('working_memory')
      .select('*')
      .gte('importance_score', 0.9)
      .gt('expires_at', new Date().toISOString()) // Not expired
      .order('importance_score', { ascending: false })
      .limit(20);
    
    // Get normal-priority memories (older than 1 hour)
    const { data: normalPriorityMemories } = await supabase
      .from('working_memory')
      .select('*')
      .gte('importance_score', 0.6)
      .lt('importance_score', 0.9)
      .lt('created_at', oneHourAgo) // At least 1 hour old
      .gt('expires_at', new Date().toISOString()) // Not expired
      .order('importance_score', { ascending: false })
      .limit(30);
    
    // Combine and deduplicate
    const allMemories = [...(highPriorityMemories || []), ...(normalPriorityMemories || [])];
    const workingMemories = await deduplicateWorkingMemories(supabase, allMemories);

    console.log(`[Memory Consolidator] Found ${workingMemories?.length || 0} working memories to evaluate (high: ${highPriorityMemories?.length || 0}, normal: ${normalPriorityMemories?.length || 0})`);
    if (workingMemories && workingMemories.length > 0) {
      console.log(`[Memory Consolidator] Sample memories:`, 
        workingMemories.slice(0, 3).map(m => ({
          type: m.memory_type,
          importance: m.importance_score,
          age_hours: ((Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60)).toFixed(1),
          content: m.content.substring(0, 80) + '...'
        }))
      );
    }

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

Respond in JSON format only (no markdown):
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
      // Fallback: consolidate high-importance memories anyway
      if (workingMemory.importance_score >= 0.8) {
        console.log('[Memory Consolidator] Fallback: consolidating high-importance memory despite API error');
        return { shouldConsolidate: true, keywords: [], category: workingMemory.memory_type || 'fact' };
      }
      return { shouldConsolidate: false, keywords: [], category: 'context' };
    }

    const data = await response.json();
    let content = data.choices[0].message.content;
    
    // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    
    // Try to extract JSON object from content using regex
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Memory Consolidator] No JSON found in AI response:', content.substring(0, 200));
      // Fallback for high-importance memories
      if (workingMemory.importance_score >= 0.8) {
        console.log('[Memory Consolidator] Fallback: consolidating high-importance memory (no JSON found)');
        return { shouldConsolidate: true, keywords: [], category: workingMemory.memory_type || 'fact' };
      }
      return { shouldConsolidate: false, keywords: [], category: 'context' };
    }
    
    const result = JSON.parse(jsonMatch[0]);
    console.log(`[Memory Consolidator] AI decision: ${result.shouldConsolidate ? 'CONSOLIDATE' : 'DISCARD'} - ${result.reasoning || 'no reason'}`);
    
    return result;
  } catch (err) {
    console.error('[Memory Consolidator] Error calling AI:', err);
    // Fallback: consolidate high-importance memories even on parse error
    if (workingMemory.importance_score >= 0.8) {
      console.log('[Memory Consolidator] Fallback: consolidating high-importance memory despite error');
      return { shouldConsolidate: true, keywords: [], category: workingMemory.memory_type || 'fact' };
    }
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

// Phase 5: Deduplication function to remove duplicate working memories before consolidation
async function deduplicateWorkingMemories(supabase: any, memories: any[]): Promise<any[]> {
  if (!memories || memories.length === 0) return [];
  
  const seen = new Map<string, any>(); // content_key -> best memory
  const duplicateIds: string[] = [];
  
  for (const mem of memories) {
    // Create key from first 50 chars of content (normalized)
    const key = mem.content.substring(0, 50).toLowerCase().replace(/\s+/g, ' ').trim();
    
    if (seen.has(key)) {
      const existing = seen.get(key);
      // Keep the one with higher importance score
      if (mem.importance_score > existing.importance_score) {
        duplicateIds.push(existing.id);
        seen.set(key, mem);
      } else {
        duplicateIds.push(mem.id);
      }
    } else {
      seen.set(key, mem);
    }
  }
  
  // Delete duplicates from database
  if (duplicateIds.length > 0) {
    const { error } = await supabase
      .from('working_memory')
      .delete()
      .in('id', duplicateIds);
    
    if (error) {
      console.error(`[Memory Consolidator] Error deleting duplicates:`, error);
    } else {
      console.log(`[Memory Consolidator] Removed ${duplicateIds.length} duplicate working memories`);
    }
  }
  
  return Array.from(seen.values());
}
