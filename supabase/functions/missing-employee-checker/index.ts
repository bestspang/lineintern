import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';
import { fetchWithRetry } from '../_shared/retry.ts';
import { getBangkokNow, formatBangkokTime, getBangkokDateString } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Missing Employee Checker
 * 
 * Runs every 30 minutes to detect employees who:
 * 1. Checked in but haven't checked out
 * 2. Have exceeded their expected work duration + grace period
 * 
 * Actions:
 * - Level 1 (1hr overdue): Send reminder to employee
 * - Level 2 (2hr overdue): Notify admin
 * - Level 3 (3hr overdue): Flag as suspicious absence
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret || cronSecret !== expectedSecret) {
    console.error('[missing-employee-checker] Unauthorized: Invalid or missing CRON_SECRET');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const now = getBangkokNow();
    const today = getBangkokDateString();
    
    logger.info('[missing-employee-checker] Starting check', { date: today, time: formatBangkokTime(now) });

    // Get all active work sessions for hours_based employees
    const { data: activeSessions, error: fetchError } = await supabase
      .from('work_sessions')
      .select(`
        id,
        employee_id,
        work_date,
        actual_start_time,
        break_minutes,
        missing_warning_sent_at,
        admin_notified_at,
        is_suspicious_absence,
        missing_check_count,
        employees (
          id,
          full_name,
          code,
          line_user_id,
          hours_per_day,
          break_hours,
          working_time_type,
          auto_checkout_grace_period_minutes,
          announcement_group_line_id,
          branch:branches (
            id,
            name,
            line_group_id
          )
        )
      `)
      .eq('status', 'active')
      .eq('work_date', today);

    if (fetchError) {
      throw fetchError;
    }

    if (!activeSessions || activeSessions.length === 0) {
      logger.info('[missing-employee-checker] No active sessions found');
      return new Response(
        JSON.stringify({ success: true, checked: 0, warnings: 0, message: 'No active sessions' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let warningsSent = 0;
    let adminsNotified = 0;
    let flaggedAsSuspicious = 0;
    
    for (const session of activeSessions) {
      const employee = session.employees as any;
      if (!employee) continue;
      
      // Only check hours_based employees for missing detection
      if (employee.working_time_type !== 'hours_based') continue;
      
      const checkInTime = new Date(session.actual_start_time);
      const hoursPerDay = employee.hours_per_day || 8;
      const breakHours = employee.break_hours || 1;
      const gracePeriodMinutes = employee.auto_checkout_grace_period_minutes || 60;
      
      // Expected work duration in minutes
      const expectedWorkMinutes = (hoursPerDay + breakHours) * 60;
      const actualElapsedMinutes = (now.getTime() - checkInTime.getTime()) / (1000 * 60);
      
      // Calculate overdue time
      const overdueMinutes = actualElapsedMinutes - expectedWorkMinutes - gracePeriodMinutes;
      
      // Skip if not yet overdue
      if (overdueMinutes <= 0) continue;
      
      const overdueHours = overdueMinutes / 60;
      
      logger.info(`[missing-employee-checker] Employee ${employee.full_name}: overdue ${overdueHours.toFixed(1)}h`, {
        session_id: session.id,
        check_in: checkInTime.toISOString(),
        expected_minutes: expectedWorkMinutes,
        actual_minutes: actualElapsedMinutes
      });
      
      // Update check count
      await supabase
        .from('work_sessions')
        .update({ 
          missing_check_count: (session.missing_check_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.id);
      
      // Level 1: Send warning to employee (1+ hour overdue)
      if (overdueHours >= 1 && !session.missing_warning_sent_at && employee.line_user_id) {
        const expectedCheckoutTime = new Date(checkInTime.getTime() + expectedWorkMinutes * 60 * 1000);
        
        const message = `⚠️ แจ้งเตือน: ยังไม่ได้ Check-out\n\n` +
          `👤 คุณ ${employee.full_name}\n` +
          `⏰ Check-in เมื่อ: ${formatBangkokTime(checkInTime, 'HH:mm')}\n` +
          `📋 ควร Check-out เวลา: ${formatBangkokTime(expectedCheckoutTime, 'HH:mm')}\n` +
          `⏳ เลยเวลาไปแล้ว: ${overdueHours.toFixed(1)} ชั่วโมง\n\n` +
          `❓ หากคุณยังอยู่ที่ทำงาน กรุณา Check-out\n` +
          `❓ หากลืม Check-out กรุณาติดต่อหัวหน้างาน`;
        
        try {
          await fetchWithRetry(
            'https://api.line.me/v2/bot/message/push',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lineAccessToken}`
              },
              body: JSON.stringify({
                to: employee.line_user_id,
                messages: [{ type: 'text', text: message }]
              })
            },
            { maxRetries: 2 }
          );
          
          await supabase
            .from('work_sessions')
            .update({ missing_warning_sent_at: now.toISOString() })
            .eq('id', session.id);
          
          warningsSent++;
          logger.info(`[missing-employee-checker] Warning sent to ${employee.full_name}`);
        } catch (error) {
          logger.error(`[missing-employee-checker] Failed to send warning to ${employee.full_name}`, error);
        }
      }
      
      // Level 2: Notify admin (2+ hours overdue)
      if (overdueHours >= 2 && !session.admin_notified_at) {
        // Get admin notification target (branch group or employee's announcement group)
        const adminGroupId = employee.branch?.line_group_id || employee.announcement_group_line_id;
        
        if (adminGroupId) {
          const adminMessage = `🚨 แจ้งเตือน: พนักงานอาจหายไป\n\n` +
            `👤 ${employee.full_name} (${employee.code})\n` +
            `🏢 สาขา: ${employee.branch?.name || 'N/A'}\n` +
            `⏰ Check-in เมื่อ: ${formatBangkokTime(checkInTime, 'HH:mm')}\n` +
            `⏳ เลยเวลา Check-out ไปแล้ว: ${overdueHours.toFixed(1)} ชั่วโมง\n` +
            `❌ ยังไม่ได้ Check-out และไม่ตอบสนอง\n\n` +
            `กรุณาตรวจสอบ หรือ Admin Checkout ผ่านระบบ`;
          
          try {
            await fetchWithRetry(
              'https://api.line.me/v2/bot/message/push',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${lineAccessToken}`
                },
                body: JSON.stringify({
                  to: adminGroupId,
                  messages: [{ type: 'text', text: adminMessage }]
                })
              },
              { maxRetries: 2 }
            );
            
            await supabase
              .from('work_sessions')
              .update({ admin_notified_at: now.toISOString() })
              .eq('id', session.id);
            
            adminsNotified++;
            logger.info(`[missing-employee-checker] Admin notified for ${employee.full_name}`);
          } catch (error) {
            logger.error(`[missing-employee-checker] Failed to notify admin for ${employee.full_name}`, error);
          }
        }
      }
      
      // Level 3: Flag as suspicious absence (3+ hours overdue)
      if (overdueHours >= 3 && !session.is_suspicious_absence) {
        await supabase
          .from('work_sessions')
          .update({ 
            is_suspicious_absence: true,
            updated_at: now.toISOString()
          })
          .eq('id', session.id);
        
        flaggedAsSuspicious++;
        logger.warn(`[missing-employee-checker] Flagged ${employee.full_name} as suspicious absence`);
        
        // Log to bot_message_logs for tracking
        await supabase
          .from('bot_message_logs')
          .insert({
            edge_function_name: 'missing-employee-checker',
            destination_type: 'system',
            destination_id: 'internal',
            message_type: 'system',
            message_text: `Suspicious absence flagged: ${employee.full_name} (${employee.code}), overdue ${overdueHours.toFixed(1)}h`,
            triggered_by: 'cron'
          });
      }
    }

    const result = {
      success: true,
      checked: activeSessions.length,
      warnings_sent: warningsSent,
      admins_notified: adminsNotified,
      flagged_suspicious: flaggedAsSuspicious,
      timestamp: formatBangkokTime(now)
    };
    
    logger.info('[missing-employee-checker] Completed', result);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[missing-employee-checker] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
