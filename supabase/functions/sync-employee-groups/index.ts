import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[sync-employee-groups] Starting backfill...");

    // Get all employees with branch_id and line_user_id
    const { data: employees, error: employeesError } = await supabase
      .from("employees")
      .select(`
        id,
        full_name,
        line_user_id,
        branch_id,
        branches (
          id,
          name,
          line_group_id
        )
      `)
      .not("branch_id", "is", null)
      .not("line_user_id", "is", null);

    if (employeesError) {
      console.error("[sync-employee-groups] Error fetching employees:", employeesError);
      throw employeesError;
    }

    console.log(`[sync-employee-groups] Found ${employees?.length || 0} employees with branch and LINE ID`);

    let synced = 0;
    let skipped = 0;
    let errors = 0;
    const results: any[] = [];

    for (const emp of employees || []) {
      const branch = emp.branches as any;
      if (!branch?.line_group_id) {
        console.log(`[sync-employee-groups] Skipping ${emp.full_name}: branch has no line_group_id`);
        skipped++;
        continue;
      }

      // Find user by line_user_id
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id, primary_group_id")
        .eq("line_user_id", emp.line_user_id)
        .maybeSingle();

      if (userError) {
        console.error(`[sync-employee-groups] Error finding user for ${emp.full_name}:`, userError);
        errors++;
        continue;
      }

      if (!user) {
        console.log(`[sync-employee-groups] Skipping ${emp.full_name}: no user record found`);
        skipped++;
        continue;
      }

      // Find group by line_group_id
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("id, display_name")
        .eq("line_group_id", branch.line_group_id)
        .maybeSingle();

      if (groupError) {
        console.error(`[sync-employee-groups] Error finding group for branch ${branch.name}:`, groupError);
        errors++;
        continue;
      }

      if (!group) {
        console.log(`[sync-employee-groups] Skipping ${emp.full_name}: no group found for line_group_id ${branch.line_group_id}`);
        skipped++;
        continue;
      }

      // Upsert into group_members
      const { error: memberError } = await supabase
        .from("group_members")
        .upsert(
          {
            user_id: user.id,
            group_id: group.id,
            role: "member",
            joined_at: new Date().toISOString(),
          },
          { onConflict: "user_id,group_id" }
        );

      if (memberError) {
        console.error(`[sync-employee-groups] Error adding ${emp.full_name} to group:`, memberError);
        errors++;
        continue;
      }

      // Set primary_group_id if not set
      if (!user.primary_group_id) {
        const { error: updateError } = await supabase
          .from("users")
          .update({ primary_group_id: group.id })
          .eq("id", user.id);

        if (updateError) {
          console.error(`[sync-employee-groups] Error setting primary_group for ${emp.full_name}:`, updateError);
        }
      }

      synced++;
      results.push({
        employee: emp.full_name,
        group: group.display_name,
        action: "synced",
      });

      console.log(`[sync-employee-groups] Synced ${emp.full_name} → ${group.display_name}`);
    }

    const summary = {
      total: employees?.length || 0,
      synced,
      skipped,
      errors,
      results,
    };

    console.log("[sync-employee-groups] Backfill complete:", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync-employee-groups] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
