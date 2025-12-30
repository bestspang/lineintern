/**
 * ⚠️ HAPPY POINT SYSTEM - Health Bonus Manager
 * 
 * Monthly Health Bonus Mechanic (Loss Aversion):
 * - Start of month: Award 100 Health Bonus points
 * - Sick leave without certificate: Deduct 30 points
 * - Sick leave with certificate: Deduct 5 points (processing fee) or shield
 * 
 * Cron Schedule: 0 1 1 * * (1st day of month, 08:00 Bangkok = 01:00 UTC)
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

    const body = await req.json().catch(() => ({}));
    const { action, employee_id, has_certificate, leave_request_id } = body;

    // Monthly bonus distribution
    if (action === 'monthly_bonus' || !action) {
      return await distributeMonthlyBonus(supabase);
    }

    // Sick leave penalty
    if (action === 'sick_leave_penalty' && employee_id) {
      return await processSickLeavePenalty(supabase, employee_id, has_certificate, leave_request_id);
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logger.error('Error in point-health-manager', { error });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function distributeMonthlyBonus(supabase: any) {
  const currentMonth = new Date().getFullYear() * 100 + (new Date().getMonth() + 1);
  
  logger.info('Distributing monthly health bonuses', { month: currentMonth });

  // Get all employees who haven't received this month's bonus
  const { data: employees, error: fetchError } = await supabase
    .from('happy_points')
    .select('id, employee_id, point_balance, total_earned, health_bonus_month')
    .or(`health_bonus_month.is.null,health_bonus_month.neq.${currentMonth}`);

  if (fetchError) {
    throw fetchError;
  }

  if (!employees || employees.length === 0) {
    logger.info('All employees already received monthly health bonus');
    return new Response(
      JSON.stringify({ success: true, processed: 0, message: 'All employees already processed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let successCount = 0;
  const HEALTH_BONUS = 100;

  for (const hp of employees) {
    try {
      const newBalance = hp.point_balance + HEALTH_BONUS;

      // Insert transaction
      await supabase.from('point_transactions').insert({
        employee_id: hp.employee_id,
        transaction_type: 'bonus',
        category: 'health',
        amount: HEALTH_BONUS,
        balance_after: newBalance,
        description: '💚 Monthly Health Bonus - Stay healthy and earn points!',
        metadata: { month: currentMonth, bonus_type: 'monthly_health' }
      });

      // Update balance and mark month as processed
      await supabase
        .from('happy_points')
        .update({
          point_balance: newBalance,
          total_earned: hp.total_earned + HEALTH_BONUS,
          monthly_health_bonus: HEALTH_BONUS,
          health_bonus_month: currentMonth,
          updated_at: new Date().toISOString()
        })
        .eq('id', hp.id);

      successCount++;
    } catch (err) {
      logger.error('Failed to award health bonus', { employee_id: hp.employee_id, error: err });
    }
  }

  logger.info('Monthly health bonus distribution complete', { processed: successCount });

  return new Response(
    JSON.stringify({
      success: true,
      processed: successCount,
      bonus_amount: HEALTH_BONUS,
      month: currentMonth
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function processSickLeavePenalty(
  supabase: any, 
  employee_id: string, 
  has_certificate: boolean,
  leave_request_id?: string
) {
  logger.info('Processing sick leave penalty', { employee_id, has_certificate });

  const { data: hp, error: fetchError } = await supabase
    .from('happy_points')
    .select('*')
    .eq('employee_id', employee_id)
    .maybeSingle();

  if (fetchError || !hp) {
    throw new Error('Employee happy_points record not found');
  }

  // Penalty amounts
  const penaltyAmount = has_certificate ? 5 : 30;
  const description = has_certificate
    ? '🏥 Sick leave (with certificate) - Minimal processing fee'
    : '😷 Sick leave (no certificate) - Health bonus deduction';

  // Don't go below 0
  const newBalance = Math.max(0, hp.point_balance - penaltyAmount);
  const actualDeduction = hp.point_balance - newBalance;

  if (actualDeduction === 0) {
    logger.info('No points to deduct', { employee_id });
    return new Response(
      JSON.stringify({ success: true, deducted: 0, message: 'No points to deduct' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Insert deduction transaction
  await supabase.from('point_transactions').insert({
    employee_id,
    transaction_type: 'deduct',
    category: 'health',
    amount: -actualDeduction,
    balance_after: newBalance,
    description,
    reference_id: leave_request_id || null,
    reference_type: leave_request_id ? 'leave_request' : null,
    metadata: {
      has_certificate,
      original_penalty: penaltyAmount,
      actual_deduction: actualDeduction
    }
  });

  // Update balance
  await supabase
    .from('happy_points')
    .update({
      point_balance: newBalance,
      monthly_health_bonus: Math.max(0, hp.monthly_health_bonus - actualDeduction),
      updated_at: new Date().toISOString()
    })
    .eq('id', hp.id);

  logger.info('Sick leave penalty applied', {
    employee_id,
    deducted: actualDeduction,
    has_certificate,
    new_balance: newBalance
  });

  return new Response(
    JSON.stringify({
      success: true,
      deducted: actualDeduction,
      new_balance: newBalance,
      has_certificate
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
