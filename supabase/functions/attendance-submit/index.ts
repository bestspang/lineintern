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

    const formData = await req.formData();
    const tokenId = formData.get('token') as string;
    const latitude = parseFloat(formData.get('latitude') as string);
    const longitude = parseFloat(formData.get('longitude') as string);
    const deviceTime = formData.get('deviceTime') as string;
    const timezone = formData.get('timezone') as string;
    const deviceInfo = formData.get('deviceInfo') as string;
    const photoFile = formData.get('photo') as File | null;

    // Validate token again
    const { data: token, error: tokenError } = await supabase
      .from('attendance_tokens')
      .select(`
        *,
        employee:employees(
          *,
          branch:branches(*)
        )
      `)
      .eq('id', tokenId)
      .eq('status', 'pending')
      .single();

    if (tokenError || !token || new Date(token.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get settings
    const { data: settings } = await supabase
      .rpc('get_effective_attendance_settings', { p_employee_id: token.employee.id })
      .single();

    const effectiveSettings = settings as { 
      enable_attendance?: boolean;
      require_photo?: boolean;
      require_location?: boolean;
    } | null;

    let photoUrl: string | null = null;
    let isFlagged = false;
    let flagReasons: string[] = [];

    // Validate photo requirement
    if (effectiveSettings?.require_photo && !photoFile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Photo is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate location requirement
    if (effectiveSettings?.require_location && (!latitude || !longitude)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Location is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upload photo if provided
    if (photoFile) {
      const fileExt = photoFile.name.split('.').pop();
      const fileName = `${token.employee.id}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attendance-photos')
        .upload(fileName, photoFile, {
          contentType: photoFile.type,
          upsert: false
        });

      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        flagReasons.push('Photo upload failed');
        isFlagged = true;
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('attendance-photos')
          .getPublicUrl(fileName);
        photoUrl = publicUrl;
      }
    }

    // Check geofence if branch has location
    if (token.employee.branch && token.employee.branch.latitude && token.employee.branch.longitude) {
      if (latitude && longitude) {
        const { data: distance } = await supabase
          .rpc('calculate_distance_meters', {
            lat1: token.employee.branch.latitude,
            lon1: token.employee.branch.longitude,
            lat2: latitude,
            lon2: longitude
          });

        if (distance && distance > (token.employee.branch.radius_meters || 200)) {
          isFlagged = true;
          flagReasons.push(`นอกพื้นที่ (ห่าง ${distance} เมตร) / Outside geofence (${distance}m away)`);
        }
      }
    }

    // Mark token as used
    await supabase
      .from('attendance_tokens')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', tokenId);

    // Insert attendance log
    const { data: log, error: logError } = await supabase
      .from('attendance_logs')
      .insert({
        employee_id: token.employee.id,
        branch_id: token.employee.branch_id,
        event_type: token.type,
        server_time: new Date().toISOString(),
        device_time: deviceTime,
        timezone: timezone,
        latitude: latitude,
        longitude: longitude,
        photo_url: photoUrl,
        device_info: JSON.parse(deviceInfo || '{}'),
        source: 'webapp',
        is_flagged: isFlagged,
        flag_reason: flagReasons.join('; ')
      })
      .select()
      .single();

    if (logError) {
      console.error('Log insert error:', logError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to record attendance' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send confirmation DM
    const actionText = token.type === 'check_in' ? 'เช็คอิน' : 'เช็คเอาต์';
    const actionTextEn = token.type === 'check_in' ? 'checked in' : 'checked out';
    const timeStr = new Date().toLocaleTimeString('th-TH', { 
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit'
    });

    const flagWarning = isFlagged ? `\n\n⚠️ คำเตือน: ${flagReasons.join(', ')}` : '';

    await fetch(`https://api.line.me/v2/bot/message/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')}`
      },
      body: JSON.stringify({
        to: token.employee.line_user_id,
        messages: [{
          type: 'text',
          text: `✅ ${actionText}สำเร็จ\n⏰ เวลา: ${timeStr}\n📍 สาขา: ${token.employee.branch?.name || 'ไม่ระบุ'}${flagWarning}\n\n---\n\n✅ Successfully ${actionTextEn}\n⏰ Time: ${timeStr}\n📍 Branch: ${token.employee.branch?.name || 'N/A'}${flagWarning}`
        }]
      })
    });

    // Post to announcement group
    const announcementGroupId = token.employee.announcement_group_line_id || 
                                 token.employee.branch?.line_group_id;

    if (announcementGroupId) {
      const flagIcon = isFlagged ? '⚠️ ' : '';
      await fetch(`https://api.line.me/v2/bot/message/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')}`
        },
        body: JSON.stringify({
          to: announcementGroupId,
          messages: [{
            type: 'text',
            text: `${flagIcon}คุณ ${token.employee.full_name} ${actionText}เวลา ${timeStr} ที่${token.employee.branch?.name || 'ไม่ระบุ'}${flagWarning}`
          }]
        })
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        log: {
          id: log.id,
          event_type: log.event_type,
          server_time: log.server_time,
          is_flagged: log.is_flagged,
          flag_reason: log.flag_reason
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
