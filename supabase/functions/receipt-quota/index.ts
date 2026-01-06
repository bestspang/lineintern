import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, line_user_id } = await req.json();

    if (!line_user_id) {
      return new Response(
        JSON.stringify({ error: 'line_user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const periodYYYYMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    switch (action) {
      case 'check': {
        // Get or create usage record for current period
        let { data: usage, error: usageError } = await supabase
          .from('receipt_usage')
          .select('*, receipt_subscriptions(receipt_plans(*))')
          .eq('line_user_id', line_user_id)
          .eq('period_yyyymm', periodYYYYMM)
          .maybeSingle();

        if (usageError) throw usageError;

        // If no usage record, get subscription and create one
        if (!usage) {
          const { data: subscription } = await supabase
            .from('receipt_subscriptions')
            .select('*, receipt_plans(*)')
            .eq('line_user_id', line_user_id)
            .eq('status', 'active')
            .maybeSingle();

          // Default to free plan if no subscription
          let planId = subscription?.plan_id;
          if (!planId) {
            const { data: freePlan } = await supabase
              .from('receipt_plans')
              .select('id')
              .eq('name', 'Free')
              .single();
            planId = freePlan?.id;
          }

          // Create usage record
          const { data: newUsage, error: createError } = await supabase
            .from('receipt_usage')
            .insert({
              line_user_id,
              period_yyyymm: periodYYYYMM,
              ai_receipts_used: 0,
            })
            .select('*, receipt_subscriptions(receipt_plans(*))')
            .single();

          if (createError) throw createError;
          usage = newUsage;
        }

        // Get subscription with plan
        const { data: subscription } = await supabase
          .from('receipt_subscriptions')
          .select('*, receipt_plans(*)')
          .eq('line_user_id', line_user_id)
          .eq('status', 'active')
          .maybeSingle();

        const plan = subscription?.receipt_plans as any || { ai_receipts_limit: 10, name: 'Free' };
        const used = usage?.ai_receipts_used || 0;
        const limit = plan.ai_receipts_limit || 10;

        return new Response(
          JSON.stringify({
            success: true,
            quota: {
              used,
              limit,
              remaining: Math.max(0, limit - used),
              exceeded: used >= limit,
              plan_name: plan.name,
              period: periodYYYYMM,
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'increment': {
        // Get current usage
        const { data: usage } = await supabase
          .from('receipt_usage')
          .select('ai_receipts_used')
          .eq('line_user_id', line_user_id)
          .eq('period_yyyymm', periodYYYYMM)
          .maybeSingle();

        if (usage) {
          // Update existing
          const { error } = await supabase
            .from('receipt_usage')
            .update({ 
              ai_receipts_used: (usage.ai_receipts_used || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('line_user_id', line_user_id)
            .eq('period_yyyymm', periodYYYYMM);

          if (error) throw error;
        } else {
          // Create new
          const { error } = await supabase
            .from('receipt_usage')
            .insert({
              line_user_id,
              period_yyyymm: periodYYYYMM,
              ai_receipts_used: 1,
            });

          if (error) throw error;
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'reset': {
        // Admin only - reset quota for a user
        const { error } = await supabase
          .from('receipt_usage')
          .update({ ai_receipts_used: 0, updated_at: new Date().toISOString() })
          .eq('line_user_id', line_user_id)
          .eq('period_yyyymm', periodYYYYMM);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: check, increment, reset' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Receipt quota error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
