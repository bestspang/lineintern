import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimiters } from "../_shared/rate-limiter.ts";
import { logger } from "../_shared/logger.ts";
import { sanitizeInput } from "../_shared/validators.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InstantOTRequest {
  employee_id: string;
  hours: number;
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
      logger.warn('Rate limit exceeded', { ip: clientIp, endpoint: 'instant-ot-grant' });
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
    const body: InstantOTRequest = await req.json();

    // Validation
    if (!body.employee_id || typeof body.employee_id !== 'string') {
      logger.warn('Invalid employee_id', { employee_id: body.employee_id });
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Valid employee_id is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!body.hours || typeof body.hours !== 'number' || body.hours < 0.5 || body.hours > 8) {
      logger.warn('Invalid hours', { hours: body.hours });
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Hours must be between 0.5 and 8' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const sanitizedReason = body.reason ? sanitizeInput(body.reason).slice(0, 500) : 'Admin granted OT';

    logger.info('Processing instant OT grant', { 
      employee_id: body.employee_id, 
      hours: body.hours,
      admin_id: user.id
    });

    // Get employee details
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, code, full_name, line_user_id, announcement_group_line_id, shift_end_time')
      .eq('id', body.employee_id)
      .maybeSingle();

    if (empError || !employee) {
      logger.warn('Employee not found', { employee_id: body.employee_id, error: empError });
      return new Response(JSON.stringify({ success: false, error: 'Employee not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get admin name
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const adminName = adminProfile?.display_name || 'Admin';

    // Check if employee has checked in today
    const today = new Date().toISOString().split('T')[0];
    const { data: todayCheckIn, error: checkInError } = await supabase
      .from('attendance_logs')
      .select('id')
      .eq('employee_id', body.employee_id)
      .eq('event_type', 'check_in')
      .gte('server_time', `${today}T00:00:00+07:00`)
      .lte('server_time', `${today}T23:59:59+07:00`)
      .limit(1)
      .maybeSingle();

    if (checkInError) {
      logger.error('Error checking attendance', checkInError);
    }

    if (!todayCheckIn) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'พนักงานยังไม่ได้ check-in วันนี้' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const now = new Date().toISOString();

    // Check if there's already an approved OT request for today
    const { data: existingOT, error: existingError } = await supabase
      .from('overtime_requests')
      .select('id, estimated_hours')
      .eq('employee_id', body.employee_id)
      .eq('request_date', today)
      .eq('status', 'approved')
      .maybeSingle();

    let requestId: string;
    let isUpdate = false;

    if (existingOT) {
      // Update existing OT request
      isUpdate = true;
      requestId = existingOT.id;
      
      const { error: updateError } = await supabase
        .from('overtime_requests')
        .update({
          estimated_hours: body.hours,
          reason: sanitizedReason,
          approved_by_admin_id: user.id,
          approved_at: now,
          updated_at: now
        })
        .eq('id', existingOT.id);

      if (updateError) {
        logger.error('Failed to update OT request', updateError);
        return new Response(JSON.stringify({ success: false, error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else {
      // Create new OT request with immediate approval
      const { data: newOT, error: insertError } = await supabase
        .from('overtime_requests')
        .insert({
          employee_id: body.employee_id,
          request_date: today,
          estimated_hours: body.hours,
          reason: sanitizedReason,
          status: 'approved',
          requested_at: now,
          approved_by_admin_id: user.id,
          approved_at: now
        })
        .select('id')
        .single();

      if (insertError) {
        logger.error('Failed to create OT request', insertError);
        return new Response(JSON.stringify({ success: false, error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      requestId = newOT.id;
    }

    // Log approval
    await supabase.from('approval_logs').insert({
      request_type: 'overtime',
      request_id: requestId,
      employee_id: body.employee_id,
      admin_id: user.id,
      action: isUpdate ? 'update_approve' : 'instant_approve',
      decision_method: 'webapp',
      notes: `Instant OT granted: ${body.hours}h - ${sanitizedReason}`
    });

    logger.info('Instant OT granted successfully', { 
      request_id: requestId, 
      employee_id: body.employee_id,
      hours: body.hours,
      is_update: isUpdate
    });

    // Calculate expected checkout time with OT
    const shiftEndTime = employee.shift_end_time || '17:00:00';
    const [endHour, endMinute] = shiftEndTime.split(':').map(Number);
    const otEndHour = endHour + Math.floor(body.hours);
    const otEndMinute = endMinute + Math.round((body.hours % 1) * 60);
    const formattedOTEnd = `${String(otEndHour).padStart(2, '0')}:${String(otEndMinute).padStart(2, '0')}`;

    // Notify employee via LINE
    const employeeMessage = `🎉 คุณได้รับอนุมัติ OT เพิ่ม!\n\n` +
      `⏰ จำนวน: ${body.hours} ชั่วโมง\n` +
      `📝 เหตุผล: ${sanitizedReason}\n` +
      `👤 อนุมัติโดย: ${adminName}\n\n` +
      `คุณสามารถทำงานต่อได้ถึง ${formattedOTEnd} น.\n` +
      `⚠️ อย่าลืม checkout เมื่อเสร็จงาน`;

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
        logger.info('LINE notification sent to employee', { employee_id: body.employee_id });
      } catch (e) {
        logger.error('Failed to notify employee via LINE', e);
      }
    }

    // Notify announcement group
    const groupMessage = isUpdate
      ? `🔄 OT อัพเดท: ${employee.full_name} (${employee.code}) - ${body.hours} ชม. โดย ${adminName}`
      : `🎉 OT อนุมัติด่วน: ${employee.full_name} (${employee.code}) - ${body.hours} ชม. โดย ${adminName}`;

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
      request_id: requestId,
      employee_name: employee.full_name,
      hours: body.hours,
      is_update: isUpdate,
      message: isUpdate 
        ? `อัพเดท OT เป็น ${body.hours} ชม. สำเร็จ`
        : `ให้ OT ${body.hours} ชม. สำเร็จ`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logger.error('Instant OT grant error', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
