import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatBangkokTime, getBangkokDateString, getBangkokStartOfDay, getBangkokEndOfDay } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Branch {
  id: string;
  name: string;
  line_group_id: string | null;
  standard_start_time: string | null;
}

interface Employee {
  id: string;
  full_name: string;
  branch_id: string | null;
  hours_per_day: number | null;
  break_hours: number | null;
}

/**
 * ⚠️ CRITICAL: Calculate work hours with validation guards
 * - Returns zeros if checkout is before or equal to checkin
 * - Always returns non-negative values
 */
const calculateWorkHoursDetailed = async (
  supabase: any,
  employeeId: string,
  checkIn: any,
  checkOut: any,
  hoursPerDay: number,
  breakHours: number,
  workDate: string
) => {
  if (!checkIn || !checkOut) {
    return { grossHours: 0, netHours: 0, countedHours: 0, overtimeHours: 0, hasApprovedOT: false };
  }

  const start = new Date(checkIn.server_time);
  const end = new Date(checkOut.server_time);
  
  // 🛡️ VALIDATION: Checkout must be after checkin
  if (end <= start) {
    console.error(`[calculateWorkHoursDetailed] Invalid session: checkout (${end.toISOString()}) <= checkin (${start.toISOString()}) for employee ${employeeId}`);
    return { grossHours: 0, netHours: 0, countedHours: 0, overtimeHours: 0, hasApprovedOT: false };
  }
  
  const grossHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const netHours = Math.max(0, grossHours - breakHours);
  
  const { data: otRequest } = await supabase
    .from('overtime_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('request_date', workDate)
    .eq('status', 'approved')
    .maybeSingle();
  
  const hasApprovedOT = !!otRequest;
  let countedHours: number;
  let overtimeHours: number;
  
  if (hasApprovedOT) {
    countedHours = netHours;
    overtimeHours = Math.max(0, netHours - hoursPerDay);
  } else {
    countedHours = Math.min(netHours, hoursPerDay);
    overtimeHours = 0;
  }
  
  return { grossHours, netHours, countedHours, overtimeHours, hasApprovedOT };
};

const generateAllBranchesSummary = async (
  supabase: any,
  branches: Branch[],
  today: string
): Promise<{ summaryText: string; stats: any }> => {
  const startOfDay = getBangkokStartOfDay(new Date(`${today}T12:00:00+07:00`));
  const endOfDay = getBangkokEndOfDay(new Date(`${today}T12:00:00+07:00`));
  
  const branchSummaries: string[] = [];
  let totalCheckedIn = 0;
  let totalCheckedOut = 0;
  let totalLate = 0;
  let totalFlagged = 0;
  let totalEmployees = 0;

  for (const branch of branches) {
    const { data: employees } = await supabase
      .from('employees')
      .select('*')
      .eq('branch_id', branch.id)
      .eq('is_active', true);

    if (!employees || employees.length === 0) {
      branchSummaries.push(`📍 ${branch.name}\n⏸️ ไม่มีพนักงานในสาขานี้`);
      continue;
    }

    totalEmployees += employees.length;
    const employeeLines: string[] = [];
    let checkedInCount = 0;
    let checkedOutCount = 0;
    let lateCount = 0;
    let flaggedCount = 0;

    for (const employee of employees) {
      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employee.id)
        .gte('server_time', startOfDay.toISOString())
        .lte('server_time', endOfDay.toISOString())
        .order('server_time', { ascending: true });

      if (!logs || logs.length === 0) {
        employeeLines.push(`- ${employee.full_name}: ไม่พบการเช็คอิน`);
        continue;
      }

      const checkIn = logs.find((l: any) => l.event_type === 'check_in');
      // ⚠️ CRITICAL: Ensure checkout is AFTER checkin to prevent cross-day session mixing
      // Previous bug: .find() could pick auto-checkout from previous day before actual checkin
      const checkOut = checkIn
        ? logs.find((l: any) => 
            l.event_type === 'check_out' && 
            new Date(l.server_time) > new Date(checkIn.server_time)
          )
        : null;

      if (checkIn) checkedInCount++;
      if (checkOut) checkedOutCount++;
      if (logs.some((l: any) => l.is_flagged)) flaggedCount++;

      const checkInTime = checkIn ? formatBangkokTime(checkIn.server_time, 'HH:mm') : '-';
      const checkOutTime = checkOut ? formatBangkokTime(checkOut.server_time, 'HH:mm') : 'ยังไม่เช็คเอาต์';

      // Calculate work hours
      let workHoursText = '';
      if (checkIn && checkOut) {
        const hoursPerDay = employee.hours_per_day || 8;
        const breakHours = employee.break_hours || 1;
        
        const workHours = await calculateWorkHoursDetailed(
          supabase, employee.id, checkIn, checkOut, hoursPerDay, breakHours, today
        );
        
        workHoursText = `, ทำงาน ${workHours.countedHours.toFixed(1)} ชม.`;
        if (workHours.hasApprovedOT && workHours.overtimeHours > 0) {
          workHoursText += ` (OT ${workHours.overtimeHours.toFixed(1)} ชม.)`;
        }
      }

      // Check if late
      let lateIndicator = '';
      if (checkIn && branch.standard_start_time) {
        const checkInDate = new Date(checkIn.server_time);
        const [hours, minutes] = branch.standard_start_time.split(':');
        const standardTime = new Date(checkInDate);
        standardTime.setHours(parseInt(hours), parseInt(minutes), 0);

        if (checkInDate > standardTime) {
          lateIndicator = ' (สาย)';
          lateCount++;
        }
      }

      const flagIndicator = logs.some((l: any) => l.is_flagged) ? ' ⚠️' : '';

      employeeLines.push(
        `- ${employee.full_name}: เช็คอิน ${checkInTime}${lateIndicator}, เช็คเอาต์ ${checkOutTime}${workHoursText}${flagIndicator}`
      );
    }

    totalCheckedIn += checkedInCount;
    totalCheckedOut += checkedOutCount;
    totalLate += lateCount;
    totalFlagged += flaggedCount;

    branchSummaries.push(
      `📍 ${branch.name}\n${employeeLines.join('\n')}\n\n📈 สรุป ${branch.name}:\n- เช็คอินแล้ว: ${checkedInCount}/${employees.length} คน\n- เช็คเอาต์แล้ว: ${checkedOutCount}/${employees.length} คน\n- มาสาย: ${lateCount} คน\n- มีข้อสังเกต: ${flaggedCount} คน`
    );
  }

  let summaryText = `📊 สรุปการเข้างาน ${today}\n\n${branchSummaries.join('\n\n')}`;

  if (branches.length > 1) {
    summaryText += `\n\n📊 สรุปรวมทุกสาขา:\n- เช็คอินแล้ว: ${totalCheckedIn}/${totalEmployees} คน\n- เช็คเอาต์แล้ว: ${totalCheckedOut}/${totalEmployees} คน\n- มาสาย: ${totalLate} คน\n- มีข้อสังเกต: ${totalFlagged} คน`;
  }

  return {
    summaryText,
    stats: {
      totalEmployees,
      checkedIn: totalCheckedIn,
      checkedOut: totalCheckedOut,
      lateCount: totalLate,
      flaggedCount: totalFlagged
    }
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret || cronSecret !== expectedSecret) {
    console.error('[attendance-snapshot-update] Unauthorized: Invalid or missing CRON_SECRET');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body for manual triggers with specific date
    let targetDate: string | null = null;
    
    try {
      const body = await req.json();
      targetDate = body.target_date || null;
    } catch {
      // No body or invalid JSON
    }

    const today = targetDate || getBangkokDateString(new Date());
    const currentTime = formatBangkokTime(new Date(), 'HH:mm:ss');

    console.log(`[Snapshot Update] Running at ${currentTime} for date ${today}`);

    // Get all active branches
    const { data: branches, error: branchError } = await supabase
      .from('branches')
      .select('*')
      .eq('is_deleted', false)
      .order('name');

    if (branchError) {
      console.error('Error fetching branches:', branchError);
      throw branchError;
    }

    if (!branches || branches.length === 0) {
      console.log('No active branches found');
      return new Response(
        JSON.stringify({ success: true, message: 'No branches found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate all-branches summary
    const { summaryText, stats } = await generateAllBranchesSummary(supabase, branches, today);

    // Upsert into daily_attendance_summaries
    const { error: upsertError } = await supabase
      .from('daily_attendance_summaries')
      .upsert({
        summary_date: today,
        scope: 'all_branches',
        branch_id: null,
        summary_text: summaryText,
        total_employees: stats.totalEmployees,
        checked_in: stats.checkedIn,
        checked_out: stats.checkedOut,
        late_count: stats.lateCount,
        flagged_count: stats.flaggedCount,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'summary_date,scope',
        ignoreDuplicates: false
      });

    if (upsertError) {
      // Try with explicit conflict handling for partial index
      console.log('First upsert failed, trying with delete + insert...');
      
      // Delete existing record for today
      await supabase
        .from('daily_attendance_summaries')
        .delete()
        .eq('summary_date', today)
        .eq('scope', 'all_branches');
      
      // Insert new record
      const { error: insertError } = await supabase
        .from('daily_attendance_summaries')
        .insert({
          summary_date: today,
          scope: 'all_branches',
          branch_id: null,
          summary_text: summaryText,
          total_employees: stats.totalEmployees,
          checked_in: stats.checkedIn,
          checked_out: stats.checkedOut,
          late_count: stats.lateCount,
          flagged_count: stats.flaggedCount,
          updated_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error inserting snapshot:', insertError);
        throw insertError;
      }
    }

    console.log(`[Snapshot Update] Successfully updated summary for ${today}`);
    console.log(`[Snapshot Update] Stats: ${JSON.stringify(stats)}`);

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        stats,
        updatedAt: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Snapshot Update] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
