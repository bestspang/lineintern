import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';
import { fetchWithRetry } from '../_shared/retry.ts';
import { getBangkokDateString, formatBangkokTime } from '../_shared/timezone.ts';

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

    logger.info('Starting auto checkout process');

    const now = new Date();
    const today = getBangkokDateString(now);
    
    // Get the date we're checking (yesterday if it's just past midnight)
    const bangkokHour = parseInt(formatBangkokTime(now, 'HH'));
    const targetDate = bangkokHour < 2 
      ? getBangkokDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000))
      : today;

    console.log(`[auto-checkout-midnight] Checking date: ${targetDate}`);

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
          announcement_group_line_id,
          branches (
            name,
            line_group_id
          )
        )
      `)
      .eq('event_type', 'check_in')
      .gte('server_time', `${targetDate}T00:00:00`)
      .lt('server_time', `${targetDate}T23:59:59`)
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

    let autoCheckouts = 0;
    let skippedOT = 0;
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');

    for (const [empId, checkInLog] of latestCheckIns) {
      const employee = checkInLog.employees;
      if (!employee) continue;

      // Check if they have checked out after this check-in
      const { data: checkOuts } = await supabase
        .from('attendance_logs')
        .select('id, server_time')
        .eq('employee_id', empId)
        .eq('event_type', 'check_out')
        .gt('server_time', checkInLog.server_time)
        .order('server_time', { ascending: false })
        .limit(1);

      // If already checked out, skip
      if (checkOuts && checkOuts.length > 0) {
        console.log(`[auto-checkout-midnight] ${employee.full_name} already checked out`);
        continue;
      }

      // Check if they have active OT approval
      const checkInTime = new Date(checkInLog.server_time);
      const checkInDate = getBangkokDateString(checkInTime);
      
      const { data: otApproval } = await supabase
        .from('overtime_requests')
        .select('id, status')
        .eq('employee_id', empId)
        .eq('request_date', checkInDate)
        .eq('status', 'approved')
        .limit(1);

      // Skip auto-checkout if OT is approved or auto_ot is enabled
      if ((otApproval && otApproval.length > 0) || employee.auto_ot_enabled) {
        console.log(`[auto-checkout-midnight] ${employee.full_name} has OT approval or auto OT enabled, skipping auto checkout`);
        skippedOT++;
        continue;
      }

      // Calculate work hours
      const midnightTime = new Date(`${targetDate}T23:59:59`);
      const hoursWorked = (midnightTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
      const maxWorkHours = employee.max_work_hours_per_day || 8;
      const overtimeHours = Math.max(0, hoursWorked - maxWorkHours);

      // Calculate OT pay (for information only - not approved)
      let otPayAmount = 0;
      if (overtimeHours > 0 && employee.salary_per_month && employee.salary_per_month > 0) {
        const hoursPerDay = employee.hours_per_day || 8;
        const dailyRate = employee.salary_per_month / 30;
        const hourlyRate = dailyRate / hoursPerDay;
        const otMultiplier = employee.ot_rate_multiplier || 1.5;
        const otRate = hourlyRate * otMultiplier;
        otPayAmount = otRate * overtimeHours;
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
        .single();

      if (checkoutError) {
        console.error(`[auto-checkout-midnight] Error auto-checking out ${employee.full_name}:`, checkoutError);
        continue;
      }

      autoCheckouts++;
      console.log(`[auto-checkout-midnight] Auto checked out ${employee.full_name}`);

      // Send LINE notification
      if (employee.line_user_id) {
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

      // Post to announcement group
      const announcementGroupId = employee.announcement_group_line_id || 
                                   employee.branches?.line_group_id;

      if (announcementGroupId) {
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
