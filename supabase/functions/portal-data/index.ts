/**
 * ⚠️ PORTAL DATA API - CRITICAL TIMEZONE HANDLING
 * Always use getBangkokDateString() from timezone.ts, NEVER new Date().toISOString().split('T')[0]
 * 
 * This edge function bypasses RLS by using service role key.
 * All portal pages should use portalApi() helper to call this function.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokDateString, getBangkokStartOfDay, getBangkokEndOfDay } from '../_shared/timezone.ts';

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
        // Get employee settings
        const settingsResult = await supabase
          .from('employee_payroll_settings')
          .select('*')
          .eq('employee_id', employee_id)
          .maybeSingle();

        // Get current month work sessions (use Bangkok timezone for month boundaries)
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
        
        // Get attendance logs for late detection
        const logsResult = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('employee_id', employee_id)
          .eq('event_type', 'check_in')
          .gte('server_time', monthStart.toISOString())
          .lte('server_time', now.toISOString());

        data = {
          settings: settingsResult.data,
          sessions: sessionsResult.data || [],
          overtime: otResult.data || [],
          leaves: leaveResult.data || [],
          checkInLogs: logsResult.data || []
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
          .select('branch_id, role:employee_roles(role_name)')
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

        let depositsQuery = supabase
          .from('daily_deposits')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');

        // Manager filter by branch (need to filter after fetch for requests without direct branch_id)
        if (!isAdmin && branchId) {
          depositsQuery = depositsQuery.eq('branch_id', branchId);
        }

        const [otRes, leaveRes, earlyRes, redemptionRes, depositRes] = await Promise.all([
          otQuery,
          leaveQuery,
          earlyLeaveQuery,
          redemptionsQuery,
          depositsQuery
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
            redemptions: 0, // Manager doesn't see redemptions
            deposits: depositRes.count || 0
          };
        } else {
          data = {
            ot: otRes.count || 0,
            leave: leaveRes.count || 0,
            earlyLeave: earlyRes.count || 0,
            redemptions: redemptionRes.count || 0,
            deposits: depositRes.count || 0
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

      // Points balance for RewardShop.tsx
      case 'my-points-balance': {
        const result = await supabase
          .from('happy_points')
          .select('point_balance, current_balance, total_earned, current_streak')
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
              nickname,
              branch_id
            )
          `)
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

      // ========== RECEIPT & REDEMPTION ENDPOINTS ==========

      // My businesses for ReceiptNew.tsx, ReceiptDetail.tsx, ReceiptBusinesses.tsx
      case 'my-businesses': {
        // Get employee's line_user_id first
        const empResult = await supabase
          .from('employees')
          .select('line_user_id')
          .eq('id', employee_id)
          .maybeSingle();

        if (!empResult.data?.line_user_id) {
          data = [];
          break;
        }

        const lineUserId = empResult.data.line_user_id;

        const result = await supabase
          .from('receipt_businesses')
          .select('id, name, is_default, tax_id, created_at')
          .eq('line_user_id', lineUserId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true });

        data = result.data;
        error = result.error;
        break;
      }

      // My receipts list for MyReceipts.tsx
      case 'my-receipts-list': {
        const empResult = await supabase
          .from('employees')
          .select('line_user_id')
          .eq('id', employee_id)
          .maybeSingle();

        if (!empResult.data?.line_user_id) {
          data = [];
          break;
        }

        const lineUserId = empResult.data.line_user_id;
        const businessId = params?.businessId;
        const limit = params?.limit || 50;

        let query = supabase
          .from('receipts')
          .select('id, vendor, total, receipt_date, category, created_at, status, business_id')
          .eq('line_user_id', lineUserId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (businessId && businessId !== 'all') {
          query = query.eq('business_id', businessId);
        }

        const result = await query;
        data = result.data;
        error = result.error;
        break;
      }

      // Receipt detail for ReceiptDetail.tsx
      case 'receipt-detail': {
        const receiptId = params?.receiptId;
        if (!receiptId) {
          error = { message: 'receiptId is required' };
          break;
        }

        // Get receipt with files
        const receiptResult = await supabase
          .from('receipts')
          .select('*, receipt_files(*)')
          .eq('id', receiptId)
          .single();

        // Get receipt items
        const itemsResult = await supabase
          .from('receipt_items')
          .select('*')
          .eq('receipt_id', receiptId)
          .order('sort_order', { ascending: true });

        data = {
          receipt: receiptResult.data,
          items: itemsResult.data || []
        };
        error = receiptResult.error;
        break;
      }

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

      // Check today deposit for DepositUpload.tsx
      case 'check-today-deposit': {
        // Get employee's branch
        const empResult = await supabase
          .from('employees')
          .select('branch_id')
          .eq('id', employee_id)
          .maybeSingle();

        if (!empResult.data?.branch_id) {
          data = null;
          break;
        }

        // ⚠️ TIMEZONE: Use Bangkok date
        const today = getBangkokDateString();

        const result = await supabase
          .from('daily_deposits')
          .select('*, employees(full_name)')
          .eq('branch_id', empResult.data.branch_id)
          .eq('deposit_date', today)
          .maybeSingle();

        data = result.data;
        error = result.error;
        break;
      }

      // AI quota for ReceiptBusinesses.tsx
      case 'my-receipt-quota': {
        const empResult = await supabase
          .from('employees')
          .select('line_user_id')
          .eq('id', employee_id)
          .maybeSingle();

        if (!empResult.data?.line_user_id) {
          data = { used: 0, limit: 5, planName: 'Free' };
          break;
        }

        const lineUserId = empResult.data.line_user_id;
        const now = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const today = getBangkokDateString();

        // Get usage
        const { data: usage } = await supabase
          .from('receipt_usage')
          .select('ai_receipts_used')
          .eq('line_user_id', lineUserId)
          .eq('period_yyyymm', period)
          .maybeSingle();

        // Get active subscription
        const { data: subscription } = await supabase
          .from('receipt_subscriptions')
          .select('plan_id')
          .eq('line_user_id', lineUserId)
          .lte('current_period_start', today)
          .gte('current_period_end', today)
          .maybeSingle();

        // Get plan details
        let plan = null;
        if (subscription?.plan_id) {
          const { data: planData } = await supabase
            .from('receipt_plans')
            .select('id, name, ai_receipts_limit')
            .eq('id', subscription.plan_id)
            .single();
          plan = planData;
        }

        // Default to free plan
        if (!plan) {
          const { data: freePlan } = await supabase
            .from('receipt_plans')
            .select('id, name, ai_receipts_limit')
            .eq('id', 'free')
            .maybeSingle();
          plan = freePlan || { id: 'free', name: 'Free', ai_receipts_limit: 5 };
        }

        data = {
          used: usage?.ai_receipts_used || 0,
          limit: plan?.ai_receipts_limit || 5,
          planName: plan?.name || 'Free',
        };
        break;
      }

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
