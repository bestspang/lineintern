import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, authzErrorResponse } from "../_shared/authz.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Phase 0A: backfill jobs are admin/owner only.
    try {
      await requireRole(req, ['admin', 'owner'], { functionName: 'backfill-work-sessions' });
    } catch (e) {
      const r = authzErrorResponse(e, corsHeaders);
      if (r) return r;
      throw e;
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[backfill-work-sessions] Starting backfill process...');

    // Get all hours_based employees
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, code, full_name, working_time_type, auto_checkout_grace_period_minutes')
      .eq('working_time_type', 'hours_based')
      .eq('is_active', true);

    if (empError) {
      console.error('[backfill-work-sessions] Error fetching employees:', empError);
      throw empError;
    }

    if (!employees || employees.length === 0) {
      console.log('[backfill-work-sessions] No hours_based employees found');
      return new Response(
        JSON.stringify({ success: true, sessions_created: 0, message: 'No employees to process' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[backfill-work-sessions] Found ${employees.length} hours_based employees`);

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const employee of employees) {
      console.log(`[backfill-work-sessions] Processing employee: ${employee.full_name} (${employee.code})`);

      // Get all check-ins for this employee that don't have a corresponding work_session
      const { data: checkIns, error: checkInError } = await supabase
        .from('attendance_logs')
        .select('id, server_time, branch_id')
        .eq('employee_id', employee.id)
        .eq('event_type', 'check_in')
        .order('server_time', { ascending: true });

      if (checkInError) {
        console.error(`[backfill-work-sessions] Error fetching check-ins for ${employee.full_name}:`, checkInError);
        totalErrors++;
        continue;
      }

      if (!checkIns || checkIns.length === 0) {
        console.log(`[backfill-work-sessions] No check-ins found for ${employee.full_name}`);
        continue;
      }

      console.log(`[backfill-work-sessions] Found ${checkIns.length} check-ins for ${employee.full_name}`);

      // Get existing work_sessions for this employee
      const { data: existingSessions } = await supabase
        .from('work_sessions')
        .select('check_in_log_id')
        .eq('employee_id', employee.id);

      const existingCheckInIds = new Set(
        (existingSessions || []).map(s => s.check_in_log_id).filter(Boolean)
      );

      for (const checkIn of checkIns) {
        // Skip if work_session already exists
        if (existingCheckInIds.has(checkIn.id)) {
          totalSkipped++;
          continue;
        }

        // Check if there's a check-out after this check-in
        const { data: checkOut } = await supabase
          .from('attendance_logs')
          .select('id, server_time')
          .eq('employee_id', employee.id)
          .eq('event_type', 'check_out')
          .gt('server_time', checkIn.server_time)
          .order('server_time', { ascending: true })
          .limit(1)
          .maybeSingle();

        const status = checkOut ? 'completed' : 'active';
        const gracePeriodMinutes = employee.auto_checkout_grace_period_minutes || 60;
        
        // Calculate grace period expiry time
        const checkInTime = new Date(checkIn.server_time);
        const graceExpiresAt = new Date(checkInTime.getTime() + gracePeriodMinutes * 60 * 1000);

        // Create work_session
        const { error: insertError } = await supabase
          .from('work_sessions')
          .insert({
            employee_id: employee.id,
            branch_id: checkIn.branch_id,
            check_in_log_id: checkIn.id,
            check_out_log_id: checkOut?.id || null,
            check_in_time: checkIn.server_time,
            check_out_time: checkOut?.server_time || null,
            status: status,
            auto_checkout_grace_expires_at: status === 'active' ? graceExpiresAt.toISOString() : null,
            created_at: new Date().toISOString()
          });

        if (insertError) {
          console.error(`[backfill-work-sessions] Error creating session for check-in ${checkIn.id}:`, insertError);
          totalErrors++;
          continue;
        }

        totalCreated++;
        console.log(`[backfill-work-sessions] Created ${status} session for ${employee.full_name} at ${checkIn.server_time}`);
      }
    }

    console.log(`[backfill-work-sessions] Completed: ${totalCreated} created, ${totalSkipped} skipped, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sessions_created: totalCreated,
        sessions_skipped: totalSkipped,
        errors: totalErrors,
        employees_processed: employees.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[backfill-work-sessions] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
