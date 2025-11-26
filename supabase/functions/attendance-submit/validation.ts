import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { toBangkokTime, formatBangkokTime } from '../_shared/timezone.ts';

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

  // 3. Calculate work hours
  const checkInTime = toBangkokTime(checkInLog.server_time);
  const hoursWorked = (bangkokNow.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
  const maxWorkHours = employee.max_work_hours_per_day || 8;

  // 4. If working overtime, require OT approval
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

  // 5. For time_based: check if before allowed_work_end_time
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
 */
export async function validateCheckIn(
  employee: any
): Promise<{ valid: boolean; error?: string; warning?: string }> {
  const bangkokNow = toBangkokTime(new Date());

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
