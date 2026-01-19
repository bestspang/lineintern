/**
 * ⚠️ HAPPY POINT SYSTEM - Attendance Point Calculator
 * 
 * Calculates and awards points for:
 * - Punctuality: Check-in on time or early (+10 points)
 * - Integrity: Fraud score = 0 with liveness (+5 points)
 * - Updates streak tracking (with work day awareness - skips weekends/holidays)
 * 
 * Called by attendance-submit after successful check-in
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';
import { getBangkokDateString, getBangkokNow } from '../_shared/timezone.ts';

/**
 * Find the previous work day for an employee (skip non-working days)
 * Returns date string in YYYY-MM-DD format or null if not found
 */
async function findPreviousWorkDay(
  supabase: any,
  employeeId: string,
  fromDate: string // YYYY-MM-DD format
): Promise<string | null> {
  // Get employee's work schedules
  const { data: workSchedules } = await supabase
    .from('work_schedules')
    .select('day_of_week, is_working_day')
    .eq('employee_id', employeeId);

  // Get shift assignments for the last 7 days
  const sevenDaysAgo = new Date(fromDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  const { data: shiftAssignments } = await supabase
    .from('shift_assignments')
    .select('work_date, is_day_off')
    .eq('employee_id', employeeId)
    .gte('work_date', sevenDaysAgoStr)
    .lt('work_date', fromDate);

  // Get holidays for the last 7 days
  const { data: holidays } = await supabase
    .from('holidays')
    .select('date')
    .gte('date', sevenDaysAgoStr)
    .lt('date', fromDate);

  const holidaySet = new Set((holidays || []).map((h: any) => h.date));
  const shiftMap = new Map(
    (shiftAssignments || []).map((s: any) => [s.work_date, s.is_day_off])
  );

  // Build work schedule map by day_of_week
  const workScheduleMap = new Map<number, boolean>();
  for (const ws of workSchedules || []) {
    workScheduleMap.set(ws.day_of_week, ws.is_working_day);
  }
  
  // Default working days (Mon-Fri) if no work_schedules
  const defaultWorkingDays = new Set([1, 2, 3, 4, 5]);

  // Search backwards up to 7 days
  const currentDate = new Date(fromDate);
  for (let i = 1; i <= 7; i++) {
    currentDate.setDate(currentDate.getDate() - 1);
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Priority 1: Check shift_assignments (day off override)
    if (shiftMap.has(dateStr)) {
      if (shiftMap.get(dateStr) === true) {
        // Explicitly marked as day off in shift assignment
        continue;
      }
      // Has shift assignment and not day off = working day
      return dateStr;
    }

    // Priority 2: Check if it's a holiday
    if (holidaySet.has(dateStr)) {
      continue;
    }

    // Priority 3: Check work_schedules
    if (workScheduleMap.has(dayOfWeek)) {
      if (workScheduleMap.get(dayOfWeek)) {
        return dateStr; // Working day
      }
      continue; // Not a working day
    }

    // Priority 4: Default (Mon-Fri)
    if (defaultWorkingDays.has(dayOfWeek)) {
      return dateStr;
    }
  }

  // No work day found in the last 7 days
  return null;
}

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

    // Fetch point rules from database
    const { data: pointRules } = await supabase
      .from('point_rules')
      .select('rule_key, points, is_active, conditions')
      .in('rule_key', ['punctuality', 'integrity']);

    const rulesMap = new Map(
      (pointRules || []).map((r: any) => [r.rule_key, r])
    );

    // Default values if rules not found
    const punctualityRule = rulesMap.get('punctuality') || { points: 10, is_active: true };
    const integrityRule = rulesMap.get('integrity') || { points: 5, is_active: true };

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
    const today = getBangkokDateString();

    // 1. Punctuality Points (from DB rule)
    if (is_on_time && punctualityRule.is_active) {
      const points = punctualityRule.points;
      totalPointsAwarded += points;
      transactions.push({
        employee_id,
        transaction_type: 'earn',
        category: 'attendance',
        amount: points,
        balance_after: happyPoints.point_balance + totalPointsAwarded,
        description: '🕐 Punctuality bonus - On time check-in',
        reference_id: attendance_log_id,
        reference_type: 'attendance_log',
        metadata: { reason: 'punctuality' }
      });
    }

    // 2. Integrity Points (from DB rule)
    if (fraud_score === 0 && integrityRule.is_active) {
      const points = integrityRule.points;
      totalPointsAwarded += points;
      transactions.push({
        employee_id,
        transaction_type: 'earn',
        category: 'attendance',
        amount: points,
        balance_after: happyPoints.point_balance + totalPointsAwarded,
        description: '✅ Integrity bonus - Clean verification',
        reference_id: attendance_log_id,
        reference_type: 'attendance_log',
        metadata: { reason: 'integrity', fraud_score: 0 }
      });
    }

    // 3. Update Streak - with work day awareness (skip weekends/holidays)
    let newStreak = happyPoints.current_punctuality_streak || 0;
    let longestStreak = happyPoints.longest_punctuality_streak || 0;

    if (is_on_time) {
      const lastDate = happyPoints.last_punctuality_date;
      
      if (!lastDate) {
        // First time on-time check-in
        newStreak = 1;
        logger.info('Streak started (first on-time)', { employee_id, today, newStreak });
      } else if (lastDate === today) {
        // Already counted today, don't increment
        logger.info('Streak unchanged (already counted today)', { employee_id, today, newStreak });
      } else {
        // Find the previous work day (skip weekends & holidays)
        const previousWorkDay = await findPreviousWorkDay(supabase, employee_id, today);
        
        if (previousWorkDay === lastDate) {
          // Consecutive WORK day - increment streak
          newStreak += 1;
          logger.info('Streak incremented (consecutive work day)', {
            employee_id,
            lastDate,
            previousWorkDay,
            today,
            newStreak
          });
        } else {
          // Missed a work day - reset streak to 1
          newStreak = 1;
          logger.info('Streak reset (missed work day)', {
            employee_id,
            lastDate,
            previousWorkDay,
            today,
            newStreak
          });
        }
      }

      if (newStreak > longestStreak) {
        longestStreak = newStreak;
      }
    } else {
      // Late - reset streak to 0
      newStreak = 0;
      logger.info('Streak reset (late check-in)', { employee_id, today });
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
