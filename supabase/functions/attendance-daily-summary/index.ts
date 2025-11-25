import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logBotMessage } from '../_shared/bot-logger.ts';
import { formatBangkokTime, getBangkokDateString } from '../_shared/timezone.ts';

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
  is_system: boolean;
  preset_type: 'per_employee' | 'per_branch' | null;
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
  hours_per_day: number | null;
  break_hours: number | null;
}

interface WorkHoursResult {
  grossHours: number;    // ชั่วโมงทำงานจริง (check-out - check-in)
  netHours: number;      // ชั่วโมงหลังหักพัก
  countedHours: number;  // ชั่วโมงที่นับจ่าย
  overtimeHours: number; // ชั่วโมง OT (ถ้ามี)
  hasApprovedOT: boolean;
}

const isWithinTimeWindow = (currentTime: string, targetTime: string, windowMinutes: number): boolean => {
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);
  const [targetHour, targetMinute] = targetTime.split(':').map(Number);
  
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  const targetTotalMinutes = targetHour * 60 + targetMinute;
  
  const diff = Math.abs(currentTotalMinutes - targetTotalMinutes);
  return diff <= windowMinutes;
};

const calculateWorkHours = (checkIn: any, checkOut: any): number => {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(checkIn.server_time);
  const end = new Date(checkOut.server_time);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return Math.max(0, hours);
};

