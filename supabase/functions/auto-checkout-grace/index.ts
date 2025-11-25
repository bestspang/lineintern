import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { format, addMinutes } from 'https://esm.sh/date-fns@4.1.0';
import { fetchWithRetry } from '../_shared/retry.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
    
    if (!lineAccessToken) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
    }
    
    const now = new Date();
    const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    
    logger.info('Starting grace period check', { time: bangkokTime.toISOString() });
    
    // หา active work sessions ที่ครบ grace period แล้ว
    const { data: sessions, error } = await supabase
      .from('work_sessions')
      .select(`
        *,
        employees (
          id, full_name, code, line_user_id, 
          announcement_group_line_id,
          hours_per_day, break_hours,
          auto_checkout_grace_period_minutes,
          branch_id
        )
      `)
      .eq('status', 'active')
      .not('auto_checkout_grace_expires_at', 'is', null)
      .lte('auto_checkout_grace_expires_at', bangkokTime.toISOString());
    
    if (error) throw error;
    
    let autoCheckouts = 0;
    
    for (const session of sessions || []) {
      const employee = session.employees;
      const graceExpiresAt = new Date(session.auto_checkout_grace_expires_at);
      
      // ตรวจสอบว่าหมดเวลา grace period แล้วหรือยัง
      if (bangkokTime >= graceExpiresAt) {
        logger.info('Grace period expired, checking for existing checkout', { 
          employeeId: employee.id,
          graceExpiresAt: graceExpiresAt.toISOString() 
        });
        
        // SAFEGUARD: Check if early leave checkout already exists for today
        const todayStart = new Date(bangkokTime);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(bangkokTime);
        todayEnd.setHours(23, 59, 59, 999);
        
        const { data: existingCheckout } = await supabase
          .from('attendance_logs')
          .select('id, early_leave_request_id, server_time')
          .eq('employee_id', employee.id)
          .eq('event_type', 'check_out')
          .gte('server_time', todayStart.toISOString())
          .lte('server_time', todayEnd.toISOString())
          .not('early_leave_request_id', 'is', null)
          .single();
        
        if (existingCheckout) {
          logger.info('Early leave checkout already exists, updating session to completed', {
            employeeId: employee.id,
            checkoutLogId: existingCheckout.id
          });
          
          // Update session to completed and link to existing checkout
          const checkoutTime = new Date(existingCheckout.server_time);
          const actualStartTime = new Date(session.actual_start_time);
          const totalMinutes = Math.floor((checkoutTime.getTime() - actualStartTime.getTime()) / (1000 * 60));
          const breakMinutes = session.break_minutes || 60;
          const netWorkMinutes = Math.max(0, totalMinutes - breakMinutes);
          
          await supabase
            .from('work_sessions')
            .update({
              checkout_log_id: existingCheckout.id,
              actual_end_time: checkoutTime.toISOString(),
              total_minutes: totalMinutes,
              net_work_minutes: netWorkMinutes,
              auto_checkout_performed: false,
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', session.id);
          
          logger.info('Session updated to completed with existing early leave checkout', {
            sessionId: session.id
          });
          
          continue; // Skip auto-checkout for this session
        }
        
        // Perform auto checkout
        const checkoutTime = graceExpiresAt;
        const { data: checkoutLog, error: checkoutError } = await supabase
          .from('attendance_logs')
          .insert({
            employee_id: employee.id,
            branch_id: employee.branch_id, // FIX: Add branch_id
            event_type: 'check_out',
            server_time: checkoutTime.toISOString(),
            device_time: checkoutTime.toISOString(),
            timezone: 'Asia/Bangkok',
            source: 'auto_checkout_grace_period',
            device_info: { 
              auto_checkout: true, 
              reason: 'grace_period_expired',
              session_id: session.id
            }
          })
          .select()
          .single();
        
        if (checkoutError) {
          logger.error('Failed to create checkout log', { employeeId: employee.id, error: checkoutError });
          continue;
        }
        
        // Update session
        const actualStartTime = new Date(session.actual_start_time);
        const totalMinutes = Math.floor((checkoutTime.getTime() - actualStartTime.getTime()) / (1000 * 60));
        const breakMinutes = session.break_minutes || 60;
        const netWorkMinutes = Math.max(0, totalMinutes - breakMinutes);
        
        // บันทึกเวลาจริงที่พนักงานอยู่ที่ทำงาน
        const recordedWorkMinutes = (employee.hours_per_day || 8) * 60;
        
        await supabase
          .from('work_sessions')
          .update({
            checkout_log_id: checkoutLog.id,
            actual_end_time: checkoutTime.toISOString(),
            total_minutes: totalMinutes,
            net_work_minutes: netWorkMinutes,
            auto_checkout_performed: true,
            status: 'auto_closed',
            updated_at: new Date().toISOString()
          })
          .eq('id', session.id);
        
        autoCheckouts++;
        
        // ส่งข้อความแจ้งเตือน
        const hoursWorked = (totalMinutes / 60).toFixed(1);
        const recordedHours = (recordedWorkMinutes / 60).toFixed(1);
        const gracePeriod = employee.auto_checkout_grace_period_minutes || 60;
        
        const message = `⏰ Auto Check-Out (Grace Period หมดเวลา)\n\n` +
          `👤 คุณ${employee.full_name}\n` +
          `📍 Check-Out เวลา: ${format(checkoutTime, 'HH:mm')}\n\n` +
          `⏱️ เวลาอยู่ที่ทำงาน: ${hoursWorked} ชั่วโมง\n` +
          `💼 นับเป็นเงินเดือน: ${recordedHours} ชั่วโมง\n\n` +
          `ℹ️ เนื่องจากคุณไม่ได้ Check-Out ภายใน ${gracePeriod} นาที หลังครบชั่วโมงทำงาน\n` +
          `ระบบได้ทำการ Check-Out อัตโนมัติให้แล้วค่ะ\n\n` +
          `หากมีข้อสงสัย กรุณาติดต่อหัวหน้างาน`;
        
        if (employee.line_user_id) {
          try {
            await fetchWithRetry('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lineAccessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                to: employee.line_user_id,
                messages: [{ type: 'text', text: message }]
              })
            }, { maxRetries: 2 });
            logger.info('Sent auto-checkout notification', { employeeId: employee.id });
          } catch (notifyError) {
            logger.error('Failed to send LINE notification', { employeeId: employee.id, error: notifyError });
            // Continue processing even if notification fails
          }
        }
      }
    }
    
    logger.info('Auto-checkout grace period check completed', { autoCheckouts });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        auto_checkouts: autoCheckouts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    logger.error('Auto-checkout grace period check failed', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});