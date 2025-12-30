/**
 * ⚠️ HAPPY POINT SYSTEM - Attendance Point Calculator
 * 
 * Calculates and awards points for:
 * - Punctuality: Check-in on time or early (+10 points)
 * - Integrity: Fraud score = 0 with liveness (+5 points)
 * - Updates streak tracking
 * 
 * Called by attendance-submit after successful check-in
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

    const { employee_id, attendance_log_id, event_type, is_on_time, fraud_score } = await req.json();

    if (!employee_id || !attendance_log_id || event_type !== 'check_in') {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid parameters or not a check-in event' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Processing attendance points', { employee_id, is_on_time, fraud_score });

    // Get or create happy_points record
    let { data: happyPoints, error: hpError } = await supabase
      .from('happy_points')
      .select('*')
      .eq('employee_id', employee_id)
      .maybeSingle();

    if (hpError) {
      logger.error('Error fetching happy_points', { error: hpError });
      throw hpError;
    }

    if (!happyPoints) {
      // Create new record
      const currentMonth = new Date().getFullYear() * 100 + (new Date().getMonth() + 1);
      const { data: newHp, error: createError } = await supabase
        .from('happy_points')
        .insert({ employee_id, health_bonus_month: currentMonth })
        .select()
        .single();
      
      if (createError) throw createError;
      happyPoints = newHp;
    }

    let totalPointsAwarded = 0;
    const transactions: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    // 1. Punctuality Points (+10)
    if (is_on_time) {
      totalPointsAwarded += 10;
      transactions.push({
        employee_id,
        transaction_type: 'earn',
        category: 'attendance',
        amount: 10,
        balance_after: happyPoints.point_balance + totalPointsAwarded,
        description: '🕐 Punctuality bonus - On time check-in',
        reference_id: attendance_log_id,
        reference_type: 'attendance_log',
        metadata: { reason: 'punctuality' }
      });
    }

    // 2. Integrity Points (+5 for fraud_score = 0)
    if (fraud_score === 0) {
      totalPointsAwarded += 5;
      transactions.push({
        employee_id,
        transaction_type: 'earn',
        category: 'attendance',
        amount: 5,
        balance_after: happyPoints.point_balance + totalPointsAwarded,
        description: '✅ Integrity bonus - Clean verification',
        reference_id: attendance_log_id,
        reference_type: 'attendance_log',
        metadata: { reason: 'integrity', fraud_score: 0 }
      });
    }

    // 3. Update Streak
    let newStreak = happyPoints.current_punctuality_streak || 0;
    let longestStreak = happyPoints.longest_punctuality_streak || 0;

    if (is_on_time) {
      const lastDate = happyPoints.last_punctuality_date;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastDate === yesterdayStr) {
        // Consecutive day
        newStreak += 1;
      } else if (lastDate !== today) {
        // Reset streak (not consecutive)
        newStreak = 1;
      }
      // If lastDate === today, don't increment (already counted today)

      if (newStreak > longestStreak) {
        longestStreak = newStreak;
      }
    } else {
      // Late - reset streak
      newStreak = 0;
    }

    // Insert transactions
    if (transactions.length > 0) {
      // Update balance_after for all transactions with running total
      let runningBalance = happyPoints.point_balance;
      for (const tx of transactions) {
        runningBalance += tx.amount;
        tx.balance_after = runningBalance;
      }

      const { error: txError } = await supabase
        .from('point_transactions')
        .insert(transactions);

      if (txError) {
        logger.error('Error inserting transactions', { error: txError });
        throw txError;
      }
    }

    // Update happy_points record
    const { error: updateError } = await supabase
      .from('happy_points')
      .update({
        point_balance: happyPoints.point_balance + totalPointsAwarded,
        total_earned: happyPoints.total_earned + totalPointsAwarded,
        current_punctuality_streak: newStreak,
        longest_punctuality_streak: longestStreak,
        last_punctuality_date: is_on_time ? today : happyPoints.last_punctuality_date,
        updated_at: new Date().toISOString()
      })
      .eq('id', happyPoints.id);

    if (updateError) {
      logger.error('Error updating happy_points', { error: updateError });
      throw updateError;
    }

    logger.info('Points awarded successfully', {
      employee_id,
      points_awarded: totalPointsAwarded,
      new_balance: happyPoints.point_balance + totalPointsAwarded,
      streak: newStreak
    });

    return new Response(
      JSON.stringify({
        success: true,
        points_awarded: totalPointsAwarded,
        new_balance: happyPoints.point_balance + totalPointsAwarded,
        streak: newStreak,
        transactions: transactions.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logger.error('Error in point-attendance-calculator', { error });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
