import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const today = new Date().toISOString().split('T')[0];
    
    // Get all active branches with daily summary enabled
    const { data: branches } = await supabase
      .from('branches')
      .select('*')
      .not('line_group_id', 'is', null);

    if (!branches || branches.length === 0) {
      console.log('No branches with LINE groups found');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let processedCount = 0;

    for (const branch of branches) {
      // Get all employees for this branch
      const { data: employees } = await supabase
        .from('employees')
        .select('*')
        .eq('branch_id', branch.id)
        .eq('is_active', true);

      if (!employees || employees.length === 0) continue;

      const summaryLines: string[] = [];
      let checkedInCount = 0;
      let checkedOutCount = 0;
      let lateCount = 0;
      let flaggedCount = 0;

      for (const employee of employees) {
        // Get today's check-in and check-out
        const { data: logs } = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('employee_id', employee.id)
          .gte('server_time', `${today}T00:00:00`)
          .lte('server_time', `${today}T23:59:59`)
          .order('server_time', { ascending: true });

        if (!logs || logs.length === 0) {
          summaryLines.push(`- ${employee.full_name}: ไม่พบการเช็คอิน`);
          continue;
        }

        const checkIn = logs.find(l => l.event_type === 'check_in');
        const checkOut = logs.find(l => l.event_type === 'check_out');

        if (checkIn) checkedInCount++;
        if (checkOut) checkedOutCount++;
        if (logs.some(l => l.is_flagged)) flaggedCount++;

        const checkInTime = checkIn ? 
          new Date(checkIn.server_time).toLocaleTimeString('th-TH', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Bangkok'
          }) : '-';

        const checkOutTime = checkOut ?
          new Date(checkOut.server_time).toLocaleTimeString('th-TH', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Bangkok'
          }) : 'ยังไม่เช็คเอาต์';

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

        const flagIndicator = logs.some(l => l.is_flagged) ? ' ⚠️' : '';

        summaryLines.push(
          `- ${employee.full_name}: เช็คอิน ${checkInTime}${lateIndicator}, เช็คเอาต์ ${checkOutTime}${flagIndicator}`
        );
      }

      // Compose summary message
      const summaryText = `📊 สรุปการเข้างาน ${today}\n📍 ${branch.name}\n\n${summaryLines.join('\n')}\n\n📈 สรุป:\n- เช็คอินแล้ว: ${checkedInCount}/${employees.length} คน\n- เช็คเอาต์แล้ว: ${checkedOutCount}/${employees.length} คน\n- มาสาย: ${lateCount} คน\n- มีข้อสังเกต: ${flaggedCount} คน`;

      // Send to LINE group
      const lineResponse = await fetch(`https://api.line.me/v2/bot/message/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')}`
        },
        body: JSON.stringify({
          to: branch.line_group_id,
          messages: [{
            type: 'text',
            text: summaryText
          }]
        })
      });

      let lineMessageId = null;
      if (lineResponse.ok) {
        const lineData = await lineResponse.json();
        lineMessageId = lineData.sentMessages?.[0]?.id || null;
      }

      // Store summary
      await supabase
        .from('daily_attendance_summaries')
        .upsert({
          branch_id: branch.id,
          summary_date: today,
          summary_text: summaryText,
          total_employees: employees.length,
          checked_in: checkedInCount,
          checked_out: checkedOutCount,
          late_count: lateCount,
          absent_count: employees.length - checkedInCount,
          flagged_count: flaggedCount,
          line_message_id: lineMessageId,
          sent_at: new Date().toISOString()
        });

      processedCount++;
    }

    return new Response(
      JSON.stringify({ success: true, processed: processedCount }),
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
