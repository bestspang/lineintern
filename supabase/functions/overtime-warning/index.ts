/**
 * ⚠️ CRITICAL OVERTIME WARNING SYSTEM - DO NOT MODIFY WITHOUT REVIEW
 * 
 * This edge function sends OT warnings to employees approaching/exceeding work hours.
 * Runs via cron job every 15 minutes during work hours.
 * 
 * INVARIANTS:
 * 1. Uses timezone.ts utilities for Bangkok date boundaries
 * 2. Calculates max work hours based on working_time_type (hours_based vs time_based)
 * 3. Warning sent at (maxWorkHours - warningMinutes) threshold
 * 4. Prevents duplicate warnings by checking attendance_reminders table
 * 5. Different messages for auto_ot_enabled true vs false
 * 
 * COMMON BUGS TO AVOID:
 * - Using local time instead of UTC for DB queries
 * - Wrong max hours for hours_based employees (should be hours_per_day + break)
 * - Missing check for existing checkout (employee already left)
 * - Duplicate warnings (always check attendance_reminders first)
 * 
 * VALIDATION CHECKLIST FOR AI MODIFICATIONS:
 * □ Date boundaries use getBangkokStartOfDay/EndOfDay?
 * □ Max work hours calculated correctly for both employee types?
 * □ Existing warning check includes both 'ot_warning' and 'ot_exceeded'?
 * □ LINE message format is correct Thai?
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';
import { fetchWithRetry } from '../_shared/retry.ts';
import { getBangkokDateString, formatBangkokTime, getBangkokStartOfDay, getBangkokEndOfDay } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret || cronSecret !== expectedSecret) {
    console.error('[overtime-warning] Unauthorized: Invalid or missing CRON_SECRET');
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

    logger.info('Starting OT warning check');

    const today = getBangkokDateString();
    const now = new Date();
    const startOfDay = getBangkokStartOfDay();
    const endOfDay = getBangkokEndOfDay();
    console.log(`[overtime-warning] Current time (Bangkok): ${formatBangkokTime(now)}, date range: ${startOfDay.toISOString()} - ${endOfDay.toISOString()}`);

    // Get all employees who are currently checked in
    // FIX: Use proper UTC boundaries for Bangkok day
    const { data: currentlyCheckedIn, error: fetchError } = await supabase
      .from('attendance_logs')
      .select(`
        employee_id,
        server_time,
        employees (
          id,
          full_name,
          code,
          line_user_id,
          max_work_hours_per_day,
          ot_warning_minutes,
          auto_ot_enabled,
          hours_per_day,
          break_hours,
          working_time_type,
          shift_end_time
        )
      `)
      .eq('event_type', 'check_in')
      .gte('server_time', startOfDay.toISOString())
      .lte('server_time', endOfDay.toISOString())
      .order('server_time', { ascending: false });

    if (fetchError) {
      console.error('[overtime-warning] Error fetching checked in employees:', fetchError);
      throw fetchError;
    }

    if (!currentlyCheckedIn || currentlyCheckedIn.length === 0) {
      console.log('[overtime-warning] No employees currently checked in');
      return new Response(
        JSON.stringify({ success: true, warnings_sent: 0, message: 'No employees checked in' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group by employee and get latest check-in
    const employeeCheckIns = new Map();
    for (const log of currentlyCheckedIn) {
      const empId = log.employee_id;
      if (!employeeCheckIns.has(empId) || new Date(log.server_time) > new Date(employeeCheckIns.get(empId).server_time)) {
        employeeCheckIns.set(empId, log);
      }
    }

    // Check each employee for checkout status and work hours
    let warningsSent = 0;
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');

    for (const [empId, checkInLog] of employeeCheckIns) {
      const employee = checkInLog.employees;
      if (!employee || !employee.line_user_id) continue;

      // Check if they have checked out after this check-in
      // FIX: Use proper UTC boundaries for Bangkok day
      const { data: checkOuts } = await supabase
        .from('attendance_logs')
        .select('server_time')
        .eq('employee_id', empId)
        .eq('event_type', 'check_out')
        .gt('server_time', checkInLog.server_time)
        .gte('server_time', startOfDay.toISOString())
        .order('server_time', { ascending: false })
        .limit(1);

      // If already checked out, skip
      if (checkOuts && checkOuts.length > 0) {
        continue;
      }

      // Calculate work hours so far (both times are in UTC)
      const checkInTime = new Date(checkInLog.server_time);
      const hoursWorked = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
      
      console.log(`[overtime-warning] ${employee.full_name}: check-in=${checkInTime.toISOString()}, now=${now.toISOString()}, hours=${hoursWorked.toFixed(2)}`);

      // Calculate max work hours based on employee type
      let maxWorkHours: number;
      
      if (employee.working_time_type === 'hours_based') {
        // For hours_based: max hours = hours_per_day + break_hours (total expected time)
        const hoursPerDay = employee.hours_per_day || 8;
        const breakHours = 1; // Default break hours (not stored in employee select)
        maxWorkHours = hoursPerDay + breakHours;
      } else {
        // For time_based: use max_work_hours_per_day or default 8
        maxWorkHours = employee.max_work_hours_per_day || 8;
      }
      
      const warningMinutes = employee.ot_warning_minutes || 15;
      const warningThresholdHours = maxWorkHours - (warningMinutes / 60);

      console.log(`[overtime-warning] Employee ${employee.full_name} (${employee.working_time_type}): worked ${hoursWorked.toFixed(2)}h, max ${maxWorkHours}h, warning at ${warningThresholdHours.toFixed(2)}h`);

      // Check if approaching max hours (within warning threshold)
      if (hoursWorked >= warningThresholdHours && hoursWorked < maxWorkHours) {
        // Check if we already sent warning today
        const { data: existingWarnings } = await supabase
          .from('attendance_reminders')
          .select('id')
          .eq('employee_id', empId)
          .eq('reminder_type', 'ot_warning')
          .eq('reminder_date', today)
          .eq('status', 'sent');

        if (existingWarnings && existingWarnings.length > 0) {
          console.log(`[overtime-warning] Warning already sent to ${employee.full_name} today`);
          continue;
        }

        const minutesLeft = Math.round((maxWorkHours - hoursWorked) * 60);
        const overtimeStart = new Date(checkInTime.getTime() + maxWorkHours * 60 * 60 * 1000);
        const overtimeStartTime = formatBangkokTime(overtimeStart, 'HH:mm');

        let message = `⚠️ แจ้งเตือน: ใกล้ครบเวลาทำงาน\n\n`;
        message += `👤 คุณ ${employee.full_name}\n`;
        message += `⏰ คุณทำงานมาแล้ว ${hoursWorked.toFixed(1)} ชั่วโมง\n`;
        message += `⏳ อีก ${minutesLeft} นาที จะครบเวลาทำงานปกติ (${maxWorkHours} ชม.)\n\n`;

        if (employee.auto_ot_enabled) {
          message += `✅ OT อัตโนมัติ: เปิดใช้งาน\n`;
          message += `หลังเวลา ${overtimeStartTime} จะนับเป็น OT อัตโนมัติ\n\n`;
          message += `💡 หากเลิกงานแล้ว อย่าลืม Check Out นะครับ!`;
        } else {
          message += `❌ OT อัตโนมัติ: ปิดใช้งาน\n`;
          message += `หากต้องการทำ OT กรุณาแจ้งหัวหน้าเพื่อขออนุมัติก่อน\n`;
          message += `ไม่เช่นนั้นระบบจะ Check Out อัตโนมัติเมื่อถึงเวลา\n\n`;
          message += `💬 พิมพ์ "/ot [เหตุผล]" เพื่อขออนุมัติ OT`;
        }

        // Send LINE notification with retry
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
                messages: [{
                  type: 'text',
                  text: message
                }]
              })
            },
            { maxRetries: 2 }
          );
        } catch (error) {
          logger.error(`Failed to send OT warning to ${employee.full_name}`, error);
          continue;
        }

        // Log the reminder
        await supabase
          .from('attendance_reminders')
          .insert({
            employee_id: empId,
            reminder_type: 'ot_warning',
            reminder_date: today,
            scheduled_time: now.toISOString(),
            notification_type: 'private',
            status: 'sent',
            sent_at: now.toISOString()
          });

        warningsSent++;
        console.log(`[overtime-warning] Warning sent to ${employee.full_name}`);
      }
      
      // Check if already exceeded max hours (send urgent warning)
      else if (hoursWorked >= maxWorkHours) {
        // Check if we already sent overtime exceeded warning today
        const { data: existingExceeded } = await supabase
          .from('attendance_reminders')
          .select('id')
          .eq('employee_id', empId)
          .eq('reminder_type', 'ot_exceeded')
          .eq('reminder_date', today)
          .eq('status', 'sent');

        if (existingExceeded && existingExceeded.length > 0) {
          continue;
        }

        const overtimeHours = (hoursWorked - maxWorkHours).toFixed(1);
        
        let message = `🚨 แจ้งเตือนด่วน: เกินเวลาทำงานแล้ว!\n\n`;
        message += `👤 คุณ ${employee.full_name}\n`;
        message += `⏰ คุณทำงานมาแล้ว ${hoursWorked.toFixed(1)} ชั่วโมง\n`;
        message += `⚠️ เกินเวลาทำงานปกติไปแล้ว ${overtimeHours} ชั่วโมง\n\n`;

        if (employee.auto_ot_enabled) {
          message += `✅ เวลาเกินจะนับเป็น OT อัตโนมัติ\n`;
          message += `💰 OT: ${overtimeHours} ชั่วโมง\n\n`;
          message += `หากเลิกงานแล้ว กรุณา Check Out ด่วน!`;
        } else {
          message += `❌ ไม่ได้รับอนุมัติ OT\n`;
          message += `กรุณา Check Out หรือแจ้งหัวหน้าเพื่อขออนุมัติ OT\n\n`;
          message += `⚠️ หากไม่ได้อนุมัติ เวลาเกินอาจไม่ได้รับค่าตอบแทน`;
        }

        // Send urgent LINE notification with retry
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
                messages: [{
                  type: 'text',
                  text: message
                }]
              })
            },
            { maxRetries: 2 }
          );
        } catch (error) {
          logger.error(`Failed to send OT exceeded warning to ${employee.full_name}`, error);
        }

        // Log the reminder
        await supabase
          .from('attendance_reminders')
          .insert({
            employee_id: empId,
            reminder_type: 'ot_exceeded',
            reminder_date: today,
            scheduled_time: now.toISOString(),
            notification_type: 'private',
            status: 'sent',
            sent_at: now.toISOString()
          });

        warningsSent++;
        console.log(`[overtime-warning] Overtime exceeded warning sent to ${employee.full_name}`);
      }
    }

    console.log(`[overtime-warning] Completed: ${warningsSent} warnings sent`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        warnings_sent: warningsSent,
        checked_employees: employeeCheckIns.size
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[overtime-warning] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
