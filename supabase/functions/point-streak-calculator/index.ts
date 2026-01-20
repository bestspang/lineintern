/**
 * ⚠️ HAPPY POINT SYSTEM - Streak Bonus Calculator (Backup Cron Job)
 * 
 * This cron job serves as a BACKUP to the real-time streak bonus in point-attendance-calculator.
 * The real-time system awards bonuses immediately when a streak milestone is reached.
 * This cron runs to catch any missed bonuses due to server errors.
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
  if (!options.messageTemplate) return;

  try {
    const { data: employee } = await supabase
      .from('employees')
      .select('full_name, line_user_id, announcement_group_line_id, branch:branches(line_group_id)')
      .eq('id', options.employeeId)
      .maybeSingle();

    if (!employee) return;

    let message = options.messageTemplate;
    message = message.replace(/{name}/g, employee.full_name || 'พนักงาน');
    message = message.replace(/{points}/g, String(options.points));
    message = message.replace(/{balance}/g, String(options.newBalance));
    message = message.replace(/{streak}/g, String(options.streak));

    const accessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!accessToken) return;

    // Send to group
    if (options.notifyGroup) {
      const groupId = employee.announcement_group_line_id || employee.branch?.line_group_id;
      if (groupId) {
        await fetch('https://api.line.me/v2/bot/message/push', {
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
      }
    }

    // Send DM
    if (options.notifyDm && employee.line_user_id) {
      await fetch('https://api.line.me/v2/bot/message/push', {
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
    }

    logger.info('Streak notification sent', {
      employee_id: options.employeeId,
      notify_group: options.notifyGroup,
      notify_dm: options.notifyDm
    });
  } catch (error: any) {
    logger.error('Error sending streak notification', { error: error?.message });
  }
}

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

    // Monthly processing is now handled by point-monthly-summary function
    if (isMonthly) {
      logger.info('Monthly streak processing delegated to point-monthly-summary');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Monthly processing handled by point-monthly-summary function',
          processed: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Processing weekly streak bonuses (backup cron)');

    // Fetch point rules from database (include notification settings)
    const ruleKey = isMonthly ? 'streak_monthly' : 'streak_weekly';
    const { data: streakRule } = await supabase
      .from('point_rules')
      .select('points, is_active, conditions, notify_enabled, notify_message_template, notify_group, notify_dm')
      .eq('rule_key', ruleKey)
      .maybeSingle();

    // Check if rule is active
    if (streakRule && !streakRule.is_active) {
      logger.info(`Streak rule ${ruleKey} is disabled`);
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'Rule is disabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get values from DB or use defaults
    const defaultMinStreak = isMonthly ? 20 : 5;
    const defaultBonusAmount = isMonthly ? 100 : 50;
    const minStreak = streakRule?.conditions?.min_streak || defaultMinStreak;
    const bonusAmount = streakRule?.points || defaultBonusAmount;
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
        // Check if already awarded this period (week or month)
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
          // Already awarded (either by real-time or previous cron run)
          logger.info('Streak bonus already awarded this period (likely by real-time)', { 
            employee_id: hp.employee_id 
          });
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
            streak_count: hp.current_punctuality_streak,
            source: 'backup_cron'
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
        logger.info('Streak bonus awarded (backup cron)', {
          employee_id: hp.employee_id,
          amount: bonusAmount,
          streak: hp.current_punctuality_streak
        });

        // Send notification if enabled
        if (streakRule?.notify_enabled) {
          await sendPointNotification(supabase, {
            employeeId: hp.employee_id,
            messageTemplate: streakRule.notify_message_template,
            notifyGroup: streakRule.notify_group || false,
            notifyDm: streakRule.notify_dm || false,
            points: bonusAmount,
            streak: hp.current_punctuality_streak,
            newBalance
          });
        }

      } catch (err: any) {
        errors.push({ employee_id: hp.employee_id, error: err?.message || 'Unknown error' });
      }
    }

    logger.info(`Streak bonuses complete (backup cron)`, { processed: successCount, errors: errors.length });

    return new Response(
      JSON.stringify({
        success: true,
        processed: successCount,
        bonus_amount: bonusAmount,
        type: isMonthly ? 'monthly' : 'weekly',
        source: 'backup_cron',
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