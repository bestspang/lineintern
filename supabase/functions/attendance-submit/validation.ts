import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { toBangkokTime, formatBangkokTime, getBangkokNow } from '../_shared/timezone.ts';

/**
 * Validates if an hours_based employee can check in
 * - Validates against earliest_checkin_time and latest_checkin_time
 * - Bypasses validation if is_test_mode is enabled
 */
export async function validateHoursBasedCheckIn(
  employee: any
): Promise<{ valid: boolean; error?: string; warning?: string }> {
  // Test mode bypass
  if (employee.is_test_mode) {
    console.log(`[TEST MODE] Bypassing check-in time validation for ${employee.full_name || employee.id}`);
    return { valid: true, warning: '🧪 Test mode - time validation bypassed' };
  }

  const bangkokNow = getBangkokNow();
  const currentTimeStr = formatBangkokTime(bangkokNow, 'HH:mm:ss');
  
  const earliestCheckin = employee.earliest_checkin_time || '06:00:00';
  const latestCheckin = employee.latest_checkin_time || '11:00:00';
  
  // Check if current time is within allowed window
  if (currentTimeStr < earliestCheckin) {
    return {
      valid: false,
      error: `⏰ ยังไม่ถึงเวลา Check-in\n\nสามารถ Check-in ได้ตั้งแต่เวลา ${earliestCheckin.substring(0, 5)} น.\n\nกรุณารอก่อนนะครับ`,
    };
  }
  
  if (currentTimeStr > latestCheckin) {
    return {
      valid: false,
      error: `⏰ เลยเวลา Check-in แล้ว\n\nสามารถ Check-in ได้ถึงเวลา ${latestCheckin.substring(0, 5)} น. เท่านั้น\n\nกรุณาติดต่อหัวหน้างาน`,
    };
  }
  
  return { valid: true };
}

/**
 * Validates if an hours_based employee can check out
 * - Checks minimum work hours requirement
 * - Requires early leave approval if not meeting minimum
 */
export async function validateHoursBasedCheckOut(
  supabase: SupabaseClient,
  employeeId: string,
  employee: any,
  checkInTime: Date
): Promise<{ valid: boolean; error?: string; warning?: string }> {
  // Test mode bypass
  if (employee.is_test_mode) {
    console.log(`[TEST MODE] Bypassing check-out hours validation for ${employee.full_name || employeeId}`);
    return { valid: true, warning: '🧪 Test mode - hours validation bypassed (treated as 8h)' };
  }

  const bangkokNow = getBangkokNow();
  const bangkokDate = formatBangkokTime(bangkokNow, 'yyyy-MM-dd');
  
  // Calculate actual work duration
  const workDurationMs = bangkokNow.getTime() - checkInTime.getTime();
  const workDurationHours = workDurationMs / (1000 * 60 * 60);
  
  // Get minimum work hours requirement
  // For hours_based: minimum = hours_per_day + break_hours
  const hoursPerDay = employee.hours_per_day || 8;
  const breakHours = employee.break_hours || 1;
  const minimumWorkHours = employee.minimum_work_hours || (hoursPerDay + breakHours);
  
  // If worked less than minimum
  if (workDurationHours < minimumWorkHours) {
    // Check for approved early leave request
    const { data: approvedEarlyLeave } = await supabase
      .from('early_leave_requests')
      .select('id, status')
      .eq('employee_id', employeeId)
      .eq('request_date', bangkokDate)
      .eq('status', 'approved')
      .maybeSingle();
    
    if (!approvedEarlyLeave) {
      const hoursShort = (minimumWorkHours - workDurationHours).toFixed(1);
      const hoursWorked = workDurationHours.toFixed(1);
      
      return {
        valid: false,
        error: `⚠️ ยังทำงานไม่ครบกำหนด\n\n` +
               `⏱️ ทำงานมาแล้ว: ${hoursWorked} ชั่วโมง\n` +
               `📋 ต้องทำงานอย่างน้อย: ${minimumWorkHours} ชั่วโมง\n` +
               `⏳ ขาดอีก: ${hoursShort} ชั่วโมง\n\n` +
               `หากต้องการออกก่อน กรุณา:\n` +
               `• พิมพ์ "/ลาก่อน [เหตุผล]" เพื่อขออนุมัติ\n` +
               `• หรือติดต่อหัวหน้างาน`,
      };
    }
    
    // Has approved early leave
    return {
      valid: true,
      warning: `ℹ️ Check-out ก่อนเวลา (ได้รับอนุมัติแล้ว)`,
    };
  }
  
  return { valid: true };
}

/**
 * Validates if an employee can check out
 * - Checks if there's an active check-in
 * - For time_based: validates against allowed_work_end_time
 * - For overtime (past max_work_hours): requires OT approval
 */
