import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimiters } from '../_shared/rate-limiter.ts';
import { logger } from '../_shared/logger.ts';
import { validateSchema, attendanceSubmitSchema } from '../_shared/validators.ts';
import { formatBangkokTime } from '../_shared/timezone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to create Google Maps link
function createGoogleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Rate limiting check
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    if (rateLimiters.attendance.isRateLimited(clientIp)) {
      logger.warn('Rate limit exceeded for attendance submission', { clientIp });
      return new Response(
        JSON.stringify({ success: false, error: 'Too many requests. Please try again later.' }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            ...rateLimiters.attendance.getHeaders(clientIp),
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    // Check if this is a JSON request (check_only mode)
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const tokenId = body.token;
      
      // Handle check_only mode for early leave detection
      if (body.check_only) {
        // Validate token
        const { data: token, error: tokenError } = await supabase
          .from('attendance_tokens')
          .select(`
            *,
            employee:employees(
              id,
              working_time_type,
              hours_per_day,
              shift_start_time,
              shift_end_time
            )
          `)
          .eq('id', tokenId)
          .eq('status', 'pending')
          .eq('type', 'check_out')
          .single();

        if (tokenError || !token) {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid token' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get today's check-in
        const today = new Date().toISOString().split('T')[0];
        const { data: checkIns } = await supabase
          .from('attendance_logs')
          .select('server_time')
          .eq('employee_id', token.employee.id)
          .eq('event_type', 'check_in')
          .gte('server_time', `${today}T00:00:00`)
          .order('server_time', { ascending: false })
          .limit(1);

        if (!checkIns || checkIns.length === 0) {
          return new Response(
            JSON.stringify({ success: true, hours_insufficient: false }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const checkInTime = new Date(checkIns[0].server_time);
        const now = new Date();
        const hoursWorked = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

        // Calculate required hours
        let requiredHours = 8; // Default
        if (token.employee.working_time_type === 'hours_based' && token.employee.hours_per_day) {
          requiredHours = token.employee.hours_per_day;
        } else if (token.employee.working_time_type === 'time_based') {
          // Calculate from shift times
          if (token.employee.shift_start_time && token.employee.shift_end_time) {
            const [startHours, startMinutes] = token.employee.shift_start_time.split(':').map(Number);
            const [endHours, endMinutes] = token.employee.shift_end_time.split(':').map(Number);
            requiredHours = (endHours * 60 + endMinutes - startHours * 60 - startMinutes) / 60;
          }
        }

        const hoursInsufficient = hoursWorked < requiredHours;

        return new Response(
          JSON.stringify({ 
            success: true, 
            hours_insufficient: hoursInsufficient,
            hours_worked: hoursWorked,
            required_hours: requiredHours
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Normal FormData flow
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

    // Validate token using ATOMIC claim function
    const { data: claimedTokens, error: tokenError } = await supabase
      .rpc('claim_attendance_token', { p_token_id: tokenId });

    if (tokenError || !claimedTokens || claimedTokens.length === 0) {
      logger.warn('Token claim failed', { tokenId, error: tokenError });
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const claimedToken = claimedTokens[0];
    const employee = claimedToken.employee_data;
    
    // Get full employee data with relationships
    const { data: fullEmployee, error: empError } = await supabase
      .from('employees')
      .select(`
        *,
        salary_per_month,
        ot_rate_multiplier,
        auto_ot_enabled,
        max_work_hours_per_day,
        ot_warning_minutes,
        branch:branches!inner(*)
      `)
      .eq('id', claimedToken.employee_id)
      .eq('branch.is_deleted', false)
      .single();

    if (empError || !fullEmployee) {
      logger.error('Failed to fetch employee data', empError);
      return new Response(
        JSON.stringify({ success: false, error: 'Employee not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = {
      id: claimedToken.token_id,
      type: claimedToken.token_type,
      expires_at: claimedToken.expires_at,
      employee: fullEmployee
    };

    // VALIDATION: Check if employee can perform this action
    if (token.type === 'check_in') {
      const { data: canCheckIn } = await supabase.rpc('can_employee_check_in', {
        p_employee_id: token.employee.id
      });
      
      if (!canCheckIn) {
        return new Response(
          JSON.stringify({ 
            error: 'ไม่สามารถเช็คอินได้ กรุณาเช็คเอาท์ก่อน\n\nYou cannot check in. Please check out first.',
            code: 'ALREADY_CHECKED_IN'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (token.type === 'check_out') {
      const { data: canCheckOut } = await supabase.rpc('can_employee_check_out', {
        p_employee_id: token.employee.id
      });
      
      if (!canCheckOut) {
        return new Response(
          JSON.stringify({ 
            error: 'ไม่สามารถเช็คเอาท์ได้ กรุณาเช็คอินก่อน\n\nYou cannot check out. Please check in first.',
            code: 'NOT_CHECKED_IN'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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

    // Validate allowed work time for hours_based employees
    if (token.employee.working_time_type === 'hours_based') {
      const currentTime = new Date();
      const currentTimeStr = formatBangkokTime(currentTime, 'HH:mm:ss');
      
      const allowedStart = token.employee.allowed_work_start_time || '06:00:00';
      const allowedEnd = token.employee.allowed_work_end_time || '20:00:00';
      
      if (currentTimeStr < allowedStart || currentTimeStr > allowedEnd) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `ไม่สามารถ check-in นอกเวลาที่กำหนด (${allowedStart.substring(0,5)} - ${allowedEnd.substring(0,5)})`,
            error_en: `Check-in is not allowed outside the designated hours (${allowedStart.substring(0,5)} - ${allowedEnd.substring(0,5)})`
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
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
    let isRemoteCheckin = false;
    
    // Skip geofence validation if employee is allowed remote check-in
    if (token.employee.allow_remote_checkin) {
      isRemoteCheckin = true;
      console.log(`Remote check-in allowed for employee ${token.employee.id}`);
    } else if (token.employee.branch && token.employee.branch.latitude && token.employee.branch.longitude) {
      // STRICT MODE - Block if outside geofence when remote is NOT allowed
      if (latitude && longitude) {
        const { data: distance } = await supabase
          .rpc('calculate_distance_meters', {
            lat1: token.employee.branch.latitude,
            lon1: token.employee.branch.longitude,
            lat2: latitude,
            lon2: longitude
          });

        const allowedRadius = token.employee.branch.radius_meters || 200;

        if (distance && distance > allowedRadius) {
          // BLOCK: Don't allow check-in outside geofence
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `🚫 คุณอยู่นอกพื้นที่ที่กำหนด\n\n📍 ระยะห่าง: ${Math.round(distance)} เมตร\n✅ อนุญาตภายใน: ${allowedRadius} เมตร\n\nกรุณาเข้าใกล้สาขา "${token.employee.branch.name}" เพื่อ check-in`,
              error_en: `🚫 You are outside the allowed area\n\n📍 Distance: ${Math.round(distance)} meters\n✅ Allowed within: ${allowedRadius} meters\n\nPlease move closer to "${token.employee.branch.name}" branch to check in`,
              distance: Math.round(distance),
              allowed_radius: allowedRadius,
              branch_name: token.employee.branch.name
            }),
            { 
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
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

    // OT Calculation Logic for Checkout
    let overtimeHours = 0;
    let isOvertime = false;
    let overtimeRequestId: string | null = null;
    let earlyLeaveRequestId: string | null = null;
    let otPayAmount = 0;

    if (token.type === 'check_out') {
      // Get today's check-in to calculate work hours
      const today = new Date().toISOString().split('T')[0];
      const { data: checkIns } = await supabase
        .from('attendance_logs')
        .select('server_time')
        .eq('employee_id', token.employee.id)
        .eq('event_type', 'check_in')
        .gte('server_time', `${today}T00:00:00`)
        .order('server_time', { ascending: false })
        .limit(1);

      if (checkIns && checkIns.length > 0) {
        const checkInTime = new Date(checkIns[0].server_time);
        const checkOutTime = new Date();
        const totalWorkHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

        // Calculate required work hours
        let requiredHours = 8; // Default
        if (token.employee.working_time_type === 'hours_based' && token.employee.hours_per_day) {
          requiredHours = token.employee.hours_per_day;
        } else if (token.employee.working_time_type === 'time_based') {
          // Calculate from shift times
          if (token.employee.shift_start_time && token.employee.shift_end_time) {
            const [startHours, startMinutes] = token.employee.shift_start_time.split(':').map(Number);
            const [endHours, endMinutes] = token.employee.shift_end_time.split(':').map(Number);
            requiredHours = (endHours * 60 + endMinutes - startHours * 60 - startMinutes) / 60;
          }
        }

        const maxWorkHours = token.employee.max_work_hours_per_day || 8;

        // 🚨 CRITICAL VALIDATION: Block check-out if overtime without approval
        if (totalWorkHours > maxWorkHours) {
          // Check for approved OT request for today
          const { data: approvedOT } = await supabase
            .from('overtime_requests')
            .select('id, estimated_hours')
            .eq('employee_id', token.employee.id)
            .eq('request_date', today)
            .eq('status', 'approved')
            .maybeSingle();

          // If no OT approval and auto_ot disabled - BLOCK CHECK-OUT
          if (!approvedOT && !token.employee.auto_ot_enabled) {
            const overtimeHoursBlocked = totalWorkHours - maxWorkHours;
            
            logger.warn('Check-out blocked: Overtime without approval', {
              employee_id: token.employee.id,
              hours_worked: totalWorkHours,
              max_hours: maxWorkHours,
              overtime: overtimeHoursBlocked
            });

            return new Response(
              JSON.stringify({ 
                success: false, 
                error: `⚠️ ไม่สามารถ Check-out ได้\n\nคุณทำงานเกิน ${overtimeHoursBlocked.toFixed(1)} ชั่วโมง\nแต่ยังไม่ได้รับอนุมัติ OT\n\nกรุณา:\n1. ขออนุมัติ OT ก่อน (พิมพ์: /ot [เหตุผล])\n2. หรือติดต่อหัวหน้างานเพื่อขอ Auto-checkout`,
                error_en: `⚠️ Cannot Check-out\n\nYou have worked ${overtimeHoursBlocked.toFixed(1)} hours overtime\nbut don't have OT approval\n\nPlease:\n1. Request OT approval first (/ot [reason])\n2. Or contact your supervisor`,
                hours_worked: totalWorkHours,
                max_hours: maxWorkHours,
                overtime_hours: overtimeHoursBlocked,
                requires_ot_approval: true
              }),
              { 
                status: 403, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          // Has OT approval or auto_ot enabled - calculate overtime
          if (totalWorkHours > maxWorkHours) {
            overtimeHours = totalWorkHours - maxWorkHours;
            isOvertime = true;
            
            if (approvedOT) {
              overtimeRequestId = approvedOT.id;
              
              // Warn if exceeds estimated OT hours
              if (overtimeHours > (approvedOT.estimated_hours || 0)) {
                logger.warn('Overtime exceeds estimated hours', {
                  employee_id: token.employee.id,
                  actual_ot: overtimeHours,
                  estimated_ot: approvedOT.estimated_hours
                });
              }
            }

            // Calculate OT pay if salary is available
            if (token.employee.salary_per_month && token.employee.salary_per_month > 0) {
              const hoursPerDay = token.employee.hours_per_day || 8;
              const dailyRate = token.employee.salary_per_month / 30;
              const hourlyRate = dailyRate / hoursPerDay;
              const otMultiplier = token.employee.ot_rate_multiplier || 1.5;
              const otRate = hourlyRate * otMultiplier;
              otPayAmount = otRate * overtimeHours;
              
              logger.info('OT Pay calculated', {
                employee: token.employee.full_name,
                ot_hours: overtimeHours,
                ot_rate: otRate,
                ot_amount: otPayAmount
              });
            }
          }
        }
      }
    }

    // Insert attendance log
    const { data: logData, error: logError } = await supabase
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
        source: 'line',
        is_flagged: isFlagged,
        flag_reason: flagReasons.join('; '),
        overtime_hours: overtimeHours,
        is_overtime: isOvertime,
        overtime_request_id: overtimeRequestId,
        early_leave_request_id: earlyLeaveRequestId,
        is_remote_checkin: isRemoteCheckin,
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

    // Multi-Shift Support: Track work_sessions
    if (token.employee.working_time_type === 'hours_based') {
      const today = new Date().toISOString().split('T')[0];
      
      if (token.type === 'check_in') {
        // สร้าง work_session ใหม่
        const { data: existingSessions } = await supabase
          .from('work_sessions')
          .select('session_number')
          .eq('employee_id', token.employee.id)
          .eq('work_date', today)
          .order('session_number', { ascending: false })
          .limit(1);
        
        const sessionNumber = (existingSessions && existingSessions.length > 0) 
          ? existingSessions[0].session_number + 1 
          : 1;
        
        // คำนวณ grace period expiry
        const hoursPerDay = token.employee.hours_per_day || 8;
        const breakHours = token.employee.break_hours || 1;
        const gracePeriodMinutes = token.employee.auto_checkout_grace_period_minutes || 60;
        
        const totalMinutes = (hoursPerDay + breakHours) * 60;
        const graceExpiresAt = new Date(Date.now() + (totalMinutes + gracePeriodMinutes) * 60 * 1000);
        
        // สร้าง session
        const { error: sessionError } = await supabase.from('work_sessions').insert({
          employee_id: token.employee.id,
          work_date: today,
          session_number: sessionNumber,
          checkin_log_id: logData.id,
          actual_start_time: new Date().toISOString(),
          auto_checkout_grace_expires_at: graceExpiresAt.toISOString(),
          break_minutes: breakHours * 60,
          status: 'active'
        });
        
        if (sessionError) {
          console.error('[work_sessions] Error creating session:', sessionError);
        } else {
          console.log(`[work_sessions] Created session ${sessionNumber} for ${token.employee.full_name}`);
        }
      } else if (token.type === 'check_out') {
        // อัปเดต session ที่ active
        const { data: activeSession } = await supabase
          .from('work_sessions')
          .select('*')
          .eq('employee_id', token.employee.id)
          .eq('work_date', today)
          .eq('status', 'active')
          .order('session_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (activeSession) {
          const actualStartTime = new Date(activeSession.actual_start_time);
          const actualEndTime = new Date();
          const totalMinutes = Math.floor((actualEndTime.getTime() - actualStartTime.getTime()) / (1000 * 60));
          const netWorkMinutes = Math.max(0, totalMinutes - (activeSession.break_minutes || 60));
          
          const { error: updateError } = await supabase
            .from('work_sessions')
            .update({
              checkout_log_id: logData.id,
              actual_end_time: actualEndTime.toISOString(),
              total_minutes: totalMinutes,
              net_work_minutes: netWorkMinutes,
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', activeSession.id);
          
          if (updateError) {
            console.error('[work_sessions] Error updating session:', updateError);
          } else {
            console.log(`[work_sessions] Completed session ${activeSession.session_number} for ${token.employee.full_name}: ${(netWorkMinutes / 60).toFixed(1)} hrs`);
          }
        }
      }
    }

    // Send confirmation DM with Quick Reply
    const actionText = token.type === 'check_in' ? 'เช็คอิน' : 'เช็คเอาต์';
    const actionTextEn = token.type === 'check_in' ? 'checked in' : 'checked out';
    const timeStr = new Date().toLocaleTimeString('th-TH', { 
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit'
    });

    const flagWarning = isFlagged ? `\n\n⚠️ คำเตือน: ${flagReasons.join(', ')}` : '';
    
    // Remote check-in info
    let remoteInfo = '';
    let remoteInfoEn = '';
    if (isRemoteCheckin) {
      remoteInfo = `\n\n🌐 Remote Check-in`;
      remoteInfoEn = `\n\n🌐 Remote Check-in`;
      if (latitude && longitude) {
        const mapsLink = createGoogleMapsLink(latitude, longitude);
        remoteInfo += `\n🗺️ ตำแหน่ง:\n${mapsLink}`;
        remoteInfoEn += `\n🗺️ Location:\n${mapsLink}`;
      }
    }
    
    // OT info for checkout messages
    let otInfo = '';
    let otInfoEn = '';
    if (token.type === 'check_out' && isOvertime && overtimeHours > 0) {
      otInfo = `\n\n⏰ ชั่วโมง OT: ${overtimeHours.toFixed(2)} ชม.`;
      otInfoEn = `\n\n⏰ OT Hours: ${overtimeHours.toFixed(2)} hrs`;
      
      if (otPayAmount > 0) {
        otInfo += `\n💰 ค่า OT (โดยประมาณ): ${otPayAmount.toFixed(2)} บาท`;
        otInfoEn += `\n💰 OT Pay (estimated): ${otPayAmount.toFixed(2)} THB`;
      }
    }
    
    // Suggest next action based on current action
    const nextActionHint = token.type === 'check_in' 
      ? '\n\nเลิกงานแล้วอย่าลืม Check Out นะครับ! 😊'
      : '\n\nขอบคุณสำหรับการทำงานวันนี้! พรุ่งนี้เจอกันครับ 👋';
    
    const nextActionHintEn = token.type === 'check_in'
      ? '\n\nDon\'t forget to Check Out when you finish work! 😊'
      : '\n\nThank you for your work today! See you tomorrow! 👋';

    // Quick Reply buttons
    const quickReply = {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: token.type === 'check_in' ? '🔴 ออกงาน' : '🟢 เข้างาน',
            text: token.type === 'check_in' ? 'checkout' : 'checkin'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '📋 ประวัติ',
            text: 'history'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '❓ ช่วยเหลือ',
            text: '/help'
          }
        }
      ]
    };

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
          text: `✅ ${actionText}สำเร็จ\n⏰ เวลา: ${timeStr}\n📍 สาขา: ${token.employee.branch?.name || 'ไม่ระบุ'}${remoteInfo}${otInfo}${flagWarning}${nextActionHint}\n\n---\n\n✅ Successfully ${actionTextEn}\n⏰ Time: ${timeStr}\n📍 Branch: ${token.employee.branch?.name || 'N/A'}${remoteInfoEn}${otInfoEn}${flagWarning}${nextActionHintEn}`,
          quickReply: quickReply
        }]
      })
    });

    // Post to announcement group
    const announcementGroupId = token.employee.announcement_group_line_id || 
                                 token.employee.branch?.line_group_id;

    if (announcementGroupId) {
      const flagIcon = isFlagged ? '⚠️ ' : '';
      const remoteIcon = isRemoteCheckin ? '🌐 ' : '';
      let groupMessage = `${flagIcon}${remoteIcon}คุณ ${token.employee.full_name} ${actionText}${isRemoteCheckin ? ' (Remote)' : ''} เวลา ${timeStr}\n📍 สาขา: ${token.employee.branch?.name || 'ไม่ระบุ'}`;
      
      // Add Google Maps link for remote check-ins
      if (isRemoteCheckin && latitude && longitude) {
        const mapsLink = createGoogleMapsLink(latitude, longitude);
        groupMessage += `\n🗺️ ตำแหน่ง:\n${mapsLink}`;
      }
      
      if (otInfo) {
        groupMessage += `\n⏰ OT: ${overtimeHours.toFixed(2)} ชม.`;
      }
      
      if (flagWarning) {
        groupMessage += flagWarning;
      }
      
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
            text: groupMessage
          }]
        })
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        log: {
          id: logData?.id,
          event_type: logData?.event_type,
          server_time: logData?.server_time,
          is_flagged: logData?.is_flagged,
          flag_reason: logData?.flag_reason,
          is_remote_checkin: logData?.is_remote_checkin,
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
