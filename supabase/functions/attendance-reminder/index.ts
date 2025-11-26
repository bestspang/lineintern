import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { format, addMinutes, startOfDay, endOfDay } from 'https://esm.sh/date-fns@4.1.0';
import { logger } from '../_shared/logger.ts';
import { fetchWithRetry } from '../_shared/retry.ts';
import { logBotMessage } from '../_shared/bot-logger.ts';
import { formatBangkokTime, getBangkokDateString } from '../_shared/timezone.ts';

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

    let checkInReminders = 0;
    let checkOutReminders = 0;

    for (const employee of employees || []) {
      const prefs = employee.reminder_preferences || {
        check_in_reminder_enabled: true,
        check_out_reminder_enabled: true,
        notification_type: 'private',
        grace_period_minutes: 15,
        check_out_reminder_after_minutes: 15,
      };

      const workingTimeType = employee.working_time_type || 'time_based';

      // SOFT CHECK-IN REMINDER for hours_based
      if (workingTimeType === 'hours_based' && prefs.soft_checkin_reminder_enabled && employee.preferred_start_time) {
        const preferredStartTime = employee.preferred_start_time;
        const reminderMinutesBefore = prefs.soft_checkin_reminder_minutes_before || 15;
        
        const [hour, minute] = preferredStartTime.split(':').map(Number);
        const preferredStart = new Date(now);
        preferredStart.setHours(hour, minute, 0, 0);
        const reminderTime = addMinutes(preferredStart, -reminderMinutesBefore);
        const reminderTimeStr = formatBangkokTime(reminderTime, 'HH:mm:ss');
        
        if (currentTime >= reminderTimeStr && currentTime < formatBangkokTime(preferredStart, 'HH:mm:ss')) {
          const hasCheckedIn = await hasEmployeeCheckedInToday(supabase, employee.id, today);
          
          if (!hasCheckedIn) {
            const reminderSent = await hasReminderSentToday(supabase, employee.id, 'soft_check_in', today);
            
            if (!reminderSent) {
              console.log(`[reminder] Sending soft check-in reminder to ${employee.full_name}`);
              await sendSoftCheckInReminder(employee, prefs.notification_type, lineAccessToken);
              await logReminder(supabase, employee.id, 'soft_check_in', today, prefs.notification_type);
              checkInReminders++;
            }
          }
        }
      }

      // SECOND CHECK-IN REMINDER for hours_based (before allowed_work_end_time)
      if (workingTimeType === 'hours_based' && prefs.second_checkin_reminder_enabled && employee.enable_second_checkin_reminder) {
        const allowedWorkEndTime = employee.allowed_work_end_time;
        const hoursPerDay = employee.hours_per_day || 8;
        const breakHours = employee.break_hours || 1;
        
        if (allowedWorkEndTime) {
          const [endHour, endMinute] = allowedWorkEndTime.split(':').map(Number);
          const workEnd = new Date(now);
          workEnd.setHours(endHour, endMinute, 0, 0);
          
          const totalMinutes = (hoursPerDay + breakHours) * 60;
          const latestStartTime = addMinutes(workEnd, -totalMinutes);
          const latestStartTimeStr = formatBangkokTime(latestStartTime, 'HH:mm:ss');
          
          const secondReminderTime = addMinutes(latestStartTime, -15);
          const secondReminderTimeStr = formatBangkokTime(secondReminderTime, 'HH:mm:ss');
          
          if (currentTime >= secondReminderTimeStr && currentTime < latestStartTimeStr) {
            const hasCheckedIn = await hasEmployeeCheckedInToday(supabase, employee.id, today);
            
            if (!hasCheckedIn) {
              const reminderSent = await hasReminderSentToday(supabase, employee.id, 'second_check_in', today);
              
              if (!reminderSent) {
                console.log(`[reminder] Sending second check-in reminder to ${employee.full_name}`);
                await sendSecondCheckInReminder(employee, latestStartTime, prefs.notification_type, lineAccessToken);
                await logReminder(supabase, employee.id, 'second_check_in', today, prefs.notification_type);
                checkInReminders++;
              }
            }
          }
        }
      }

      // CHECK-IN REMINDER LOGIC (only for time_based employees)
      if (workingTimeType === 'time_based' && prefs.check_in_reminder_enabled) {
        // Skip if no shift start time defined
        if (!employee.shift_start_time) {
          continue;
        }

        const shiftStartTime = employee.shift_start_time;
        const gracePeriodMinutes = prefs.grace_period_minutes || 15;
        
        // Parse shift start time and add grace period
        const [startHour, startMinute] = shiftStartTime.split(':').map(Number);
        const shiftStart = new Date(now);
        shiftStart.setHours(startHour, startMinute, 0, 0);
        const reminderTime = addMinutes(shiftStart, gracePeriodMinutes);
        const reminderTimeStr = formatBangkokTime(reminderTime, 'HH:mm:ss');

        console.log(`[attendance-reminder] Employee ${employee.full_name} (time_based): shift_start=${shiftStartTime}, reminder_time=${reminderTimeStr}, current=${currentTime}`);

        if (currentTime >= reminderTimeStr) {
          // Check if employee has checked in today
          const hasCheckedIn = await hasEmployeeCheckedInToday(supabase, employee.id, today);
          
          if (!hasCheckedIn) {
            // Check if reminder was already sent today
            const reminderSent = await hasReminderSentToday(supabase, employee.id, 'check_in', today);
            
            if (!reminderSent) {
              console.log(`[attendance-reminder] Sending check-in reminder to ${employee.full_name}`);
              await sendCheckInReminder(employee, prefs.notification_type, lineAccessToken);
              await logReminder(supabase, employee.id, 'check_in', today, prefs.notification_type);
              checkInReminders++;
            }
          }
        }
      }

      // CHECK-OUT REMINDER LOGIC
      if (prefs.check_out_reminder_enabled) {
        let expectedCheckOutTime: Date | null = null;

        if (workingTimeType === 'time_based') {
          // Time-based: use shift_end_time
          if (!employee.shift_end_time) {
            continue;
          }

          const shiftEndTime = employee.shift_end_time;
          const [endHour, endMinute] = shiftEndTime.split(':').map(Number);
          const shiftEnd = new Date(now);
          shiftEnd.setHours(endHour, endMinute, 0, 0);
          expectedCheckOutTime = shiftEnd;

          console.log(`[attendance-reminder] Employee ${employee.full_name} (time_based): shift_end=${shiftEndTime}`);
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
          
          expectedCheckOutTime = addMinutes(new Date(checkInTime), totalMinutes);

          console.log(`[attendance-reminder] Employee ${employee.full_name} (hours_based): check_in=${formatBangkokTime(new Date(checkInTime), 'HH:mm:ss')}, hours=${hoursPerDay}, break=${breakHours}, expected_checkout=${formatBangkokTime(expectedCheckOutTime, 'HH:mm:ss')}`);
        }

        if (!expectedCheckOutTime) {
          continue;
        }

        const reminderAfterMinutes = prefs.check_out_reminder_after_minutes || 15;
        const reminderTime = addMinutes(expectedCheckOutTime, reminderAfterMinutes);
        const reminderTimeStr = formatBangkokTime(reminderTime, 'HH:mm:ss');

        if (currentTime >= reminderTimeStr) {
          // First check if they checked in
          const hasCheckedIn = await hasEmployeeCheckedInToday(supabase, employee.id, today);
          
          if (hasCheckedIn) {
            // Check if they checked out
            const hasCheckedOut = await hasEmployeeCheckedOutToday(supabase, employee.id, today);
            
            if (!hasCheckedOut) {
              // Check if reminder was already sent today
              const reminderSent = await hasReminderSentToday(supabase, employee.id, 'check_out', today);
              
              if (!reminderSent) {
                console.log(`[attendance-reminder] Sending check-out reminder to ${employee.full_name}`);
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
async function hasEmployeeCheckedInToday(
  supabase: any,
  employeeId: string,
  date: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('event_type', 'check_in')
    .gte('server_time', `${date}T00:00:00`)
    .lte('server_time', `${date}T23:59:59`)
    .limit(1);

  if (error) {
    console.error('[hasEmployeeCheckedInToday] Error:', error);
    return false;
  }

  return data && data.length > 0;
}

// Helper function: Check if employee checked out today
async function hasEmployeeCheckedOutToday(
  supabase: any,
  employeeId: string,
  date: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('event_type', 'check_out')
    .gte('server_time', `${date}T00:00:00`)
    .lte('server_time', `${date}T23:59:59`)
    .limit(1);

  if (error) {
    console.error('[hasEmployeeCheckedOutToday] Error:', error);
    return false;
  }

  return data && data.length > 0;
}

// Helper function: Get employee's check-in time today (for hours_based calculation)
async function getEmployeeCheckInTime(
  supabase: any,
  employeeId: string,
  date: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('server_time')
    .eq('employee_id', employeeId)
    .eq('event_type', 'check_in')
    .gte('server_time', `${date}T00:00:00`)
    .lte('server_time', `${date}T23:59:59`)
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