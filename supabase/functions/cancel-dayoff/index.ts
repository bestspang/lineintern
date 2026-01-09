import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelDayOffRequest {
  request_id: string;
  employee_id?: string;   // For LINE (employee self-cancel)
  source: 'line' | 'webapp';
  reason?: string;
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

    const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const body: CancelDayOffRequest = await req.json();

    console.log('[cancel-dayoff] Received request:', body);

    // Validate input
    if (!body.request_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing request_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the request
    const { data: request, error: reqError } = await supabase
      .from('flexible_day_off_requests')
      .select(`
        *,
        employee:employees(id, code, full_name, line_user_id, announcement_group_line_id, branch:branches!employees_branch_id_fkey(name))
      `)
      .eq('id', body.request_id)
      .maybeSingle();

    if (reqError || !request) {
      console.error('[cancel-dayoff] Request not found:', reqError);
      return new Response(
        JSON.stringify({ success: false, error: 'Request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For LINE source, verify the employee owns this request
    if (body.source === 'line') {
      if (!body.employee_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Employee ID required for LINE cancellation' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (request.employee_id !== body.employee_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'You can only cancel your own requests' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Employees can only cancel pending requests
      if (request.status !== 'pending') {
        return new Response(
          JSON.stringify({ success: false, error: 'Can only cancel pending requests' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check if already cancelled
    if (request.status === 'cancelled') {
      return new Response(
        JSON.stringify({ success: false, error: 'Request already cancelled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const previousStatus = request.status;

    // Update request to cancelled
    const { error: updateError } = await supabase
      .from('flexible_day_off_requests')
      .update({
        status: 'cancelled',
        rejection_reason: body.reason || (body.source === 'line' ? 'Cancelled by employee' : 'Cancelled by admin'),
        updated_at: new Date().toISOString()
      })
      .eq('id', body.request_id);

    if (updateError) {
      console.error('[cancel-dayoff] Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to cancel request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[cancel-dayoff] Request cancelled successfully:', body.request_id);

    // Format date in Thai
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const d = new Date(request.day_off_date);
    const formattedDate = `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
    
    const employee = request.employee as any;
    const branchName = employee?.branch?.name || '-';

    // Send LINE notifications
    if (LINE_ACCESS_TOKEN && employee) {
      if (body.source === 'line') {
        // Employee cancelled - notify employee with confirmation
        const employeeMessage = `✅ ยกเลิกคำขอวันหยุดยืดหยุ่นแล้ว\n\n` +
          `📅 วันหยุด: ${formattedDate}\n` +
          `📝 สถานะเดิม: ${previousStatus === 'pending' ? 'รออนุมัติ' : previousStatus}\n` +
          `\n❌ ยกเลิกโดยคุณเรียบร้อยแล้ว`;

        if (employee.line_user_id) {
          try {
            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: employee.line_user_id,
                messages: [{ type: 'text', text: employeeMessage }]
              })
            });
            console.log('[cancel-dayoff] Sent cancellation confirmation to employee');
          } catch (e) {
            console.error('[cancel-dayoff] Error sending to employee:', e);
          }
        }

        // Notify announcement group
        if (employee.announcement_group_line_id) {
          const groupMessage = `❌ ยกเลิกคำขอวันหยุดยืดหยุ่น\n\n` +
            `${employee.full_name} (${employee.code})\n` +
            `วันหยุด: ${formattedDate}\n` +
            `ยกเลิกโดย: พนักงาน`;

          try {
            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: employee.announcement_group_line_id,
                messages: [{ type: 'text', text: groupMessage }]
              })
            });
            console.log('[cancel-dayoff] Posted cancellation to announcement group');
          } catch (e) {
            console.error('[cancel-dayoff] Error posting to group:', e);
          }
        }
      } else {
        // Admin cancelled - notify employee
        const employeeMessage = `❌ คำขอวันหยุดยืดหยุ่นถูกยกเลิก\n\n` +
          `📅 วันหยุด: ${formattedDate}\n` +
          `📝 สถานะเดิม: ${previousStatus === 'pending' ? 'รออนุมัติ' : previousStatus === 'approved' ? 'อนุมัติแล้ว' : previousStatus}\n` +
          `${body.reason ? `📋 เหตุผล: ${body.reason}\n` : ''}` +
          `\n⚠️ ยกเลิกโดย Admin`;

        if (employee.line_user_id) {
          try {
            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: employee.line_user_id,
                messages: [{ type: 'text', text: employeeMessage }]
              })
            });
            console.log('[cancel-dayoff] Sent admin cancellation notice to employee');
          } catch (e) {
            console.error('[cancel-dayoff] Error sending to employee:', e);
          }
        }

        // Notify announcement group
        if (employee.announcement_group_line_id) {
          const groupMessage = `❌ ยกเลิกคำขอวันหยุดยืดหยุ่น (โดย Admin)\n\n` +
            `${employee.full_name} (${employee.code})\n` +
            `วันหยุด: ${formattedDate}` +
            `${body.reason ? `\nเหตุผล: ${body.reason}` : ''}`;

          try {
            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: employee.announcement_group_line_id,
                messages: [{ type: 'text', text: groupMessage }]
              })
            });
          } catch (e) {
            console.error('[cancel-dayoff] Error posting to group:', e);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        request_id: body.request_id,
        previous_status: previousStatus
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[cancel-dayoff] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
