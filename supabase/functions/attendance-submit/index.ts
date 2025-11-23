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
    const livenessDataRaw = formData.get('livenessData') as string | null;
    
    let livenessData = null;
    if (livenessDataRaw) {
      try {
        livenessData = JSON.parse(livenessDataRaw);
      } catch (e) {
        console.error('Failed to parse liveness data:', e);
      }
    }

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
    let photoPath: string | null = null;
    let photoHash: string | null = null;
    let exifData: any = null;
    let fraudScore = 0;
    let fraudReasons: string[] = [];
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
      
      // Calculate photo hash for duplicate detection
      const photoBytes = new Uint8Array(await photoFile.arrayBuffer());
      const hashBuffer = await crypto.subtle.digest('SHA-256', photoBytes);
      photoHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Extract basic EXIF-like metadata
      exifData = {
        size: photoFile.size,
        type: photoFile.type,
        lastModified: photoFile.lastModified,
        uploadTime: Date.now(),
        livenessVerified: !!livenessData,
        livenessChallenge: livenessData?.challenge || null,
        blinkDetected: livenessData?.blinked || false,
        headTurnDetected: livenessData?.headTurned || false,
      };
      
      // Adjust fraud score based on liveness verification
      if (livenessData) {
        // Liveness verification passed - reduce fraud score
        fraudScore -= 20;
        fraudReasons.push('liveness_verified');
        
        // Check if challenge was completed
        if (!livenessData.blinked && !livenessData.headTurned) {
          fraudScore += 15;
          fraudReasons.push('liveness_challenge_failed');
        }
      } else {
        // No liveness verification - increase fraud score
        fraudScore += 30;
        fraudReasons.push('no_liveness_verification');
      }

      // Check for duplicate photos
      if (photoHash) {
        const { data: duplicates } = await supabase
          .rpc('detect_duplicate_photos', {
            p_employee_id: token.employee.id,
            p_photo_hash: photoHash,
            p_hours_lookback: 168 // 7 days
          });

        if (duplicates && duplicates.length > 0 && duplicates[0].is_duplicate) {
          fraudScore += 50;
          fraudReasons.push('duplicate_photo');
          const hoursDiff = duplicates[0].time_diff_hours;
          if (hoursDiff < 24) {
            fraudScore += 30; // Higher score if duplicate within 24h
            fraudReasons.push('duplicate_within_24h');
          }
        }
      }
      
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
        photoPath = fileName;
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
          fraudScore += 20;
          fraudReasons.push('outside_geofence');
        }
      }
    }

    // Check for suspicious timing patterns
    const currentTime = new Date();
    const currentHour = currentTime.getUTCHours() + 7; // Bangkok time
    const currentMinute = currentTime.getMinutes();
    const currentSecond = currentTime.getSeconds();

    // Check if time is too exact (e.g., 08:00:00 every day)
    if (currentSecond === 0 && currentMinute === 0) {
      fraudScore += 15;
      fraudReasons.push('suspicious_timing');
    }

    // Check for unusual hours
    if (currentHour < 5 || currentHour > 23) {
      fraudScore += 10;
      fraudReasons.push('unusual_hours');
    }

    // Get recent check-ins to detect patterns
    const { data: recentLogs } = await supabase
      .from('attendance_logs')
      .select('server_time')
      .eq('employee_id', token.employee.id)
      .gte('server_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('server_time', { ascending: false })
      .limit(5);

    if (recentLogs && recentLogs.length >= 3) {
      // Check if all times are suspiciously similar
      const times = recentLogs.map(log => new Date(log.server_time));
      const minutes = times.map(t => t.getMinutes());
      const seconds = times.map(t => t.getSeconds());
      
      const allSameMinute = minutes.every(m => m === minutes[0]);
      const allSameSecond = seconds.every(s => s === seconds[0]);
      
      if (allSameMinute && allSameSecond) {
        fraudScore += 25;
        fraudReasons.push('identical_time_pattern');
      }
    }

    // Set flagged status based on fraud score
    if (fraudScore >= 40) {
      isFlagged = true;
      flagReasons.push(`Fraud detection: score ${fraudScore}`);
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
        photo_url: photoPath,
        photo_hash: photoHash,
        exif_data: exifData,
        fraud_score: fraudScore,
        fraud_reasons: fraudReasons,
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
