import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { format, addMinutes, startOfDay, endOfDay } from 'https://esm.sh/date-fns@4.1.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Employee {
  id: string;
  full_name: string;
  line_user_id: string | null;
  announcement_group_line_id: string | null;
  working_time_type: string; // 'time_based' or 'hours_based'
  shift_start_time: string | null;
  shift_end_time: string | null;
  hours_per_day: number | null;
  break_hours: number | null;
  reminder_preferences: {
    check_in_reminder_enabled: boolean;
    check_out_reminder_enabled: boolean;
    notification_type: 'private' | 'group' | 'both';
    grace_period_minutes: number;
    check_out_reminder_after_minutes: number;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[attendance-reminder] Starting attendance reminder check...');

    const now = new Date();
    const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const currentTime = format(bangkokTime, 'HH:mm:ss');
    const today = format(bangkokTime, 'yyyy-MM-dd');

    console.log(`[attendance-reminder] Current Bangkok time: ${format(bangkokTime, 'yyyy-MM-dd HH:mm:ss')}`);

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
        const shiftStart = new Date(bangkokTime);
        shiftStart.setHours(startHour, startMinute, 0, 0);
        const reminderTime = addMinutes(shiftStart, gracePeriodMinutes);
        const reminderTimeStr = format(reminderTime, 'HH:mm:ss');

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
          const shiftEnd = new Date(bangkokTime);
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

          console.log(`[attendance-reminder] Employee ${employee.full_name} (hours_based): check_in=${format(new Date(checkInTime), 'HH:mm:ss')}, hours=${hoursPerDay}, break=${breakHours}, expected_checkout=${format(expectedCheckOutTime, 'HH:mm:ss')}`);
        }

        if (!expectedCheckOutTime) {
          continue;
        }

        const reminderAfterMinutes = prefs.check_out_reminder_after_minutes || 15;
        const reminderTime = addMinutes(expectedCheckOutTime, reminderAfterMinutes);
        const reminderTimeStr = format(reminderTime, 'HH:mm:ss');

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
        timestamp: bangkokTime.toISOString(),
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
  reminderType: 'check_in' | 'check_out',
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
  reminderType: 'check_in' | 'check_out',
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

  try {
    if ((notificationType === 'private' || notificationType === 'both') && employee.line_user_id) {
      await sendLineMessage(employee.line_user_id, privateMessage, lineAccessToken);
    }

    if ((notificationType === 'group' || notificationType === 'both') && employee.announcement_group_line_id) {
      await sendLineMessage(employee.announcement_group_line_id, groupMessage, lineAccessToken);
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

  try {
    if ((notificationType === 'private' || notificationType === 'both') && employee.line_user_id) {
      await sendLineMessage(employee.line_user_id, privateMessage, lineAccessToken);
    }

    if ((notificationType === 'group' || notificationType === 'both') && employee.announcement_group_line_id) {
      await sendLineMessage(employee.announcement_group_line_id, groupMessage, lineAccessToken);
    }
  } catch (error) {
    console.error('[sendCheckOutReminder] Error:', error);
    throw error;
  }
}

// Send LINE message
async function sendLineMessage(lineId: string, message: string, lineAccessToken: string) {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lineAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: lineId,
      messages: [{ type: 'text', text: message }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[sendLineMessage] LINE API error:', response.status, errorText);
    throw new Error(`LINE API error: ${response.status} - ${errorText}`);
  }

  console.log(`[sendLineMessage] Message sent successfully to ${lineId}`);
}