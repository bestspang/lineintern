import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimiters } from "../_shared/rate-limiter.ts";
import { logger } from "../_shared/logger.ts";
import { sanitizeInput } from "../_shared/validators.ts";
import { getBangkokDateString } from "../_shared/timezone.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelOTRequest {
  request_id?: string;
  employee_id?: string;
  request_date?: string;
  reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    if (rateLimiters.api.isRateLimited(clientIp)) {
      logger.warn('Rate limit exceeded', { ip: clientIp, endpoint: 'cancel-ot' });
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

    // Create client with user's authorization for authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Service role client for actual operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has admin or owner role
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'owner'])
      .maybeSingle();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin/Owner access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const body: CancelOTRequest = await req.json();

    // Get admin name
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const adminName = adminProfile?.display_name || 'Admin';
    const sanitizedReason = body.reason ? sanitizeInput(body.reason).slice(0, 500) : 'ยกเลิกโดย Admin';

    let otRequest: any;

    // Find OT request by ID or by employee_id + date
    if (body.request_id) {
      const { data, error } = await supabase
        .from('overtime_requests')
        .select('*, employees!inner(id, code, full_name, line_user_id, announcement_group_line_id)')
        .eq('id', body.request_id)
        .maybeSingle();

      if (error || !data) {
        logger.warn('OT request not found by ID', { request_id: body.request_id });
        return new Response(JSON.stringify({ success: false, error: 'OT request not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      otRequest = data;
    } else if (body.employee_id) {
      const requestDate = body.request_date || getBangkokDateString();
      
      const { data, error } = await supabase
        .from('overtime_requests')
        .select('*, employees!inner(id, code, full_name, line_user_id, announcement_group_line_id)')
        .eq('employee_id', body.employee_id)
        .eq('request_date', requestDate)
        .eq('status', 'approved')
        .maybeSingle();

      if (error || !data) {
        logger.warn('OT request not found by employee_id', { 
          employee_id: body.employee_id,
          request_date: requestDate
        });
        return new Response(JSON.stringify({ success: false, error: 'ไม่พบ OT request ที่อนุมัติแล้ว' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      otRequest = data;
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'request_id or employee_id is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if already cancelled
    if (otRequest.status === 'cancelled') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'OT request already cancelled' 
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const employee = otRequest.employees as any;
    const now = new Date().toISOString();

    logger.info('Cancelling OT request', { 
      request_id: otRequest.id, 
      employee_id: employee.id,
      admin_id: user.id
    });

    // Update OT request status
    const { error: updateError } = await supabase
      .from('overtime_requests')
      .update({
        status: 'cancelled',
        rejection_reason: sanitizedReason,
        updated_at: now
      })
      .eq('id', otRequest.id);

    if (updateError) {
      logger.error('Failed to cancel OT request', updateError);
      return new Response(JSON.stringify({ success: false, error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Log cancellation
    await supabase.from('approval_logs').insert({
      request_type: 'overtime',
      request_id: otRequest.id,
      employee_id: employee.id,
      admin_id: user.id,
      action: 'cancel',
      decision_method: 'webapp',
      notes: `OT cancelled: ${sanitizedReason}`
    });

    logger.info('OT request cancelled successfully', { 
      request_id: otRequest.id, 
      employee_id: employee.id 
    });

    // Notify employee via LINE
    const employeeMessage = `⚠️ OT ของคุณถูกยกเลิก\n\n` +
      `📅 วันที่: ${otRequest.request_date}\n` +
      `⏰ OT ที่ถูกยกเลิก: ${otRequest.estimated_hours} ชั่วโมง\n` +
      `👤 ยกเลิกโดย: ${adminName}\n` +
      `📝 เหตุผล: ${sanitizedReason}\n\n` +
      `กรุณา checkout ตามเวลาปกติ`;

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
        logger.info('LINE notification sent for OT cancellation', { employee_id: employee.id });
      } catch (e) {
        logger.error('Failed to notify employee via LINE', e);
      }
    }

    // Notify announcement group
    const groupMessage = `⚠️ OT ยกเลิก: ${employee.full_name} (${employee.code}) - ${otRequest.estimated_hours} ชม. โดย ${adminName}`;

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
      request_id: otRequest.id,
      employee_name: employee.full_name,
      cancelled_hours: otRequest.estimated_hours,
      message: `ยกเลิก OT ${otRequest.estimated_hours} ชม. ของ ${employee.full_name} สำเร็จ`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logger.error('Cancel OT error', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
