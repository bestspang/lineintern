import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApprovalRequest {
  request_id: string;
  admin_id?: string;
  admin_line_user_id?: string;
  action: 'approve' | 'reject';
  decision_method: 'line' | 'webapp';
  notes?: string;
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

    const { request_id, admin_id, admin_line_user_id, action, decision_method, notes }: ApprovalRequest = await req.json();

    // Input validation
    if (!request_id || typeof request_id !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (notes && (typeof notes !== 'string' || notes.length > 500)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Notes too long (max 500 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[early-leave-approval] Processing ${action} for request ${request_id}`);

    // Get the leave request
    const { data: leaveRequest, error: fetchError } = await supabase
      .from('early_leave_requests')
      .select(`
        *,
        employees (
          id,
          full_name,
          code,
          line_user_id,
          announcement_group_line_id,
          branches (
            name,
            line_group_id
          )
        )
      `)
      .eq('id', request_id)
      .single();

    if (fetchError || !leaveRequest) {
      return new Response(
        JSON.stringify({ success: false, error: 'Leave request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (leaveRequest.status !== 'pending') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Request already ${leaveRequest.status}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find admin user ID if only line_user_id provided
    let actualAdminId = admin_id;
    if (!actualAdminId && admin_line_user_id) {
      const { data: adminUser } = await supabase
        .from('users')
        .select('id')
        .eq('line_user_id', admin_line_user_id)
        .single();

      if (adminUser) {
        actualAdminId = adminUser.id;
      }
    }

    const now = new Date();
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update leave request
    const { error: updateError } = await supabase
      .from('early_leave_requests')
      .update({
        status: newStatus,
        approved_by_admin_id: actualAdminId,
        approved_at: now.toISOString(),
        rejection_reason: action === 'reject' ? (notes || 'ไม่อนุมัติ') : null
      })
      .eq('id', request_id);

    if (updateError) {
      console.error('[early-leave-approval] Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log approval
    await supabase
      .from('approval_logs')
      .insert({
        request_type: 'early_leave',
        request_id: request_id,
        employee_id: leaveRequest.employee_id,
        admin_id: actualAdminId,
        action: newStatus,
        decision_method: decision_method,
        notes: notes
      });

    console.log(`[early-leave-approval] Request ${newStatus}`);

    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const employee = leaveRequest.employees;

    // If approved, perform checkout
    if (action === 'approve' && employee) {
      const { error: checkoutError } = await supabase
        .from('attendance_logs')
        .insert({
          employee_id: employee.id,
          branch_id: leaveRequest.attendance_log_id, // May need adjustment
          event_type: 'check_out',
          server_time: now.toISOString(),
          device_time: now.toISOString(),
          timezone: 'Asia/Bangkok',
          source: 'early_leave_approved',
          early_leave_request_id: request_id,
          approval_status: 'approved',
          device_info: { 
            early_leave: true, 
            leave_type: leaveRequest.leave_type,
            leave_reason: leaveRequest.leave_reason
          }
        });

      if (checkoutError) {
        console.error('[early-leave-approval] Checkout error:', checkoutError);
      } else {
        console.log(`[early-leave-approval] Auto-checked out ${employee.full_name}`);
      }
    }

    // Notify employee
    if (employee?.line_user_id) {
      const actionEmoji = action === 'approve' ? '✅' : '❌';
      const actionText = action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';
      
      let message = `${actionEmoji} คำขอออกงานก่อนเวลา: ${actionText}\n\n`;
      message += `📋 ประเภท: ${leaveRequest.leave_type}\n`;
      message += `💬 เหตุผล: ${leaveRequest.leave_reason}\n`;
      message += `⏰ เวลาทำงาน: ${leaveRequest.actual_work_hours?.toFixed(1)} ชั่วโมง\n\n`;

      if (action === 'approve') {
        message += `✅ ได้รับอนุมัติให้ออกงานก่อนเวลาแล้ว\n`;
        message += `ระบบได้ Check Out ให้อัตโนมัติเรียบร้อย\n\n`;
        message += `ขอบคุณสำหรับการทำงาน!`;
      } else {
        message += `❌ ไม่ได้รับอนุมัติ\n`;
        if (notes) {
          message += `📝 หมายเหตุ: ${notes}\n\n`;
        }
        message += `กรุณาทำงานต่อจนครบเวลา`;
      }

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
            text: message
          }]
        })
      });
    }

    // Post to announcement group
    const announcementGroupId = (employee as any)?.announcement_group_line_id || 
                                 (employee as any)?.branches?.line_group_id;

    if (announcementGroupId) {
      const actionEmoji = action === 'approve' ? '✅' : '❌';
      const actionText = action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';
      
      let groupMessage = `${actionEmoji} ${actionText}การออกงานก่อนเวลา\n\n`;
      groupMessage += `${employee?.full_name} - ${leaveRequest.leave_type}\n`;
      groupMessage += `เหตุผล: ${leaveRequest.leave_reason}`;

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

    return new Response(
      JSON.stringify({ 
        success: true, 
        status: newStatus,
        auto_checkout: action === 'approve'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[early-leave-approval] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
