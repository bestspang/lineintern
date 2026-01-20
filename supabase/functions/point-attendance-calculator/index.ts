/**
 * ⚠️ HAPPY POINT SYSTEM - Attendance Point Calculator
 * 
 * Calculates and awards points for:
 * - Punctuality: Check-in on time or early (+10 points)
 * - Integrity: Fraud score = 0 with liveness (+5 points)
 * - Updates streak tracking (with work day awareness - skips weekends/holidays)
 * - Awards streak bonus immediately when milestone is reached (5, 10, 15...)
 * - Sends LINE notification for streak bonuses if enabled
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

/**
 * Send point notification to LINE (group and/or DM)
 */
async function sendPointNotification(
  supabase: any,
  options: {
    employeeId: string;
    messageTemplate: string | null;
    notifyGroup: boolean;
    notifyDm: boolean;
    points: number;
    streak: number;
    newBalance: number;
  }
): Promise<void> {
  if (!options.messageTemplate) {
    logger.info('No message template, skipping notification');
    return;
  }

  try {
    // Fetch employee info with branch
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('full_name, line_user_id, announcement_group_line_id, branch:branches(line_group_id)')
      .eq('id', options.employeeId)
      .maybeSingle();

    if (empError || !employee) {
      logger.error('Failed to fetch employee for notification', { error: empError });
      return;
    }

    // Replace template variables
    let message = options.messageTemplate;
    message = message.replace(/{name}/g, employee.full_name || 'พนักงาน');
    message = message.replace(/{points}/g, String(options.points));
    message = message.replace(/{balance}/g, String(options.newBalance));
    message = message.replace(/{streak}/g, String(options.streak));

    const accessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!accessToken) {
      logger.error('LINE_CHANNEL_ACCESS_TOKEN not configured');
      return;
    }

    // Send to group
    if (options.notifyGroup) {
      const groupId = employee.announcement_group_line_id || employee.branch?.line_group_id;
      if (groupId) {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            to: groupId,
            messages: [{ type: 'text', text: message }]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Failed to send group notification', { error: errorText, groupId });
        } else {
          logger.info('Point notification sent to group', { groupId });
        }
      } else {
        logger.warn('No group ID found for notification', { employeeId: options.employeeId });
      }
    }

    // Send DM
    if (options.notifyDm && employee.line_user_id) {
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          to: employee.line_user_id,
          messages: [{ type: 'text', text: message }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Failed to send DM notification', { error: errorText });
      } else {
        logger.info('Point notification sent to DM', { lineUserId: employee.line_user_id });
      }
    }
  } catch (error: any) {
    logger.error('Error sending point notification', { error: error?.message });
  }
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

    // Fetch point rules from database (include notification settings)
    const { data: pointRules } = await supabase
      .from('point_rules')
      .select('rule_key, points, is_active, conditions, notify_enabled, notify_message_template, notify_group, notify_dm')
      .in('rule_key', ['punctuality', 'integrity', 'streak_weekly', 'streak_monthly']);

    const rulesMap = new Map(
      (pointRules || []).map((r: any) => [r.rule_key, r])
    );

    // Default values if rules not found
    const punctualityRule = rulesMap.get('punctuality') || { points: 10, is_active: true };
    const integrityRule = rulesMap.get('integrity') || { points: 5, is_active: true };
    const weeklyStreakRule = rulesMap.get('streak_weekly') || { 
      points: 50, 
      is_active: true, 
      conditions: { min_streak: 5 },
      notify_enabled: false 
    };

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
          // Missed a work day - check for shield protection
          if ((happyPoints.streak_shields || 0) > 0) {
            // Use shield to protect streak
            await supabase
              .from('happy_points')
              .update({ 
                streak_shields: happyPoints.streak_shields - 1,
                last_shield_used_at: today
              })
              .eq('id', happyPoints.id);
            
            // Log shield usage
            await supabase.from('point_transactions').insert({
              employee_id,
              transaction_type: 'spend',
              category: 'streak',
              amount: 0,
              balance_after: happyPoints.point_balance,
              description: '🛡️ Streak Shield used - streak protected from missed day!',
              metadata: { reason: 'shield_used_missed_day', streak_protected: happyPoints.current_punctuality_streak }
            });
            
            // Streak continues from previous value + 1 for today
            newStreak = (happyPoints.current_punctuality_streak || 0) + 1;
            logger.info('Shield used to protect streak (missed work day)', { 
              employee_id, 
              streak: newStreak,
              shields_remaining: happyPoints.streak_shields - 1
            });
          } else {
            // No shield - reset streak to 1 (today counts as first day)
            newStreak = 1;
            logger.info('Streak reset (missed work day, no shield)', {
              employee_id,
              lastDate,
              previousWorkDay,
              today,
              newStreak
            });
          }
        }
      }

      if (newStreak > longestStreak) {
        longestStreak = newStreak;
      }
    } else {
      // Late check-in - check for shield protection
      if ((happyPoints.streak_shields || 0) > 0) {
        // Use shield to protect streak
        await supabase
          .from('happy_points')
          .update({ 
            streak_shields: happyPoints.streak_shields - 1,
            last_shield_used_at: today
          })
          .eq('id', happyPoints.id);
        
        // Log shield usage
        await supabase.from('point_transactions').insert({
          employee_id,
          transaction_type: 'spend',
          category: 'streak',
          amount: 0,
          balance_after: happyPoints.point_balance,
          description: '🛡️ Streak Shield used - streak protected from late check-in!',
          metadata: { reason: 'shield_used_late', streak_protected: happyPoints.current_punctuality_streak }
        });
        
        // Keep current streak (don't increment since late, but don't reset)
        newStreak = happyPoints.current_punctuality_streak || 0;
        logger.info('Shield used to protect streak (late check-in)', { 
          employee_id, 
          streak: newStreak,
          shields_remaining: happyPoints.streak_shields - 1
        });
      } else {
        // No shield - reset streak to 0
        newStreak = 0;
        logger.info('Streak reset (late check-in, no shield)', { employee_id, today });
      }
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

    // ============================================
    // REAL-TIME STREAK BONUS
    // Award streak bonus immediately when milestone is reached
    // ============================================
    let streakBonusAwarded = 0;
    const weeklyMinStreak = weeklyStreakRule.conditions?.min_streak || 5;

    // Check if streak just reached a milestone (5, 10, 15, 20...)
    if (is_on_time && newStreak >= weeklyMinStreak && newStreak % weeklyMinStreak === 0) {
      logger.info('Streak milestone reached, checking for bonus', { 
        employee_id, 
        newStreak, 
        weeklyMinStreak 
      });

      // Check if not already awarded today for this streak count
      const { data: existingBonus } = await supabase
        .from('point_transactions')
        .select('id')
        .eq('employee_id', employee_id)
        .eq('category', 'streak')
        .gte('created_at', today + 'T00:00:00')
        .maybeSingle();

      if (!existingBonus && weeklyStreakRule.is_active) {
        const bonusAmount = weeklyStreakRule.points || 50;
        const newBalance = happyPoints.point_balance + totalPointsAwarded + bonusAmount;

        // Insert streak bonus transaction
        const { error: streakTxError } = await supabase.from('point_transactions').insert({
          employee_id,
          transaction_type: 'bonus',
          category: 'streak',
          amount: bonusAmount,
          balance_after: newBalance,
          description: `🔥 Weekly Streak Bonus - ตรงเวลาติดต่อกัน ${newStreak} วัน!`,
          metadata: { streak_type: 'weekly', streak_count: newStreak }
        });

        if (streakTxError) {
          logger.error('Error inserting streak bonus transaction', { error: streakTxError });
        } else {
          // Update balance with streak bonus
          const { error: bonusUpdateError } = await supabase
            .from('happy_points')
            .update({
              point_balance: newBalance,
              total_earned: happyPoints.total_earned + totalPointsAwarded + bonusAmount,
              updated_at: new Date().toISOString()
            })
            .eq('id', happyPoints.id);

          if (bonusUpdateError) {
            logger.error('Error updating balance with streak bonus', { error: bonusUpdateError });
          } else {
            streakBonusAwarded = bonusAmount;
            totalPointsAwarded += bonusAmount;

            logger.info('Streak bonus awarded', {
              employee_id,
              bonus_amount: bonusAmount,
              streak: newStreak,
              new_balance: newBalance
            });

            // Send notification if enabled
            if (weeklyStreakRule.notify_enabled) {
              await sendPointNotification(supabase, {
                employeeId: employee_id,
                messageTemplate: weeklyStreakRule.notify_message_template,
                notifyGroup: weeklyStreakRule.notify_group || false,
                notifyDm: weeklyStreakRule.notify_dm || false,
                points: bonusAmount,
                streak: newStreak,
                newBalance
              });
            }
          }
        }
      } else if (existingBonus) {
        logger.info('Streak bonus already awarded today', { employee_id, newStreak });
      }
    }

    logger.info('Points awarded successfully', {
      employee_id,
      points_awarded: totalPointsAwarded,
      streak_bonus: streakBonusAwarded,
      new_balance: happyPoints.point_balance + totalPointsAwarded,
      streak: newStreak
    });

    return new Response(
      JSON.stringify({
        success: true,
        points_awarded: totalPointsAwarded,
        streak_bonus: streakBonusAwarded,
        new_balance: happyPoints.point_balance + totalPointsAwarded,
        streak: newStreak,
        transactions: transactions.length + (streakBonusAwarded > 0 ? 1 : 0)
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