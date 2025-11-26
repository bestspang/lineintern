import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimiters } from "../_shared/rate-limiter.ts";
import { logger } from "../_shared/logger.ts";
import { sanitizeInput } from "../_shared/validators.ts";

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
    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    if (rateLimiters.api.isRateLimited(clientIp)) {
      logger.warn('Rate limit exceeded', { ip: clientIp, endpoint: 'overtime-approval' });
      return new Response(
        JSON.stringify({ success: false, error: 'Too many requests. Please try again later.' }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            ...rateLimiters.api.getHeaders(clientIp),
            'Content-Type': 'application/json' 
          } 
        }
      );
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const body: ApprovalRequest = await req.json();

    // Validation
    if (!body.request_id || typeof body.request_id !== 'string') {
      logger.warn('Invalid request_id', { request_id: body.request_id });
      return new Response(JSON.stringify({ 
        error: 'Valid request_id is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!body.action || !['approve', 'reject'].includes(body.action)) {
      logger.warn('Invalid action', { action: body.action });
      return new Response(JSON.stringify({ 
        error: 'Action must be "approve" or "reject"' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (body.notes && (typeof body.notes !== 'string' || body.notes.length > 500)) {
      logger.warn('Notes validation failed', { notesLength: body.notes?.length });
      return new Response(JSON.stringify({ 
        error: 'Notes too long (max 500 characters)' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const sanitizedNotes = body.notes ? sanitizeInput(body.notes) : null;
    logger.info('Processing overtime approval', { 
      request_id: body.request_id, 
      action: body.action,
      hasNotes: !!sanitizedNotes
    });

    // Get OT request
    const { data: otRequest, error: reqError } = await supabase
      .from('overtime_requests')
      .select('*, employees!inner(id, code, full_name, line_user_id, announcement_group_line_id)')
      .eq('id', body.request_id)
      .maybeSingle();

    if (reqError || !otRequest) {
      logger.warn('OT request not found', { request_id: body.request_id, error: reqError });
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
        rejection_reason: body.action === 'reject' ? sanitizedNotes || 'ไม่ระบุเหตุผล' : null,
        updated_at: now
      })
      .eq('id', body.request_id);

    if (updateError) {
      logger.error('Failed to update OT request', updateError);
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
      notes: sanitizedNotes
    });

    logger.info('OT request processed', { 
      request_id: body.request_id, 
      action: body.action,
      employee_id: employee.id
    });

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
        `เหตุผลที่ไม่อนุมัติ: ${sanitizedNotes || 'ไม่ระบุ'}\n\n` +
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
        logger.error('Failed to notify employee', e);
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
        logger.error('Failed to notify announcement group', e);
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
    logger.error('Overtime approval error', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});