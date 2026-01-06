/**
 * ⚠️ HAPPY POINT SYSTEM - Streak Bonus Calculator
 * 
 * Cron job to award streak bonuses:
 * - Weekly: 5 consecutive on-time days = +50 points (Friday evening)
 * - Monthly: Full month on-time = +100 points (Last day of month)
 * 
 * Schedule: 
 * - Weekly: 0 11 * * 5 (Friday 18:00 Bangkok = 11:00 UTC)
 * - Monthly: 0 11 L * * (Last day 18:00 Bangkok)
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
    // CRON_SECRET validation - this function is called by cron jobs only
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret || cronSecret !== expectedSecret) {
      logger.warn('Unauthorized access attempt to point-streak-calculator');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { type } = await req.json().catch(() => ({ type: 'weekly' }));
    const isMonthly = type === 'monthly';

    logger.info(`Processing ${isMonthly ? 'monthly' : 'weekly'} streak bonuses`);

    // Get employees with qualifying streaks
    const minStreak = isMonthly ? 20 : 5; // ~20 working days for monthly, 5 for weekly
    const bonusAmount = isMonthly ? 100 : 50;
    const bonusDescription = isMonthly 
      ? '🏆 Monthly Perfect Attendance - Full month on time!'
      : '🔥 Weekly Streak Bonus - 5 consecutive on-time days!';

    const { data: qualifyingEmployees, error: fetchError } = await supabase
      .from('happy_points')
      .select('id, employee_id, point_balance, total_earned, current_punctuality_streak')
      .gte('current_punctuality_streak', minStreak);

    if (fetchError) {
      throw fetchError;
    }

    if (!qualifyingEmployees || qualifyingEmployees.length === 0) {
      logger.info('No employees qualify for streak bonus', { minStreak });
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No qualifying employees' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let successCount = 0;
    const errors: any[] = [];

    for (const hp of qualifyingEmployees) {
      try {
        // Check if already awarded this period
        const periodStart = isMonthly 
          ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
          : (() => {
              const now = new Date();
              const dayOfWeek = now.getDay();
              const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
              const monday = new Date(now);
              monday.setDate(now.getDate() - diff);
              monday.setHours(0, 0, 0, 0);
              return monday.toISOString();
            })();

        const { data: existingBonus } = await supabase
          .from('point_transactions')
          .select('id')
          .eq('employee_id', hp.employee_id)
          .eq('category', 'streak')
          .gte('created_at', periodStart)
          .maybeSingle();

        if (existingBonus) {
          logger.info('Streak bonus already awarded this period', { employee_id: hp.employee_id });
          continue;
        }

        const newBalance = hp.point_balance + bonusAmount;

        // Insert transaction
        await supabase.from('point_transactions').insert({
          employee_id: hp.employee_id,
          transaction_type: 'bonus',
          category: 'streak',
          amount: bonusAmount,
          balance_after: newBalance,
          description: bonusDescription,
          metadata: {
            streak_type: isMonthly ? 'monthly' : 'weekly',
            streak_count: hp.current_punctuality_streak
          }
        });

        // Update balance
        await supabase
          .from('happy_points')
          .update({
            point_balance: newBalance,
            total_earned: hp.total_earned + bonusAmount,
            updated_at: new Date().toISOString()
          })
          .eq('id', hp.id);

        successCount++;
        logger.info('Streak bonus awarded', {
          employee_id: hp.employee_id,
          amount: bonusAmount,
          streak: hp.current_punctuality_streak
        });

      } catch (err: any) {
        errors.push({ employee_id: hp.employee_id, error: err?.message || 'Unknown error' });
      }
    }

    logger.info(`Streak bonuses complete`, { processed: successCount, errors: errors.length });

    return new Response(
      JSON.stringify({
        success: true,
        processed: successCount,
        bonus_amount: bonusAmount,
        type: isMonthly ? 'monthly' : 'weekly',
        errors: errors.length > 0 ? errors : undefined
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logger.error('Error in point-streak-calculator', { error });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
