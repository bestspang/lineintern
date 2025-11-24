import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Cron job to auto-reject pending requests that have timed out
 * 
 * Schedule: Every hour
 * 
 * Timeout rules:
 * - OT requests: 24 hours (auto-reject if no admin response)
 * - Early leave requests: 4 hours (auto-reject if no admin response)
 */
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
    const now = new Date();

    console.log('[request-timeout-checker] Running timeout check at:', now.toISOString());

    // Check OT requests (24 hour timeout)
    const otTimeoutThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const { data: timedOutOT, error: otError } = await supabase
      .from('overtime_requests')
      .select(`
        id,
        employee_id,
        request_date,
        estimated_hours,
        reason,
        requested_at,
        employees (
          line_user_id,
          full_name,
          code
        )
      `)
      .eq('status', 'pending')
      .lt('requested_at', otTimeoutThreshold.toISOString());

    if (otError) {
      console.error('[request-timeout-checker] Error fetching OT requests:', otError);
    }

    let otRejected = 0;
    if (timedOutOT && timedOutOT.length > 0) {
      console.log(`[request-timeout-checker] Found ${timedOutOT.length} timed out OT requests`);

      for (const request of timedOutOT) {
        // Auto-reject
        const { error: updateError } = await supabase
          .from('overtime_requests')
          .update({
            status: 'rejected',
            rejection_reason: 'Auto-rejected: No admin response within 24 hours',
            updated_at: now.toISOString()
          })
          .eq('id', request.id);

        if (updateError) {
          console.error(`[request-timeout-checker] Error rejecting OT ${request.id}:`, updateError);
          continue;
        }

        // Log the action
        await supabase.from('approval_logs').insert({
          request_type: 'overtime',
          request_id: request.id,
          employee_id: request.employee_id,
          action: 'reject',
          decision_method: 'system',
          notes: 'Auto-rejected due to 24-hour timeout'
        });

        otRejected++;

        // Notify employee
        const employee = request.employees as any;
        if (LINE_ACCESS_TOKEN && employee?.line_user_id) {
          const message = `⏰ คำขอ OT หมดเวลา\n\n` +
            `📅 วันที่: ${request.request_date}\n` +
            `⏰ จำนวน: ${request.estimated_hours} ชั่วโมง\n` +
            `📝 เหตุผล: ${request.reason}\n\n` +
            `❌ ไม่ได้รับการตอบกลับจาก Admin ภายใน 24 ชม.\n` +
            `กรุณาติดต่อ Admin หรือส่งคำขอใหม่`;

          try {
            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: employee.line_user_id,
                messages: [{ type: 'text', text: message }]
              })
            });
          } catch (e) {
            console.error('[request-timeout-checker] Error notifying employee:', e);
          }
        }
      }
    }

    // Check early leave requests (4 hour timeout)
    const earlyLeaveTimeoutThreshold = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    
    const { data: timedOutEarlyLeave, error: elError } = await supabase
      .from('early_leave_requests')
      .select(`
        id,
        employee_id,
        request_date,
        leave_reason,
        leave_type,
        requested_at,
        actual_work_hours,
        required_work_hours,
        employees (
          line_user_id,
          full_name,
          code
        )
      `)
      .eq('status', 'pending')
      .lt('requested_at', earlyLeaveTimeoutThreshold.toISOString());

    if (elError) {
      console.error('[request-timeout-checker] Error fetching early leave requests:', elError);
    }

    let earlyLeaveRejected = 0;
    if (timedOutEarlyLeave && timedOutEarlyLeave.length > 0) {
      console.log(`[request-timeout-checker] Found ${timedOutEarlyLeave.length} timed out early leave requests`);

      for (const request of timedOutEarlyLeave) {
        // Auto-reject
        const { error: updateError } = await supabase
          .from('early_leave_requests')
          .update({
            status: 'rejected',
            rejection_reason: 'Auto-rejected: No admin response within 4 hours',
            updated_at: now.toISOString()
          })
          .eq('id', request.id);

        if (updateError) {
          console.error(`[request-timeout-checker] Error rejecting early leave ${request.id}:`, updateError);
          continue;
        }

        // Log the action
        await supabase.from('approval_logs').insert({
          request_type: 'early_leave',
          request_id: request.id,
          employee_id: request.employee_id,
          action: 'reject',
          decision_method: 'system',
          notes: 'Auto-rejected due to 4-hour timeout'
        });

        earlyLeaveRejected++;

        // Notify employee
        const employee = request.employees as any;
        if (LINE_ACCESS_TOKEN && employee?.line_user_id) {
          const message = `⏰ คำขอออกงานก่อนเวลาหมดเวลา\n\n` +
            `📅 วันที่: ${request.request_date}\n` +
            `📋 ประเภท: ${request.leave_type}\n` +
            `📝 เหตุผล: ${request.leave_reason}\n\n` +
            `❌ ไม่ได้รับการตอบกลับจาก Admin ภายใน 4 ชม.\n` +
            `กรุณาติดต่อ Admin หรือทำงานต่อจนครบเวลา`;

          try {
            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: employee.line_user_id,
                messages: [{ type: 'text', text: message }]
              })
            });
          } catch (e) {
            console.error('[request-timeout-checker] Error notifying employee:', e);
          }
        }
      }
    }

    const result = {
      success: true,
      checked_at: now.toISOString(),
      ot_requests_rejected: otRejected,
      early_leave_requests_rejected: earlyLeaveRejected,
      total_rejected: otRejected + earlyLeaveRejected
    };

    console.log('[request-timeout-checker] Result:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[request-timeout-checker] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
