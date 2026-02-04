/**
 * Remote Checkout Approval Edge Function
 * 
 * Handles approval/rejection of remote checkout requests by managers/admins.
 * When approved, automatically triggers the checkout for the employee.
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
      request_id, 
      approved, 
      approver_employee_id,
      rejection_reason 
    } = await req.json();

    // Validate required fields
    if (!request_id || approved === undefined || !approver_employee_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'กรุณากรอกข้อมูลให้ครบถ้วน (request_id, approved, approver_employee_id)' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the request with employee info
    const { data: request, error: reqError } = await supabase
      .from('remote_checkout_requests')
      .select(`
        *,
        employee:employees!remote_checkout_requests_employee_id_fkey(
          id, full_name, line_user_id, branch_id
        )
      `)
      .eq('id', request_id)
      .maybeSingle();

    if (reqError || !request) {
      console.error('[remote-checkout-approval] Request not found:', reqError);
      return new Response(
        JSON.stringify({ success: false, error: 'ไม่พบคำขอ' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (request.status !== 'pending') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `คำขอนี้ถูกดำเนินการแล้ว (สถานะ: ${request.status})` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const employee = request.employee as { id: string; full_name: string; line_user_id?: string; branch_id?: string };
    const now = new Date().toISOString();

    if (approved) {
      // === APPROVAL FLOW ===
      
      // Create the checkout log
      const { data: checkoutLog, error: checkoutError } = await supabase
        .from('attendance_logs')
        .insert({
          employee_id: employee.id,
          branch_id: employee.branch_id,
          event_type: 'check_out',
          server_time: now,
          latitude: request.latitude,
          longitude: request.longitude,
          source: 'remote_checkout_approval',
          is_remote_checkin: true,
          admin_notes: `Approved remote checkout. Reason: ${request.reason}`
        })
        .select('id')
        .single();

      if (checkoutError) {
        console.error('[remote-checkout-approval] Failed to create checkout log:', checkoutError);
        return new Response(
          JSON.stringify({ success: false, error: 'ไม่สามารถสร้าง checkout ได้' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update the request status
      const { error: updateError } = await supabase
        .from('remote_checkout_requests')
        .update({
          status: 'approved',
          approved_by_employee_id: approver_employee_id,
          approved_at: now,
          checkout_log_id: checkoutLog.id,
          updated_at: now
        })
        .eq('id', request_id);

      if (updateError) {
        console.error('[remote-checkout-approval] Failed to update request:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'ไม่สามารถอัปเดตคำขอได้' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update/create work session
      const today = getBangkokDateString();
      const { data: checkInLog } = await supabase
        .from('attendance_logs')
        .select('server_time')
        .eq('employee_id', employee.id)
        .eq('event_type', 'check_in')
        .gte('server_time', `${today}T00:00:00+07:00`)
        .order('server_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkInLog) {
        const checkInTime = new Date(checkInLog.server_time);
        const checkOutTime = new Date(now);
        const totalMinutes = Math.floor((checkOutTime.getTime() - checkInTime.getTime()) / 60000);

        await supabase
          .from('work_sessions')
          .upsert({
            employee_id: employee.id,
            work_date: today,
            first_check_in: checkInLog.server_time,
            last_check_out: now,
            total_work_minutes: totalMinutes,
            net_work_minutes: totalMinutes,
            status: 'complete',
            updated_at: now
          }, {
            onConflict: 'employee_id,work_date'
          });
      }

      console.log(`[remote-checkout-approval] Approved request ${request_id} for ${employee.full_name}`);

      const lineChannelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');

      // Send LINE notification to employee
      if (employee.line_user_id && lineChannelToken) {
        try {
          const message = {
            to: employee.line_user_id,
            messages: [{
              type: 'text',
              text: `✅ คำขอ Checkout นอกสถานที่ได้รับการอนุมัติแล้ว\n\n⏰ เวลา Checkout: ${new Date(now).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\nขอบคุณที่ใช้บริการ 🙏`
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
        } catch (notifyError) {
          console.warn('[remote-checkout-approval] Failed to notify employee:', notifyError);
        }
      }

      // Get approver info for admin notification
      const { data: approver } = await supabase
        .from('employees')
        .select('full_name')
        .eq('id', approver_employee_id)
        .maybeSingle();

      // Send notification to Admin LINE group
      if (lineChannelToken) {
        try {
          const { data: settings } = await supabase
            .from('attendance_settings')
            .select('admin_line_group_id')
            .eq('scope', 'global')
            .maybeSingle();

          if (settings?.admin_line_group_id) {
            const adminMessage = {
              to: settings.admin_line_group_id,
              messages: [{
                type: 'text',
                text: `✅ Remote Checkout อนุมัติแล้ว\n\n👤 พนักงาน: ${employee.full_name}\n✍️ อนุมัติโดย: ${approver?.full_name || 'ไม่ทราบ'}\n⏰ เวลา: ${new Date(now).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}`
              }]
            };

            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lineChannelToken}`
              },
              body: JSON.stringify(adminMessage)
            });
            console.log('[remote-checkout-approval] Sent admin notification');
          }
        } catch (adminNotifyError) {
          console.warn('[remote-checkout-approval] Failed to notify admin group:', adminNotifyError);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `✅ อนุมัติคำขอ Checkout นอกสถานที่ของ ${employee.full_name} สำเร็จ`,
          checkout_log_id: checkoutLog.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      // === REJECTION FLOW ===
      
      const { error: updateError } = await supabase
        .from('remote_checkout_requests')
        .update({
          status: 'rejected',
          approved_by_employee_id: approver_employee_id,
          approved_at: now,
          rejection_reason: rejection_reason || 'ไม่ระบุเหตุผล',
          updated_at: now
        })
        .eq('id', request_id);

      if (updateError) {
        console.error('[remote-checkout-approval] Failed to reject request:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'ไม่สามารถปฏิเสธคำขอได้' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[remote-checkout-approval] Rejected request ${request_id} for ${employee.full_name}`);

      const lineChannelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');

      // Send LINE notification to employee
      if (employee.line_user_id && lineChannelToken) {
        try {
          const message = {
            to: employee.line_user_id,
            messages: [{
              type: 'text',
              text: `❌ คำขอ Checkout นอกสถานที่ถูกปฏิเสธ\n\n📝 เหตุผล: ${rejection_reason || 'ไม่ระบุ'}\n\nกรุณาติดต่อหัวหน้างานหากมีข้อสงสัย`
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
        } catch (notifyError) {
          console.warn('[remote-checkout-approval] Failed to notify employee:', notifyError);
        }
      }

      // Get approver info for admin notification
      const { data: approverReject } = await supabase
        .from('employees')
        .select('full_name')
        .eq('id', approver_employee_id)
        .maybeSingle();

      // Send notification to Admin LINE group
      if (lineChannelToken) {
        try {
          const { data: settings } = await supabase
            .from('attendance_settings')
            .select('admin_line_group_id')
            .eq('scope', 'global')
            .maybeSingle();

          if (settings?.admin_line_group_id) {
            const adminMessage = {
              to: settings.admin_line_group_id,
              messages: [{
                type: 'text',
                text: `❌ Remote Checkout ปฏิเสธ\n\n👤 พนักงาน: ${employee.full_name}\n✍️ โดย: ${approverReject?.full_name || 'ไม่ทราบ'}\n📝 เหตุผล: ${rejection_reason || 'ไม่ระบุ'}`
              }]
            };

            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lineChannelToken}`
              },
              body: JSON.stringify(adminMessage)
            });
            console.log('[remote-checkout-approval] Sent admin rejection notification');
          }
        } catch (adminNotifyError) {
          console.warn('[remote-checkout-approval] Failed to notify admin group on rejection:', adminNotifyError);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `❌ ปฏิเสธคำขอ Checkout นอกสถานที่ของ ${employee.full_name}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (err) {
    console.error('[remote-checkout-approval] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
