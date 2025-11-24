import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApprovalRequest {
  request_id: string;
  admin_id?: string;
  action: 'approve' | 'reject';
  decision_method?: 'line' | 'webapp';
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

    const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const body: ApprovalRequest = await req.json();

    console.log('[overtime-approval] Received:', body);

    // Validation
    if (!body.request_id || !body.action) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: request_id, action' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get OT request
    const { data: otRequest, error: reqError } = await supabase
      .from('overtime_requests')
      .select('*, employees!inner(id, code, full_name, line_user_id, announcement_group_line_id)')
      .eq('id', body.request_id)
      .single();

    if (reqError || !otRequest) {
      return new Response(JSON.stringify({ error: 'OT request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (otRequest.status !== 'pending') {
      return new Response(JSON.stringify({ 
        error: `Request already ${otRequest.status}`,
        current_status: otRequest.status
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const employee = (otRequest.employees as any);
    const now = new Date().toISOString();

    // Update OT request status
    const newStatus = body.action === 'approve' ? 'approved' : 'rejected';
    const { error: updateError } = await supabase
      .from('overtime_requests')
      .update({
        status: newStatus,
        approved_by_admin_id: body.admin_id || null,
        approved_at: now,
        rejection_reason: body.action === 'reject' ? body.notes || 'ไม่ระบุเหตุผล' : null,
        updated_at: now
      })
      .eq('id', body.request_id);

    if (updateError) {
      console.error('[overtime-approval] Update error:', updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Log approval
    await supabase.from('approval_logs').insert({
      request_type: 'overtime',
      request_id: body.request_id,
      employee_id: employee.id,
      admin_id: body.admin_id || null,
      action: body.action,
      decision_method: body.decision_method || 'webapp',
      notes: body.notes || null
    });

    console.log(`[overtime-approval] ${body.action} OT request ${body.request_id}`);

    // Notify employee
    let employeeMessage: string;
    if (body.action === 'approve') {
      employeeMessage = `✅ คำขอ OT ได้รับอนุมัติ\n\n` +
        `📅 วันที่: ${otRequest.request_date}\n` +
        `⏰ จำนวน: ${otRequest.estimated_hours} ชั่วโมง\n` +
        `📝 เหตุผล: ${otRequest.reason}\n\n` +
        `คุณสามารถทำงานต่อได้ตามเวลาที่ขอ\n` +
        `⚠️ อย่าลืม checkout เมื่อเสร็จงาน`;
    } else {
      employeeMessage = `❌ คำขอ OT ไม่ได้รับอนุมัติ\n\n` +
        `📅 วันที่: ${otRequest.request_date}\n` +
        `⏰ จำนวน: ${otRequest.estimated_hours} ชั่วโมง\n` +
        `📝 เหตุผลที่ขอ: ${otRequest.reason}\n\n` +
        `เหตุผลที่ไม่อนุมัติ: ${body.notes || 'ไม่ระบุ'}\n\n` +
        `กรุณา checkout ตามเวลาปกติ`;
    }

    if (LINE_ACCESS_TOKEN && employee.line_user_id) {
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
      } catch (e) {
        console.error('[overtime-approval] Error notifying employee:', e);
      }
    }

    // Notify announcement group
    const groupMessage = body.action === 'approve' 
      ? `✅ OT อนุมัติ: ${employee.full_name} (${employee.code}) - ${otRequest.estimated_hours} ชม.`
      : `❌ OT ไม่อนุมัติ: ${employee.full_name} (${employee.code})`;

    if (LINE_ACCESS_TOKEN && employee.announcement_group_line_id) {
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
        console.error('[overtime-approval] Error posting to group:', e);
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      action: body.action,
      request_id: body.request_id,
      status: newStatus
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[overtime-approval] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});