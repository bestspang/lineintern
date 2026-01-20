/**
 * Monthly Points Summary & Streak Bonus
 * 
 * Runs on the last day of each month at 19:00 Bangkok time
 * 
 * Tasks:
 * 1. Award Monthly Streak Bonus to employees with 20+ day streaks
 * 2. Send monthly points summary to all employees
 * 
 * Cron: 0 12 L * * (Last day of month, 19:00 Bangkok = 12:00 UTC)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

/**
 * Send LINE message (push)
 */
async function sendLineMessage(
  accessToken: string,
  to: string,
  message: string
): Promise<boolean> {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        to,
        messages: [{ type: 'text', text: message }]
      })
    });
    return response.ok;
  } catch (error) {
    logger.error('Error sending LINE message', { error });
    return false;
  }
}

/**
 * Replace template variables with actual values
 */
function formatMessage(
  template: string,
  data: {
    name: string;
    points: number;
    streak: number;
    balance: number;
    month: string;
    attendance_points?: number;
    response_points?: number;
    streak_points?: number;
    health_points?: number;
  }
): string {
  let message = template;
  message = message.replace(/{name}/g, data.name);
  message = message.replace(/{points}/g, String(data.points));
  message = message.replace(/{streak}/g, String(data.streak));
  message = message.replace(/{balance}/g, String(data.balance));
  message = message.replace(/{month}/g, data.month);
  message = message.replace(/{attendance_points}/g, String(data.attendance_points || 0));
  message = message.replace(/{response_points}/g, String(data.response_points || 0));
  message = message.replace(/{streak_points}/g, String(data.streak_points || 0));
  message = message.replace(/{health_points}/g, String(data.health_points || 0));
  return message;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // CRON_SECRET validation
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret || cronSecret !== expectedSecret) {
      logger.warn('Unauthorized access attempt to point-monthly-summary');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const accessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!accessToken) {
      logger.error('LINE_CHANNEL_ACCESS_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'LINE token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current month info
    const now = new Date();
    const currentMonth = THAI_MONTHS[now.getMonth()];
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    logger.info('Starting monthly summary process', { month: currentMonth });

    const results = {
      monthly_streak_awarded: 0,
      monthly_summary_sent: 0,
      errors: [] as any[]
    };

    // =====================================
    // PART 1: Award Monthly Streak Bonus
    // =====================================
    
    const { data: monthlyStreakRule } = await supabase
      .from('point_rules')
      .select('*')
      .eq('rule_key', 'streak_monthly')
      .maybeSingle();

    if (monthlyStreakRule?.is_active && monthlyStreakRule.timing_mode === 'end_of_month') {
      const minStreak = monthlyStreakRule.conditions?.min_streak || 20;
      const bonusAmount = monthlyStreakRule.points || 100;

      logger.info('Processing monthly streak bonus', { minStreak, bonusAmount });

      // Find employees with qualifying streaks
      const { data: qualifyingEmployees } = await supabase
        .from('happy_points')
        .select('id, employee_id, point_balance, total_earned, current_punctuality_streak')
        .gte('current_punctuality_streak', minStreak);

      for (const hp of qualifyingEmployees || []) {
        try {
          // Check if already awarded this month
          const { data: existingBonus } = await supabase
            .from('point_transactions')
            .select('id')
            .eq('employee_id', hp.employee_id)
            .eq('category', 'streak')
            .gte('created_at', firstDayOfMonth)
            .ilike('description', '%Monthly%')
            .maybeSingle();

          if (existingBonus) {
            logger.info('Monthly streak already awarded', { employee_id: hp.employee_id });
            continue;
          }

          const newBalance = hp.point_balance + bonusAmount;

          // Award bonus
          await supabase.from('point_transactions').insert({
            employee_id: hp.employee_id,
            transaction_type: 'bonus',
            category: 'streak',
            amount: bonusAmount,
            balance_after: newBalance,
            description: `🏆 Monthly Perfect Attendance - ${hp.current_punctuality_streak} days streak!`,
            metadata: {
              streak_type: 'monthly',
              streak_count: hp.current_punctuality_streak,
              month: currentMonth,
              source: 'monthly_cron'
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

          results.monthly_streak_awarded++;

          // Send notification
          if (monthlyStreakRule.notify_enabled && monthlyStreakRule.notify_message_template) {
            const { data: employee } = await supabase
              .from('employees')
              .select('full_name, line_user_id, announcement_group_line_id, branches(line_group_id)')
              .eq('id', hp.employee_id)
              .maybeSingle();

            if (employee) {
              const message = formatMessage(monthlyStreakRule.notify_message_template, {
                name: employee.full_name || 'พนักงาน',
                points: bonusAmount,
                streak: hp.current_punctuality_streak,
                balance: newBalance,
                month: currentMonth
              });

              // Send to group
              if (monthlyStreakRule.notify_group) {
                const branchData = Array.isArray(employee.branches) ? employee.branches[0] : employee.branches;
                const branchGroupId = branchData?.line_group_id;
                const groupId = employee.announcement_group_line_id || branchGroupId;
                if (groupId) {
                  await sendLineMessage(accessToken, groupId, message);
                }
              }

              // Send DM
              if (monthlyStreakRule.notify_dm && employee.line_user_id) {
                await sendLineMessage(accessToken, employee.line_user_id, message);
              }
            }
          }

          logger.info('Monthly streak bonus awarded', { 
            employee_id: hp.employee_id, 
            amount: bonusAmount,
            streak: hp.current_punctuality_streak 
          });

        } catch (error: any) {
          results.errors.push({ 
            type: 'monthly_streak', 
            employee_id: hp.employee_id, 
            error: error?.message 
          });
        }
      }
    }

    // =====================================
    // PART 2: Send Monthly Points Summary
    // =====================================
    
    const { data: summaryRule } = await supabase
      .from('point_rules')
      .select('*')
      .eq('rule_key', 'monthly_summary')
      .maybeSingle();

    if (summaryRule?.is_active && summaryRule.notify_enabled) {
      logger.info('Processing monthly summary notifications');

      // Get all active employees with happy_points
      const { data: employees } = await supabase
        .from('employees')
        .select('id, full_name, line_user_id, announcement_group_line_id, branches(line_group_id)')
        .eq('is_active', true);

      for (const employee of employees || []) {
        try {
        // Get include categories from conditions
        const includeCategories = summaryRule.conditions?.include_categories || ['attendance', 'response', 'streak', 'health'];

        // Get this month's transactions
        const { data: transactions } = await supabase
          .from('point_transactions')
          .select('amount, category')
          .eq('employee_id', employee.id)
          .gte('created_at', firstDayOfMonth);

        // Calculate points by category
        const categoryPoints = { attendance: 0, response: 0, streak: 0, health: 0 };
        for (const t of transactions || []) {
          if (t.amount > 0 && categoryPoints.hasOwnProperty(t.category)) {
            categoryPoints[t.category as keyof typeof categoryPoints] += t.amount;
          }
        }

        // Calculate total (only from included categories)
        let totalEarned = 0;
        for (const cat of includeCategories) {
          totalEarned += categoryPoints[cat as keyof typeof categoryPoints] || 0;
        }

        // Get current balance
        const { data: happyPoint } = await supabase
          .from('happy_points')
          .select('point_balance, current_punctuality_streak')
          .eq('employee_id', employee.id)
          .maybeSingle();

        if (summaryRule.notify_message_template && (summaryRule.notify_dm || summaryRule.notify_group)) {
          const message = formatMessage(summaryRule.notify_message_template, {
            name: employee.full_name || 'พนักงาน',
            points: totalEarned,
            streak: happyPoint?.current_punctuality_streak || 0,
            balance: happyPoint?.point_balance || 0,
            month: currentMonth,
            attendance_points: includeCategories.includes('attendance') ? categoryPoints.attendance : 0,
            response_points: includeCategories.includes('response') ? categoryPoints.response : 0,
            streak_points: includeCategories.includes('streak') ? categoryPoints.streak : 0,
            health_points: includeCategories.includes('health') ? categoryPoints.health : 0,
          });

            // Send to group
            if (summaryRule.notify_group) {
              const branchData = Array.isArray(employee.branches) ? employee.branches[0] : employee.branches;
              const branchGroupId = branchData?.line_group_id;
              const groupId = employee.announcement_group_line_id || branchGroupId;
              if (groupId) {
                await sendLineMessage(accessToken, groupId, message);
              }
            }

            // Send DM
            if (summaryRule.notify_dm && employee.line_user_id) {
              await sendLineMessage(accessToken, employee.line_user_id, message);
              results.monthly_summary_sent++;
            }
          }

        } catch (error: any) {
          results.errors.push({ 
            type: 'summary', 
            employee_id: employee.id, 
            error: error?.message 
          });
        }
      }
    }

    logger.info('Monthly summary process complete', results);

    return new Response(
      JSON.stringify({
        success: true,
        month: currentMonth,
        ...results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logger.error('Error in point-monthly-summary', { error });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});