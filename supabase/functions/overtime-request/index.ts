import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OvertimeRequest {
  employee_id: string;
  estimated_hours?: number;
  reason: string;
  request_date?: string;
  request_method?: 'line' | 'webapp';
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
    const body: OvertimeRequest = await req.json();

    console.log('[overtime-request] Received request:', body);

    // Validation
    if (!body.employee_id || !body.reason) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: employee_id, reason' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Default estimated_hours to 2 if not provided (from LINE)
    const estimatedHours = body.estimated_hours || 2;

    // Get employee details
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, code, full_name, line_user_id, announcement_group_line_id, branch_id')
      .eq('id', body.employee_id)
      .single();

    if (empError || !employee) {
      return new Response(JSON.stringify({ error: 'Employee not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const requestDate = body.request_date || new Date().toISOString().split('T')[0];

    // Check for existing pending request today
    const { data: existingRequest } = await supabase
      .from('overtime_requests')
      .select('id, status')
      .eq('employee_id', body.employee_id)
      .eq('request_date', requestDate)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingRequest) {
      return new Response(JSON.stringify({ 
        error: 'มีคำขอ OT ที่รอการอนุมัติอยู่แล้ว / Pending OT request already exists',
        request_id: existingRequest.id
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create OT request
    const { data: otRequest, error: insertError } = await supabase
      .from('overtime_requests')
      .insert({
        employee_id: body.employee_id,
        request_date: requestDate,
        estimated_hours: estimatedHours,
        reason: body.reason,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[overtime-request] Insert error:', insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[overtime-request] Created request:', otRequest.id);

    // Get admin users
    const { data: admins } = await supabase
      .from('user_roles')
      .select('users!inner(line_user_id, display_name)')
      .eq('role', 'admin');

    // Notify admins via LINE
    const message = `🔔 คำขออนุมัติ OT\n\n` +
      `👤 พนักงาน: ${employee.full_name} (${employee.code})\n` +
      `📅 วันที่: ${requestDate}\n` +
      `⏰ OT ที่ขอ: ${estimatedHours} ชั่วโมง\n` +
      `📝 เหตุผล: ${body.reason}\n\n` +
      `พิมพ์ "อนุมัติ OT ${otRequest.id}" หรือ "ไม่อนุมัติ OT ${otRequest.id}"`;

    if (LINE_ACCESS_TOKEN) {
      // Send to admins
      if (admins && admins.length > 0) {
        for (const admin of admins) {
          const adminUser = (admin.users as any);
          if (adminUser.line_user_id) {
            try {
              await fetch('https://api.line.me/v2/bot/message/push', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: adminUser.line_user_id,
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
                            text: `อนุมัติ OT ${otRequest.id}`
                          }
                        },
                        {
                          type: 'action',
                          action: {
                            type: 'message',
                            label: '❌ ไม่อนุมัติ',
                            text: `ไม่อนุมัติ OT ${otRequest.id}`
                          }
                        }
                      ]
                    }
                  }]
                })
              });
            } catch (e) {
              console.error('[overtime-request] Error sending to admin:', e);
            }
          }
        }
      }

      // Post to announcement group
      if (employee.announcement_group_line_id) {
        try {
          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: employee.announcement_group_line_id,
              messages: [{ type: 'text', text: message }]
            })
          });
        } catch (e) {
          console.error('[overtime-request] Error posting to group:', e);
        }
      }
    }

    // Confirm to employee
    const confirmMessage = `✅ ส่งคำขอ OT เรียบร้อยแล้ว\n\n` +
      `📅 วันที่: ${requestDate}\n` +
      `⏰ จำนวน: ${estimatedHours} ชั่วโมง\n` +
      `📝 เหตุผล: ${body.reason}\n\n` +
      `รอการอนุมัติจาก Admin...`;

    if (LINE_ACCESS_TOKEN && employee.line_user_id) {
      try {
        const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: employee.line_user_id,
            messages: [{ type: 'text', text: confirmMessage }]
          })
        });

        if (lineRes.ok) {
          const lineData = await lineRes.json();
          const lineMessageId = lineData.sentMessages?.[0]?.id || null;
          
          // Update request with LINE message ID
          await supabase
            .from('overtime_requests')
            .update({ line_message_id: lineMessageId })
            .eq('id', otRequest.id);
        }
      } catch (e) {
        console.error('[overtime-request] Error sending confirmation:', e);
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      request_id: otRequest.id,
      request: otRequest
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[overtime-request] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});