import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Check for CRON_SECRET (for cron jobs) OR authenticated admin user (for manual refresh)
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('authorization');

  let isAuthorized = false;

  // Option 1: CRON_SECRET for automated cron jobs
  if (cronSecret && cronSecret === expectedSecret) {
    isAuthorized = true;
    console.log('[refresh-member-count] Authorized via CRON_SECRET');
  }

  // Option 2: JWT for authenticated admin users from dashboard
  if (!isAuthorized && authHeader) {
    try {
      const supabaseAuth = createClient(supabaseUrl, supabaseKey);
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
      
      if (user && !error) {
        isAuthorized = true;
        console.log(`[refresh-member-count] Authorized via JWT for user: ${user.email}`);
      }
    } catch (authError) {
      console.error('[refresh-member-count] JWT validation error:', authError);
    }
  }

  if (!isAuthorized) {
    console.error('[refresh-member-count] Unauthorized: No valid CRON_SECRET or JWT');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active groups (exclude DM groups which start with 'dm_')
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('id, line_group_id, display_name')
      .eq('status', 'active')
      .not('line_group_id', 'like', 'dm_%');

    if (groupsError) {
      throw groupsError;
    }

    if (!groups || groups.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active groups found',
          updated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const group of groups) {
      try {
        // Skip if line_group_id is not a valid LINE group format (should start with 'C' for groups or 'R' for rooms)
        if (!group.line_group_id.startsWith('C') && !group.line_group_id.startsWith('R')) {
          results.push({
            group_id: group.id,
            group_name: group.display_name,
            status: 'skipped',
            reason: 'Not a valid LINE group ID format (expected C... or R...)'
          });
          console.log(`⊘ Skipped ${group.display_name}: Invalid LINE group ID format`);
          continue;
        }

        // Fetch member count from LINE API (correct endpoint)
        const response = await fetch(
          `https://api.line.me/v2/bot/group/${group.line_group_id}/members/count`,
          {
            headers: {
              'Authorization': `Bearer ${lineToken}`,
            },
          }
        );

        const responseText = await response.text();
        console.log(`[${group.display_name}] LINE API status: ${response.status}, response: ${responseText}`);

        if (response.ok) {
          const countData = JSON.parse(responseText);
          const memberCount = countData.count || 0;
          console.log(`[${group.display_name}] Member count: ${memberCount}`);

          // Update member_count in database
          const { error: updateError } = await supabase
            .from('groups')
            .update({ 
              member_count: memberCount,
              updated_at: new Date().toISOString()
            })
            .eq('id', group.id);

          if (updateError) {
            throw updateError;
          }

          results.push({
            group_id: group.id,
            group_name: group.display_name,
            member_count: memberCount,
            status: 'success'
          });
          successCount++;

          console.log(`✓ Updated ${group.display_name}: ${memberCount} members`);
        } else {
          // Group might not exist anymore or bot was removed
          const status = response.status;
          results.push({
            group_id: group.id,
            group_name: group.display_name,
            status: 'error',
            error: `LINE API error: ${status} - ${responseText}`
          });
          errorCount++;
          
          console.log(`✗ Failed to fetch ${group.display_name}: ${status}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          group_id: group.id,
          group_name: group.display_name,
          status: 'error',
          error: errorMessage
        });
        errorCount++;
        
        console.error(`✗ Error processing ${group.display_name}:`, error);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Refreshed member counts for ${groups.length} groups`,
        summary: {
          total: groups.length,
          success: successCount,
          errors: errorCount
        },
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in refresh-member-count:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
