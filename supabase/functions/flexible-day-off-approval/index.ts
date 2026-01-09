import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApprovalRequest {
  request_id: string;
  request_ids?: string[]; // For bulk actions
  action: 'approve' | 'reject';
  notes?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Verify user has admin role
    const { data: isAdmin } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ApprovalRequest = await req.json();
    const { request_id, request_ids, action, notes } = body;

    // Determine which IDs to process (bulk or single)
    const idsToProcess = request_ids && request_ids.length > 0 
      ? request_ids 
      : request_id ? [request_id] : [];

    if (idsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No request IDs provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[flexible-day-off-approval] Processing ${idsToProcess.length} requests, action: ${action}`);

    const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const now = new Date().toISOString();

    // Get all requests with employee details
    const { data: requests, error: fetchError } = await supabase
      .from('flexible_day_off_requests')
      .select(`
        *,
        employees (
          id, full_name, code, line_user_id, announcement_group_line_id,
          branch:branches!employees_branch_id_fkey(name)
        )
      `)
      .in('id', idsToProcess)
      .eq('status', 'pending');

    if (fetchError) {
      console.error('[flexible-day-off-approval] Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch requests' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!requests || requests.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No pending requests found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update all requests
    const updateData: any = {
      status: newStatus,
      approved_at: action === 'approve' ? now : null,
      approved_by_admin_id: user.id,
      rejection_reason: action === 'reject' ? (notes || 'ไม่อนุมัติ') : null,
      updated_at: now,
    };

    const { error: updateError } = await supabase
      .from('flexible_day_off_requests')
      .update(updateData)
      .in('id', idsToProcess);

    if (updateError) {
      console.error('[flexible-day-off-approval] Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update requests' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[flexible-day-off-approval] Updated ${requests.length} requests to ${newStatus}`);

    // Log approvals
    const approvalLogs = requests.map(req => ({
      request_type: 'flexible_day_off',
      request_id: req.id,
      employee_id: req.employee_id,
      admin_id: user.id,
      action: newStatus,
      decision_method: 'webapp',
      notes: notes || null,
    }));

    await supabase.from('approval_logs').insert(approvalLogs);

    // Format Thai date helper
    const formatThaiDate = (dateStr: string) => {
      const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const d = new Date(dateStr);
      return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
    };

    // Send LINE notifications
    if (LINE_ACCESS_TOKEN) {
      for (const request of requests) {
        const employee = request.employees;
        if (!employee) continue;

        const formattedDate = formatThaiDate(request.day_off_date);
        const branchName = (employee.branch as any)?.name || '-';

        // Message to employee
        let employeeMessage: string;
        if (action === 'approve') {
          employeeMessage = `✅ คำขอวันหยุดยืดหยุ่น: อนุมัติ\n\n` +
            `📅 วันหยุด: ${formattedDate}\n` +
            `${request.reason ? `📝 เหตุผล: ${request.reason}\n` : ''}` +
            `\n✨ ได้รับอนุมัติให้หยุดงานแล้ว\nขอบคุณครับ!`;
        } else {
          employeeMessage = `❌ คำขอวันหยุดยืดหยุ่น: ไม่อนุมัติ\n\n` +
            `📅 วันที่ขอหยุด: ${formattedDate}\n` +
            `${request.reason ? `📝 เหตุผล: ${request.reason}\n` : ''}` +
            `${notes ? `❌ หมายเหตุ: ${notes}\n` : ''}` +
            `\nกรุณาเลือกวันอื่นหรือติดต่อ Admin`;
        }

        // Send to employee
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
            console.log(`[flexible-day-off-approval] Notified employee ${employee.code}`);
          } catch (e) {
            console.error('[flexible-day-off-approval] Error sending to employee:', e);
          }
        }

        // Post to announcement group
        if (employee.announcement_group_line_id) {
          const actionEmoji = action === 'approve' ? '✅' : '❌';
          const actionText = action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';
          
          const groupMessage = `${actionEmoji} ${actionText}วันหยุดยืดหยุ่น\n\n` +
            `👤 ${employee.full_name} (${employee.code})\n` +
            `📅 ${formattedDate}` +
            `${notes ? `\n📝 หมายเหตุ: ${notes}` : ''}`;

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
            console.error('[flexible-day-off-approval] Error posting to group:', e);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        status: newStatus,
        processed_count: requests.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[flexible-day-off-approval] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
