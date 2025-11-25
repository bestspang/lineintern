import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { format, addMinutes } from 'https://esm.sh/date-fns@4.1.0';

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
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;
    const now = new Date();
    const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    
    console.log('[auto-checkout-grace] Starting grace period check...');
    
    // หา active work sessions ที่ครบ grace period แล้ว
    const { data: sessions, error } = await supabase
      .from('work_sessions')
      .select(`
        *,
        employees (
          id, full_name, code, line_user_id, 
          announcement_group_line_id,
          hours_per_day, break_hours,
          auto_checkout_grace_period_minutes
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
        console.log(`[auto-checkout-grace] Grace period expired for ${employee.full_name}, performing auto checkout`);
        
        // Perform auto checkout
        const checkoutTime = graceExpiresAt;
        const { data: checkoutLog, error: checkoutError } = await supabase
          .from('attendance_logs')
          .insert({
            employee_id: employee.id,
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
          console.error(`[auto-checkout-grace] Error auto-checking out ${employee.full_name}:`, checkoutError);
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
          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lineAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              to: employee.line_user_id,
              messages: [{ type: 'text', text: message }]
            })
          });
        }
      }
    }
    
    console.log(`[auto-checkout-grace] Completed: ${autoCheckouts} auto checkouts`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        auto_checkouts: autoCheckouts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[auto-checkout-grace] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});