const calculateWorkHoursDetailed = async (
  supabase: any,
  employeeId: string,
  checkIn: any,
  checkOut: any,
  hoursPerDay: number,
  breakHours: number,
  workDate: string
): Promise<WorkHoursResult> => {
  if (!checkIn || !checkOut) {
    return {
      grossHours: 0,
      netHours: 0,
      countedHours: 0,
      overtimeHours: 0,
      hasApprovedOT: false
    };
  }

  const start = new Date(checkIn.server_time);
  const end = new Date(checkOut.server_time);
  const grossHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  
  // Calculate net hours (after break deduction)
  const netHours = Math.max(0, grossHours - breakHours);
  
  // Check for approved OT
  const { data: otRequest } = await supabase
    .from('overtime_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('request_date', workDate)
    .eq('status', 'approved')
    .maybeSingle();
  
  const hasApprovedOT = !!otRequest;
  
  // Calculate counted hours
  let countedHours: number;
  let overtimeHours: number;
  
  if (hasApprovedOT) {
    // If OT approved, count all net hours
    countedHours = netHours;
    overtimeHours = Math.max(0, netHours - hoursPerDay);
  } else {
    // If no OT, cap at hours_per_day
    countedHours = Math.min(netHours, hoursPerDay);
    overtimeHours = 0;
  }
  
  return {
    grossHours,
    netHours,
    countedHours,
    overtimeHours,
    hasApprovedOT
  };
};

const generatePersonalSummary = async (
  supabase: any,
  employee: Employee,
  today: string,
  includeWorkHours: boolean
): Promise<string> => {
  const { data: logs } = await supabase
    .from('attendance_logs')
    .select('*')
    .eq('employee_id', employee.id)
    .gte('server_time', `${today}T00:00:00`)
    .lte('server_time', `${today}T23:59:59`)
    .order('server_time', { ascending: true });

  const checkIn = logs?.find((l: any) => l.event_type === 'check_in');
  const checkOut = logs?.find((l: any) => l.event_type === 'check_out');

  const checkInTime = checkIn
    ? new Date(checkIn.server_time).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      })
    : 'ยังไม่เช็คอิน';

  const checkOutTime = checkOut
    ? new Date(checkOut.server_time).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      })
    : 'ยังไม่เช็คเอาต์';

  let summaryText = `📋 สรุปการเข้างานของคุณ ${today}\n\n`;
  summaryText += `👤 ${employee.full_name}\n`;
  summaryText += `⏰ เช็คอิน: ${checkInTime}\n`;
  summaryText += `🏁 เช็คเอาต์: ${checkOutTime}\n`;

  if (includeWorkHours && checkIn && checkOut) {
    const hoursPerDay = employee.hours_per_day || 8;
    const breakHours = employee.break_hours || 1;
    
    const workHours = await calculateWorkHoursDetailed(
      supabase,
      employee.id,
      checkIn,
      checkOut,
      hoursPerDay,
      breakHours,
      today
    );
    
    summaryText += `⏱️ ทำงาน ${workHours.grossHours.toFixed(1)} ชม. (หักพัก ${breakHours} ชม. = ${workHours.netHours.toFixed(1)} ชม.)\n`;
    summaryText += `💰 นับเป็น: ${workHours.countedHours.toFixed(1)} ชม.`;
    
    if (workHours.hasApprovedOT && workHours.overtimeHours > 0) {
      summaryText += ` (OT ${workHours.overtimeHours.toFixed(1)} ชม.)`;
    } else if (!workHours.hasApprovedOT && workHours.netHours > hoursPerDay) {
      summaryText += ` (ไม่มี OT)`;
    }
    summaryText += '\n';
  }

  if (logs?.some((l: any) => l.is_flagged)) {
    summaryText += `\n⚠️ มีข้อสังเกต: กรุณาติดต่อฝ่ายบริหาร\n`;
  }

  return summaryText;
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

    // Handle empty branches
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

      // Calculate work hours with detailed breakdown
      let workHoursText = '';
      if (includeWorkHours && checkIn && checkOut) {
        const hoursPerDay = employee.hours_per_day || 8;
        const breakHours = employee.break_hours || 1;
        
        const workHours = await calculateWorkHoursDetailed(
          supabase,
          employee.id,
          checkIn,
          checkOut,
          hoursPerDay,
          breakHours,
          today
        );
        
        workHoursText = `, ทำงาน ${workHours.grossHours.toFixed(1)} ชม. (หักพัก ${breakHours} ชม.)`;
        workHoursText += `, นับ ${workHours.countedHours.toFixed(1)} ชม.`;
        
        if (workHours.hasApprovedOT && workHours.overtimeHours > 0) {
          workHoursText += ` (OT ${workHours.overtimeHours.toFixed(1)} ชม.)`;
        } else if (!workHours.hasApprovedOT && workHours.netHours > hoursPerDay) {
          workHoursText += ` (ไม่มี OT)`;
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

    const today = getBangkokDateString(new Date());
    const currentTime = formatBangkokTime(new Date(), 'HH:mm');

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
    let skippedCount = 0;
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';

    for (const config of configs as DeliveryConfig[]) {
      const configTime = config.send_time?.substring(0, 5); // "21:00"
      
      // Check if current time matches config send_time (±30 minutes window)
      if (configTime && !isWithinTimeWindow(currentTime, configTime, 30)) {
        console.log(`[Config: ${config.name}] Skipping - current time ${currentTime} not within 30min of ${configTime}`);
        skippedCount++;
        continue;
      }

      console.log(`[Config: ${config.name}] Processing... (preset_type: ${config.preset_type}, send_time: ${configTime})`);

      const sentMessageIds: string[] = [];
      let successCount = 0;
      let failedCount = 0;

      // Handle preset types
      if (config.preset_type === 'per_employee') {
        // Send personal summary to each employee
        console.log(`[Config: ${config.name}] Running per-employee preset`);
        
        const { data: allEmployees } = await supabase
          .from('employees')
          .select('*')
          .eq('is_active', true);

        if (!allEmployees || allEmployees.length === 0) {
          console.log(`[Config: ${config.name}] No active employees found`);
          continue;
        }

        for (const employee of allEmployees) {
          if (!employee.line_user_id) {
            console.warn(`[Config: ${config.name}] Employee ${employee.full_name} has no LINE user ID, skipping`);
            continue;
          }

          const personalSummary = await generatePersonalSummary(
            supabase,
            employee,
            today,
            config.include_work_hours
          );

          const { ok, messageId } = await sendToLine(employee.line_user_id, personalSummary, lineAccessToken);
          if (ok) {
            console.log(`[Config: ${config.name}] Sent personal summary to ${employee.full_name}`);
            if (messageId) sentMessageIds.push(messageId);
            successCount++;
            
            // Log bot message
            await logBotMessage({
              destinationType: 'dm',
              destinationId: employee.line_user_id,
              destinationName: employee.full_name,
              recipientEmployeeId: employee.id,
              messageText: personalSummary,
              messageType: 'summary',
              triggeredBy: 'cron',
              edgeFunctionName: 'attendance-daily-summary',
              lineMessageId: messageId || undefined,
              deliveryStatus: 'sent'
            });
          } else {
            console.error(`[Config: ${config.name}] Failed to send to ${employee.full_name}`);
            failedCount++;
            
            // Log failed message
            await logBotMessage({
              destinationType: 'dm',
              destinationId: employee.line_user_id,
              destinationName: employee.full_name,
              recipientEmployeeId: employee.id,
              messageText: personalSummary,
              messageType: 'summary',
              triggeredBy: 'cron',
              edgeFunctionName: 'attendance-daily-summary',
              deliveryStatus: 'failed'
            });
          }
        }

        processedCount++;
        console.log(`[Config: ${config.name}] Sent ${successCount} personal summaries (${failedCount} failed)`);
        
        // Log delivery
        await supabase.from('summary_delivery_logs').insert({
          config_id: config.id,
          recipients_count: allEmployees.filter(e => e.line_user_id).length,
          success_count: successCount,
          failed_count: failedCount,
          details: { preset_type: 'per_employee', sent_time: currentTime }
        });
        
        continue;
      }

      if (config.preset_type === 'per_branch') {
        // Send branch-specific summary to each branch's LINE group
        console.log(`[Config: ${config.name}] Running per-branch preset`);
        
        const { data: allBranches } = await supabase
          .from('branches')
          .select('*')
          .eq('is_deleted', false);

        if (!allBranches || allBranches.length === 0) {
          console.log(`[Config: ${config.name}] No active branches found`);
          continue;
        }

        for (const branch of allBranches) {
          if (!branch.line_group_id) {
            console.warn(`[Config: ${config.name}] Branch ${branch.name} has no LINE group ID, skipping`);
            continue;
          }

          const branchSummary = await generateSummary(
            supabase,
            [branch],
            today,
            config.include_work_hours
          );

          const { ok, messageId } = await sendToLine(branch.line_group_id, branchSummary, lineAccessToken);
          if (ok) {
            console.log(`[Config: ${config.name}] Sent branch summary to ${branch.name}`);
            if (messageId) sentMessageIds.push(messageId);
            successCount++;

            // Store summary ONLY for per_branch preset
            await supabase.from('daily_attendance_summaries').upsert({
              branch_id: branch.id,
              summary_date: today,
              summary_text: branchSummary,
              line_message_id: messageId || null,
              sent_at: new Date().toISOString(),
            });
            
            // Log bot message
            await logBotMessage({
              destinationType: 'group',
              destinationId: branch.line_group_id,
              destinationName: branch.name,
              messageText: branchSummary,
              messageType: 'summary',
              triggeredBy: 'cron',
              edgeFunctionName: 'attendance-daily-summary',
              lineMessageId: messageId || undefined,
              deliveryStatus: 'sent'
            });
          } else {
            console.error(`[Config: ${config.name}] Failed to send to branch ${branch.name}`);
            failedCount++;
            
            // Log failed message
            await logBotMessage({
              destinationType: 'group',
              destinationId: branch.line_group_id,
              destinationName: branch.name,
              messageText: branchSummary,
              messageType: 'summary',
              triggeredBy: 'cron',
              edgeFunctionName: 'attendance-daily-summary',
              deliveryStatus: 'failed'
            });
          }
        }

        processedCount++;
        console.log(`[Config: ${config.name}] Sent ${successCount} branch summaries (${failedCount} failed)`);
        
        // Log delivery
        await supabase.from('summary_delivery_logs').insert({
          config_id: config.id,
          recipients_count: allBranches.filter(b => b.line_group_id).length,
          success_count: successCount,
          failed_count: failedCount,
          details: { preset_type: 'per_branch', sent_time: currentTime }
        });
        
        continue;
      }

      // Custom config (preset_type = null)
      console.log(`[Config: ${config.name}] Running custom config`);

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
      
      const totalRecipients = lineIds.length + employeeIds.length;
      if (totalRecipients === 0) {
        console.log(`[Config: ${config.name}] No destinations configured, skipping`);
        continue;
      }

      // Send to LINE groups
      for (const lineGroupId of lineIds) {
        const { ok, messageId } = await sendToLine(lineGroupId, summaryText, lineAccessToken);
        if (ok) {
          console.log(`[Config: ${config.name}] Sent to LINE group ${lineGroupId}`);
          if (messageId) sentMessageIds.push(messageId);
          successCount++;
          
          // Log bot message
          await logBotMessage({
            destinationType: 'group',
            destinationId: lineGroupId,
            messageText: summaryText,
            messageType: 'summary',
            triggeredBy: 'cron',
            edgeFunctionName: 'attendance-daily-summary',
            lineMessageId: messageId || undefined,
            deliveryStatus: 'sent'
          });
        } else {
          console.error(`[Config: ${config.name}] Failed to send to LINE group ${lineGroupId}`);
          failedCount++;
          
          // Log failed message
          await logBotMessage({
            destinationType: 'group',
            destinationId: lineGroupId,
            messageText: summaryText,
            messageType: 'summary',
            triggeredBy: 'cron',
            edgeFunctionName: 'attendance-daily-summary',
            deliveryStatus: 'failed'
          });
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
            
            // Log bot message
            await logBotMessage({
              destinationType: 'dm',
              destinationId: employee.line_user_id,
              destinationName: employee.full_name,
              recipientEmployeeId: employee.id,
              messageText: summaryText,
              messageType: 'summary',
              triggeredBy: 'cron',
              edgeFunctionName: 'attendance-daily-summary',
              lineMessageId: messageId || undefined,
              deliveryStatus: 'sent'
            });
          } else {
            console.error(`[Config: ${config.name}] Failed to send to employee ${employee.full_name}`);
            failedCount++;
            
            // Log failed message
            await logBotMessage({
              destinationType: 'dm',
              destinationId: employee.line_user_id,
              destinationName: employee.full_name,
              recipientEmployeeId: employee.id,
              messageText: summaryText,
              messageType: 'summary',
              triggeredBy: 'cron',
              edgeFunctionName: 'attendance-daily-summary',
              deliveryStatus: 'failed'
            });
          }
        } else {
          console.warn(`[Config: ${config.name}] Employee ${employeeId} has no LINE user ID`);
          failedCount++;
        }
      }

      // DO NOT store summaries for custom configs to prevent duplicate bug
      // Only per_branch preset stores summaries
      
      if (successCount > 0) {
        processedCount++;
        console.log(`[Config: ${config.name}] Successfully sent to ${successCount} destination(s) (${failedCount} failed)`);
      } else {
        console.error(`[Config: ${config.name}] Failed to send to any destination`);
      }
      
      // Log delivery
      await supabase.from('summary_delivery_logs').insert({
        config_id: config.id,
        recipients_count: totalRecipients,
        success_count: successCount,
        failed_count: failedCount,
        details: { preset_type: 'custom', sent_time: currentTime }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        skipped: skippedCount,
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
