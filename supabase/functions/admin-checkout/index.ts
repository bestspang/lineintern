import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { rateLimiters } from "../_shared/rate-limiter.ts";
import { logger } from "../_shared/logger.ts";
import { sanitizeInput } from "../_shared/validators.ts";
import { getBangkokDateString, formatBangkokTime } from "../_shared/timezone.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    if (rateLimiters.api.isRateLimited(clientIp)) {
      logger.warn('Rate limit exceeded', { ip: clientIp, endpoint: 'admin-checkout' });
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify admin role
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isAdmin } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { employee_id, notes } = await req.json();

    // Input validation
    if (!employee_id || typeof employee_id !== 'string') {
      logger.warn('Invalid employee_id', { employee_id });
      return new Response(
        JSON.stringify({ success: false, error: 'Valid employee ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (notes && (typeof notes !== 'string' || notes.length > 500)) {
      logger.warn('Invalid notes', { notesLength: notes?.length });
      return new Response(
        JSON.stringify({ success: false, error: 'Notes too long (max 500 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedNotes = notes ? sanitizeInput(notes) : null;
    logger.info('Admin checkout request', { employee_id, hasNotes: !!sanitizedNotes });

    // Get employee details
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('*, branch:branches!employees_branch_id_fkey(*)')
      .eq('id', employee_id)
    .eq('is_active', true)
    .maybeSingle();
  
  if (!employee) {
    return new Response(JSON.stringify({ error: 'Employee not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

    if (employeeError || !employee) {
      return new Response(
        JSON.stringify({ success: false, error: 'Employee not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if employee has checked in today
    const today = getBangkokDateString();
    const { data: checkIn, error: checkInError } = await supabase
      .from('attendance_logs')
      .select('id, server_time')
      .eq('employee_id', employee_id)
      .eq('event_type', 'check_in')
      .gte('server_time', `${today}T00:00:00`)
      .lte('server_time', `${today}T23:59:59`)
      .maybeSingle();

    if (checkInError) throw checkInError;

    if (!checkIn) {
      return new Response(
        JSON.stringify({ success: false, error: 'Employee has not checked in today' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if employee has already checked out
    const { data: existingCheckOut } = await supabase
      .from('attendance_logs')
      .select('id')
      .eq('employee_id', employee_id)
      .eq('event_type', 'check_out')
      .gte('server_time', `${today}T00:00:00`)
      .lte('server_time', `${today}T23:59:59`)
      .maybeSingle();

    if (existingCheckOut) {
      return new Response(
        JSON.stringify({ success: false, error: 'Employee has already checked out today' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert check-out log
    const { data: log, error: logError } = await supabase
      .from('attendance_logs')
      .insert({
        employee_id: employee_id,
        branch_id: employee.branch_id,
        event_type: 'check_out',
        server_time: new Date().toISOString(),
        device_time: new Date().toISOString(),
        timezone: 'Asia/Bangkok',
        source: 'admin_webapp',
        device_info: {
          admin_user_id: user.id,
          admin_action: true,
          notes: sanitizedNotes,
        },
        performed_by_admin_id: user.id,
        admin_notes: sanitizedNotes,
      })
      .select()
      .maybeSingle();
    
    if (logError || !log) {
      logger.error('Failed to insert checkout log', logError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to record checkout' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Admin checkout successful', { employee_id, log_id: log.id });

    // Get admin profile for notification
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const adminName = adminProfile?.display_name || 'Admin';

    const timeStr = formatBangkokTime(new Date(), 'HH:mm');

    // Send confirmation DM to employee
    if (employee.line_user_id) {
      await fetch(`https://api.line.me/v2/bot/message/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')}`
        },
        body: JSON.stringify({
          to: employee.line_user_id,
          messages: [{
            type: 'text',
            text: `✅ เช็คเอาต์สำเร็จ (โดย Admin)\n⏰ เวลา: ${timeStr}\n📍 สาขา: ${employee.branch?.name || 'ไม่ระบุ'}\n👤 ดำเนินการโดย: ${adminName}${sanitizedNotes ? `\n📝 หมายเหตุ: ${sanitizedNotes}` : ''}\n\n---\n\n✅ Successfully checked out (by Admin)\n⏰ Time: ${timeStr}\n📍 Branch: ${employee.branch?.name || 'N/A'}\n👤 Performed by: ${adminName}${sanitizedNotes ? `\n📝 Note: ${sanitizedNotes}` : ''}`
          }]
        })
      });
    }

    // Post to announcement group
    const announcementGroupId = employee.announcement_group_line_id || employee.branch?.line_group_id;
    if (announcementGroupId) {
      await fetch(`https://api.line.me/v2/bot/message/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')}`
        },
        body: JSON.stringify({
          to: announcementGroupId,
          messages: [{
            type: 'text',
            text: `👤 Admin ${adminName} ได้เช็คเอาต์ให้คุณ ${employee.full_name} เวลา ${timeStr} ที่${employee.branch?.name || 'ไม่ระบุ'}${sanitizedNotes ? `\n📝 ${sanitizedNotes}` : ''}`
          }]
        })
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        log: {
          id: log.id,
          event_type: log.event_type,
          server_time: log.server_time,
          source: log.source
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Admin checkout error', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
