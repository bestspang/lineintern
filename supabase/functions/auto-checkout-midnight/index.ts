import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';
import { fetchWithRetry } from '../_shared/retry.ts';
import { getBangkokDateString, formatBangkokTime, getBangkokStartOfDay, getBangkokEndOfDay } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ✅ Helper function to check if a date is a holiday
async function checkIfHoliday(supabase: any, dateString: string, branchId?: string | null): Promise<boolean> {
  try {
    const monthDay = dateString.slice(5); // "MM-DD"
    
    const { data: holidays, error } = await supabase
      .from('holidays')
      .select('id, name, date, is_recurring, branch_id')
      .or(`date.eq.${dateString},and(is_recurring.eq.true,date.ilike.%-${monthDay})`)
      .or(`branch_id.is.null,branch_id.eq.${branchId || 'null'}`);
    
    if (error) {
      console.warn('[checkIfHoliday] Error:', error);
      return false;
    }
    
    return holidays && holidays.length > 0;
  } catch (e) {
    console.warn('[checkIfHoliday] Unexpected error:', e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret || cronSecret !== expectedSecret) {
    console.error('[auto-checkout-midnight] Unauthorized: Invalid or missing CRON_SECRET');
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

    logger.info('Starting auto checkout process');

    const now = new Date();
    const today = getBangkokDateString(now);
    
    // Get the date we're checking (yesterday if it's just past midnight)
    const bangkokHour = parseInt(formatBangkokTime(now, 'HH'));
    const targetDate = bangkokHour < 2 
      ? getBangkokDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000))
      : today;

    // FIX: Use proper UTC boundaries for Bangkok target date
    const targetDateObj = new Date(`${targetDate}T12:00:00+07:00`);
    const startOfTargetDay = getBangkokStartOfDay(targetDateObj);
    const endOfTargetDay = getBangkokEndOfDay(targetDateObj);

    console.log(`[auto-checkout-midnight] Checking date: ${targetDate}, range: ${startOfTargetDay.toISOString()} - ${endOfTargetDay.toISOString()}`);

    // Get all check-ins from target date that haven't been checked out
    const { data: checkIns, error: fetchError } = await supabase
      .from('attendance_logs')
      .select(`
        id,
        employee_id,
        server_time,
        employees (
          id,
          full_name,
          code,
          line_user_id,
          auto_ot_enabled,
          max_work_hours_per_day,
          ot_rate_multiplier,
          holiday_ot_rate_multiplier,
          hours_per_day,
          salary_per_month,
          announcement_group_line_id,
          branches:branches!employees_branch_id_fkey (
            id,
            name,
            line_group_id
          )
        )
      `)
      .eq('event_type', 'check_in')
      .gte('server_time', startOfTargetDay.toISOString())
      .lt('server_time', endOfTargetDay.toISOString())
      .order('server_time', { ascending: false });

    if (fetchError) {
      console.error('[auto-checkout-midnight] Error fetching check-ins:', fetchError);
      throw fetchError;
    }

    if (!checkIns || checkIns.length === 0) {
      console.log('[auto-checkout-midnight] No check-ins found for target date');
      return new Response(
        JSON.stringify({ success: true, auto_checkouts: 0, message: 'No check-ins to process' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group by employee and get latest check-in
    const latestCheckIns = new Map();
    for (const log of checkIns) {
      const empId = log.employee_id;
      if (!latestCheckIns.has(empId) || new Date(log.server_time) > new Date(latestCheckIns.get(empId).server_time)) {
        latestCheckIns.set(empId, log);
      }
    }

    const employeeIds = Array.from(latestCheckIns.keys());
    
    // ✅ FIX N+1: Batch fetch ALL checkouts for ALL employees at once
    // FIX: Use proper UTC boundaries for Bangkok target date
    const { data: allCheckOuts } = await supabase
      .from('attendance_logs')
      .select('employee_id, server_time')
      .in('employee_id', employeeIds)
      .eq('event_type', 'check_out')
      .gte('server_time', startOfTargetDay.toISOString())
      .order('server_time', { ascending: false });
    
    // Group checkouts by employee
    const checkOutsByEmployee = new Map();
    if (allCheckOuts) {
      for (const checkout of allCheckOuts) {
        if (!checkOutsByEmployee.has(checkout.employee_id)) {
          checkOutsByEmployee.set(checkout.employee_id, []);
        }
        checkOutsByEmployee.get(checkout.employee_id).push(checkout);
      }
    }
    
    // ✅ FIX N+1: Batch fetch ALL OT approvals for target date
    const { data: allOTApprovals } = await supabase
      .from('overtime_requests')
      .select('employee_id, id, status, request_date')
      .in('employee_id', employeeIds)
      .eq('request_date', targetDate)
      .eq('status', 'approved');
    
    // Group OT approvals by employee
    const otApprovalsByEmployee = new Set();
    if (allOTApprovals) {
      for (const ot of allOTApprovals) {
        otApprovalsByEmployee.add(ot.employee_id);
      }
    }

    // ✅ Fetch notification settings BEFORE the loop
    const { data: notifySettings } = await supabase
      .from('attendance_settings')
      .select('auto_checkout_notify_dm, auto_checkout_notify_group')
      .eq('scope', 'global')
      .maybeSingle();

    const notifyDM = (notifySettings as any)?.auto_checkout_notify_dm ?? true;
    const notifyGroup = (notifySettings as any)?.auto_checkout_notify_group ?? true;

    console.log(`[auto-checkout-midnight] Notification settings: DM=${notifyDM}, Group=${notifyGroup}`);

    let autoCheckouts = 0;
    let skippedOT = 0;
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');

    for (const [empId, checkInLog] of latestCheckIns) {
      const employee = checkInLog.employees;
      if (!employee) continue;

      // Check if they have checked out after this check-in (from batched data)
      const employeeCheckOuts = checkOutsByEmployee.get(empId) || [];
      const hasCheckedOut = employeeCheckOuts.some(
        (co: any) => new Date(co.server_time) > new Date(checkInLog.server_time)
      );

      // If already checked out, skip
      if (hasCheckedOut) {
        console.log(`[auto-checkout-midnight] ${employee.full_name} already checked out`);
        continue;
      }

      // Check if they have active OT approval (from batched data)
      const hasOTApproval = otApprovalsByEmployee.has(empId);

      // Skip auto-checkout if OT is approved or auto_ot is enabled
      if (hasOTApproval || employee.auto_ot_enabled) {
        console.log(`[auto-checkout-midnight] ${employee.full_name} has OT approval or auto OT enabled, skipping auto checkout`);
        skippedOT++;
        continue;
      }

      // Calculate work hours
      const checkInTime = new Date(checkInLog.server_time);
      // ⚠️ CRITICAL: Use +07:00 offset for Bangkok midnight to prevent UTC interpretation bug
      // Without +07:00: "2025-11-29T23:59:59" is interpreted as UTC = 06:59:59 Bangkok NEXT DAY
      // With +07:00: "2025-11-29T23:59:59+07:00" is correctly 23:59:59 Bangkok = 16:59:59 UTC
      const midnightTime = new Date(`${targetDate}T23:59:59+07:00`);
      const hoursWorked = (midnightTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
      
      // 🛡️ VALIDATION: Ensure work hours are non-negative
      if (hoursWorked < 0) {
        console.error(`[auto-checkout-midnight] Invalid session: negative hours (${hoursWorked.toFixed(2)}) for ${employee.full_name}. CheckIn: ${checkInTime.toISOString()}, Midnight: ${midnightTime.toISOString()}`);
        continue;
      }
      const maxWorkHours = employee.max_work_hours_per_day || 8;
      const overtimeHours = Math.max(0, hoursWorked - maxWorkHours);

      // Calculate OT pay (for information only - not approved)
      let otPayAmount = 0;
      if (overtimeHours > 0 && employee.salary_per_month && employee.salary_per_month > 0) {
        const hoursPerDay = employee.hours_per_day || 8;
        const dailyRate = employee.salary_per_month / 30;
        const hourlyRate = dailyRate / hoursPerDay;
        
        // ✅ Check if target date is a holiday - use holiday OT rate if so
        const isHoliday = await checkIfHoliday(supabase, targetDate, checkInLog.employees.branches?.id);
        const otMultiplier = isHoliday
          ? (employee.holiday_ot_rate_multiplier || 2.0)
          : (employee.ot_rate_multiplier || 1.5);
        
        const otRate = hourlyRate * otMultiplier;
        otPayAmount = otRate * overtimeHours;
        
        if (isHoliday) {
          console.log(`[auto-checkout-midnight] ${employee.full_name}: Holiday OT rate applied (${otMultiplier}x)`);
        }
      }

      // Perform auto checkout
      const { data: checkoutLog, error: checkoutError } = await supabase
        .from('attendance_logs')
        .insert({
          employee_id: empId,
          branch_id: checkInLog.employees.branches?.id || null,
          event_type: 'check_out',
          server_time: midnightTime.toISOString(),
          device_time: midnightTime.toISOString(),
          timezone: 'Asia/Bangkok',
          source: 'auto_checkout',
          overtime_hours: 0, // No OT counted without approval
          is_overtime: false, // Not approved
          device_info: { auto_checkout: true, reason: 'midnight_timeout' }
        })
        .select()
        .maybeSingle();

      if (checkoutError || !checkoutLog) {
        console.error(`[auto-checkout-midnight] Error auto-checking out ${employee.full_name}:`, checkoutError);
        continue;
      }

      autoCheckouts++;
      console.log(`[auto-checkout-midnight] Auto checked out ${employee.full_name}`);

      // ✅ NEW: Update work_session to mark as auto_closed
      // Find active session for this employee on target date
      const { data: activeSession, error: sessionFetchError } = await supabase
        .from('work_sessions')
        .select('id, actual_start_time, break_minutes')
        .eq('employee_id', empId)
        .eq('work_date', targetDate)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .maybeSingle();

      if (activeSession && !sessionFetchError) {
        // Calculate work duration
        const actualStartTime = new Date(activeSession.actual_start_time);
        const totalMinutes = Math.floor((midnightTime.getTime() - actualStartTime.getTime()) / (1000 * 60));
        const breakMinutes = activeSession.break_minutes || 60;
        const netWorkMinutes = Math.max(0, totalMinutes - breakMinutes);
        
        const { error: updateError } = await supabase
          .from('work_sessions')
          .update({
            checkout_log_id: checkoutLog.id,
            actual_end_time: midnightTime.toISOString(),
            total_minutes: totalMinutes,
            net_work_minutes: netWorkMinutes,
            status: 'auto_closed',
            updated_at: new Date().toISOString()
          })
          .eq('id', activeSession.id);
        
        if (updateError) {
          console.error(`[auto-checkout-midnight] Error updating work session for ${employee.full_name}:`, updateError);
        } else {
          console.log(`[auto-checkout-midnight] Updated work session ${activeSession.id} for ${employee.full_name}: ${(netWorkMinutes / 60).toFixed(1)}h net`);
        }
      } else {
        console.warn(`[auto-checkout-midnight] No active session found for ${employee.full_name} on ${targetDate}`);
      }

      // Send LINE notification to employee (only if enabled)
      if (notifyDM && employee.line_user_id) {
        let message = `🌙 Check Out อัตโนมัติ\n\n`;
        message += `👤 คุณ ${employee.full_name}\n`;
        message += `⏰ เวลา: 23:59 (เที่ยงคืน)\n`;
        message += `📊 รวมเวลาทำงาน: ${hoursWorked.toFixed(1)} ชั่วโมง\n\n`;
        
        if (overtimeHours > 0) {
          message += `⚠️ ทำงานเกิน: ${overtimeHours.toFixed(1)} ชั่วโมง\n`;
          message += `❌ ไม่ได้รับอนุมัติ OT ล่วงหน้า\n`;
          
          if (otPayAmount > 0) {
            message += `💸 มูลค่า OT ที่อาจสูญเสีย: ~${otPayAmount.toFixed(2)} บาท\n`;
          }
          
          message += `\n⚠️ หากต้องการทำ OT กรุณาขออนุมัติก่อน\n`;
          message += `ใช้คำสั่ง: /ot [เหตุผล]\n`;
        }
        
        message += `\n💡 เนื่องจากคุณไม่ได้ Check Out\n`;
        message += `ระบบได้ทำการ Check Out ให้อัตโนมัติเมื่อเที่ยงคืน\n\n`;
        message += `หากมีข้อสงสัย กรุณาติดต่อหัวหน้างาน`;

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
      }

      // Post to announcement group (only if enabled)
      const announcementGroupId = employee.announcement_group_line_id || 
                                   employee.branches?.line_group_id;

      if (notifyGroup && announcementGroupId) {
        let groupMessage = `🌙 Auto Check Out: ${employee.full_name}\n`;
        groupMessage += `⏰ 23:59 (ไม่ได้ Check Out ตามปกติ)\n`;
        groupMessage += `📊 เวลาทำงาน: ${hoursWorked.toFixed(1)} ชม.`;
        
        if (overtimeHours > 0) {
          groupMessage += `\n⚠️ OT ไม่ได้รับอนุมัติ: ${overtimeHours.toFixed(1)} ชม.`;
        }

        await fetchWithRetry(
          'https://api.line.me/v2/bot/message/push',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${lineAccessToken}`
            },
            body: JSON.stringify({
              to: announcementGroupId,
              messages: [{
                type: 'text',
                text: groupMessage
              }]
            })
          },
          { maxRetries: 2 }
        );
      }
    }

    console.log(`[auto-checkout-midnight] Completed: ${autoCheckouts} auto checkouts, ${skippedOT} skipped (OT approved)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        auto_checkouts: autoCheckouts,
        skipped_ot: skippedOT,
        total_checked: latestCheckIns.size
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[auto-checkout-midnight] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
