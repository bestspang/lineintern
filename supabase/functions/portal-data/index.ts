import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { endpoint, employee_id, params } = await req.json();

    if (!employee_id) {
      return new Response(
        JSON.stringify({ error: 'employee_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[portal-data] Endpoint: ${endpoint}, Employee: ${employee_id}`);

    let data: any = null;
    let error: any = null;

    switch (endpoint) {
      case 'attendance-history': {
        const days = params?.days || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const result = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('employee_id', employee_id)
          .gte('server_time', startDate.toISOString())
          .order('server_time', { ascending: false });
        
        data = result.data;
        error = result.error;
        break;
      }

      case 'work-sessions': {
        const days = params?.days || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const result = await supabase
          .from('work_sessions')
          .select('*')
          .eq('employee_id', employee_id)
          .gte('work_date', startDate.toISOString().split('T')[0])
          .order('work_date', { ascending: false });
        
        data = result.data;
        error = result.error;
        break;
      }

      case 'today-status': {
        const today = new Date().toISOString().split('T')[0];
        
        // Get today's logs
        const logsResult = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('employee_id', employee_id)
          .gte('server_time', `${today}T00:00:00`)
          .lte('server_time', `${today}T23:59:59`)
          .order('server_time', { ascending: true });

        // Get today's work session
        const sessionResult = await supabase
          .from('work_sessions')
          .select('*')
          .eq('employee_id', employee_id)
          .eq('work_date', today)
          .maybeSingle();

        data = {
          logs: logsResult.data || [],
          session: sessionResult.data
        };
        error = logsResult.error || sessionResult.error;
        break;
      }

      case 'leave-balance': {
        const year = params?.year || new Date().getFullYear();
        
        const result = await supabase
          .from('leave_balances')
          .select('*')
          .eq('employee_id', employee_id)
          .eq('leave_year', year)
          .maybeSingle();
        
        data = result.data;
        error = result.error;
        break;
      }

      case 'leave-requests': {
        const result = await supabase
          .from('leave_requests')
          .select('*')
          .eq('employee_id', employee_id)
          .order('created_at', { ascending: false })
          .limit(50);
        
        data = result.data;
        error = result.error;
        break;
      }

      case 'payroll': {
        // Get employee settings
        const settingsResult = await supabase
          .from('employee_payroll_settings')
          .select('*')
          .eq('employee_id', employee_id)
          .maybeSingle();

        // Get current month work sessions
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const sessionsResult = await supabase
          .from('work_sessions')
          .select('*')
          .eq('employee_id', employee_id)
          .gte('work_date', monthStart.toISOString().split('T')[0])
          .lte('work_date', monthEnd.toISOString().split('T')[0]);

        // Get approved overtime
        const otResult = await supabase
          .from('overtime_requests')
          .select('*')
          .eq('employee_id', employee_id)
          .eq('status', 'approved')
          .gte('request_date', monthStart.toISOString().split('T')[0])
          .lte('request_date', monthEnd.toISOString().split('T')[0]);

        // Get leave requests
        const leaveResult = await supabase
          .from('leave_requests')
          .select('*')
          .eq('employee_id', employee_id)
          .eq('status', 'approved')
          .gte('start_date', monthStart.toISOString().split('T')[0])
          .lte('end_date', monthEnd.toISOString().split('T')[0]);

        data = {
          settings: settingsResult.data,
          sessions: sessionsResult.data || [],
          overtime: otResult.data || [],
          leaves: leaveResult.data || []
        };
        error = settingsResult.error || sessionsResult.error;
        break;
      }

      case 'points': {
        const pointsResult = await supabase
          .from('happy_points')
          .select('*')
          .eq('employee_id', employee_id)
          .maybeSingle();

        const transactionsResult = await supabase
          .from('point_transactions')
          .select('*')
          .eq('employee_id', employee_id)
          .order('created_at', { ascending: false })
          .limit(20);

        const redemptionsResult = await supabase
          .from('point_redemptions')
          .select(`
            *,
            reward:rewards(*)
          `)
          .eq('employee_id', employee_id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        data = {
          points: pointsResult.data,
          transactions: transactionsResult.data || [],
          pendingRedemptions: redemptionsResult.data || []
        };
        error = pointsResult.error;
        break;
      }

      case 'schedules': {
        const weekStart = params?.weekStart;
        const weekEnd = params?.weekEnd;
        
        if (!weekStart || !weekEnd) {
          error = { message: 'weekStart and weekEnd are required' };
          break;
        }

        // Get regular schedules
        const schedulesResult = await supabase
          .from('work_schedules')
          .select('*')
          .eq('employee_id', employee_id)
          .eq('is_active', true);

        // Get shift assignments for the week
        const assignmentsResult = await supabase
          .from('shift_assignments')
          .select(`
            *,
            shift:shift_templates(*)
          `)
          .eq('employee_id', employee_id)
          .gte('assignment_date', weekStart)
          .lte('assignment_date', weekEnd);

        data = {
          schedules: schedulesResult.data || [],
          assignments: assignmentsResult.data || []
        };
        error = schedulesResult.error || assignmentsResult.error;
        break;
      }

      case 'profile': {
        const result = await supabase
          .from('employees')
          .select(`
            *,
            branch:branches!employees_branch_id_fkey(*),
            role:employee_roles(*)
          `)
          .eq('id', employee_id)
          .maybeSingle();
        
        data = result.data;
        error = result.error;
        break;
      }

      case 'home-summary': {
        const today = new Date().toISOString().split('T')[0];
        
        // Get points
        const pointsResult = await supabase
          .from('happy_points')
          .select('current_balance, total_earned, current_streak')
          .eq('employee_id', employee_id)
          .maybeSingle();

        // Get today's attendance
        const attendanceResult = await supabase
          .from('attendance_logs')
          .select('event_type, server_time, is_overtime')
          .eq('employee_id', employee_id)
          .gte('server_time', `${today}T00:00:00`)
          .lte('server_time', `${today}T23:59:59`)
          .order('server_time', { ascending: true });

        // Get pending approvals count (for managers)
        const pendingOTResult = await supabase
          .from('overtime_requests')
          .select('id', { count: 'exact' })
          .eq('status', 'pending');

        const pendingLeaveResult = await supabase
          .from('leave_requests')
          .select('id', { count: 'exact' })
          .eq('status', 'pending');

        data = {
          points: pointsResult.data,
          todayAttendance: attendanceResult.data || [],
          pendingApprovals: {
            overtime: pendingOTResult.count || 0,
            leave: pendingLeaveResult.count || 0
          }
        };
        error = pointsResult.error || attendanceResult.error;
        break;
      }

      case 'team-summary': {
        // Get employee's branch first
        const empResult = await supabase
          .from('employees')
          .select('branch_id, role:employee_roles(role_name)')
          .eq('id', employee_id)
          .maybeSingle();

        if (!empResult.data) {
          error = { message: 'Employee not found' };
          break;
        }

        const branchId = empResult.data.branch_id;
        const today = new Date().toISOString().split('T')[0];

        // Get all employees in the branch
        const employeesResult = await supabase
          .from('employees')
          .select('id, full_name, nickname')
          .eq('branch_id', branchId)
          .eq('is_active', true);

        // Get today's attendance for these employees
        const employeeIds = (employeesResult.data || []).map(e => e.id);
        
        const attendanceResult = await supabase
          .from('attendance_logs')
          .select('employee_id, event_type, server_time')
          .in('employee_id', employeeIds)
          .gte('server_time', `${today}T00:00:00`)
          .lte('server_time', `${today}T23:59:59`)
          .order('server_time', { ascending: true });

        data = {
          employees: employeesResult.data || [],
          attendance: attendanceResult.data || []
        };
        error = employeesResult.error || attendanceResult.error;
        break;
      }

      case 'today-photos': {
        const today = new Date().toISOString().split('T')[0];
        const branchId = params?.branchId;
        
        let query = supabase
          .from('attendance_logs')
          .select(`
            id,
            event_type,
            server_time,
            photo_url,
            employee:employees!attendance_logs_employee_id_fkey(
              id,
              full_name,
              nickname,
              branch:branches!employees_branch_id_fkey(id, name)
            )
          `)
          .not('photo_url', 'is', null)
          .gte('server_time', `${today}T00:00:00`)
          .lte('server_time', `${today}T23:59:59`)
          .order('server_time', { ascending: false });

        if (branchId) {
          query = query.eq('branch_id', branchId);
        }

        const result = await query.limit(100);
        data = result.data;
        error = result.error;
        break;
      }

      case 'branches': {
        const result = await supabase
          .from('branches')
          .select('id, name')
          .eq('is_deleted', false)
          .order('name');
        
        data = result.data;
        error = result.error;
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown endpoint: ${endpoint}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    if (error) {
      console.error(`[portal-data] Error for ${endpoint}:`, error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[portal-data] Success for ${endpoint}`);
    return new Response(
      JSON.stringify({ data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[portal-data] Unexpected error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
