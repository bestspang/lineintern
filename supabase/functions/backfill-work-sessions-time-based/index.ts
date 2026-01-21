/**
 * Backfill Work Sessions for Time-Based Employees
 * 
 * This function creates work_sessions for attendance_logs that have matching
 * check_in and check_out events but no corresponding work_session.
 * 
 * Use case: When check-in happens via LINE but check-out happens via:
 * - admin_webapp (admin checkout)
 * - auto_checkout (automatic checkout at midnight)
 * - Other sources that don't create work_sessions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getBangkokDateString } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AttendanceLog {
  id: string;
  employee_id: string;
  event_type: string;
  server_time: string;
  branch_id: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get date range from request or default to current month
    const { start_date, end_date } = await req.json().catch(() => ({}));
    
    // ⚠️ TIMEZONE: Use Bangkok date for date range calculation
    const now = new Date();
    const startDate = start_date || getBangkokDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const endDate = end_date || getBangkokDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    console.log(`Backfilling work_sessions from ${startDate} to ${endDate}`);

    // Get all time_based employees
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, full_name, code, working_time_type, branch_id, break_hours')
      .eq('working_time_type', 'time_based')
      .eq('is_active', true);

    if (empError) throw empError;
    if (!employees?.length) {
      return new Response(JSON.stringify({ message: 'No time_based employees found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found ${employees.length} time_based employees`);

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const results: any[] = [];

    for (const employee of employees) {
      console.log(`Processing employee: ${employee.full_name} (${employee.code})`);

      // Get all check_in logs for this employee in date range
      const { data: checkIns, error: checkInError } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('event_type', 'check_in')
        .gte('server_time', `${startDate}T00:00:00Z`)
        .lt('server_time', `${endDate}T23:59:59Z`)
        .order('server_time', { ascending: true });

      if (checkInError) {
        console.error(`Error fetching check_ins for ${employee.code}:`, checkInError);
        totalErrors++;
        continue;
      }

      if (!checkIns?.length) {
        console.log(`No check_ins found for ${employee.code}`);
        continue;
      }

      for (const checkIn of checkIns) {
        const workDate = checkIn.server_time.split('T')[0];
        
        // Check if work_session already exists
        const { data: existingSession } = await supabase
          .from('work_sessions')
          .select('id')
          .eq('employee_id', employee.id)
          .eq('work_date', workDate)
          .maybeSingle();

        if (existingSession) {
          console.log(`Session already exists for ${employee.code} on ${workDate}`);
          totalSkipped++;
          continue;
        }

        // Find matching check_out (next check_out after this check_in on same day or before 6am next day)
        const nextDayLimit = new Date(checkIn.server_time);
        nextDayLimit.setDate(nextDayLimit.getDate() + 1);
        nextDayLimit.setHours(6, 0, 0, 0);

        const { data: checkOut } = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('employee_id', employee.id)
          .eq('event_type', 'check_out')
          .gt('server_time', checkIn.server_time)
          .lt('server_time', nextDayLimit.toISOString())
          .order('server_time', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!checkOut) {
          console.log(`No check_out found for ${employee.code} on ${workDate}`);
          totalSkipped++;
          continue;
        }

        // Calculate work duration
        const startTime = new Date(checkIn.server_time);
        const endTime = new Date(checkOut.server_time);
        const totalMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
        const breakMinutes = (employee.break_hours || 0) * 60;
        const netWorkMinutes = Math.max(0, totalMinutes - breakMinutes);

        // Determine session status
        let status = 'completed';
        if (checkOut.source === 'auto_checkout') {
          status = 'auto_closed';
        } else if (checkOut.performed_by_admin_id) {
          status = 'admin_closed';
        }

        // Create work_session
        const { error: insertError } = await supabase
          .from('work_sessions')
          .insert({
            employee_id: employee.id,
            work_date: workDate,
            session_number: 1,
            checkin_log_id: checkIn.id,
            checkout_log_id: checkOut.id,
            actual_start_time: checkIn.server_time,
            actual_end_time: checkOut.server_time,
            total_minutes: totalMinutes,
            break_minutes: breakMinutes,
            net_work_minutes: netWorkMinutes,
            billable_minutes: netWorkMinutes, // For time_based, all net work is billable
            status: status,
            auto_checkout_performed: checkOut.source === 'auto_checkout',
          });

        if (insertError) {
          console.error(`Error creating session for ${employee.code} on ${workDate}:`, insertError);
          totalErrors++;
          results.push({
            employee: employee.code,
            date: workDate,
            status: 'error',
            error: insertError.message,
          });
        } else {
          console.log(`✓ Created session for ${employee.code} on ${workDate} (${netWorkMinutes} min)`);
          totalCreated++;
          results.push({
            employee: employee.code,
            date: workDate,
            status: 'created',
            work_minutes: netWorkMinutes,
          });
        }
      }
    }

    const summary = {
      success: true,
      date_range: { start: startDate, end: endDate },
      employees_processed: employees.length,
      sessions_created: totalCreated,
      sessions_skipped: totalSkipped,
      errors: totalErrors,
      results: results,
    };

    console.log('Backfill complete:', summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