export async function validateCheckOut(
  supabase: SupabaseClient,
  employeeId: string,
  employee: any
): Promise<{ valid: boolean; error?: string; warning?: string }> {
  const bangkokNow = toBangkokTime(new Date());
  const bangkokDate = formatBangkokTime(bangkokNow, 'yyyy-MM-dd');

  // 1. Check if there's an active check-in today
  const { data: checkInLog } = await supabase
    .from('attendance_logs')
    .select('id, server_time')
    .eq('employee_id', employeeId)
    .eq('event_type', 'check_in')
    .gte('server_time', `${bangkokDate}T00:00:00`)
    .lte('server_time', `${bangkokDate}T23:59:59`)
    .order('server_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!checkInLog) {
    return { valid: false, error: 'ยังไม่ได้ Check-in วันนี้' };
  }

  // 2. Check if already checked out after this check-in
  const { data: existingCheckOut } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('event_type', 'check_out')
    .gt('server_time', checkInLog.server_time)
    .limit(1)
    .maybeSingle();

  if (existingCheckOut) {
    return { valid: false, error: 'Check-out แล้ววันนี้' };
  }

  // 3. For hours_based employees, validate minimum work hours
  if (employee.working_time_type === 'hours_based') {
    const checkInTime = toBangkokTime(checkInLog.server_time);
    return validateHoursBasedCheckOut(supabase, employeeId, employee, checkInTime);
  }

  // 4. For time_based: Calculate work hours
  const checkInTime = toBangkokTime(checkInLog.server_time);
  const hoursWorked = (bangkokNow.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
  const maxWorkHours = employee.max_work_hours_per_day || 8;

  // 5. If working overtime, require OT approval
  if (hoursWorked > maxWorkHours) {
    const { data: otApproval } = await supabase
      .from('overtime_requests')
      .select('id, status, estimated_hours')
      .eq('employee_id', employeeId)
      .eq('request_date', bangkokDate)
      .eq('status', 'approved')
      .maybeSingle();

    // If no OT approval and not auto_ot_enabled
    if (!otApproval && !employee.auto_ot_enabled) {
      const overtimeHours = hoursWorked - maxWorkHours;
      return {
        valid: false,
        error: `⚠️ คุณทำงานเกิน ${overtimeHours.toFixed(1)} ชม. แต่ยังไม่ได้รับอนุมัติ OT\n\nกรุณาขออนุมัติ OT ก่อน หรือติดต่อหัวหน้างาน`,
      };
    }

    // If has OT approval but exceeds estimated hours
    if (otApproval && hoursWorked > maxWorkHours + (otApproval.estimated_hours || 0)) {
      return {
        valid: true,
        warning: `⚠️ คุณทำงาน OT เกินจากที่ขออนุมัติไว้ (${otApproval.estimated_hours} ชม.)`,
      };
    }
  }

  // 6. For time_based: check if before allowed_work_end_time
  if (employee.working_time_type === 'time_based' && employee.allowed_work_end_time) {
    const [hour, minute] = employee.allowed_work_end_time.split(':').map(Number);
    const allowedEndTime = toBangkokTime(bangkokNow);
    allowedEndTime.setHours(hour, minute, 0, 0);

    if (bangkokNow > allowedEndTime) {
      // Past allowed end time - this is OK but might be overtime
      return { valid: true };
    }
  }

  return { valid: true };
}

/**
 * Validates if an employee can check in
 * - For time_based: validates against allowed_work_start_time
 * - For hours_based: validates against earliest_checkin_time and latest_checkin_time
 */
export async function validateCheckIn(
  employee: any
): Promise<{ valid: boolean; error?: string; warning?: string }> {
  // Test mode bypass
  if (employee.is_test_mode) {
    console.log(`[TEST MODE] Bypassing all check-in validation for ${employee.full_name || employee.id}`);
    return { valid: true, warning: '🧪 Test mode - all validation bypassed' };
  }

  const bangkokNow = toBangkokTime(new Date());

  // For hours_based: check time window
  if (employee.working_time_type === 'hours_based') {
    return validateHoursBasedCheckIn(employee);
  }

  // For time_based: check if before allowed_work_start_time
  if (employee.working_time_type === 'time_based') {
    if (!employee.allowed_work_start_time) {
      return {
        valid: false,
        error: 'ข้อมูลการตั้งค่าไม่ครบถ้วน (allowed_work_start_time)',
      };
    }

    const [startHour, startMinute] = employee.allowed_work_start_time.split(':').map(Number);
    const allowedStartTime = toBangkokTime(bangkokNow);
    allowedStartTime.setHours(startHour, startMinute, 0, 0);

    if (bangkokNow < allowedStartTime) {
      return {
        valid: false,
        error: `ยังไม่ถึงเวลา Check-in (เริ่มได้เวลา ${employee.allowed_work_start_time})`,
      };
    }
  }

  return { valid: true };
}
