/**
 * Weekly Points Summary
 * 
 * Runs every Friday at 18:00 Bangkok time
 * Sends weekly points summary to all employees
 * 
 * Cron: 0 11 * * 5 (Friday 18:00 Bangkok = 11:00 UTC)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    balance: number;
    attendance_points: number;
    response_points: number;
    streak_points: number;
    health_points: number;
  }
): string {
  let message = template;
  message = message.replace(/{name}/g, data.name);
  message = message.replace(/{points}/g, String(data.points));
  message = message.replace(/{balance}/g, String(data.balance));
  message = message.replace(/{attendance_points}/g, String(data.attendance_points));
  message = message.replace(/{response_points}/g, String(data.response_points));
  message = message.replace(/{streak_points}/g, String(data.streak_points));
  message = message.replace(/{health_points}/g, String(data.health_points));
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
      logger.warn('Unauthorized access attempt to point-weekly-summary');
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

    // Calculate this week's date range (Monday to today)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Handle Sunday
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() - mondayOffset);
    mondayDate.setHours(0, 0, 0, 0);
    const weekStart = mondayDate.toISOString();

    logger.info('Starting weekly summary process', { weekStart });

    const results = {
      weekly_summary_sent: 0,
      errors: [] as any[]
    };

    // Get weekly summary rule
    const { data: summaryRule } = await supabase
      .from('point_rules')
      .select('*')
      .eq('rule_key', 'weekly_summary')
      .maybeSingle();

    if (!summaryRule?.is_active || !summaryRule.notify_enabled) {
      logger.info('Weekly summary is disabled');
      return new Response(
        JSON.stringify({ success: true, message: 'Weekly summary is disabled', ...results }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get include categories from conditions
    const includeCategories = summaryRule.conditions?.include_categories || ['attendance', 'response', 'streak', 'health'];
    
    logger.info('Processing weekly summary notifications', { includeCategories });

    // Get all active employees
    const { data: employees } = await supabase
      .from('employees')
      .select('id, full_name, line_user_id, announcement_group_line_id, branches(line_group_id)')
      .eq('is_active', true);

    for (const employee of employees || []) {
      try {
        // Get this week's transactions
        const { data: transactions } = await supabase
          .from('point_transactions')
          .select('amount, category')
          .eq('employee_id', employee.id)
          .gte('created_at', weekStart);

        // Calculate points by category (only for included categories)
        const categoryPoints = {
          attendance: 0,
          response: 0,
          streak: 0,
          health: 0
        };

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
          .select('point_balance')
          .eq('employee_id', employee.id)
          .maybeSingle();

        // Only send if there are points earned or if we always want to send
        if (totalEarned > 0 || summaryRule.conditions?.send_zero_summary) {
          if (summaryRule.notify_message_template && (summaryRule.notify_dm || summaryRule.notify_group)) {
            const message = formatMessage(summaryRule.notify_message_template, {
              name: employee.full_name || 'พนักงาน',
              points: totalEarned,
              balance: happyPoint?.point_balance || 0,
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
              const sent = await sendLineMessage(accessToken, employee.line_user_id, message);
              if (sent) {
                results.weekly_summary_sent++;
              }
            }
          }
        }

      } catch (error: any) {
        results.errors.push({ 
          employee_id: employee.id, 
          error: error?.message 
        });
      }
    }

    logger.info('Weekly summary process complete', results);

    return new Response(
      JSON.stringify({
        success: true,
        week_start: weekStart,
        ...results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logger.error('Error in point-weekly-summary', { error });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
