import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { format, differenceInMinutes } from 'https://esm.sh/date-fns@4.1.0';
import { toBangkokTime } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret || cronSecret !== expectedSecret) {
    console.error('[pattern-learner] Unauthorized: Invalid or missing CRON_SECRET');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    console.log('[pattern-learner] Starting pattern learning...');
    
    // หา employees ที่เปิดใช้งาน pattern learning
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, full_name, working_time_type, enable_pattern_learning')
      .eq('is_active', true)
      .eq('working_time_type', 'hours_based')
      .eq('enable_pattern_learning', true);
    
    if (empError) throw empError;
    
    let patternsUpdated = 0;
    
    for (const employee of employees || []) {
      // ดึงข้อมูล attendance logs ย้อนหลัง 30 วัน
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: logs, error: logsError } = await supabase
        .from('attendance_logs')
        .select('event_type, server_time')
        .eq('employee_id', employee.id)
        .gte('server_time', thirtyDaysAgo.toISOString())
        .order('server_time', { ascending: true });
      
      if (logsError) continue;
      if (!logs || logs.length < 10) continue; // ต้องมีข้อมูลอย่างน้อย 10 วัน
      
      // วิเคราะห์รูปแบบ
      const checkIns: Date[] = [];
      const checkOuts: Date[] = [];
      const durations: number[] = [];
      
      let lastCheckIn: Date | null = null;
      
      for (const log of logs) {
        const time = toBangkokTime(log.server_time);
        
        if (log.event_type === 'check_in') {
          checkIns.push(time);
          lastCheckIn = time;
        } else if (log.event_type === 'check_out' && lastCheckIn) {
          checkOuts.push(time);
          durations.push(differenceInMinutes(time, lastCheckIn));
          lastCheckIn = null;
        }
      }
      
      if (checkIns.length < 5) continue; // ต้องมีข้อมูลอย่างน้อย 5 วัน
      
      // คำนวณค่าเฉลี่ย
      const avgCheckInMinutes = checkIns.reduce((sum, time) => {
        return sum + time.getHours() * 60 + time.getMinutes();
      }, 0) / checkIns.length;
      
      const avgCheckOutMinutes = checkOuts.length > 0 
        ? checkOuts.reduce((sum, time) => {
            return sum + time.getHours() * 60 + time.getMinutes();
          }, 0) / checkOuts.length
        : avgCheckInMinutes + 480; // default 8 hours
      
      const avgDuration = durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 480;
      
      // แปลงกลับเป็น TIME
      const typicalCheckInHour = Math.floor(avgCheckInMinutes / 60);
      const typicalCheckInMinute = Math.floor(avgCheckInMinutes % 60);
      const typicalCheckInTime = `${String(typicalCheckInHour).padStart(2, '0')}:${String(typicalCheckInMinute).padStart(2, '0')}:00`;
      
      const typicalCheckOutHour = Math.floor(avgCheckOutMinutes / 60);
      const typicalCheckOutMinute = Math.floor(avgCheckOutMinutes % 60);
      const typicalCheckOutTime = `${String(typicalCheckOutHour).padStart(2, '0')}:${String(typicalCheckOutMinute).padStart(2, '0')}:00`;
      
      // คำนวณ confidence score
      const stdDev = Math.sqrt(
        durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length
      );
      const confidenceScore = Math.min(1.0, Math.max(0.0, 1.0 - (stdDev / 120))); // normalize to 0-1
      
      // บันทึกลง work_patterns
      const { error: patternError } = await supabase
        .from('work_patterns')
        .upsert({
          employee_id: employee.id,
          typical_checkin_time: typicalCheckInTime,
          typical_checkout_time: typicalCheckOutTime,
          typical_work_duration_minutes: Math.floor(avgDuration),
          confidence_score: confidenceScore.toFixed(2),
          pattern_type: 'auto_learned',
          sample_size: checkIns.length,
          last_updated_at: new Date().toISOString()
        }, {
          onConflict: 'employee_id'
        });
      
      if (!patternError) {
        console.log(`[pattern-learner] Updated pattern for ${employee.full_name}: check-in=${typicalCheckInTime}, confidence=${confidenceScore.toFixed(2)}`);
        patternsUpdated++;
      }
    }
    
    console.log(`[pattern-learner] Completed: ${patternsUpdated} patterns updated`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        patterns_updated: patternsUpdated 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[pattern-learner] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});