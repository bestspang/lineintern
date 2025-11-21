import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[Memory Decay] Starting decay process...');

    // 1. Decay memory strength for unused memories
    const decayFactor = 0.95; // Reduce by 5% daily
    const { data: memories, error: fetchError } = await supabase
      .from('memory_items')
      .select('*')
      .gt('memory_strength', 0.1)
      .is('pinned', false)
      .order('last_reinforced_at', { ascending: true });

    if (fetchError) throw fetchError;

    let decayed = 0;
    let archived = 0;

    for (const memory of memories || []) {
      const daysSinceReinforcement = memory.last_reinforced_at
        ? (Date.now() - new Date(memory.last_reinforced_at).getTime()) / (1000 * 60 * 60 * 24)
        : (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);

      // Apply decay based on days since last use
      let newStrength = memory.memory_strength;
      if (daysSinceReinforcement > 1) {
        const decayAmount = Math.pow(decayFactor, daysSinceReinforcement);
        newStrength = memory.memory_strength * decayAmount;
      }

      // Archive if strength too low
      if (newStrength < 0.1) {
        await supabase
          .from('memory_items')
          .update({ is_deleted: true, updated_at: new Date().toISOString() })
          .eq('id', memory.id);
        archived++;
      } else if (newStrength < memory.memory_strength) {
        await supabase
          .from('memory_items')
          .update({ memory_strength: newStrength, updated_at: new Date().toISOString() })
          .eq('id', memory.id);
        decayed++;
      }
    }

    // 2. Delete expired working memories
    const { error: deleteError } = await supabase
      .from('working_memory')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (deleteError) throw deleteError;

    // 3. Archive old inactive threads (>30 days)
    const archiveDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldThreads, error: threadsError } = await supabase
      .from('conversation_threads')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('status', 'active')
      .lt('last_message_at', archiveDate)
      .select('id');

    if (threadsError) throw threadsError;

    const archivedThreads = oldThreads?.length || 0;

    // 4. Clean up user preferences - apply retention policies
    const { data: users } = await supabase
      .from('users')
      .select('id, memory_preferences');

    for (const user of users || []) {
      const prefs = user.memory_preferences || {};
      const retentionDays = prefs.retention_days || 90;
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

      // Delete old memories for this user based on retention policy
      await supabase
        .from('memory_items')
        .delete()
        .eq('user_id', user.id)
        .lt('created_at', cutoffDate)
        .eq('pinned', false);
    }

    console.log(`[Memory Decay] Completed: ${decayed} decayed, ${archived} archived, ${archivedThreads} threads archived`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          memoriesDecayed: decayed,
          memoriesArchived: archived,
          threadsArchived: archivedThreads,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Memory Decay] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
