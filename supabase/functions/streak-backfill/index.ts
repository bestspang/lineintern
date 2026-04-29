import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokNow, getBangkokDateString } from "../_shared/timezone.ts";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Find the previous work day for an employee (skip non-working days)
 * Returns date string in YYYY-MM-DD format or null if not found
 */
async function findPreviousWorkDay(
  supabase: any,
  employeeId: string,
  fromDate: string // YYYY-MM-DD format
): Promise<string | null> {
  // Get employee's work schedules
  const { data: workSchedules } = await supabase
    .from('work_schedules')
    .select('day_of_week, is_working_day')
    .eq('employee_id', employeeId);

  // Get shift assignments for the last 7 days
  const sevenDaysAgo = new Date(fromDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  // ⚠️ TIMEZONE: Use Bangkok date string format
  const sevenDaysAgoStr = getBangkokDateString(sevenDaysAgo);

  const { data: shiftAssignments } = await supabase
    .from('shift_assignments')
    .select('work_date, is_day_off')
    .eq('employee_id', employeeId)
    .gte('work_date', sevenDaysAgoStr)
    .lt('work_date', fromDate);

  // Get holidays for the last 7 days
  const { data: holidays } = await supabase
    .from('holidays')
    .select('date')
    .gte('date', sevenDaysAgoStr)
    .lt('date', fromDate);

  const holidaySet = new Set((holidays || []).map((h: any) => h.date));
  const shiftMap = new Map(
    (shiftAssignments || []).map((s: any) => [s.work_date, s.is_day_off])
  );

  // Build work schedule map by day_of_week
  const workScheduleMap = new Map<number, boolean>();
  for (const ws of workSchedules || []) {
    workScheduleMap.set(ws.day_of_week, ws.is_working_day);
  }
  
  // Default working days (Mon-Fri) if no work_schedules
  const defaultWorkingDays = new Set([1, 2, 3, 4, 5]);

  // Search backwards up to 7 days
  const currentDate = new Date(fromDate);
  for (let i = 1; i <= 7; i++) {
    currentDate.setDate(currentDate.getDate() - 1);
    // ⚠️ TIMEZONE: Use Bangkok date string format
    const dateStr = getBangkokDateString(currentDate);
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Priority 1: Check shift_assignments (day off override)
    if (shiftMap.has(dateStr)) {
      if (shiftMap.get(dateStr) === true) {
        continue; // Explicitly marked as day off
      }
      return dateStr; // Has shift assignment and not day off = working day
    }

    // Priority 2: Check if it's a holiday
    if (holidaySet.has(dateStr)) {
      continue;
    }

    // Priority 3: Check work_schedules
    if (workScheduleMap.has(dayOfWeek)) {
      if (workScheduleMap.get(dayOfWeek)) {
        return dateStr; // Working day
      }
      continue; // Not a working day
    }

    // Priority 4: Default (Mon-Fri)
    if (defaultWorkingDays.has(dayOfWeek)) {
      return dateStr;
    }
  }

  return null;
}

/**
 * Check if a check-in was on time based on shift, work_schedule, or default settings
 * Priority: shift_assignments > work_schedules > attendance_settings
 */
async function isCheckInOnTime(
  supabase: any,
  employeeId: string,
  checkInTime: string, // ISO timestamp or "YYYY-MM-DDTHH:mm:ss"
  branchId: string | null
): Promise<boolean> {
  const checkInDate = new Date(checkInTime);
  const dateStr = checkInTime.split('T')[0];
  const checkInTimeOnly = checkInTime.split('T')[1]?.substring(0, 8) || '00:00:00';
  const dayOfWeek = new Date(dateStr).getDay(); // 0 = Sunday
  
  // Priority 1: Check shift_assignments for this specific date
  const { data: shift } = await supabase
    .from('shift_assignments')
    .select('shift_templates(start_time)')
    .eq('employee_id', employeeId)
    .eq('work_date', dateStr)
    .maybeSingle();

  let expectedStartTime: string | null = null;

  if (shift?.shift_templates?.start_time) {
    expectedStartTime = shift.shift_templates.start_time;
  } else {
    // Priority 2: Check work_schedules for this day of week
    const { data: workSchedule } = await supabase
      .from('work_schedules')
      .select('start_time')
      .eq('employee_id', employeeId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_working_day', true)
      .maybeSingle();
    
    if (workSchedule?.start_time) {
      expectedStartTime = workSchedule.start_time;
    } else {
      // Priority 3: Check branch or global attendance_settings
      const { data: settings } = await supabase
        .from('attendance_settings')
        .select('standard_start_time')
        .or(`scope.eq.global${branchId ? `,branch_id.eq.${branchId}` : ''}`)
        .order('scope', { ascending: false })
        .limit(1)
        .maybeSingle();

      expectedStartTime = settings?.standard_start_time || '09:00:00';
    }
  }

  // Get grace period from global settings
  const { data: globalSettings } = await supabase
    .from('attendance_settings')
    .select('grace_period_minutes')
    .eq('scope', 'global')
    .maybeSingle();

  const gracePeriod = globalSettings?.grace_period_minutes || 15;

  // Compare check-in time with expected start + grace
  const startTime = expectedStartTime || '09:00:00';
  
  // For streak/punctuality, we check if check-in <= shift_start (NOT including grace)
  // Grace period is only for "not marked as late" - punctuality requires <= shift_start
  const isOnTime = checkInTimeOnly <= startTime;
  
  return isOnTime;
}

/**
 * Recalculate streak for an employee based on attendance logs AND attendance_adjustments
 * ⚠️ VERIFIED 2026-02-03: Streak calculation includes BOTH sources:
 * 1. attendance_logs (real check-ins)
 * 2. attendance_adjustments (Admin manual entries with override_status='present')
 * Adjustments take priority over logs for the same date
 * DO NOT remove adjustment handling without understanding impact on Admin-adjusted records
 */
async function recalculateStreak(
  supabase: any,
  employeeId: string,
  employeeName: string
): Promise<{ currentStreak: number; longestStreak: number; lastOnTimeDate: string | null }> {
  const today = getBangkokDateString();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  // ⚠️ TIMEZONE: Use Bangkok date string format
  const thirtyDaysAgoStr = getBangkokDateString(thirtyDaysAgo);

  // Get check-in logs for last 30 days, ordered by date descending
  const { data: logs, error } = await supabase
    .from('attendance_logs')
    .select('id, server_time, branch_id')
    .eq('employee_id', employeeId)
    .eq('event_type', 'check_in')
    .gte('server_time', thirtyDaysAgoStr + 'T00:00:00')
    .order('server_time', { ascending: false });

  // Also get attendance adjustments (Admin manual entries)
  const { data: adjustments } = await supabase
    .from('attendance_adjustments')
    .select('adjustment_date, override_check_in, override_status')
    .eq('employee_id', employeeId)
    .eq('override_status', 'present')
    .not('override_check_in', 'is', null)
    .gte('adjustment_date', thirtyDaysAgoStr);

  // Build adjustment map (adjustments take priority over actual logs)
  const adjustmentMap = new Map<string, { server_time: string; branch_id: null; isFromAdjustment: boolean }>();
  for (const adj of adjustments || []) {
    if (adj.override_check_in) {
      const checkInTime = `${adj.adjustment_date}T${adj.override_check_in}`;
      adjustmentMap.set(adj.adjustment_date, {
        server_time: checkInTime,
        branch_id: null,
        isFromAdjustment: true
      });
    }
  }

  // Check if we have any data (logs or adjustments)
  const hasLogs = logs && logs.length > 0;
  const hasAdjustments = adjustmentMap.size > 0;
  
  if (error || (!hasLogs && !hasAdjustments)) {
    console.log(`No check-in logs or adjustments found for ${employeeName}`);
    return { currentStreak: 0, longestStreak: 0, lastOnTimeDate: null };
  }

  // Filter to one log per day (earliest check-in) and check if on-time
  const dailyLogs = new Map<string, { log: any; isOnTime: boolean }>();
  
  // First, add attendance_logs (skip dates that have adjustments)
  for (const log of logs || []) {
    const dateStr = log.server_time.split('T')[0];
    // Skip if this date has an adjustment (adjustment takes priority)
    if (adjustmentMap.has(dateStr)) continue;
    
    if (!dailyLogs.has(dateStr)) {
      const isOnTime = await isCheckInOnTime(supabase, employeeId, log.server_time, log.branch_id);
      dailyLogs.set(dateStr, { log, isOnTime });
    }
  }

  // Then, add adjustments to dailyLogs
  for (const [dateStr, adjLog] of adjustmentMap) {
    // For adjustments, check if the override_check_in time is on-time
    const isOnTime = await isCheckInOnTime(supabase, employeeId, adjLog.server_time, null);
    dailyLogs.set(dateStr, { log: adjLog, isOnTime });
    console.log(`${employeeName}: Including adjustment for ${dateStr}, isOnTime=${isOnTime}`);
  }

  // Convert to sorted array (most recent first)
  const sortedDates = Array.from(dailyLogs.keys()).sort((a, b) => b.localeCompare(a));
  
  let currentStreak = 0;
  let longestStreak = 0;
  let lastOnTimeDate: string | null = null;
  let previousDate: string | null = null;

  for (const dateStr of sortedDates) {
    const entry = dailyLogs.get(dateStr)!;
    
    if (!entry.isOnTime) {
      // Not on-time, streak breaks here
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
      currentStreak = 0;
      previousDate = dateStr;
      continue;
    }

    // On-time check-in
    if (!lastOnTimeDate) {
      // First on-time date found (most recent)
      lastOnTimeDate = dateStr;
      currentStreak = 1;
      previousDate = dateStr;
      continue;
    }

    // Check if this is a consecutive work day
    const expectedPrevWorkDay = await findPreviousWorkDay(supabase, employeeId, previousDate!);
    
    if (dateStr === expectedPrevWorkDay) {
      // Consecutive work day
      currentStreak++;
    } else {
      // Not consecutive (missed a work day), save current streak if it's the longest
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
      // Reset streak to 0 for missed work day, this on-time day starts fresh at 1
      currentStreak = 1;
    }
    
    previousDate = dateStr;
  }

  // Final check for longest streak
  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  console.log(`${employeeName}: currentStreak=${currentStreak}, longestStreak=${longestStreak}, lastOnTimeDate=${lastOnTimeDate}`);

  return { currentStreak, longestStreak, lastOnTimeDate };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let callerUserId: string | null = null;
  let callerRoleLabel: string | null = null;

  try {
    // Phase 0A guard: admin/owner only — destructive backfill of streak data.
    try {
      const result = await requireRole(
        req,
        ['admin', 'owner'],
        { functionName: 'streak-backfill' },
      );
      callerUserId = result.userId;
      callerRoleLabel = result.role;
    } catch (e) {
      const r = authzErrorResponse(e, corsHeaders);
      if (r) return r;
      throw e;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all employees with happy_points
    const { data: happyPoints, error: fetchError } = await supabase
      .from('happy_points')
      .select(`
        id,
        employee_id,
        current_punctuality_streak,
        longest_punctuality_streak,
        last_punctuality_date,
        employees(full_name, code)
      `);

    if (fetchError) {
      throw new Error(`Failed to fetch happy_points: ${fetchError.message}`);
    }

    const results: any[] = [];
    let updated = 0;
    
    const getEmployeeName = (emp: any) => {
      if (!emp) return 'Unknown';
      if (Array.isArray(emp)) {
        const e = emp[0];
        return e?.full_name || e?.code || 'Unknown';
      }
      return emp.full_name || emp.code || 'Unknown';
    };
    let unchanged = 0;

    for (const hp of happyPoints || []) {
      const employeeName = getEmployeeName(hp.employees);
      
      const { currentStreak, longestStreak, lastOnTimeDate } = await recalculateStreak(
        supabase,
        hp.employee_id,
        employeeName
      );

      // Check if update is needed
      const needsUpdate = 
        hp.current_punctuality_streak !== currentStreak ||
        hp.longest_punctuality_streak !== longestStreak ||
        hp.last_punctuality_date !== lastOnTimeDate;

      if (needsUpdate) {
        const { error: updateError } = await supabase
          .from('happy_points')
          .update({
            current_punctuality_streak: currentStreak,
            longest_punctuality_streak: longestStreak,
            last_punctuality_date: lastOnTimeDate,
            updated_at: new Date().toISOString()
          })
          .eq('id', hp.id);

        if (updateError) {
          console.error(`Failed to update ${employeeName}:`, updateError);
          results.push({
            employee: employeeName,
            status: 'error',
            error: updateError.message
          });
        } else {
          updated++;
          results.push({
            employee: employeeName,
            status: 'updated',
            oldStreak: hp.current_punctuality_streak,
            newStreak: currentStreak,
            longestStreak
          });
        }
      } else {
        unchanged++;
        results.push({
          employee: employeeName,
          status: 'unchanged',
          currentStreak
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: happyPoints?.length || 0,
          updated,
          unchanged
        },
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: unknown) {
    console.error('Streak backfill error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
