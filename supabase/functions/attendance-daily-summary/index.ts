import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeliveryConfig {
  id: string;
  name: string;
  source_type: 'all_branches' | 'single_branch';
  source_branch_id: string | null;
  destination_line_ids: string[];
  destination_employee_ids: string[];
  send_time: string;
  include_work_hours: boolean;
  is_enabled: boolean;
}

interface Branch {
  id: string;
  name: string;
  line_group_id: string | null;
  standard_start_time: string | null;
}

interface Employee {
  id: string;
  full_name: string;
  line_user_id: string | null;
}

const calculateWorkHours = (checkIn: any, checkOut: any): number => {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(checkIn.server_time);
  const end = new Date(checkOut.server_time);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return Math.max(0, hours);
};

const generateSummary = async (
  supabase: any,
  branches: Branch[],
  today: string,
  includeWorkHours: boolean
): Promise<string> => {
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

    if (!employees || employees.length === 0) continue;

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
        .gte('server_time', `${today}T00:00:00`)
        .lte('server_time', `${today}T23:59:59`)
        .order('server_time', { ascending: true });

      if (!logs || logs.length === 0) {
        employeeLines.push(`- ${employee.full_name}: ไม่พบการเช็คอิน`);
        continue;
      }

      const checkIn = logs.find((l: any) => l.event_type === 'check_in');
      const checkOut = logs.find((l: any) => l.event_type === 'check_out');

      if (checkIn) checkedInCount++;
      if (checkOut) checkedOutCount++;
      if (logs.some((l: any) => l.is_flagged)) flaggedCount++;

      const checkInTime = checkIn
        ? new Date(checkIn.server_time).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Bangkok',
          })
        : '-';

      const checkOutTime = checkOut
        ? new Date(checkOut.server_time).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Bangkok',
          })
        : 'ยังไม่เช็คเอาต์';

      // Calculate work hours
      let workHoursText = '';
      if (includeWorkHours && checkIn && checkOut) {
        const hours = calculateWorkHours(checkIn, checkOut);
        workHoursText = `, ทำงาน ${hours.toFixed(1)} ชม.`;
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

    if (branches.length > 1) {
      branchSummaries.push(
        `📍 ${branch.name}\n${employeeLines.join('\n')}\n\n📈 สรุป ${branch.name}:\n- เช็คอินแล้ว: ${checkedInCount}/${employees.length} คน\n- เช็คเอาต์แล้ว: ${checkedOutCount}/${employees.length} คน\n- มาสาย: ${lateCount} คน\n- มีข้อสังเกต: ${flaggedCount} คน`
      );
    } else {
      branchSummaries.push(
        `📍 ${branch.name}\n\n${employeeLines.join('\n')}\n\n📈 สรุป:\n- เช็คอินแล้ว: ${checkedInCount}/${employees.length} คน\n- เช็คเอาต์แล้ว: ${checkedOutCount}/${employees.length} คน\n- มาสาย: ${lateCount} คน\n- มีข้อสังเกต: ${flaggedCount} คน`
      );
    }
  }

  let summaryText = `📊 สรุปการเข้างาน ${today}\n\n${branchSummaries.join('\n\n')}`;

  if (branches.length > 1) {
    summaryText += `\n\n📊 สรุปรวมทุกสาขา:\n- เช็คอินแล้ว: ${totalCheckedIn}/${totalEmployees} คน\n- เช็คเอาต์แล้ว: ${totalCheckedOut}/${totalEmployees} คน\n- มาสาย: ${totalLate} คน\n- มีข้อสังเกต: ${totalFlagged} คน`;
  }

  return summaryText;
};

const sendToLine = async (
  to: string,
  message: string,
  accessToken: string
): Promise<{ ok: boolean; messageId: string | null }> => {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: to,
        messages: [{ type: 'text', text: message }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return { ok: true, messageId: data.sentMessages?.[0]?.id || null };
    }
    return { ok: false, messageId: null };
  } catch (error) {
    console.error('Error sending LINE message:', error);
    return { ok: false, messageId: null };
  }
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

    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok',
      hour12: false,
    });

    console.log(`[Daily Summary] Running at ${currentTime} for date ${today}`);

    // Get enabled delivery configs
    const { data: configs, error: configError } = await supabase
      .from('summary_delivery_config')
      .select('*')
      .eq('is_enabled', true);

    if (configError) {
      console.error('Error fetching configs:', configError);
      throw configError;
    }

    if (!configs || configs.length === 0) {
      console.log('No enabled delivery configs found');
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No configs enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processedCount = 0;
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';

    for (const config of configs as DeliveryConfig[]) {
      console.log(`[Config: ${config.name}] Processing...`);

      // Get branches based on source type
      let branches: Branch[] = [];
      if (config.source_type === 'all_branches') {
        const { data: allBranches } = await supabase.from('branches').select('*');
        branches = allBranches || [];
      } else if (config.source_branch_id) {
        const { data: branch } = await supabase
          .from('branches')
          .select('*')
          .eq('id', config.source_branch_id)
          .single();
        if (branch) branches = [branch];
      }

      if (branches.length === 0) {
        console.log(`[Config: ${config.name}] No branches found, skipping`);
        continue;
      }

      // Generate summary
      const summaryText = await generateSummary(
        supabase,
        branches,
        today,
        config.include_work_hours
      );

      // Get all employees for resolving LINE user IDs
      const { data: allEmployees } = await supabase.from('employees').select('id, line_user_id, full_name');
      
      // Send to all destinations
      const lineIds = config.destination_line_ids || [];
      const employeeIds = config.destination_employee_ids || [];
      
      if (lineIds.length === 0 && employeeIds.length === 0) {
        console.log(`[Config: ${config.name}] No destinations configured, skipping`);
        continue;
      }

      const sentMessageIds: string[] = [];
      let successCount = 0;

      // Send to LINE groups
      for (const lineGroupId of lineIds) {
        const { ok, messageId } = await sendToLine(lineGroupId, summaryText, lineAccessToken);
        if (ok) {
          console.log(`[Config: ${config.name}] Sent to LINE group ${lineGroupId}`);
          if (messageId) sentMessageIds.push(messageId);
          successCount++;
        } else {
          console.error(`[Config: ${config.name}] Failed to send to LINE group ${lineGroupId}`);
        }
      }

      // Send to individual employees
      for (const employeeId of employeeIds) {
        const employee = allEmployees?.find(e => e.id === employeeId);
        if (employee?.line_user_id) {
          const { ok, messageId } = await sendToLine(employee.line_user_id, summaryText, lineAccessToken);
          if (ok) {
            console.log(`[Config: ${config.name}] Sent to employee ${employee.full_name}`);
            if (messageId) sentMessageIds.push(messageId);
            successCount++;
          } else {
            console.error(`[Config: ${config.name}] Failed to send to employee ${employee.full_name}`);
          }
        } else {
          console.warn(`[Config: ${config.name}] Employee ${employeeId} has no LINE user ID`);
        }
      }

      if (successCount > 0) {
        // Store summary for each branch
        for (const branch of branches) {
          await supabase.from('daily_attendance_summaries').upsert({
            branch_id: branch.id,
            summary_date: today,
            summary_text: summaryText,
            line_message_id: sentMessageIds[0] || null,
            sent_at: new Date().toISOString(),
          });
        }
        
        processedCount++;
        console.log(`[Config: ${config.name}] Successfully sent to ${successCount} destination(s)`);
      } else {
        console.error(`[Config: ${config.name}] Failed to send to any destination`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        total_configs: configs.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
