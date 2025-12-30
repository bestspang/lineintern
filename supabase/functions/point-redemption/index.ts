/**
 * ⚠️ HAPPY POINT SYSTEM - Reward Redemption
 * 
 * Handles point redemption for rewards:
 * - Validates employee has enough points
 * - Checks cooldown period
 * - Checks stock availability
 * - Creates redemption record
 * - Deducts points
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, employee_id, reward_id, redemption_id, notes, admin_id, rejection_reason } = await req.json();

    // Handle different actions
    switch (action) {
      case 'redeem':
        return await processRedemption(supabase, employee_id, reward_id, notes);
      case 'approve':
        return await approveRedemption(supabase, redemption_id, admin_id, notes);
      case 'reject':
        return await rejectRedemption(supabase, redemption_id, admin_id, rejection_reason);
      case 'use':
        return await markAsUsed(supabase, redemption_id);
      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error: any) {
    logger.error('Error in point-redemption', { error });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processRedemption(supabase: any, employee_id: string, reward_id: string, notes?: string) {
  logger.info('Processing redemption', { employee_id, reward_id });

  // 1. Get reward details
  const { data: reward, error: rewardError } = await supabase
    .from('point_rewards')
    .select('*')
    .eq('id', reward_id)
    .eq('is_active', true)
    .maybeSingle();

  if (rewardError || !reward) {
    return new Response(
      JSON.stringify({ success: false, error: 'Reward not found or inactive' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Check validity dates
  const now = new Date();
  if (reward.valid_from && new Date(reward.valid_from) > now) {
    return new Response(
      JSON.stringify({ success: false, error: 'Reward not yet available' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (reward.valid_until && new Date(reward.valid_until) < now) {
    return new Response(
      JSON.stringify({ success: false, error: 'Reward has expired' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 3. Check stock
  if (reward.stock_limit !== null && reward.stock_used >= reward.stock_limit) {
    return new Response(
      JSON.stringify({ success: false, error: 'Reward out of stock' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Get employee's points
  const { data: hp, error: hpError } = await supabase
    .from('happy_points')
    .select('*')
    .eq('employee_id', employee_id)
    .maybeSingle();

  if (hpError || !hp) {
    return new Response(
      JSON.stringify({ success: false, error: 'Employee points record not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 5. Check balance
  if (hp.point_balance < reward.point_cost) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Insufficient points',
        required: reward.point_cost,
        available: hp.point_balance
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 6. Check cooldown
  if (reward.cooldown_days > 0) {
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - reward.cooldown_days);

    const { data: recentRedemption } = await supabase
      .from('point_redemptions')
      .select('id, created_at')
      .eq('employee_id', employee_id)
      .eq('reward_id', reward_id)
      .neq('status', 'cancelled')
      .neq('status', 'rejected')
      .gte('created_at', cooldownDate.toISOString())
      .maybeSingle();

    if (recentRedemption) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cooldown period not over. Please wait ${reward.cooldown_days} days between redemptions.`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // 7. Create redemption record
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 day expiry

  const initialStatus = reward.requires_approval ? 'pending' : 'approved';

  const { data: redemption, error: redemptionError } = await supabase
    .from('point_redemptions')
    .insert({
      employee_id,
      reward_id,
      point_cost: reward.point_cost,
      status: initialStatus,
      notes,
      expires_at: expiresAt.toISOString(),
      approved_at: initialStatus === 'approved' ? new Date().toISOString() : null
    })
    .select()
    .single();

  if (redemptionError) {
    throw redemptionError;
  }

  // 8. Deduct points
  const newBalance = hp.point_balance - reward.point_cost;

  await supabase.from('point_transactions').insert({
    employee_id,
    transaction_type: 'spend',
    category: 'redemption',
    amount: -reward.point_cost,
    balance_after: newBalance,
    description: `🎁 Redeemed: ${reward.name}`,
    reference_id: redemption.id,
    reference_type: 'redemption',
    metadata: { reward_name: reward.name, reward_id }
  });

  await supabase
    .from('happy_points')
    .update({
      point_balance: newBalance,
      total_spent: hp.total_spent + reward.point_cost,
      updated_at: new Date().toISOString()
    })
    .eq('id', hp.id);

  // 9. Update stock
  if (reward.stock_limit !== null) {
    await supabase
      .from('point_rewards')
      .update({ stock_used: reward.stock_used + 1 })
      .eq('id', reward_id);
  }

  logger.info('Redemption successful', {
    employee_id,
    reward_id,
    reward_name: reward.name,
    points_spent: reward.point_cost,
    new_balance: newBalance,
    requires_approval: reward.requires_approval
  });

  return new Response(
    JSON.stringify({
      success: true,
      redemption_id: redemption.id,
      status: initialStatus,
      points_spent: reward.point_cost,
      new_balance: newBalance,
      requires_approval: reward.requires_approval
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function approveRedemption(supabase: any, redemption_id: string, admin_id: string, notes?: string) {
  const { data: redemption, error } = await supabase
    .from('point_redemptions')
    .update({
      status: 'approved',
      approved_by_admin_id: admin_id,
      approved_at: new Date().toISOString(),
      notes: notes || undefined,
      updated_at: new Date().toISOString()
    })
    .eq('id', redemption_id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error || !redemption) {
    return new Response(
      JSON.stringify({ success: false, error: 'Redemption not found or not pending' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  logger.info('Redemption approved', { redemption_id, admin_id });

  return new Response(
    JSON.stringify({ success: true, redemption }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function rejectRedemption(supabase: any, redemption_id: string, admin_id: string, rejection_reason?: string) {
  // Get redemption details for refund
  const { data: redemption, error: fetchError } = await supabase
    .from('point_redemptions')
    .select('*, employee:employees(id), reward:point_rewards(name)')
    .eq('id', redemption_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchError || !redemption) {
    return new Response(
      JSON.stringify({ success: false, error: 'Redemption not found or not pending' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Refund points
  const { data: hp } = await supabase
    .from('happy_points')
    .select('*')
    .eq('employee_id', redemption.employee_id)
    .single();

  const newBalance = hp.point_balance + redemption.point_cost;

  await supabase.from('point_transactions').insert({
    employee_id: redemption.employee_id,
    transaction_type: 'earn',
    category: 'redemption',
    amount: redemption.point_cost,
    balance_after: newBalance,
    description: `↩️ Refund: ${redemption.reward?.name} (rejected)`,
    reference_id: redemption_id,
    reference_type: 'redemption',
    metadata: { reason: 'rejected', rejection_reason }
  });

  await supabase
    .from('happy_points')
    .update({
      point_balance: newBalance,
      total_spent: Math.max(0, hp.total_spent - redemption.point_cost),
      updated_at: new Date().toISOString()
    })
    .eq('id', hp.id);

  // Update redemption status
  await supabase
    .from('point_redemptions')
    .update({
      status: 'rejected',
      approved_by_admin_id: admin_id,
      rejection_reason,
      updated_at: new Date().toISOString()
    })
    .eq('id', redemption_id);

  logger.info('Redemption rejected and refunded', { redemption_id, admin_id, refund: redemption.point_cost });

  return new Response(
    JSON.stringify({ success: true, refunded: redemption.point_cost }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function markAsUsed(supabase: any, redemption_id: string) {
  const { data: redemption, error } = await supabase
    .from('point_redemptions')
    .update({
      status: 'used',
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', redemption_id)
    .eq('status', 'approved')
    .select()
    .maybeSingle();

  if (error || !redemption) {
    return new Response(
      JSON.stringify({ success: false, error: 'Redemption not found or not approved' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  logger.info('Redemption marked as used', { redemption_id });

  return new Response(
    JSON.stringify({ success: true, redemption }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
