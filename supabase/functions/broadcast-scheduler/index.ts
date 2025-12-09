import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[broadcast-scheduler] Starting scheduled broadcast check");

    const now = new Date().toISOString();

    // Find broadcasts that are scheduled and due to run
    // - Status is 'scheduled'
    // - scheduled_at <= now (for one-time) OR next_run_at <= now (for recurring)
    const { data: broadcasts, error } = await supabase
      .from("broadcasts")
      .select("*")
      .eq("status", "scheduled")
      .or(`scheduled_at.lte.${now},next_run_at.lte.${now}`);

    if (error) {
      console.error("[broadcast-scheduler] Error fetching broadcasts:", error);
      throw error;
    }

    console.log(`[broadcast-scheduler] Found ${broadcasts?.length || 0} broadcasts to process`);

    const results = [];

    for (const broadcast of broadcasts || []) {
      // Check if it's time to run
      const scheduledTime = broadcast.next_run_at || broadcast.scheduled_at;
      if (!scheduledTime || new Date(scheduledTime) > new Date()) {
        continue;
      }

      console.log(`[broadcast-scheduler] Triggering broadcast: ${broadcast.id} - ${broadcast.title}`);

      try {
        // Call broadcast-send function
        const response = await fetch(`${SUPABASE_URL}/functions/v1/broadcast-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ broadcast_id: broadcast.id }),
        });

        const result = await response.json();
        results.push({
          broadcast_id: broadcast.id,
          title: broadcast.title,
          ...result,
        });

        console.log(`[broadcast-scheduler] Broadcast ${broadcast.id} result:`, result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[broadcast-scheduler] Error triggering broadcast ${broadcast.id}:`, err);
        results.push({
          broadcast_id: broadcast.id,
          title: broadcast.title,
          success: false,
          error: errorMessage,
        });

        // Mark as failed if there was an error
        await supabase
          .from("broadcasts")
          .update({ status: "failed" })
          .eq("id", broadcast.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed_count: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[broadcast-scheduler] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
