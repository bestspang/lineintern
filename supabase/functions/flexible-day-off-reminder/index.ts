import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBangkokNow, getBangkokDateString, formatBangkokTime } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');

    console.log('[flexible-day-off-reminder] Starting weekly reminder check');

    // Calculate current week range (Monday to Sunday) in Bangkok timezone
    const bangkokNow = getBangkokNow();
    const dayOfWeek = bangkokNow.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const weekStart = new Date(bangkokNow);
    weekStart.setDate(bangkokNow.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const weekStartDate = getBangkokDateString(weekStart);
    const weekEndDate = getBangkokDateString(weekEnd);

    console.log(`[flexible-day-off-reminder] Week range: ${weekStartDate} to ${weekEndDate}`);

    // Get employees with flexible day-off enabled and LINE user ID
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, full_name, code, line_user_id, flexible_days_per_week')
      .eq('is_active', true)
      .eq('flexible_day_off_enabled', true)
      .not('line_user_id', 'is', null);

    if (empError) {
      console.error('[flexible-day-off-reminder] Error fetching employees:', empError);
      throw empError;
    }

    if (!employees || employees.length === 0) {
      console.log('[flexible-day-off-reminder] No employees with flexible day-off enabled');
      return new Response(
        JSON.stringify({ success: true, message: 'No employees to remind', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[flexible-day-off-reminder] Found ${employees.length} employees with flexible day-off enabled`);

    // Get existing requests for this week
    const employeeIds = employees.map(e => e.id);
    const { data: existingRequests, error: reqError } = await supabase
      .from('flexible_day_off_requests')
      .select('employee_id, day_off_date')
      .in('employee_id', employeeIds)
      .gte('day_off_date', weekStartDate)
      .lte('day_off_date', weekEndDate)
      .in('status', ['pending', 'approved']);

    if (reqError) {
      console.error('[flexible-day-off-reminder] Error fetching existing requests:', reqError);
      throw reqError;
    }

    // Group requests by employee
    const requestsByEmployee = new Map<string, number>();
    existingRequests?.forEach(req => {
      const count = requestsByEmployee.get(req.employee_id) || 0;
      requestsByEmployee.set(req.employee_id, count + 1);
    });

    // Filter employees who haven't used their quota
    const employeesToRemind = employees.filter(emp => {
      const usedDays = requestsByEmployee.get(emp.id) || 0;
      const quota = emp.flexible_days_per_week || 1;
      return usedDays < quota;
    });

    console.log(`[flexible-day-off-reminder] ${employeesToRemind.length} employees need reminder`);

    if (!LINE_ACCESS_TOKEN || employeesToRemind.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: employeesToRemind.length === 0 
            ? 'All employees have already requested their day off' 
            : 'LINE_ACCESS_TOKEN not configured',
          sent: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format dates for message
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const weekStartFormatted = `${weekStart.getDate()} ${thaiMonths[weekStart.getMonth()]}`;
    const weekEndFormatted = `${weekEnd.getDate()} ${thaiMonths[weekEnd.getMonth()]}`;

    let sentCount = 0;
    const errors: string[] = [];

    // Send reminders
    for (const emp of employeesToRemind) {
      const usedDays = requestsByEmployee.get(emp.id) || 0;
      const quota = emp.flexible_days_per_week || 1;
      const remaining = quota - usedDays;

      const message = `📅 เตือนความจำ: วันหยุดยืดหยุ่น\n\n` +
        `สวัสดี ${emp.full_name}\n\n` +
        `🗓 สัปดาห์นี้ (${weekStartFormatted} - ${weekEndFormatted})\n` +
        `📌 คุณยังไม่ได้เลือกวันหยุดยืดหยุ่น\n` +
        `💡 คุณมีสิทธิ์หยุดได้อีก ${remaining} วัน ในสัปดาห์นี้\n\n` +
        `พิมพ์ /dayoff [วันที่] เพื่อขอวันหยุด\n` +
        `ตัวอย่าง: /dayoff พรุ่งนี้\n` +
        `หรือ: /dayoff 2024-12-10`;

      try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: emp.line_user_id,
            messages: [{ type: 'text', text: message }]
          })
        });

        if (response.ok) {
          sentCount++;
          console.log(`[flexible-day-off-reminder] Sent reminder to ${emp.full_name}`);

          // Log the message
          await supabase.from('bot_message_logs').insert({
            edge_function_name: 'flexible-day-off-reminder',
            destination_type: 'user',
            destination_id: emp.line_user_id,
            destination_name: emp.full_name,
            message_type: 'text',
            message_text: message,
            delivery_status: 'sent',
            triggered_by: 'cron',
            recipient_employee_id: emp.id,
          });
        } else {
          const errorText = await response.text();
          console.error(`[flexible-day-off-reminder] Failed to send to ${emp.full_name}:`, errorText);
          errors.push(`${emp.full_name}: ${errorText}`);
        }
      } catch (e) {
        console.error(`[flexible-day-off-reminder] Error sending to ${emp.full_name}:`, e);
        errors.push(`${emp.full_name}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    console.log(`[flexible-day-off-reminder] Completed. Sent: ${sentCount}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount,
        total_eligible: employeesToRemind.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[flexible-day-off-reminder] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
