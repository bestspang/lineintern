/**
 * Remote Checkout Request Edge Function
 * 
 * Creates a request for employees to checkout from outside the geofence area.
 * This request must be approved by a manager/admin before the checkout is processed.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokDateString } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      employee_id, 
      latitude, 
      longitude, 
      distance_from_branch,
      branch_id,
      reason 
    } = await req.json();

    // Validate required fields
    if (!employee_id || !latitude || !longitude || !reason) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'กรุณากรอกข้อมูลให้ครบถ้วน (employee_id, latitude, longitude, reason)' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get employee info
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select(`
        id, full_name, line_user_id, branch_id,
        branch:branches!employees_branch_id_fkey(id, name, line_group_id)
      `)
      .eq('id', employee_id)
      .maybeSingle();

    if (empError || !employee) {
      console.error('[remote-checkout-request] Employee not found:', empError);
      return new Response(
        JSON.stringify({ success: false, error: 'ไม่พบข้อมูลพนักงาน' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = getBangkokDateString();

    // Check for existing pending request today
    const { data: existingRequest } = await supabase
      .from('remote_checkout_requests')
      .select('id, status')
      .eq('employee_id', employee_id)
      .eq('request_date', today)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingRequest) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'คุณมีคำขอ Checkout นอกสถานที่ที่รออนุมัติอยู่แล้ว กรุณารอการอนุมัติ',
          existing_request_id: existingRequest.id
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's check-in log
    const { data: checkInLog } = await supabase
      .from('attendance_logs')
      .select('id')
      .eq('employee_id', employee_id)
      .eq('event_type', 'check_in')
      .gte('server_time', `${today}T00:00:00+07:00`)
      .lt('server_time', `${today}T23:59:59+07:00`)
      .order('server_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Create the remote checkout request
    const { data: request, error: insertError } = await supabase
      .from('remote_checkout_requests')
      .insert({
        employee_id,
        request_date: today,
        latitude,
        longitude,
        distance_from_branch: distance_from_branch || null,
        branch_id: branch_id || employee.branch_id,
        reason,
        status: 'pending',
        checkin_log_id: checkInLog?.id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[remote-checkout-request] Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'ไม่สามารถสร้างคำขอได้' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[remote-checkout-request] Created request ${request.id} for employee ${employee.full_name}`);

    // Send LINE notification to Management team (not branch group)
    // This ensures only managers see approval requests, not all branch employees
    try {
      const lineChannelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
      if (lineChannelToken) {
        // Get the admin LINE group from settings (Management team for approvals)
        const { data: settings } = await supabase
          .from('attendance_settings')
          .select('admin_line_group_id')
          .eq('scope', 'global')
          .maybeSingle();

        const targetGroupId = settings?.admin_line_group_id;
        
        if (targetGroupId) {
          const branchData = employee.branch as { name?: string } | null;
          const message = {
            to: targetGroupId,
            messages: [{
              type: 'text',
              text: `📍 คำขอ Checkout นอกสถานที่\n\n👤 ${employee.full_name}\n📏 ระยะห่าง: ${Math.round(distance_from_branch || 0)} เมตร\n📝 เหตุผล: ${reason}\n🏢 สาขา: ${branchData?.name || 'ไม่ระบุ'}\n\n⏳ กรุณาอนุมัติใน Portal`
            }]
          };

          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${lineChannelToken}`
            },
            body: JSON.stringify(message)
          });

          console.log(`[remote-checkout-request] Sent LINE notification to admin group ${targetGroupId}`);
        } else {
          console.warn('[remote-checkout-request] No admin_line_group_id configured in attendance_settings');
        }
      }
    } catch (notifyError) {
      console.warn('[remote-checkout-request] Failed to send LINE notification:', notifyError);
      // Don't fail the request if notification fails
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        request_id: request.id,
        message: '✅ ส่งคำขอ Checkout นอกสถานที่สำเร็จ\n\nกรุณารอการอนุมัติจากหัวหน้างาน'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[remote-checkout-request] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
