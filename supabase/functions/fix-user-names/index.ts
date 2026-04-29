import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[fix-user-names] Starting user name fix...");

  try {
    // Phase 0A: admin/owner only.
    try {
      await requireRole(req, ['admin', 'owner'], { functionName: 'fix-user-names' });
    } catch (e) {
      const r = authzErrorResponse(e, corsHeaders);
      if (r) return r;
      throw e;
    }

    // Find all users where display_name looks generic (LINE ID starting with U or "User " pattern) or missing avatar
    const { data: usersToFix, error: fetchError } = await supabase
      .from("users")
      .select("id, line_user_id, display_name, avatar_url")
      .or("display_name.like.U%,display_name.like.User %,avatar_url.is.null")
      .limit(100);

    if (fetchError) {
      console.error("[fix-user-names] Error fetching users:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch users" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!usersToFix || usersToFix.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users to fix", fixedCount: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fix-user-names] Found ${usersToFix.length} users to fix`);

    const results = [];
    for (const user of usersToFix) {
      try {
        // Fetch profile from LINE API
        const response = await fetch(
          `https://api.line.me/v2/bot/profile/${user.line_user_id}`,
          {
            headers: {
              Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
            },
          }
        );

        if (!response.ok) {
          console.error(`[fix-user-names] LINE API error for ${user.line_user_id}: ${response.status}`);
          results.push({ userId: user.id, status: "error", error: `LINE API ${response.status}` });
          continue;
        }

        const profile = await response.json();
        const displayName = profile.displayName || user.line_user_id;
        const avatarUrl = profile.pictureUrl || null;

        // Update user
        const { error: updateError } = await supabase
          .from("users")
          .update({
            display_name: displayName,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (updateError) {
          console.error(`[fix-user-names] Error updating user ${user.id}:`, updateError);
          results.push({ userId: user.id, status: "error", error: updateError.message });
        } else {
          console.log(`[fix-user-names] Fixed user ${user.id}: ${user.display_name} → ${displayName}`);
          results.push({ userId: user.id, status: "success", newName: displayName });
        }

        // Rate limit: wait 100ms between API calls
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`[fix-user-names] Error processing user ${user.id}:`, error);
        results.push({ userId: user.id, status: "error", error: error.message });
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;

    return new Response(
      JSON.stringify({
        message: "User name fix completed",
        total: usersToFix.length,
        success: successCount,
        errors: errorCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[fix-user-names] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
