import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Phase 0A: backfill jobs are admin/owner only.
    try {
      await requireRole(req, ['admin', 'owner'], { functionName: 'backfill-primary-groups' });
    } catch (e) {
      const r = authzErrorResponse(e, corsHeaders);
      if (r) return r;
      throw e;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("[backfill-primary-groups] Starting backfill...");

    // Get users without primary_group_id
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, display_name")
      .is("primary_group_id", null);

    if (usersError) {
      console.error("[backfill-primary-groups] Error fetching users:", usersError);
      throw usersError;
    }

    console.log(`[backfill-primary-groups] Found ${users?.length || 0} users without primary group`);

    const results = {
      total: users?.length || 0,
      assigned: 0,
      skipped: 0,
      details: [] as { userId: string; userName: string; groupName: string; branchName: string }[],
    };

    // Get all branches with their line_group_ids for quick lookup
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name, line_group_id")
      .not("line_group_id", "is", null);

    const branchByLineGroupId = new Map(
      branches?.map((b) => [b.line_group_id, b]) || []
    );

    console.log(`[backfill-primary-groups] Found ${branches?.length || 0} branches with line_group_id`);

    for (const user of users || []) {
      // Get groups user is member of
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id, joined_at, groups(id, line_group_id, display_name)")
        .eq("user_id", user.id)
        .is("left_at", null)
        .order("joined_at", { ascending: true });

      let assigned = false;

      // Find first branch group
      for (const m of memberships || []) {
        const group = m.groups as any;
        if (!group?.line_group_id) continue;

        const branch = branchByLineGroupId.get(group.line_group_id);
        if (branch) {
          // Assign this as primary group
          const { error: updateError } = await supabase
            .from("users")
            .update({ primary_group_id: m.group_id })
            .eq("id", user.id);

          if (!updateError) {
            results.assigned++;
            results.details.push({
              userId: user.id,
              userName: user.display_name || "Unknown",
              groupName: group.display_name || "Unknown",
              branchName: branch.name,
            });
            console.log(
              `[backfill-primary-groups] ✅ Assigned ${user.display_name} → ${group.display_name} (${branch.name})`
            );
            assigned = true;
            break;
          } else {
            console.error(`[backfill-primary-groups] Error updating user ${user.id}:`, updateError);
          }
        }
      }

      if (!assigned) {
        results.skipped++;
        console.log(`[backfill-primary-groups] ⏭️ Skipped ${user.display_name} - no branch group found`);
      }
    }

    console.log(`[backfill-primary-groups] Complete: ${results.assigned} assigned, ${results.skipped} skipped`);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[backfill-primary-groups] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
