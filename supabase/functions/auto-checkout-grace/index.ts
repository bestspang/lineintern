/**
 * ⚠️ CRITICAL AUTO-CHECKOUT GRACE PERIOD - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This edge function handles automatic checkout after grace period expiration.
 * Runs via cron job to close work sessions that exceeded grace period.
 * 
 * INVARIANTS:
 * 1. Uses timezone.ts utilities for ALL Bangkok time operations
 * 2. Compares UTC timestamps directly (not fake Bangkok ISO strings)
 * 3. Checks for existing early_leave checkout before auto-checkout
 * 4. Updates work_session status to 'auto_closed' (not 'completed')
 * 5. Sends LINE notification to both employee and announcement group
 * 
 * COMMON BUGS TO AVOID:
 * - Using getBangkokNow().toISOString() for DB comparison (wrong! use new Date())
 * - Creating duplicate checkouts (check existingCheckout first)
 * - Forgetting to update work_session.checkout_log_id
 * - Missing error handling for LINE push failures
 * 
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * □ All date comparisons use UTC consistently?
 * □ Existing checkout check uses maybeSingle() not single()?
 * □ Work session status updated correctly?
 * □ LINE notifications logged to bot_message_logs?
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { fetchWithRetry } from '../_shared/retry.ts';
import { logger } from '../_shared/logger.ts';
import { logBotMessage } from '../_shared/bot-logger.ts';
import { 
  getBangkokNow, 
  getBangkokDateString, 
  getBangkokStartOfDay,
  getBangkokEndOfDay,
  hasBangkokTimePassed,
  toBangkokTime,
  formatBangkokTime,
  toUTC
} from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret || cronSecret !== expectedSecret) {
    console.error('[auto-checkout-grace] Unauthorized: Invalid or missing CRON_SECRET');
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
    
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
    
    if (!lineAccessToken) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
    }
    
    // ========================================
    // Fetch notification settings (sync with auto-checkout-midnight)
    // ========================================
    const { data: notifySettings } = await supabase
      .from('attendance_settings')
      .select('auto_checkout_notify_dm, auto_checkout_notify_group, auto_checkout_notify_admin_group, admin_line_group_id')
      .eq('scope', 'global')
      .maybeSingle();

    const notifyDM = notifySettings?.auto_checkout_notify_dm ?? true;
    const notifyGroup = notifySettings?.auto_checkout_notify_group ?? true;
    const notifyAdminGroup = notifySettings?.auto_checkout_notify_admin_group ?? false;
    const adminGroupId = notifySettings?.admin_line_group_id;
    
    // ใช้ timezone utility แทนการ manual conversion
    const bangkokNow = getBangkokNow();
    const bangkokDateStr = getBangkokDateString();
    const bangkokStartOfDay = getBangkokStartOfDay();
    const bangkokEndOfDay = getBangkokEndOfDay();
    
    // ⚠️ CRITICAL: Use new Date() with formatBangkokTime - NOT getBangkokNow()!
    logger.info('Starting grace period check (using timezone utility)', { 
      bangkokTime: formatBangkokTime(new Date()),
      bangkokDate: bangkokDateStr,
      utcNow: new Date().toISOString()
    });
    
    // หา active work sessions ที่ครบ grace period แล้ว
    // ✅ FIX: ใช้ UTC time ใน comparison แทนที่จะใช้ "fake Bangkok" ISO string
    const { data: sessions, error } = await supabase
      .from('work_sessions')
      .select(`
        *,
        employees (
          id, full_name, code, line_user_id, 
          announcement_group_line_id,
          hours_per_day, break_hours,
          auto_checkout_grace_period_minutes,
          branch_id,
          working_time_type
        )
      `)
      .eq('status', 'active')
      .not('auto_checkout_grace_expires_at', 'is', null)
      .lte('auto_checkout_grace_expires_at', new Date().toISOString()); // ใช้ UTC consistently
    
    if (error) throw error;
    
    let autoCheckouts = 0;
    let skippedNonHoursBased = 0;
    
    for (const session of sessions || []) {
      const employee = session.employees;
      
      // Safety check: Skip non-hours_based employees
      // (ป้องกัน legacy data ที่อาจมี grace_expires_at แม้เป็น time_based)
      if (employee.working_time_type !== 'hours_based') {
        logger.info('Skipping non-hours_based employee (safety check)', { 
          employeeId: employee.id,
          employeeName: employee.full_name,
          workingTimeType: employee.working_time_type
        });
        
        // Clear invalid grace period for this session
        await supabase
          .from('work_sessions')
          .update({ auto_checkout_grace_expires_at: null })
          .eq('id', session.id);
        
        skippedNonHoursBased++;
        continue;
      }
      
      // ตรวจสอบว่าหมดเวลา grace period แล้วหรือยัง
      if (hasBangkokTimePassed(session.auto_checkout_grace_expires_at)) {
        logger.info('Grace period expired, checking for existing checkout', { 
          employeeId: employee.id,
          graceExpiresAtBangkok: formatBangkokTime(session.auto_checkout_grace_expires_at),
          graceExpiresAtUTC: session.auto_checkout_grace_expires_at
        });
        
        // SAFEGUARD: Check if early leave checkout already exists for today
        // ✅ FIX: ใช้ timezone utilities สำหรับ date boundaries
        const { data: existingCheckout } = await supabase
          .from('attendance_logs')
          .select('id, early_leave_request_id, server_time')
          .eq('employee_id', employee.id)
          .eq('event_type', 'check_out')
          .gte('server_time', bangkokStartOfDay.toISOString())
          .lte('server_time', bangkokEndOfDay.toISOString())
          .not('early_leave_request_id', 'is', null)
          .maybeSingle(); // ✅ FIX: ใช้ maybeSingle แทน single
        
        if (existingCheckout) {
          logger.info('Early leave checkout already exists, updating session to completed', {
            employeeId: employee.id,
            checkoutLogId: existingCheckout.id
          });
          
          // Update session to completed and link to existing checkout
          const checkoutTime = new Date(existingCheckout.server_time);
          const actualStartTime = new Date(session.actual_start_time);
          const totalMinutes = Math.floor((checkoutTime.getTime() - actualStartTime.getTime()) / (1000 * 60));
          const breakMinutes = session.break_minutes || 60;
          const netWorkMinutes = Math.max(0, totalMinutes - breakMinutes);
          
          await supabase
            .from('work_sessions')
            .update({
              checkout_log_id: existingCheckout.id,
              actual_end_time: checkoutTime.toISOString(),
              total_minutes: totalMinutes,
              net_work_minutes: netWorkMinutes,
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', session.id);
          
          logger.info('Session updated to completed', { sessionId: session.id });
          continue; // Skip auto-checkout ส่งข้อความไปแล้วจาก early-leave-approval
        }
        
        // ถ้าไม่มี early leave checkout ให้ทำ auto-checkout ปกติ
        logger.info('Performing auto-checkout', { employeeId: employee.id });
        
        // สร้าง attendance log สำหรับ auto-checkout
        const { data: checkoutLog, error: checkoutError } = await supabase
          .from('attendance_logs')
          .insert({
            employee_id: employee.id,
            event_type: 'check_out',
            server_time: new Date().toISOString(),
            source: 'auto_checkout_grace',
            branch_id: employee.branch_id,
            admin_notes: `Auto checked out after grace period expired at ${formatBangkokTime(session.auto_checkout_grace_expires_at)}`
          })
          .select()
          .single();
        
        if (checkoutError) {
          logger.error('Failed to create checkout log', { error: checkoutError, employeeId: employee.id });
          continue;
        }
        
        // คำนวณเวลาทำงานจริง
        const actualStartTime = new Date(session.actual_start_time);
        const checkoutTime = new Date(checkoutLog.server_time);
        const totalMinutes = Math.floor((checkoutTime.getTime() - actualStartTime.getTime()) / (1000 * 60));
        const breakMinutes = session.break_minutes || 60;
        const netWorkMinutes = Math.max(0, totalMinutes - breakMinutes);
        
        // Update work session
        const { error: updateError } = await supabase
          .from('work_sessions')
          .update({
            checkout_log_id: checkoutLog.id,
            actual_end_time: checkoutTime.toISOString(),
            total_minutes: totalMinutes,
            net_work_minutes: netWorkMinutes,
            status: 'auto_closed',
            updated_at: new Date().toISOString()
          })
          .eq('id', session.id);
        
        if (updateError) {
          logger.error('Failed to update work session', { error: updateError, sessionId: session.id });
          continue;
        }
        
        // ส่งการแจ้งเตือนไป LINE
        const hoursWorked = (netWorkMinutes / 60).toFixed(1);
        
        let message = `🚪 Auto Check-out (Grace Period)\n\n`;
        message += `พนักงาน: ${employee.full_name} (${employee.code})\n`;
        message += `เวลาออก: ${formatBangkokTime(checkoutLog.server_time, 'HH:mm')} น.\n`;
        message += `ชั่วโมงทำงาน: ${hoursWorked} ชม.\n\n`;
        message += `📌 ระบบทำการ check-out อัตโนมัติเนื่องจากพ้นช่วง grace period แล้ว\n`;
        message += `Grace Period หมดเวลา: ${formatBangkokTime(session.auto_checkout_grace_expires_at, 'HH:mm')} น.`;
        
        // ส่งไปพนักงาน (only if enabled in settings)
        if (notifyDM && employee.line_user_id) {
          try {
            await fetchWithRetry('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lineAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: employee.line_user_id,
                messages: [{ type: 'text', text: message }]
              })
            });
            
            // Log bot message
            await logBotMessage({
              destinationType: 'dm',
              destinationId: employee.line_user_id,
              destinationName: employee.full_name,
              messageType: 'notification',
              messageText: message,
              edgeFunctionName: 'auto-checkout-grace',
              recipientEmployeeId: employee.id,
              commandType: 'auto_checkout',
              triggeredBy: 'cron',
              deliveryStatus: 'sent'
            });
            
            logger.info('Auto-checkout notification sent to employee', { 
              employeeId: employee.id,
              lineUserId: employee.line_user_id 
            });
          } catch (error) {
            logger.error('Failed to send notification to employee', { 
              error, 
              employeeId: employee.id 
            });
          }
        }
        
        // ส่งไปกลุ่มประกาศ (only if enabled in settings)
        if (notifyGroup && employee.announcement_group_line_id) {
          try {
            await fetchWithRetry('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lineAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: employee.announcement_group_line_id,
                messages: [{ type: 'text', text: message }]
              })
            });
            
            // Log bot message
            await logBotMessage({
              destinationType: 'group',
              destinationId: employee.announcement_group_line_id,
              destinationName: 'Announcement Group',
              messageType: 'notification',
              messageText: message,
              edgeFunctionName: 'auto-checkout-grace',
              recipientEmployeeId: employee.id,
              commandType: 'auto_checkout',
              triggeredBy: 'cron',
              deliveryStatus: 'sent'
            });
            
            logger.info('Auto-checkout notification sent to announcement group', { 
              employeeId: employee.id,
              groupId: employee.announcement_group_line_id 
            });
          } catch (error) {
            logger.error('Failed to send notification to announcement group', { 
              error, 
              employeeId: employee.id 
            });
          }
        }
        
        // ส่งไป Admin Group (only if enabled and different from announcement group)
        if (notifyAdminGroup && adminGroupId && adminGroupId !== employee.announcement_group_line_id) {
          try {
            let adminMessage = `🚪 Auto Check-out (Grace Period)\n\n`;
            adminMessage += `พนักงาน: ${employee.full_name} (${employee.code})\n`;
            adminMessage += `เวลาออก: ${formatBangkokTime(checkoutLog.server_time, 'HH:mm')} น.\n`;
            adminMessage += `ชั่วโมงทำงาน: ${hoursWorked} ชม.`;
            
            await fetchWithRetry('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lineAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: adminGroupId,
                messages: [{ type: 'text', text: adminMessage }]
              })
            });
            
            // Log bot message
            await logBotMessage({
              destinationType: 'group',
              destinationId: adminGroupId,
              destinationName: 'Admin Group',
              messageType: 'notification',
              messageText: adminMessage,
              edgeFunctionName: 'auto-checkout-grace',
              recipientEmployeeId: employee.id,
              commandType: 'auto_checkout',
              triggeredBy: 'cron',
              deliveryStatus: 'sent'
            });
            
            logger.info('Auto-checkout notification sent to admin group', { 
              employeeId: employee.id,
              adminGroupId 
            });
          } catch (error) {
            logger.error('Failed to send notification to admin group', { 
              error, 
              employeeId: employee.id 
            });
          }
        }
        
        autoCheckouts++;
        logger.info('Auto-checkout completed successfully', { 
          employeeId: employee.id,
          sessionId: session.id 
        });
      }
    }
    
    // ⚠️ CRITICAL: Use new Date() with formatBangkokTime - NOT getBangkokNow()!
    logger.info('Grace period check completed', { 
      autoCheckouts,
      skippedNonHoursBased,
      totalSessions: sessions?.length || 0,
      bangkokTime: formatBangkokTime(new Date())
    });
    
    return new Response(
      JSON.stringify({
        success: true,
        autoCheckouts,
        skippedNonHoursBased,
        totalSessions: sessions?.length || 0,
        checkedAt: formatBangkokTime(new Date())
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Error in auto-checkout-grace', { error: errorMessage });
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
