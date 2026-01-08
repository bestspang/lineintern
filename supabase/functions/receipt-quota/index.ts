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
        // Get usage record for current period
        let { data: usage, error: usageError } = await supabase
          .from('receipt_usage')
          .select('ai_receipts_used')
          .eq('line_user_id', line_user_id)
          .eq('period_yyyymm', periodYYYYMM)
          .maybeSingle();

        if (usageError) throw usageError;

        // Get subscription and plan (check if subscription is within current period)
        const { data: subscription } = await supabase
          .from('receipt_subscriptions')
          .select('plan_id, current_period_start, current_period_end')
          .eq('line_user_id', line_user_id)
          .lte('current_period_start', now.toISOString().split('T')[0])
          .gte('current_period_end', now.toISOString().split('T')[0])
          .maybeSingle();

        // Get plan details
        let plan = null;
        if (subscription?.plan_id) {
          const { data: planData } = await supabase
            .from('receipt_plans')
            .select('id, name, ai_receipts_limit')
            .eq('id', subscription.plan_id)
            .single();
          plan = planData;
        }

        // Default to free plan if no active subscription
        if (!plan) {
          // Get default plan setting
          const { data: defaultPlanSetting } = await supabase
            .from('receipt_settings')
            .select('setting_value')
            .eq('setting_key', 'default_plan')
            .maybeSingle();
          
          const defaultPlanId = (defaultPlanSetting?.setting_value as { plan_id?: string })?.plan_id || 'free';
          
          const { data: defaultPlan } = await supabase
            .from('receipt_plans')
            .select('id, name, ai_receipts_limit')
            .eq('id', defaultPlanId)
            .maybeSingle();
          plan = defaultPlan || { id: 'free', name: 'Free', ai_receipts_limit: 5 };
        }

        const used = usage?.ai_receipts_used || 0;
        const limit = plan.ai_receipts_limit ?? 5;
        
        // Check for unlimited plan (limit = -1)
        const unlimited = limit === -1;

        return new Response(
          JSON.stringify({
            success: true,
            quota: {
              used,
              limit,
              remaining: unlimited ? Infinity : Math.max(0, limit - used),
              exceeded: unlimited ? false : used >= limit,
              unlimited,
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
