import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schemas
const leaveReasons = ['sick', 'personal', 'vacation', 'emergency', 'other'] as const;

interface EarlyCheckoutRequest {
  employee_id: string;
  leave_reason: string;
  leave_type: typeof leaveReasons[number];
  custom_reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { employee_id, leave_reason, leave_type, custom_reason }: EarlyCheckoutRequest = await req.json();

    // Input validation
    if (!employee_id || typeof employee_id !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid employee_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!leave_reason || typeof leave_reason !== 'string' || leave_reason.length > 500) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid leave_reason (max 500 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!leave_type || !leaveReasons.includes(leave_type)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid leave_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[early-checkout-request] Processing request for employee ${employee_id}`);

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Get employee info
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select(`
        id,
        full_name,
        code,
        line_user_id,
        working_time_type,
        hours_per_day,
        shift_end_time,
        announcement_group_line_id,
        branches (
          name,
          line_group_id
        )
      `)
      .eq('id', employee_id)
      .single();

    if (empError || !employee) {
      return new Response(
        JSON.stringify({ success: false, error: 'Employee not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if employee is currently checked in
    const { data: canCheckOut } = await supabase.rpc('can_employee_check_out', {
      p_employee_id: employee_id
    });

    if (!canCheckOut) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'ไม่สามารถขอออกงานก่อนเวลาได้ กรุณา Check In ก่อน\n\nYou must be checked in to request early checkout.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get latest check-in time for today
    const { data: checkIns } = await supabase
      .from('attendance_logs')
      .select('id, server_time')
      .eq('employee_id', employee_id)
      .eq('event_type', 'check_in')
      .gte('server_time', `${today}T00:00:00`)
      .order('server_time', { ascending: false })
      .limit(1);

    if (!checkIns || checkIns.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No check-in found today' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const checkInTime = new Date(checkIns[0].server_time);
    const hoursWorked = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

    // Calculate required hours
    let requiredHours = 8; // Default
    if (employee.working_time_type === 'hours_based' && employee.hours_per_day) {
      requiredHours = employee.hours_per_day;
    } else if (employee.working_time_type === 'time_based' && employee.shift_end_time) {
      // Calculate from shift times (simplified - assuming 8 hours)
      requiredHours = 8;
    }

    // Check for existing pending request today
    const { data: existingRequest } = await supabase
      .from('early_leave_requests')
      .select('id, status')
      .eq('employee_id', employee_id)
      .eq('request_date', today)
      .in('status', ['pending'])
      .limit(1);

    if (existingRequest && existingRequest.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'มีคำขอออกงานก่อนเวลารอดำเนินการอยู่แล้ว\n\nYou already have a pending early leave request.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create early leave request
    const { data: leaveRequest, error: insertError } = await supabase
      .from('early_leave_requests')
      .insert({
        employee_id: employee_id,
        request_date: today,
        actual_work_hours: hoursWorked,
        required_work_hours: requiredHours,
        leave_reason: leave_reason,
        leave_type: leave_type,
        status: 'pending',
        requested_at: now.toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('[early-checkout-request] Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[early-checkout-request] Created request ${leaveRequest.id}`);

    // Get admins to notify
    const { data: admins } = await supabase
      .from('user_roles')
      .select(`
        users (
          id,
          line_user_id,
          display_name
        )
      `)
      .eq('role', 'admin');

    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');

    // Send notifications to admins
    let notificationsSent = 0;
    if (admins && admins.length > 0) {
      for (const adminRecord of admins) {
        const admin = adminRecord.users as any;
        if (!admin || !admin.line_user_id) continue;

        const leaveTypeEmoji = {
          sick: '🤒',
          personal: '📝',
          vacation: '🏖️',
          emergency: '🚨',
          other: '❓'
        }[leave_type];

        let message = `${leaveTypeEmoji} คำขอออกงานก่อนเวลา\n\n`;
        message += `👤 พนักงาน: ${employee.full_name} (${employee.code})\n`;
        message += `⏰ เวลาทำงาน: ${hoursWorked.toFixed(1)}/${requiredHours} ชั่วโมง\n`;
        message += `📋 ประเภท: ${leave_type}\n`;
        message += `💬 เหตุผล: ${leave_reason}\n\n`;
        message += `⏱️ ขาดเวลา: ${(requiredHours - hoursWorked).toFixed(1)} ชั่วโมง\n\n`;
        message += `กรุณาตอบกลับเพื่ออนุมัติ:\n`;
        message += `พิมพ์: อนุมัติ ${leaveRequest.id}\n`;
        message += `หรือ: ไม่อนุมัติ ${leaveRequest.id}`;

        // LINE message with Quick Reply
        const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${lineAccessToken}`
          },
          body: JSON.stringify({
            to: admin.line_user_id,
            messages: [{
              type: 'text',
              text: message,
              quickReply: {
                items: [
                  {
                    type: 'action',
                    action: {
                      type: 'message',
                      label: '✅ อนุมัติ',
                      text: `อนุมัติ ${leaveRequest.id}`
                    }
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'message',
                      label: '❌ ไม่อนุมัติ',
                      text: `ไม่อนุมัติ ${leaveRequest.id}`
                    }
                  }
                ]
              }
            }]
          })
        });

        if (lineResponse.ok) {
          notificationsSent++;
        }
      }
    }

    console.log(`[early-checkout-request] Sent ${notificationsSent} admin notifications`);

    // Also post to announcement group
    const announcementGroupId = employee.announcement_group_line_id || 
                                 (employee.branches as any)?.line_group_id;

    if (announcementGroupId) {
      const groupMessage = `📢 คำขอออกงานก่อนเวลา\n\n${employee.full_name} ขอออกงานก่อนเวลา\nเหตุผล: ${leave_reason}\nรอการอนุมัติจากหัวหน้า...`;

      await fetch('https://api.line.me/v2/bot/message/push', {
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
      });
    }

    // Notify employee
    if (employee.line_user_id) {
      const employeeMessage = `✅ ส่งคำขอออกงานก่อนเวลาเรียบร้อย\n\n📋 เหตุผล: ${leave_reason}\n⏰ ทำงานมาแล้ว: ${hoursWorked.toFixed(1)} ชั่วโมง\n\nรอการอนุมัติจากหัวหน้า...`;

      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${lineAccessToken}`
        },
        body: JSON.stringify({
          to: employee.line_user_id,
          messages: [{
            type: 'text',
            text: employeeMessage
          }]
        })
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        request_id: leaveRequest.id,
        hours_worked: hoursWorked,
        required_hours: requiredHours,
        admins_notified: notificationsSent
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[early-checkout-request] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
