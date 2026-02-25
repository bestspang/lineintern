import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokDateString } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FlexibleDayOffRequest {
  employee_id: string;
  day_off_date: string;
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
    const body: FlexibleDayOffRequest = await req.json();

    console.log('[flexible-day-off-request] Received request:', body);

    // Validate input
    if (!body.employee_id || !body.day_off_date) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get employee details with flexible settings
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select(`
        id, code, full_name, line_user_id, announcement_group_line_id,
        flexible_day_off_enabled, flexible_days_per_week, 
        flexible_advance_days_required, flexible_auto_approve,
        branch:branches!employees_branch_id_fkey(name)
      `)
      .eq('id', body.employee_id)
      .maybeSingle();

    if (empError || !employee) {
      console.error('[flexible-day-off-request] Employee not found:', empError);
      return new Response(
        JSON.stringify({ success: false, error: 'Employee not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!employee.flexible_day_off_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'Flexible day-off is not enabled for this employee' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate week start (Monday)
    const dayOffDate = new Date(body.day_off_date);
    const dayOfWeek = dayOffDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday is start
    const weekStart = new Date(dayOffDate);
    weekStart.setDate(dayOffDate.getDate() + diff);
    // ⚠️ TIMEZONE: Use Bangkok date string format
    const weekStartDate = getBangkokDateString(weekStart);

    // Check existing requests this week
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    // ⚠️ TIMEZONE: Use Bangkok date string format
    const weekEndDate = getBangkokDateString(weekEnd);
    
    const { data: existingRequests } = await supabase
      .from('flexible_day_off_requests')
      .select('id')
      .eq('employee_id', body.employee_id)
      .gte('day_off_date', weekStartDate)
      .lte('day_off_date', weekEndDate)
      .in('status', ['pending', 'approved']);

    const usedDays = existingRequests?.length || 0;
    const remainingQuota = (employee.flexible_days_per_week || 1) - usedDays;

    if (remainingQuota <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Weekly quota exceeded' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already requested this date
    const { data: existingOnDate } = await supabase
      .from('flexible_day_off_requests')
      .select('id')
      .eq('employee_id', body.employee_id)
      .eq('day_off_date', body.day_off_date)
      .in('status', ['pending', 'approved'])
      .maybeSingle();

    if (existingOnDate) {
      return new Response(
        JSON.stringify({ success: false, error: 'Already requested for this date' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine status based on auto-approve setting
    const isAutoApprove = employee.flexible_auto_approve === true;
    const status = isAutoApprove ? 'approved' : 'pending';
    const approvedAt = isAutoApprove ? new Date().toISOString() : null;

    // Create request
    const { data: request, error: insertError } = await supabase
      .from('flexible_day_off_requests')
      .insert({
        employee_id: body.employee_id,
        day_off_date: body.day_off_date,
        week_start_date: weekStartDate,
        reason: body.reason || null,
        status,
        approved_at: approvedAt,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[flexible-day-off-request] Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[flexible-day-off-request] Created request:', request.id, 'status:', status);

    // Notify managers/admins via portal notification (only for pending, not auto-approve)
    if (!isAutoApprove) {
      try {
        const { data: managerEmployees } = await supabase
          .from('employees')
          .select('id, role_id, employee_roles!inner(role_key)')
          .in('employee_roles.role_key', ['admin', 'manager', 'hr', 'owner'])
          .eq('is_active', true);

        if (managerEmployees && managerEmployees.length > 0) {
          // Check notification preferences
          const { data: prefs } = await supabase
            .from('notification_preferences')
            .select('employee_id, notify_day_off')
            .in('employee_id', managerEmployees.map(m => m.id));
          const prefMap = new Map(prefs?.map(p => [p.employee_id, p]) || []);

          const notifications = managerEmployees
            .filter(m => m.id !== body.employee_id)
            .filter(m => {
              const pref = prefMap.get(m.id);
              return !pref || pref.notify_day_off !== false;
            })
            .map(m => ({
              employee_id: m.id,
              title: '📅 คำขอวันหยุดยืดหยุ่น',
              body: `${employee.full_name} ขอหยุดวันที่ ${body.day_off_date}`,
              type: 'approval',
              priority: 'high',
              action_url: '/portal/approve-leave',
              metadata: { request_type: 'flexible_day_off', request_id: request.id }
            }));
          
          if (notifications.length > 0) {
            await supabase.from('notifications').insert(notifications);
          }
        }
      } catch (e) {
        console.warn('[flexible-day-off-request] Failed to create manager notifications', e);
      }
    }

    // Format date in Thai
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const d = new Date(body.day_off_date);
    const formattedDate = `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
    const branchName = (employee.branch as any)?.name || '-';

    // Send LINE notifications
    if (LINE_ACCESS_TOKEN) {
      if (isAutoApprove) {
        // Send confirmation to employee
        const employeeMessage = `✅ อนุมัติวันหยุดยืดหยุ่น (อัตโนมัติ)\n\n` +
          `👤 พนักงาน: ${employee.full_name} (${employee.code})\n` +
          `📍 สาขา: ${branchName}\n` +
          `📅 วันหยุด: ${formattedDate}\n` +
          `${body.reason ? `📝 เหตุผล: ${body.reason}\n` : ''}` +
          `\n✨ อนุมัติอัตโนมัติเรียบร้อยแล้ว`;

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
            console.log('[flexible-day-off-request] Sent auto-approve message to employee');
          } catch (e) {
            console.error('[flexible-day-off-request] Error sending to employee:', e);
          }
        }

        // Post to announcement group
        if (employee.announcement_group_line_id) {
          const groupMessage = `📅 วันหยุดยืดหยุ่น (อนุมัติอัตโนมัติ)\n\n` +
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
            console.log('[flexible-day-off-request] Posted to announcement group');
          } catch (e) {
            console.error('[flexible-day-off-request] Error posting to group:', e);
          }
        }
      } else {
        // Not auto-approve: Notify employee and admins
        const employeeMessage = `📤 ส่งคำขอวันหยุดยืดหยุ่นแล้ว\n\n` +
          `📅 วันที่ขอหยุด: ${formattedDate}\n` +
          `${body.reason ? `📝 เหตุผล: ${body.reason}\n` : ''}` +
          `\n⏳ รอการอนุมัติจาก Admin...`;

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
            console.log('[flexible-day-off-request] Sent pending message to employee');
          } catch (e) {
            console.error('[flexible-day-off-request] Error sending to employee:', e);
          }
        }

        // Notify admins
        const { data: admins } = await supabase
          .from('user_roles')
          .select('users!inner(line_user_id, display_name)')
          .eq('role', 'admin');

        const adminMessage = `🔔 คำขอวันหยุดยืดหยุ่น\n\n` +
          `👤 พนักงาน: ${employee.full_name} (${employee.code})\n` +
          `📍 สาขา: ${branchName}\n` +
          `📅 วันที่ขอหยุด: ${formattedDate}\n` +
          `${body.reason ? `📝 เหตุผล: ${body.reason}\n` : ''}` +
          `\n⏳ รอการอนุมัติจาก Admin`;

        if (admins && admins.length > 0) {
          for (const admin of admins) {
            const adminUser = (admin.users as any);
            if (adminUser?.line_user_id) {
              try {
                await fetch('https://api.line.me/v2/bot/message/push', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    to: adminUser.line_user_id,
                    messages: [{ type: 'text', text: adminMessage }]
                  })
                });
              } catch (e) {
                console.error('[flexible-day-off-request] Error sending to admin:', e);
              }
            }
          }
          console.log('[flexible-day-off-request] Notified', admins.length, 'admins');
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
                messages: [{ type: 'text', text: adminMessage }]
              })
            });
          } catch (e) {
            console.error('[flexible-day-off-request] Error posting to group:', e);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        request_id: request.id,
        status,
        auto_approved: isAutoApprove
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[flexible-day-off-request] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
