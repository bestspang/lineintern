// ============================================
// STALE SESSION CLEANER
// ============================================
// Automatically closes work_sessions that have been "active" for more than 24 hours
// This prevents orphaned sessions from accumulating in the database
// 
// Scheduled: Daily at 01:00 Bangkok time (18:00 UTC)
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bangkok timezone offset: UTC+7
const BANGKOK_OFFSET_HOURS = 7;

function getBangkokNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + BANGKOK_OFFSET_HOURS * 60 * 60 * 1000);
}

function getBangkokDateString(date?: Date): string {
  const d = date || getBangkokNow();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const bangkokNow = getBangkokNow();
  const today = getBangkokDateString();
  
  console.log(`[stale-session-cleaner] Starting cleanup at ${bangkokNow.toISOString()} (Bangkok: ${today})`);

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find stale sessions (active for more than 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // First, get the count and details of stale sessions
    const { data: staleSessions, error: fetchError } = await supabase
      .from("work_sessions")
      .select("id, employee_id, actual_start_time, status")
      .eq("status", "active")
      .lt("actual_start_time", twentyFourHoursAgo);

    if (fetchError) {
      throw new Error(`Failed to fetch stale sessions: ${fetchError.message}`);
    }

    const staleCount = staleSessions?.length || 0;
    console.log(`[stale-session-cleaner] Found ${staleCount} stale sessions`);

    if (staleCount === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No stale sessions found",
          stats: {
            checked_at: today,
            stale_count: 0,
            cleaned_count: 0,
            duration_ms: Date.now() - startTime,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log details of sessions being cleaned
    for (const session of staleSessions) {
      console.log(`[stale-session-cleaner] Cleaning session: ${session.id}, employee: ${session.employee_id}, started: ${session.actual_start_time}`);
    }

    // Update stale sessions to auto_closed
    const { data: updatedSessions, error: updateError } = await supabase
      .from("work_sessions")
      .update({
        status: "auto_closed",
        actual_end_time: new Date(
          new Date(staleSessions[0].actual_start_time).getTime() + 8 * 60 * 60 * 1000
        ).toISOString(), // Set end time to 8 hours after start
        updated_at: new Date().toISOString(),
      })
      .eq("status", "active")
      .lt("actual_start_time", twentyFourHoursAgo)
      .select("id");

    if (updateError) {
      throw new Error(`Failed to update stale sessions: ${updateError.message}`);
    }

    const cleanedCount = updatedSessions?.length || 0;
    console.log(`[stale-session-cleaner] ✅ Successfully cleaned ${cleanedCount} stale sessions`);

    // Log cleanup result for monitoring
    try {
      await supabase.from("bot_message_logs").insert({
        edge_function_name: "stale-session-cleaner",
        destination_type: "system",
        destination_id: "system",
        message_type: "info",
        message_text: `Cleaned ${cleanedCount} stale work sessions`,
        command_type: "cron_cleanup",
        delivery_status: "success",
      });
    } catch (logError) {
      console.warn("[stale-session-cleaner] Failed to log cleanup result:", logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully cleaned ${cleanedCount} stale sessions`,
        stats: {
          checked_at: today,
          stale_count: staleCount,
          cleaned_count: cleanedCount,
          duration_ms: Date.now() - startTime,
        },
        cleaned_sessions: updatedSessions?.map(s => s.id) || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[stale-session-cleaner] ❌ Error: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        stats: {
          checked_at: today,
          duration_ms: Date.now() - startTime,
        },
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
