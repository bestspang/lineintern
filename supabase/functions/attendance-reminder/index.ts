import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { addMinutes } from 'https://esm.sh/date-fns@4.1.0';
import { logger } from '../_shared/logger.ts';
import { fetchWithRetry } from '../_shared/retry.ts';
import { logBotMessage } from '../_shared/bot-logger.ts';
import { formatBangkokTime, getBangkokDateString, getBangkokStartOfDay, getBangkokEndOfDay } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Employee {
  id: string;
  full_name: string;
  line_user_id: string | null;
  announcement_group_line_id: string | null;
  working_time_type: string;
  shift_start_time: string | null;
  shift_end_time: string | null;
  hours_per_day: number | null;
  break_hours: number | null;
  preferred_start_time: string | null;
  allowed_work_end_time: string | null;
  enable_second_checkin_reminder: boolean | null;
  reminder_preferences: {
    check_in_reminder_enabled: boolean;
    check_out_reminder_enabled: boolean;
    notification_type: 'private' | 'group' | 'both';
    grace_period_minutes: number;
    check_out_reminder_after_minutes: number;
    soft_checkin_reminder_enabled?: boolean;
    soft_checkin_reminder_minutes_before?: number;
    second_checkin_reminder_enabled?: boolean;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret || cronSecret !== expectedSecret) {
    console.error('[attendance-reminder] Unauthorized: Invalid or missing CRON_SECRET');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    logger.info('Starting attendance reminder check');

    const now = new Date();
    const currentTime = formatBangkokTime(now, 'HH:mm:ss');
    const today = getBangkokDateString(now);

    console.log(`[attendance-reminder] Current Bangkok time: ${formatBangkokTime(now)}`);

    // Fetch all active employees with shift times
    const { data: employees, error: employeesError } = await supabase
      .from('employees')
      .select('*')
      .eq('is_active', true);

    if (employeesError) {
      throw employeesError;
    }

    console.log(`[attendance-reminder] Found ${employees?.length || 0} active employees`);

    // Fetch approved flexible day-offs for today
    const { data: flexibleDayOffs } = await supabase
      .from('flexible_day_off_requests')
      .select('employee_id')
      .eq('day_off_date', today)
      .eq('status', 'approved');
    
    const flexibleDayOffEmployeeIds = new Set(flexibleDayOffs?.map(f => f.employee_id) || []);
    console.log(`[attendance-reminder] Found ${flexibleDayOffEmployeeIds.size} employees with flexible day-off today`);

    let checkInReminders = 0;
    let checkOutReminders = 0;

    for (const employee of employees || []) {
      // Skip if employee has approved flexible day-off today
      if (flexibleDayOffEmployeeIds.has(employee.id)) {
        console.log(`[reminder] Skipping ${employee.full_name} - flexible day off today`);
        continue;
      }
      const prefs = employee.reminder_preferences || {
        check_in_reminder_enabled: true,
        check_out_reminder_enabled: true,
        notification_type: 'private',
        grace_period_minutes: 15,
        check_out_reminder_after_minutes: 15,
      };

      const workingTimeType = employee.working_time_type || 'time_based';

      // SOFT CHECK-IN REMINDER for hours_based
      // FIX: Use string-based time comparison instead of setHours() to avoid timezone issues
      if (workingTimeType === 'hours_based' && prefs.soft_checkin_reminder_enabled && employee.preferred_start_time) {
        const preferredStartTime = employee.preferred_start_time; // "09:00:00" format
        const reminderMinutesBefore = prefs.soft_checkin_reminder_minutes_before || 15;
        
        // Parse the time string and calculate reminder time using string arithmetic
        const [hour, minute] = preferredStartTime.split(':').map(Number);
        let reminderHour = hour;
        let reminderMinute = minute - reminderMinutesBefore;
        
        // Handle minute underflow
        if (reminderMinute < 0) {
          reminderHour -= Math.ceil(Math.abs(reminderMinute) / 60);
          reminderMinute = 60 + (reminderMinute % 60);
          if (reminderMinute === 60) reminderMinute = 0;
        }
        if (reminderHour < 0) reminderHour += 24;
        
        const reminderTimeStr = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}:00`;
        const preferredTimeStr = preferredStartTime.substring(0, 8); // Ensure HH:mm:ss format
        
        if (currentTime >= reminderTimeStr && currentTime < preferredTimeStr) {
          const hasCheckedIn = await hasEmployeeCheckedInToday(supabase, employee.id, today);
          
          if (!hasCheckedIn) {
            const reminderSent = await hasReminderSentToday(supabase, employee.id, 'soft_check_in', today);
            
            if (!reminderSent) {
              console.log(`[reminder] Sending soft check-in reminder to ${employee.full_name} (current: ${currentTime}, window: ${reminderTimeStr}-${preferredTimeStr})`);
              await sendSoftCheckInReminder(employee, prefs.notification_type, lineAccessToken);
              await logReminder(supabase, employee.id, 'soft_check_in', today, prefs.notification_type);
              checkInReminders++;
            }
          }
        }
      }

      // SECOND CHECK-IN REMINDER for hours_based (before allowed_work_end_time)
      // FIX: Use string-based time calculation instead of setHours() to avoid timezone issues
      if (workingTimeType === 'hours_based' && prefs.second_checkin_reminder_enabled && employee.enable_second_checkin_reminder) {
        const allowedWorkEndTime = employee.allowed_work_end_time;
        const hoursPerDay = employee.hours_per_day || 8;
        const breakHours = employee.break_hours || 1;
        
        if (allowedWorkEndTime) {
          // Parse end time and calculate latest start time using string arithmetic
          const [endHour, endMinute] = allowedWorkEndTime.split(':').map(Number);
          const totalMinutes = (hoursPerDay + breakHours) * 60;
          
          // Calculate latest start time by subtracting totalMinutes from end time
          let latestStartHour = endHour;
          let latestStartMinute = endMinute - (totalMinutes % 60);
          latestStartHour -= Math.floor(totalMinutes / 60);
          
          if (latestStartMinute < 0) {
            latestStartHour -= 1;
            latestStartMinute += 60;
          }
          if (latestStartHour < 0) latestStartHour += 24;
          
          const latestStartTimeStr = `${String(latestStartHour).padStart(2, '0')}:${String(latestStartMinute).padStart(2, '0')}:00`;
          
          // Calculate second reminder time (15 minutes before latest start)
          let reminderHour = latestStartHour;
          let reminderMinute = latestStartMinute - 15;
          
          if (reminderMinute < 0) {
            reminderHour -= 1;
            reminderMinute += 60;
          }
          if (reminderHour < 0) reminderHour += 24;
          
          const secondReminderTimeStr = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}:00`;
          
          if (currentTime >= secondReminderTimeStr && currentTime < latestStartTimeStr) {
            const hasCheckedIn = await hasEmployeeCheckedInToday(supabase, employee.id, today);
            
            if (!hasCheckedIn) {
              const reminderSent = await hasReminderSentToday(supabase, employee.id, 'second_check_in', today);
              
              if (!reminderSent) {
                console.log(`[reminder] Sending second check-in reminder to ${employee.full_name} (current: ${currentTime}, latest: ${latestStartTimeStr})`);
                // Create a proper Date for the message by constructing it correctly
                const latestStartDate = new Date(`${today}T${latestStartTimeStr}+07:00`);
                await sendSecondCheckInReminder(employee, latestStartDate, prefs.notification_type, lineAccessToken);
                await logReminder(supabase, employee.id, 'second_check_in', today, prefs.notification_type);
                checkInReminders++;
              }
            }
          }
        }
      }

      // CHECK-IN REMINDER LOGIC (only for time_based employees)
      // FIX: Use string-based time calculation instead of setHours() to avoid timezone issues
      if (workingTimeType === 'time_based' && prefs.check_in_reminder_enabled) {
        // Skip if no shift start time defined
        if (!employee.shift_start_time) {
          continue;
        }

        const shiftStartTime = employee.shift_start_time; // "09:00:00" format
        const gracePeriodMinutes = prefs.grace_period_minutes || 15;
        
        // Calculate reminder time using string arithmetic
        const [startHour, startMinute] = shiftStartTime.split(':').map(Number);
        let reminderHour = startHour;
        let reminderMinute = startMinute + gracePeriodMinutes;
        
        // Handle minute overflow
        if (reminderMinute >= 60) {
          reminderHour += Math.floor(reminderMinute / 60);
          reminderMinute = reminderMinute % 60;
        }
        if (reminderHour >= 24) reminderHour -= 24;
        
        const reminderTimeStr = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}:00`;

        console.log(`[attendance-reminder] Employee ${employee.full_name} (time_based): shift_start=${shiftStartTime}, reminder_time=${reminderTimeStr}, current=${currentTime}`);

        if (currentTime >= reminderTimeStr) {
          // Check if employee has checked in today
          const hasCheckedIn = await hasEmployeeCheckedInToday(supabase, employee.id, today);
          
          if (!hasCheckedIn) {
            // Check if reminder was already sent today
            const reminderSent = await hasReminderSentToday(supabase, employee.id, 'check_in', today);
            
            if (!reminderSent) {
              console.log(`[attendance-reminder] Sending check-in reminder to ${employee.full_name} (current: ${currentTime} >= ${reminderTimeStr})`);
              await sendCheckInReminder(employee, prefs.notification_type, lineAccessToken);
              await logReminder(supabase, employee.id, 'check_in', today, prefs.notification_type);
              checkInReminders++;
            }
          }
        }
      }

      // CHECK-OUT REMINDER LOGIC
      if (prefs.check_out_reminder_enabled) {
        let expectedCheckOutTimeStr: string | null = null;

        if (workingTimeType === 'time_based') {
          // Time-based: use shift_end_time directly (already in Bangkok time format HH:mm:ss)
          if (!employee.shift_end_time) {
            continue;
          }

          // shift_end_time is already in Bangkok local time (e.g., "18:30:00")
          // We just need to add reminder_after_minutes to it
          const shiftEndTime = employee.shift_end_time; // "18:30:00"
          const [endHour, endMinute] = shiftEndTime.split(':').map(Number);
          
          // Calculate reminder time by adding minutes to the Bangkok time
          const reminderAfterMinutes = prefs.check_out_reminder_after_minutes || 15;
          let reminderHour = endHour;
          let reminderMinute = endMinute + reminderAfterMinutes;
          
          // Handle minute overflow
          if (reminderMinute >= 60) {
            reminderHour += Math.floor(reminderMinute / 60);
            reminderMinute = reminderMinute % 60;
          }
          
          // Format as HH:mm:ss for comparison
          expectedCheckOutTimeStr = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}:00`;

          console.log(`[attendance-reminder] Employee ${employee.full_name} (time_based): shift_end=${shiftEndTime}, reminder_time=${expectedCheckOutTimeStr}, current=${currentTime}`);
        } else if (workingTimeType === 'hours_based') {
          // Hours-based: calculate from check-in time + hours_per_day + break_hours
          if (!employee.hours_per_day) {
            continue;
          }

          // Get today's check-in time
          const checkInTime = await getEmployeeCheckInTime(supabase, employee.id, today);
          
          if (!checkInTime) {
            // No check-in yet, skip check-out reminder
            continue;
          }

          const hoursPerDay = employee.hours_per_day;
          const breakHours = employee.break_hours || 0;
          const totalMinutes = (hoursPerDay + breakHours) * 60;
          
          const expectedCheckOutTime = addMinutes(new Date(checkInTime), totalMinutes);
          const reminderAfterMinutes = prefs.check_out_reminder_after_minutes || 15;
          const reminderTime = addMinutes(expectedCheckOutTime, reminderAfterMinutes);
          
          // Convert to Bangkok time string for comparison
          expectedCheckOutTimeStr = formatBangkokTime(reminderTime, 'HH:mm:ss');

          console.log(`[attendance-reminder] Employee ${employee.full_name} (hours_based): check_in=${formatBangkokTime(new Date(checkInTime), 'HH:mm:ss')}, hours=${hoursPerDay}, break=${breakHours}, expected_checkout=${formatBangkokTime(expectedCheckOutTime, 'HH:mm:ss')}, reminder_time=${expectedCheckOutTimeStr}`);
        }

        if (!expectedCheckOutTimeStr) {
          continue;
        }

        // Compare Bangkok time strings directly (both are in HH:mm:ss format)
        if (currentTime >= expectedCheckOutTimeStr) {
          // First check if they checked in
          const hasCheckedIn = await hasEmployeeCheckedInToday(supabase, employee.id, today);
          
          if (hasCheckedIn) {
            // Check if they checked out
            const hasCheckedOut = await hasEmployeeCheckedOutToday(supabase, employee.id, today);
            
            if (!hasCheckedOut) {
              // Check if reminder was already sent today
              const reminderSent = await hasReminderSentToday(supabase, employee.id, 'check_out', today);
              
              if (!reminderSent) {
                console.log(`[attendance-reminder] Sending check-out reminder to ${employee.full_name} (current: ${currentTime} >= reminder: ${expectedCheckOutTimeStr})`);
                await sendCheckOutReminder(employee, prefs.notification_type, lineAccessToken);
                await logReminder(supabase, employee.id, 'check_out', today, prefs.notification_type);
                checkOutReminders++;
              }
            }
          }
        }
      }
    }

    console.log(`[attendance-reminder] Completed: ${checkInReminders} check-in reminders, ${checkOutReminders} check-out reminders sent`);

    return new Response(
      JSON.stringify({
        success: true,
        check_in_reminders: checkInReminders,
        check_out_reminders: checkOutReminders,
        timestamp: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[attendance-reminder] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper function: Check if employee checked in today
// FIX: Use proper UTC boundaries for Bangkok day to avoid missing early morning records
async function hasEmployeeCheckedInToday(
  supabase: any,
  employeeId: string,
  date: string
): Promise<boolean> {
  // Convert Bangkok date string to proper UTC boundaries
  const startOfDay = getBangkokStartOfDay(new Date(`${date}T12:00:00+07:00`));
  const endOfDay = getBangkokEndOfDay(new Date(`${date}T12:00:00+07:00`));
  
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('event_type', 'check_in')
    .gte('server_time', startOfDay.toISOString())
    .lte('server_time', endOfDay.toISOString())
    .limit(1);

  if (error) {
    console.error('[hasEmployeeCheckedInToday] Error:', error);
    return false;
  }

  return data && data.length > 0;
}

// Helper function: Check if employee checked out today
// FIX: Use proper UTC boundaries for Bangkok day
async function hasEmployeeCheckedOutToday(
  supabase: any,
  employeeId: string,
  date: string
): Promise<boolean> {
  const startOfDay = getBangkokStartOfDay(new Date(`${date}T12:00:00+07:00`));
  const endOfDay = getBangkokEndOfDay(new Date(`${date}T12:00:00+07:00`));
  
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('event_type', 'check_out')
    .gte('server_time', startOfDay.toISOString())
    .lte('server_time', endOfDay.toISOString())
    .limit(1);

  if (error) {
    console.error('[hasEmployeeCheckedOutToday] Error:', error);
    return false;
  }

  return data && data.length > 0;
}

// Helper function: Get employee's check-in time today (for hours_based calculation)
// FIX: Use proper UTC boundaries for Bangkok day
async function getEmployeeCheckInTime(
  supabase: any,
  employeeId: string,
  date: string
): Promise<string | null> {
  const startOfDay = getBangkokStartOfDay(new Date(`${date}T12:00:00+07:00`));
  const endOfDay = getBangkokEndOfDay(new Date(`${date}T12:00:00+07:00`));
  
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('server_time')
    .eq('employee_id', employeeId)
    .eq('event_type', 'check_in')
    .gte('server_time', startOfDay.toISOString())
    .lte('server_time', endOfDay.toISOString())
    .order('server_time', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[getEmployeeCheckInTime] Error:', error);
    return null;
  }

  return data && data.length > 0 ? data[0].server_time : null;
}

// Helper function: Check if reminder was sent today
async function hasReminderSentToday(
  supabase: any,
  employeeId: string,
  reminderType: 'check_in' | 'check_out' | 'soft_check_in' | 'second_check_in',
  date: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('attendance_reminders')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('reminder_type', reminderType)
    .eq('reminder_date', date)
    .eq('status', 'sent')
    .limit(1);

  if (error) {
    console.error('[hasReminderSentToday] Error:', error);
    return false;
  }

  return data && data.length > 0;
}

// Helper function: Log reminder
async function logReminder(
  supabase: any,
  employeeId: string,
  reminderType: 'check_in' | 'check_out' | 'soft_check_in' | 'second_check_in',
  date: string,
  notificationType: string
) {
  const { error } = await supabase.from('attendance_reminders').insert({
    employee_id: employeeId,
    reminder_type: reminderType,
    reminder_date: date,
    notification_type: notificationType,
    scheduled_time: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    status: 'sent',
  });

  if (error) {
    console.error('[logReminder] Error:', error);
  }
}

// Send check-in reminder via LINE
async function sendCheckInReminder(
  employee: Employee,
  notificationType: 'private' | 'group' | 'both',
  lineAccessToken: string
) {
  const appUrl = Deno.env.get('APP_URL') || 'https://your-app.lovableproject.com';
  
  const privateMessage = `⏰ สวัสดีค่ะ คุณ${employee.full_name}\n\nตอนนี้เกินเวลาเริ่มงานแล้ว กรุณา Check-In ด้วยค่ะ 📍\n\n🔗 คลิกที่นี่เพื่อ Check-In: ${appUrl}/attendance`;
  
  const groupMessage = `⏰ แจ้งเตือน: @${employee.full_name} ยังไม่ได้ Check-In`;

  const employeeData = { id: employee.id, full_name: employee.full_name, line_user_id: employee.line_user_id };

  try {
    if ((notificationType === 'private' || notificationType === 'both') && employee.line_user_id) {
      await sendLineMessage(employee.line_user_id, privateMessage, lineAccessToken, employeeData, 'reminder', 'check_in');
    }

    if ((notificationType === 'group' || notificationType === 'both') && employee.announcement_group_line_id) {
      await sendLineMessage(employee.announcement_group_line_id, groupMessage, lineAccessToken, employeeData, 'reminder', 'check_in');
    }
  } catch (error) {
    console.error('[sendCheckInReminder] Error:', error);
    throw error;
  }
}

// Send check-out reminder via LINE
async function sendCheckOutReminder(
  employee: Employee,
  notificationType: 'private' | 'group' | 'both',
  lineAccessToken: string
) {
  const appUrl = Deno.env.get('APP_URL') || 'https://your-app.lovableproject.com';
  
  const privateMessage = `🏠 สวัสดีค่ะ คุณ${employee.full_name}\n\nเลิกงานแล้ว กรุณา Check-Out ด้วยค่ะ\n\n🔗 คลิกที่นี่เพื่อ Check-Out: ${appUrl}/attendance`;
  
  const groupMessage = `🏠 แจ้งเตือน: @${employee.full_name} ยังไม่ได้ Check-Out`;

  const employeeData = { id: employee.id, full_name: employee.full_name, line_user_id: employee.line_user_id };

  try {
    if ((notificationType === 'private' || notificationType === 'both') && employee.line_user_id) {
      await sendLineMessage(employee.line_user_id, privateMessage, lineAccessToken, employeeData, 'reminder', 'check_out');
    }

    if ((notificationType === 'group' || notificationType === 'both') && employee.announcement_group_line_id) {
      await sendLineMessage(employee.announcement_group_line_id, groupMessage, lineAccessToken, employeeData, 'reminder', 'check_out');
    }
  } catch (error) {
    console.error('[sendCheckOutReminder] Error:', error);
    throw error;
  }
}

// Send soft check-in reminder
async function sendSoftCheckInReminder(
  employee: Employee,
  notificationType: 'private' | 'group' | 'both',
  lineAccessToken: string
) {
  const appUrl = Deno.env.get('APP_URL') || 'https://your-app.lovableproject.com';
  
  const privateMessage = `☀️ สวัสดีค่ะ คุณ${employee.full_name}\n\n` +
    `💼 เวลาเริ่มงานที่แนะนำคือ ${employee.preferred_start_time?.substring(0, 5)}\n` +
    `⏰ อีก 15 นาทีจะถึงเวลาแล้วค่ะ\n\n` +
    `📍 พร้อม Check-In เมื่อเริ่มงานนะคะ\n` +
    `🔗 ${appUrl}/attendance\n\n` +
    `💡 ข้อความนี้เป็นแค่การแนะนำ ไม่ใช่การบังคับค่ะ`;
  
  const employeeData = { id: employee.id, full_name: employee.full_name, line_user_id: employee.line_user_id };
  
  try {
    if ((notificationType === 'private' || notificationType === 'both') && employee.line_user_id) {
      await sendLineMessage(employee.line_user_id, privateMessage, lineAccessToken, employeeData, 'reminder', 'soft_check_in');
    }
  } catch (error) {
    console.error('[sendSoftCheckInReminder] Error:', error);
  }
}

// Send second check-in reminder
async function sendSecondCheckInReminder(
  employee: Employee,
  latestStartTime: Date,
  notificationType: 'private' | 'group' | 'both',
  lineAccessToken: string
) {
  const appUrl = Deno.env.get('APP_URL') || 'https://your-app.lovableproject.com';
  const latestStartStr = formatBangkokTime(latestStartTime, 'HH:mm');
  const allowedEndStr = employee.allowed_work_end_time?.substring(0, 5) || '20:00';
  
  const privateMessage = `⚠️ แจ้งเตือนสำคัญ!\n\n` +
    `👤 คุณ${employee.full_name}\n` +
    `⏰ ตอนนี้เวลา ${formatBangkokTime(new Date(), 'HH:mm')}\n\n` +
    `📢 หากคุณยังไม่ Check-In ภายใน ${latestStartStr}\n` +
    `คุณจะไม่สามารถทำงานครบ ${employee.hours_per_day} ชั่วโมงได้\n` +
    `(เพราะสิ้นสุดการนับเวลาที่ ${allowedEndStr})\n\n` +
    `📍 กรุณา Check-In ด้วยค่ะ\n` +
    `🔗 ${appUrl}/attendance`;
  
  const employeeData = { id: employee.id, full_name: employee.full_name, line_user_id: employee.line_user_id };
  
  try {
    if ((notificationType === 'private' || notificationType === 'both') && employee.line_user_id) {
      await sendLineMessage(employee.line_user_id, privateMessage, lineAccessToken, employeeData, 'warning', 'second_check_in');
    }
  } catch (error) {
    console.error('[sendSecondCheckInReminder] Error:', error);
  }
}

// Send LINE message with retry
async function sendLineMessage(
  lineId: string, 
  message: string, 
  lineAccessToken: string, 
  employeeData?: { id: string; full_name: string; line_user_id: string | null },
  messageType: 'reminder' | 'notification' | 'warning' = 'reminder',
  reminderType?: string
) {
  try {
    await fetchWithRetry(
      'https://api.line.me/v2/bot/message/push',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lineAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: lineId,
          messages: [{ type: 'text', text: message }],
        })
      },
      { maxRetries: 2 }
    );

    logger.info('LINE message sent successfully', { lineId });
    
    // Log to bot_message_logs
    if (employeeData) {
      await logBotMessage({
        destinationType: lineId.startsWith('U') ? 'dm' : 'group',
        destinationId: lineId,
        destinationName: lineId.startsWith('U') ? employeeData.full_name : 'Announcement Group',
        recipientEmployeeId: employeeData.id,
        messageText: message,
        messageType: messageType,
        triggeredBy: 'cron',
        commandType: reminderType,
        edgeFunctionName: 'attendance-reminder',
        deliveryStatus: 'sent',
      });
    }
  } catch (error) {
    logger.error('Failed to send LINE message', { lineId, error });
    
    // Log failed message
    if (employeeData) {
      await logBotMessage({
        destinationType: lineId.startsWith('U') ? 'dm' : 'group',
        destinationId: lineId,
        destinationName: lineId.startsWith('U') ? employeeData.full_name : 'Announcement Group',
        recipientEmployeeId: employeeData.id,
        messageText: message,
        messageType: messageType,
        triggeredBy: 'cron',
        commandType: reminderType,
        edgeFunctionName: 'attendance-reminder',
        deliveryStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    
    throw error;
  }
}