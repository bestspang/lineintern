import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { toBangkokTime } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const tokenId = url.searchParams.get('tokenId');

    if (!tokenId) {
      return new Response(
        JSON.stringify({ error: 'Token ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate token
    const { data: token, error: tokenError } = await supabase
      .from('attendance_tokens')
      .select('*, employee:employees(id, full_name, code)')
      .eq('id', tokenId)
      .eq('type', 'history')
      .maybeSingle();

    if (tokenError || !token) {
      console.error('Token not found:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired
    if (new Date(token.expires_at) < new Date()) {
      await supabase
        .from('attendance_tokens')
        .update({ status: 'expired' })
        .eq('id', tokenId);

      return new Response(
        JSON.stringify({ error: 'Token has expired' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already used
    if (token.status === 'used') {
      return new Response(
        JSON.stringify({ error: 'Token already used' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get attendance history for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: logs, error: logsError } = await supabase
      .from('attendance_logs')
      .select('*, branch:branches(name)')
      .eq('employee_id', token.employee_id)
      .gte('server_time', thirtyDaysAgo.toISOString())
      .order('server_time', { ascending: false });

    if (logsError) {
      console.error('Error fetching logs:', logsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch attendance history' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate statistics
    const checkIns = logs.filter(log => log.event_type === 'check_in');
    const lateCount = logs.filter(log => log.is_flagged && log.flag_reason?.includes('late')).length;
    const totalDays = new Set(logs.map(log => new Date(log.server_time).toDateString())).size;

    // Calculate average check-in time
    const checkInTimes = checkIns.map(log => {
      const bangkokTime = toBangkokTime(log.server_time);
      return bangkokTime.getHours() * 60 + bangkokTime.getMinutes();
    });
    const avgCheckInTime = checkInTimes.length > 0
      ? checkInTimes.reduce((a, b) => a + b, 0) / checkInTimes.length
      : 0;
    const avgHours = Math.floor(avgCheckInTime / 60);
    const avgMinutes = Math.floor(avgCheckInTime % 60);

    const statistics = {
      totalDays,
      totalCheckIns: checkIns.length,
      totalCheckOuts: logs.filter(log => log.event_type === 'check_out').length,
      lateCount,
      flaggedCount: logs.filter(log => log.is_flagged).length,
      averageCheckInTime: `${avgHours.toString().padStart(2, '0')}:${avgMinutes.toString().padStart(2, '0')}`,
    };

    // Mark token as used
    await supabase
      .from('attendance_tokens')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', tokenId);

    return new Response(
      JSON.stringify({
        valid: true,
        employee: token.employee,
        logs,
        statistics,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in attendance-employee-history:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
