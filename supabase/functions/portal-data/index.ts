/**
 * ⚠️ PORTAL DATA API - CRITICAL TIMEZONE HANDLING
 * Always use getBangkokDateString() from timezone.ts, NEVER new Date().toISOString().split('T')[0]
 * 
 * This edge function bypasses RLS by using service role key.
 * All portal pages should use portalApi() helper to call this function.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokDateString, getBangkokStartOfDay, getBangkokEndOfDay, getBangkokNow } from '../_shared/timezone.ts';

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
        
        // ⚠️ TIMEZONE: Use Bangkok date
        const result = await supabase
          .from('work_sessions')
          .select('*')
          .eq('employee_id', employee_id)
          .gte('work_date', getBangkokDateString(startDate))
          .order('work_date', { ascending: false });
        
        data = result.data;
        error = result.error;
        break;
      }

      case 'today-status': {
        // ⚠️ TIMEZONE: Use Bangkok date
        const today = getBangkokDateString();
        
        // Get today's logs
        const logsResult = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('employee_id', employee_id)
          .gte('server_time', `${today}T00:00:00+07:00`)
          .lte('server_time', `${today}T23:59:59+07:00`)
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
        // Get employee payroll settings
        const settingsResult = await supabase
          .from('employee_payroll_settings')
          .select('*')
          .eq('employee_id', employee_id)
          .maybeSingle();
        
        // Get employee base info for salary
        const empInfoResult = await supabase
          .from('employees')
          .select('salary_per_month, hours_per_day, ot_rate_multiplier')
          .eq('id', employee_id)
          .maybeSingle();

        // Get work schedules for proper late detection
        const schedulesResult = await supabase
          .from('work_schedules')
          .select('day_of_week, is_working_day, start_time, end_time')
          .eq('employee_id', employee_id);
        
        // Get global grace period
        const graceResult = await supabase
          .from('attendance_settings')
          .select('grace_period_minutes')
          .eq('scope', 'global')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get current month work sessions (use Bangkok timezone for month boundaries)
        // ⚠️ TIMEZONE: Use Bangkok date for month boundaries
        const now = getBangkokNow();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const monthStartStr = getBangkokDateString(monthStart);
        const monthEndStr = getBangkokDateString(monthEnd);

        const sessionsResult = await supabase
          .from('work_sessions')
          .select('*')
          .eq('employee_id', employee_id)
          .gte('work_date', monthStartStr)
          .lte('work_date', monthEndStr);

        // Get approved overtime
        const otResult = await supabase
          .from('overtime_requests')
          .select('*')
          .eq('employee_id', employee_id)
          .eq('status', 'approved')
          .gte('request_date', monthStartStr)
          .lte('request_date', monthEndStr);

        // Get leave requests (include leave_type for paid/unpaid distinction)
        const leaveResult = await supabase
          .from('leave_requests')
          .select('*')
          .eq('employee_id', employee_id)
          .eq('status', 'approved')
          .gte('start_date', monthStartStr)
          .lte('end_date', monthEndStr);
        
        // Get attendance logs for late detection
        const logsResult = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('employee_id', employee_id)
          .eq('event_type', 'check_in')
          .gte('server_time', monthStart.toISOString())
          .lte('server_time', now.toISOString());

        // Merge settings with employee info
        const mergedSettings = {
          ...(settingsResult.data || {}),
          salary_per_month: settingsResult.data?.salary_per_month || empInfoResult.data?.salary_per_month || 0,
          hours_per_day: empInfoResult.data?.hours_per_day || 8,
          ot_rate_multiplier: empInfoResult.data?.ot_rate_multiplier || 1.5,
        };

        data = {
          settings: mergedSettings,
          sessions: sessionsResult.data || [],
          overtime: otResult.data || [],
          leaves: leaveResult.data || [],
          checkInLogs: logsResult.data || [],
          workSchedules: schedulesResult.data || [],
          gracePeriodMinutes: graceResult.data?.grace_period_minutes || 15
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
            reward:point_rewards(*)
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
          .eq('employee_id', employee_id);

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

      // NEW: Full profile with schedules
      case 'profile-full': {
        // Get employee with branch and role
        const empResult = await supabase
          .from('employees')
          .select(`
            *,
            branch:branches!employees_branch_id_fkey(*),
            role:employee_roles(*)
          `)
          .eq('id', employee_id)
          .maybeSingle();
        
        // Get work schedules
        const schedulesResult = await supabase
          .from('work_schedules')
          .select('day_of_week, is_working_day, start_time, end_time, expected_hours')
          .eq('employee_id', employee_id)
          .order('day_of_week');

        data = {
          employee: empResult.data,
          schedules: schedulesResult.data || []
        };
        error = empResult.error;
        break;
      }

      case 'home-summary': {
        // ⚠️ TIMEZONE: Use Bangkok date
        const today = getBangkokDateString();
        
        // Get points
        const pointsResult = await supabase
          .from('happy_points')
          .select('point_balance, total_earned, current_punctuality_streak')
          .eq('employee_id', employee_id)
          .maybeSingle();

        // Get today's attendance
        const attendanceResult = await supabase
          .from('attendance_logs')
          .select('event_type, server_time, is_overtime')
          .eq('employee_id', employee_id)
          .gte('server_time', `${today}T00:00:00+07:00`)
          .lte('server_time', `${today}T23:59:59+07:00`)
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
          points: pointsResult.data ? {
            current_balance: pointsResult.data.point_balance,
            current_streak: pointsResult.data.current_punctuality_streak,
            total_earned: pointsResult.data.total_earned
          } : null,
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
          .select('branch_id, role:employee_roles(role_key)')
          .eq('id', employee_id)
          .maybeSingle();

        if (!empResult.data) {
          error = { message: 'Employee not found' };
          break;
        }

        const branchId = empResult.data.branch_id;
        // ⚠️ TIMEZONE: Use Bangkok date
        const today = getBangkokDateString();

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
          .gte('server_time', `${today}T00:00:00+07:00`)
          .lte('server_time', `${today}T23:59:59+07:00`)
          .order('server_time', { ascending: true });

        data = {
          employees: employeesResult.data || [],
          attendance: attendanceResult.data || []
        };
        error = employeesResult.error || attendanceResult.error;
        break;
      }

      case 'today-photos': {
        // ⚠️ TIMEZONE: Use Bangkok date
        const today = getBangkokDateString();
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
          .gte('server_time', `${today}T00:00:00+07:00`)
          .lte('server_time', `${today}T23:59:59+07:00`)
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

      case 'submit-leave': {
        const result = await supabase
          .from('leave_requests')
          .insert({
            employee_id,
            leave_type: params.leave_type,
            start_date: params.start_date,
            end_date: params.end_date,
            reason: params.reason,
            total_days: params.total_days,
            status: 'pending',
            requested_at: new Date().toISOString(),
            request_date: params.request_date,
          })
          .select()
          .single();
        data = result.data;
        error = result.error;
        break;
      }

      case 'submit-ot': {
        const result = await supabase
          .from('overtime_requests')
          .insert({
            employee_id,
            request_date: params.request_date,
            estimated_hours: params.estimated_hours,
            reason: params.reason,
            status: 'pending',
            requested_at: new Date().toISOString(),
          })
          .select()
          .single();
        data = result.data;
        error = result.error;
        break;
      }

      case 'ot-requests': {
        const result = await supabase
          .from('overtime_requests')
          .select('id, request_date, estimated_hours, reason, status, created_at')
          .eq('employee_id', employee_id)
          .order('created_at', { ascending: false })
          .limit(params?.limit || 10);
        data = result.data;
        error = result.error;
        break;
      }

      case 'attendance-status': {
        // ⚠️ TIMEZONE: Use Bangkok date
        const today = getBangkokDateString();
        
        // Get can check-in/out status via RPC
        const [checkInResult, checkOutResult] = await Promise.all([
          supabase.rpc('can_employee_check_in', { p_employee_id: employee_id }),
          supabase.rpc('can_employee_check_out', { p_employee_id: employee_id }),
        ]);

        // Get today's logs with proper timezone
        const logsResult = await supabase
          .from('attendance_logs')
          .select('event_type, server_time, branch_id')
          .eq('employee_id', employee_id)
          .gte('server_time', `${today}T00:00:00+07:00`)
          .lt('server_time', `${today}T23:59:59+07:00`)
          .order('server_time', { ascending: true });

        const todayLogs = logsResult.data || [];
        const checkInLog = todayLogs.find((l: any) => l.event_type === 'check-in' || l.event_type === 'check_in');
        const checkOutLog = todayLogs.find((l: any) => l.event_type === 'check-out' || l.event_type === 'check_out');

        // Get branch name if checked in
        let branchName: string | null = null;
        if (checkInLog?.branch_id) {
          const { data: branchData } = await supabase
            .from('branches')
            .select('name')
            .eq('id', checkInLog.branch_id)
            .single();
          branchName = branchData?.name || null;
        }

        // Calculate minutes worked
        let minutesWorked = null;
        if (checkInLog && !checkOutLog) {
          const checkInTime = new Date(checkInLog.server_time);
          minutesWorked = Math.floor((new Date().getTime() - checkInTime.getTime()) / 60000);
        } else if (checkInLog && checkOutLog) {
          const checkInTime = new Date(checkInLog.server_time);
          const checkOutTime = new Date(checkOutLog.server_time);
          minutesWorked = Math.floor((checkOutTime.getTime() - checkInTime.getTime()) / 60000);
        }

        // Check for leave/day-off
        let isOnLeave = false;
        let leaveType: string | null = null;
        const flexDayOffResult = await supabase
          .from('flexible_day_off_requests')
          .select('reason')
          .eq('employee_id', employee_id)
          .eq('day_off_date', today)
          .eq('status', 'approved')
          .limit(1);
        
        if (flexDayOffResult.data && flexDayOffResult.data.length > 0) {
          isOnLeave = true;
          leaveType = flexDayOffResult.data[0]?.reason || 'day-off';
        }

        // Check for OT request
        let hasOT = false;
        const otResult = await supabase
          .from('overtime_requests')
          .select('id')
          .eq('employee_id', employee_id)
          .eq('request_date', today)
          .eq('status', 'approved')
          .limit(1);
        
        hasOT = !!(otResult.data && otResult.data.length > 0);

        data = {
          canCheckIn: checkInResult.data === true,
          canCheckOut: checkOutResult.data === true,
          todayCheckIn: checkInLog?.server_time || null,
          todayCheckOut: checkOutLog?.server_time || null,
          isWorking: !!checkInLog && !checkOutLog,
          minutesWorked,
          branchName,
          isOnLeave,
          leaveType,
          hasOT
        };
        break;
      }

      // ========== NEW ENDPOINTS FOR PORTAL MIGRATION ==========

      // Approval counts for Approvals.tsx
      case 'approval-counts': {
        const branchId = params?.branchId;
        const isAdmin = params?.isAdmin === true;

        let otQuery = supabase
          .from('overtime_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');

        let leaveQuery = supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');

        let earlyLeaveQuery = supabase
          .from('early_leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');

        let redemptionsQuery = supabase
          .from('point_redemptions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');

        let remoteCheckoutQuery = supabase
          .from('remote_checkout_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');

        // Manager filter by branch (need to filter after fetch for requests without direct branch_id)
        if (!isAdmin && branchId) {
          remoteCheckoutQuery = remoteCheckoutQuery.eq('branch_id', branchId);
        }

        const [otRes, leaveRes, earlyRes, redemptionRes, remoteRes] = await Promise.all([
          otQuery,
          leaveQuery,
          earlyLeaveQuery,
          redemptionsQuery,
          remoteCheckoutQuery
        ]);

        // For manager, we need to filter OT/Leave/EarlyLeave by fetching with branch
        if (!isAdmin && branchId) {
          const [otBranchRes, leaveBranchRes, earlyBranchRes] = await Promise.all([
            supabase
              .from('overtime_requests')
              .select('id, employee:employees!inner(branch_id)', { count: 'exact', head: true })
              .eq('status', 'pending')
              .eq('employee.branch_id', branchId),
            supabase
              .from('leave_requests')
              .select('id, employee:employees!inner(branch_id)', { count: 'exact', head: true })
              .eq('status', 'pending')
              .eq('employee.branch_id', branchId),
            supabase
              .from('early_leave_requests')
              .select('id, employee:employees!inner(branch_id)', { count: 'exact', head: true })
              .eq('status', 'pending')
              .eq('employee.branch_id', branchId),
          ]);

          data = {
            ot: otBranchRes.count || 0,
            leave: leaveBranchRes.count || 0,
            earlyLeave: earlyBranchRes.count || 0,
            remoteCheckout: remoteRes.count || 0,
            redemptions: 0, // Manager doesn't see redemptions
          };
        } else {
          data = {
            ot: otRes.count || 0,
            leave: leaveRes.count || 0,
            earlyLeave: earlyRes.count || 0,
            remoteCheckout: remoteRes.count || 0,
            redemptions: redemptionRes.count || 0,
          };
        }
        break;
      }

      // Pending OT requests for ApproveOT.tsx
      case 'pending-ot-requests': {
        const branchId = params?.branchId;
        const isAdmin = params?.isAdmin === true;

        let query = supabase
          .from('overtime_requests')
          .select(`
            id, request_date, estimated_hours, reason, status, created_at,
            employee:employees!overtime_requests_employee_id_fkey (
              id, full_name, code, branch_id,
              branch:branches!employees_branch_id_fkey ( name )
            )
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        const { data: requests, error: reqError } = await query;

        if (reqError) {
          error = reqError;
        } else {
          // Filter by branch for managers
          let filtered = requests || [];
          if (!isAdmin && branchId) {
            filtered = filtered.filter((r: any) => r.employee?.branch_id === branchId);
          }
          data = filtered;
        }
        break;
      }

      // Approve/Reject OT request
      case 'approve-ot': {
        const { requestId, approved, approverEmployeeId } = params;

        const { error: updateError } = await supabase
          .from('overtime_requests')
          .update({
            status: approved ? 'approved' : 'rejected',
            approved_at: new Date().toISOString(),
            approved_by_admin_id: approverEmployeeId,
          })
          .eq('id', requestId);

        if (updateError) {
          error = updateError;
        } else {
          data = { success: true };
        }
        break;
      }

      // Pending leave requests for ApproveLeave.tsx
      case 'pending-leave-requests': {
        const branchId = params?.branchId;
        const isAdmin = params?.isAdmin === true;

        const { data: requests, error: reqError } = await supabase
          .from('leave_requests')
          .select(`
            id, leave_type, start_date, end_date, reason, status, total_days, created_at,
            employee:employees!leave_requests_employee_id_fkey (
              id, full_name, code, branch_id,
              branch:branches!employees_branch_id_fkey ( name )
            )
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (reqError) {
          error = reqError;
        } else {
          let filtered = requests || [];
          if (!isAdmin && branchId) {
            filtered = filtered.filter((r: any) => r.employee?.branch_id === branchId);
          }
          data = filtered;
        }
        break;
      }

      // Approve/Reject leave request
      case 'approve-leave': {
        const { requestId, approved, approverEmployeeId } = params;

        const { error: updateError } = await supabase
          .from('leave_requests')
          .update({
            status: approved ? 'approved' : 'rejected',
            approved_at: new Date().toISOString(),
            approved_by_admin_id: approverEmployeeId,
          })
          .eq('id', requestId);

        if (updateError) {
          error = updateError;
        } else {
          data = { success: true };
        }
        break;
      }

      // Pending early leave requests for ApproveEarlyLeave.tsx
      case 'pending-early-leave-requests': {
        const branchId = params?.branchId;
        const isAdmin = params?.isAdmin === true;

        const { data: requests, error: reqError } = await supabase
          .from('early_leave_requests')
          .select(`
            id, request_date, leave_reason, leave_type, actual_work_hours, required_work_hours, status, created_at,
            employee:employees!early_leave_requests_employee_id_fkey (
              id, full_name, code, branch_id,
              branch:branches!employees_branch_id_fkey ( name )
            )
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (reqError) {
          error = reqError;
        } else {
          let filtered = requests || [];
          if (!isAdmin && branchId) {
            filtered = filtered.filter((r: any) => r.employee?.branch_id === branchId);
          }
          data = filtered;
        }
        break;
      }

      // Approve/Reject early leave request
      case 'approve-early-leave': {
        const { requestId, approved, approverEmployeeId } = params;

        const { error: updateError } = await supabase
          .from('early_leave_requests')
          .update({
            status: approved ? 'approved' : 'rejected',
            approved_at: new Date().toISOString(),
            approved_by_admin_id: approverEmployeeId,
          })
          .eq('id', requestId);

        if (updateError) {
          error = updateError;
        } else {
          data = { success: true };
        }
        break;
      }

      // ========== REMOTE CHECKOUT ENDPOINTS ==========

      // Pending remote checkout requests for ApproveRemoteCheckout.tsx
      case 'pending-remote-checkout-requests': {
        const branchId = params?.branchId;
        const isAdmin = params?.isAdmin === true;

        let query = supabase
          .from('remote_checkout_requests')
          .select(`
            id, request_date, latitude, longitude, distance_from_branch, reason, status, created_at,
            employee:employees!remote_checkout_requests_employee_id_fkey (
              id, full_name, code, branch_id,
              branch:branches!employees_branch_id_fkey ( name )
            )
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (!isAdmin && branchId) {
          query = query.eq('branch_id', branchId);
        }

        const { data: requests, error: reqError } = await query;

        if (reqError) {
          error = reqError;
        } else {
          data = requests || [];
        }
        break;
      }

      // Approve/Reject remote checkout request
      case 'approve-remote-checkout': {
        const { requestId, approved, approverEmployeeId, rejectionReason } = params;

        // Call the remote-checkout-approval function
        const approvalUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/remote-checkout-approval`;
        const approvalResponse = await fetch(approvalUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            request_id: requestId,
            approved: approved,
            approver_employee_id: approverEmployeeId,
            rejection_reason: rejectionReason
          })
        });

        const result = await approvalResponse.json();
        
        if (!approvalResponse.ok) {
          error = { message: result.error || 'Failed to process approval' };
        } else {
          data = result;
        }
        break;
      }

      // Available rewards for RewardShop.tsx
      case 'rewards-list': {
        const result = await supabase
          .from('point_rewards')
          .select('*')
          .eq('is_active', true)
          .order('point_cost', { ascending: true });

        data = result.data;
        error = result.error;
        break;
      }

      // Gacha box items for GachaBox.tsx
      case 'gacha-items': {
        const rewardId = params?.reward_id;
        if (!rewardId) {
          error = { message: 'reward_id is required' };
          break;
        }
        const result = await supabase
          .from('gacha_box_items')
          .select('id, prize_name, prize_name_th, prize_icon, prize_type, prize_value, weight, rarity')
          .eq('reward_id', rewardId)
          .eq('is_active', true)
          .order('weight', { ascending: false });
        data = result.data;
        error = result.error;
        break;
      }

      // Points balance for RewardShop.tsx
      case 'my-points-balance': {
        const result = await supabase
          .from('happy_points')
          .select('point_balance, current_balance, total_earned, current_streak, streak_shields')
          .eq('employee_id', employee_id)
          .maybeSingle();

        data = result.data;
        error = result.error;
        break;
      }

      // Leaderboard for PointLeaderboard.tsx
      case 'leaderboard': {
        const branchId = params?.branchId;
        const limit = params?.limit || 20;

        let query = supabase
          .from('happy_points')
          .select(`
            id,
            employee_id,
            point_balance,
            current_punctuality_streak,
            employee:employees!inner(
              id,
              full_name,
              branch_id,
              exclude_from_points
            )
          `)
          .eq('employee.exclude_from_points', false)
          .eq('employee.is_active', true)
          .order('point_balance', { ascending: false })
          .limit(limit);

        if (branchId) {
          query = query.eq('employee.branch_id', branchId);
        }

        const result = await query;
        data = result.data;
        error = result.error;
        break;
      }

      // ========== REDEMPTION ENDPOINTS ==========
      // (Receipt endpoints removed in Phase 2 cleanup.)

      // My redemptions for MyRedemptions.tsx
      case 'my-redemptions-list': {
        const result = await supabase
          .from('point_redemptions')
          .select(`
            *,
            point_rewards (name, name_th, icon)
          `)
          .eq('employee_id', employee_id)
          .order('created_at', { ascending: false });

        data = result.data;
        error = result.error;
        break;
      }

      // (check-today-deposit and my-receipt-quota endpoints removed in Phase 4 cleanup.)

      // ========================================
      // MY POINTS PAGE ENDPOINTS (bypass RLS)
      // ========================================
      case 'my-points': {
        const result = await supabase
          .from('happy_points')
          .select('*')
          .eq('employee_id', employee_id)
          .maybeSingle();
        
        data = result.data;
        error = result.error;
        break;
      }

      case 'my-transactions': {
        const limit = params?.limit || 10;
        const result = await supabase
          .from('point_transactions')
          .select('*')
          .eq('employee_id', employee_id)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        data = result.data || [];
        error = result.error;
        break;
      }

      case 'my-pending-redemptions': {
        const result = await supabase
          .from('point_redemptions')
          .select(`
            *,
            point_rewards (name, name_th, icon)
          `)
          .eq('employee_id', employee_id)
          .eq('status', 'pending');
        
        data = result.data || [];
        error = result.error;
        break;
      }

      // ========================================
      // POINT RULES SUMMARY (for dynamic UI values)
      // ========================================
      case 'point-rules-summary': {
        const result = await supabase
          .from('point_rules')
          .select('rule_key, points, is_active, conditions')
          .eq('is_active', true);
        
        // Convert to map for easy lookup
        const rulesMap: Record<string, { points: number; conditions?: any }> = {};
        for (const rule of result.data || []) {
          rulesMap[rule.rule_key] = { 
            points: rule.points,
            conditions: rule.conditions 
          };
        }
        
        data = rulesMap;
        error = result.error;
        break;
      }

      case 'create-attendance-token': {
        const type = params?.type || 'check_in'; // 'check_in' or 'check_out'
        
        // Get employee's effective settings for token validity
        const { data: settings } = await supabase
          .rpc('get_effective_attendance_settings', { p_employee_id: employee_id });
        
        const tokenValidityMinutes = (settings as any)?.token_validity_minutes || 10;
        
        // Create expires_at
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + tokenValidityMinutes);
        
        console.log(`[portal-data] Creating ${type} token for ${employee_id}, expires in ${tokenValidityMinutes} mins`);
        
        // Insert new token
        const { data: token, error: tokenError } = await supabase
          .from('attendance_tokens')
          .insert({
            employee_id: employee_id,
            type: type,
            expires_at: expiresAt.toISOString(),
            status: 'pending'
          })
          .select('id')
          .single();
        
        if (tokenError) {
          console.error(`[portal-data] Token insert failed:`, tokenError);
          error = tokenError;
        } else {
          console.log(`[portal-data] Created attendance token: ${token.id}`);
          data = { token_id: token.id };
        }
        break;
      }

      // ========== SELF-SERVICE CANCELLATION ENDPOINTS ==========

      // Get pending OT requests for cancellation (Feature 1)
      case 'my-pending-ot-requests': {
        const result = await supabase
          .from('overtime_requests')
          .select('id, request_date, estimated_hours, reason, status, created_at')
          .eq('employee_id', employee_id)
          .eq('status', 'pending')
          .order('request_date', { ascending: true });
        
        data = result.data;
        error = result.error;
        break;
      }

      // Get pending Day-Off requests for cancellation (Feature 1)
      case 'my-pending-dayoff-requests': {
        const result = await supabase
          .from('flexible_day_off_requests')
          .select('id, day_off_date, reason, status, created_at')
          .eq('employee_id', employee_id)
          .eq('status', 'pending')
          .order('day_off_date', { ascending: true });
        
        data = result.data;
        error = result.error;
        break;
      }

      // Cancel own OT or Day-Off request (Feature 1)
      case 'cancel-my-request': {
        const { requestId, requestType, reason } = params || {};
        
        if (!requestId || !requestType) {
          error = { message: 'requestId and requestType are required' };
          break;
        }
        
        if (!['ot', 'dayoff'].includes(requestType)) {
          error = { message: 'requestType must be "ot" or "dayoff"' };
          break;
        }
        
        const tableName = requestType === 'ot' ? 'overtime_requests' : 'flexible_day_off_requests';
        
        // Verify ownership and pending status
        const { data: existing } = await supabase
          .from(tableName)
          .select('id, employee_id, status')
          .eq('id', requestId)
          .eq('employee_id', employee_id)
          .eq('status', 'pending')
          .maybeSingle();
        
        if (!existing) {
          error = { message: 'Request not found or cannot be cancelled' };
          break;
        }
        
        // Update to cancelled
        const updateData = requestType === 'ot' 
          ? { status: 'cancelled', rejection_reason: reason || 'Cancelled by employee via Portal', updated_at: new Date().toISOString() }
          : { status: 'cancelled', admin_notes: reason || 'Cancelled by employee via Portal', updated_at: new Date().toISOString() };
        
        const { error: updateError } = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', requestId);
        
        if (updateError) {
          error = updateError;
        } else {
          console.log(`[portal-data] ${requestType} request ${requestId} cancelled by employee ${employee_id}`);
          data = { success: true };
          
          // Send LINE push notification to confirm cancellation
          const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
          const { data: empInfo } = await supabase
            .from('employees')
            .select('line_user_id')
            .eq('id', employee_id)
            .maybeSingle();
          
          if (LINE_ACCESS_TOKEN && empInfo?.line_user_id) {
            const message = requestType === 'ot'
              ? `🚫 คำขอ OT ของคุณถูกยกเลิกแล้ว\n\nหากต้องการขอใหม่ สามารถทำได้ที่ Portal`
              : `🚫 คำขอวันหยุดของคุณถูกยกเลิกแล้ว\n\nหากต้องการขอใหม่ สามารถทำได้ที่ Portal`;
            
            try {
              await fetch('https://api.line.me/v2/bot/message/push', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: empInfo.line_user_id,
                  messages: [{ type: 'text', text: message }]
                })
              });
              console.log(`[portal-data] LINE notification sent for ${requestType} cancellation`);
            } catch (lineErr) {
              console.error('[portal-data] LINE push error:', lineErr);
            }
          }
        }
        break;
      }

      // Get Remote Checkout history (Feature 3)
      case 'my-remote-checkout-requests': {
        const limit = params?.limit || 10;
        
        const result = await supabase
          .from('remote_checkout_requests')
          .select(`
            id, request_date, latitude, longitude, distance_from_branch, 
            reason, status, created_at, approved_at, rejection_reason
          `)
          .eq('employee_id', employee_id)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        data = result.data;
        error = result.error;
        break;
      }

      // ========== LEAVE REQUEST ENDPOINTS (Suggestion 3) ==========

      // Get leave requests history
      case 'my-leave-requests': {
        const limit = params?.limit || 10;
        
        const result = await supabase
          .from('leave_requests')
          .select('id, start_date, end_date, leave_type, reason, status, created_at, approved_at, rejection_reason')
          .eq('employee_id', employee_id)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        data = result.data;
        error = result.error;
        break;
      }

      // Cancel own Leave request
      case 'cancel-leave-request': {
        const { requestId, reason } = params || {};
        
        if (!requestId) {
          error = { message: 'requestId is required' };
          break;
        }
        
        // Verify ownership and pending status
        const { data: existing } = await supabase
          .from('leave_requests')
          .select('id, employee_id, status')
          .eq('id', requestId)
          .eq('employee_id', employee_id)
          .eq('status', 'pending')
          .maybeSingle();
        
        if (!existing) {
          error = { message: 'Request not found or cannot be cancelled' };
          break;
        }
        
        const { error: updateError } = await supabase
          .from('leave_requests')
          .update({
            status: 'cancelled',
            rejection_reason: reason || 'Cancelled by employee via Portal',
            updated_at: new Date().toISOString()
          })
          .eq('id', requestId);
        
        if (updateError) {
          error = updateError;
        } else {
          console.log(`[portal-data] Leave request ${requestId} cancelled by employee ${employee_id}`);
          data = { success: true };
          
          // Send LINE push notification to confirm cancellation
          const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
          const { data: empInfo } = await supabase
            .from('employees')
            .select('line_user_id')
            .eq('id', employee_id)
            .maybeSingle();
          
          if (LINE_ACCESS_TOKEN && empInfo?.line_user_id) {
            try {
              await fetch('https://api.line.me/v2/bot/message/push', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: empInfo.line_user_id,
                  messages: [{ type: 'text', text: '🚫 คำขอลางานของคุณถูกยกเลิกแล้ว\n\nหากต้องการขอใหม่ สามารถทำได้ที่ Portal' }]
                })
              });
              console.log('[portal-data] LINE notification sent for leave cancellation');
            } catch (lineErr) {
              console.error('[portal-data] LINE push error:', lineErr);
            }
          }
        }
        break;
      }

      // ========== BAG / INVENTORY ENDPOINTS ==========
      case 'my-bag-items': {
        // Lazy expiration: auto-expire items past expires_at
        await supabase
          .from('employee_bag_items')
          .update({ status: 'expired' })
          .eq('employee_id', employee_id)
          .eq('status', 'active')
          .lt('expires_at', new Date().toISOString())
          .not('expires_at', 'is', null);

        const result = await supabase
          .from('employee_bag_items')
          .select('*')
          .eq('employee_id', employee_id)
          .order('created_at', { ascending: false });

        data = result.data;
        error = result.error;
        break;
      }

      case 'employee-bag-items': {
        const targetEmployeeId = params?.target_employee_id;
        if (!targetEmployeeId) {
          error = { message: 'target_employee_id is required' };
          break;
        }
        const result = await supabase
          .from('employee_bag_items')
          .select('*')
          .eq('employee_id', targetEmployeeId)
          .order('created_at', { ascending: false });

        data = result.data;
        error = result.error;
        break;
      }

      // ========== GACHA ENDPOINTS ==========
      case 'gacha-daily-count': {
        const rewardId = params?.reward_id;
        if (!rewardId) {
          error = { message: 'reward_id is required' };
          break;
        }

        // Get reward to read daily_pull_limit
        const { data: rewardInfo } = await supabase
          .from('point_rewards')
          .select('daily_pull_limit')
          .eq('id', rewardId)
          .maybeSingle();

        // Count today's pulls (Bangkok timezone)
        const todayBkk = getBangkokDateString();
        const result = await supabase
          .from('point_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employee_id)
          .eq('category', 'gacha')
          .eq('transaction_type', 'spend')
          .gte('created_at', `${todayBkk}T00:00:00+07:00`);

        data = {
          pulls_today: result.count || 0,
          daily_limit: rewardInfo?.daily_pull_limit || null,
        };
        error = result.error;
        break;
      }

      case 'gacha-history': {
        const limit = params?.limit || 50;
        const result = await supabase
          .from('point_transactions')
          .select('id, amount, description, balance_after, metadata, created_at')
          .eq('employee_id', employee_id)
          .eq('category', 'gacha')
          .eq('transaction_type', 'spend')
          .order('created_at', { ascending: false })
          .limit(limit);
        data = result.data;
        error = result.error;
        break;
      }

      case 'notification-preferences': {
        // GET: return preferences for employee
        const result = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('employee_id', employee_id)
          .maybeSingle();
        data = result.data;
        error = result.error;
        break;
      }

      case 'notification-preferences-update': {
        // POST: upsert preferences
        const result = await supabase
          .from('notification_preferences')
          .upsert({
            employee_id,
            notify_overtime: params?.notify_overtime ?? true,
            notify_early_leave: params?.notify_early_leave ?? true,
            notify_day_off: params?.notify_day_off ?? true,
            notify_remote_checkout: params?.notify_remote_checkout ?? true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'employee_id' })
          .select()
          .single();
        data = result.data;
        error = result.error;
        break;
      }

      case 'daily-missions': {
        const today = getBangkokDateString();
        const todayStart = `${today}T00:00:00+07:00`;
        const todayEnd = `${today}T23:59:59+07:00`;

        // Mission 1: On-time check-in today
        const { data: todayCheckin } = await supabase
          .from('attendance_logs')
          .select('id, server_time')
          .eq('employee_id', employee_id)
          .eq('event_type', 'check_in')
          .gte('server_time', todayStart)
          .lte('server_time', todayEnd)
          .limit(1);

        // Check if check-in was on time via work_sessions
        const { data: todaySession } = await supabase
          .from('work_sessions')
          .select('is_late')
          .eq('employee_id', employee_id)
          .eq('work_date', today)
          .maybeSingle();

        const checkedIn = (todayCheckin?.length || 0) > 0;
        const onTime = checkedIn && todaySession?.is_late === false;

        // Mission 2: Current streak
        const { data: hp } = await supabase
          .from('happy_points')
          .select('current_punctuality_streak, daily_response_score')
          .eq('employee_id', employee_id)
          .maybeSingle();

        const streak = hp?.current_punctuality_streak || 0;

        // Mission 3: Points earned today
        const { data: todayPoints } = await supabase
          .from('point_transactions')
          .select('amount')
          .eq('employee_id', employee_id)
          .eq('transaction_type', 'earn')
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd);

        const todayTotalPoints = (todayPoints || []).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

        // Mission 4: Check-out completed
        const { data: todayCheckout } = await supabase
          .from('attendance_logs')
          .select('id')
          .eq('employee_id', employee_id)
          .eq('event_type', 'check_out')
          .gte('server_time', todayStart)
          .lte('server_time', todayEnd)
          .limit(1);

        const checkedOut = (todayCheckout?.length || 0) > 0;

        const missions = [
          { id: 'checkin', label_th: 'เช็คอินวันนี้', label_en: 'Check in today', icon: '🕐', completed: checkedIn },
          { id: 'ontime', label_th: 'มาตรงเวลา', label_en: 'On time', icon: '✅', completed: onTime },
          { id: 'streak3', label_th: 'Streak 3 วันขึ้นไป', label_en: '3+ day streak', icon: '🔥', completed: streak >= 3 },
          { id: 'earn_points', label_th: 'ได้รับแต้มวันนี้', label_en: 'Earn points today', icon: '⭐', completed: todayTotalPoints > 0 },
          { id: 'checkout', label_th: 'เช็คเอาท์วันนี้', label_en: 'Check out today', icon: '🏠', completed: checkedOut },
        ];

        const completedCount = missions.filter(m => m.completed).length;

        data = {
          missions,
          completed_count: completedCount,
          total_count: missions.length,
          today_points: todayTotalPoints,
          current_streak: streak,
        };
        break;
      }

      case 'achievement-badges': {
        // Query happy_points
        const { data: hp } = await supabase
          .from('happy_points')
          .select('current_punctuality_streak, longest_punctuality_streak, total_earned, point_balance, streak_shields, daily_response_score, daily_score_date')
          .eq('employee_id', employee_id)
          .maybeSingle();

        // Check perfect month: all working days this month have on-time check-ins
        const now = getBangkokNow();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const todayStr = getBangkokDateString();

        const { data: monthCheckins } = await supabase
          .from('attendance_logs')
          .select('id, server_time')
          .eq('employee_id', employee_id)
          .eq('event_type', 'check_in')
          .gte('server_time', `${monthStart}T00:00:00+07:00`)
          .lte('server_time', `${todayStr}T23:59:59+07:00`);

        const { data: schedules } = await supabase
          .from('work_schedules')
          .select('day_of_week, is_working_day')
          .eq('employee_id', employee_id);

        // Count working days so far this month
        const workingDaysSet = new Set((schedules || []).filter(s => s.is_working_day).map(s => s.day_of_week));
        let workingDaysThisMonth = 0;
        const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        for (let d = new Date(monthStartDate); d <= now; d.setDate(d.getDate() + 1)) {
          if (workingDaysSet.has(d.getDay())) workingDaysThisMonth++;
        }
        const checkinDays = monthCheckins?.length || 0;
        const isPerfectMonth = workingDaysThisMonth > 0 && checkinDays >= workingDaysThisMonth && now.getDate() >= 20;

        const streak = hp?.current_punctuality_streak || 0;
        const longestStreak = hp?.longest_punctuality_streak || 0;
        const totalEarned = hp?.total_earned || 0;
        const shields = hp?.streak_shields || 0;
        const responseScore = hp?.daily_response_score || 0;
        const scoreDate = hp?.daily_score_date;
        const isScoreToday = scoreDate === todayStr;

        const badges = [
          { id: 'streak5', label_th: 'Streak 5 วัน', label_en: '5-Day Streak', icon: '🔥', unlocked: streak >= 5 || longestStreak >= 5, tier: 'bronze' },
          { id: 'streak10', label_th: 'Streak 10 วัน', label_en: '10-Day Streak', icon: '🔥', unlocked: streak >= 10 || longestStreak >= 10, tier: 'silver' },
          { id: 'streak20', label_th: 'Streak 20 วัน', label_en: '20-Day Streak', icon: '🔥', unlocked: streak >= 20 || longestStreak >= 20, tier: 'gold' },
          { id: 'perfect_month', label_th: 'เดือนสมบูรณ์แบบ', label_en: 'Perfect Month', icon: '🏆', unlocked: isPerfectMonth, tier: 'gold' },
          { id: 'top_earner', label_th: 'นักสะสมแต้ม', label_en: 'Top Earner', icon: '⭐', unlocked: totalEarned >= 500, tier: 'silver' },
          { id: 'diamond_earner', label_th: 'นักสะสมเพชร', label_en: 'Diamond Earner', icon: '💎', unlocked: totalEarned >= 2000, tier: 'gold' },
          { id: 'fast_responder', label_th: 'ตอบไว', label_en: 'Fast Responder', icon: '💬', unlocked: isScoreToday && responseScore >= 5, tier: 'bronze' },
          { id: 'shield_master', label_th: 'ราชาโล่', label_en: 'Shield Master', icon: '🛡️', unlocked: shields >= 3, tier: 'silver' },
          { id: 'longest_streak', label_th: 'Streak ระดับตำนาน', label_en: 'Legendary Streak', icon: '👑', unlocked: longestStreak >= 30, tier: 'gold' },
        ];

        data = {
          badges,
          unlocked_count: badges.filter(b => b.unlocked).length,
          total_count: badges.length,
        };
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
