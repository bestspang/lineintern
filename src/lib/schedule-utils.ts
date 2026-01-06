/**
 * Schedule Utils - Effective Schedule Resolution
 * 
 * Priority Order:
 * 1. shift_assignments (ตารางกะรายสัปดาห์) - Primary source for shift workers
 * 2. work_schedules (ตั้งค่า OT & เวลาทำงาน) - Fallback for office workers
 * 3. Default (Mon-Fri 09:00-18:00) - Final fallback
 */

import { getDay, parseISO } from "date-fns";

export interface ShiftAssignment {
  employee_id: string;
  work_date: string;
  is_day_off: boolean | null;
  day_off_type?: string | null;
  shift_template_id: string | null;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  is_borrowed?: boolean | null;
}

export interface ShiftTemplate {
  id: string;
  start_time: string;
  end_time: string;
  break_hours?: number | null;
  name?: string;
}

export interface WorkSchedule {
  employee_id: string;
  day_of_week: number;
  is_working_day: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface EffectiveSchedule {
  isWorkingDay: boolean;
  startTime: string;
  endTime: string;
  breakHours: number;
  source: 'shift' | 'work_schedule' | 'default';
  isDayOff: boolean;
  dayOffType?: string | null;
  shiftName?: string;
  isBorrowed?: boolean;
}

interface GetEffectiveScheduleParams {
  employeeId: string;
  date: Date | string;
  shiftAssignments: ShiftAssignment[] | null;
  shiftTemplates: Map<string, ShiftTemplate>;
  workSchedules: WorkSchedule[] | null;
  employeeSettings?: {
    shift_start_time?: string | null;
    shift_end_time?: string | null;
    break_hours?: number | null;
  } | null;
}

/**
 * Get the effective schedule for an employee on a specific date
 * Follows priority: shift_assignments > work_schedules > default
 */
export function getEffectiveSchedule({
  employeeId,
  date,
  shiftAssignments,
  shiftTemplates,
  workSchedules,
  employeeSettings,
}: GetEffectiveScheduleParams): EffectiveSchedule {
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  const dayOfWeek = typeof date === 'string' ? getDay(parseISO(date)) : getDay(date);
  
  // Default values (Mon-Fri 09:00-18:00)
  const DEFAULT_START = '09:00';
  const DEFAULT_END = '18:00';
  const DEFAULT_BREAK = 1;
  const defaultWorkingDays = new Set([1, 2, 3, 4, 5]); // Mon-Fri
  
  // Priority 1: Check shift_assignments for this employee + date
  if (shiftAssignments) {
    const assignment = shiftAssignments.find(
      sa => sa.employee_id === employeeId && sa.work_date === dateStr
    );
    
    if (assignment) {
      // If it's a day off in the shift schedule
      if (assignment.is_day_off) {
        return {
          isWorkingDay: false,
          startTime: DEFAULT_START,
          endTime: DEFAULT_END,
          breakHours: DEFAULT_BREAK,
          source: 'shift',
          isDayOff: true,
          dayOffType: assignment.day_off_type,
          isBorrowed: assignment.is_borrowed || false,
        };
      }
      
      // Get times from custom times or shift template
      let startTime = assignment.custom_start_time || DEFAULT_START;
      let endTime = assignment.custom_end_time || DEFAULT_END;
      let breakHours = DEFAULT_BREAK;
      let shiftName: string | undefined;
      
      if (assignment.shift_template_id) {
        const template = shiftTemplates.get(assignment.shift_template_id);
        if (template) {
          startTime = assignment.custom_start_time || template.start_time || DEFAULT_START;
          endTime = assignment.custom_end_time || template.end_time || DEFAULT_END;
          breakHours = template.break_hours ?? DEFAULT_BREAK;
          shiftName = template.name;
        }
      }
      
      return {
        isWorkingDay: true,
        startTime,
        endTime,
        breakHours,
        source: 'shift',
        isDayOff: false,
        shiftName,
        isBorrowed: assignment.is_borrowed || false,
      };
    }
  }
  
  // Priority 2: Check work_schedules for this employee + dayOfWeek
  if (workSchedules) {
    const schedule = workSchedules.find(
      ws => ws.employee_id === employeeId && ws.day_of_week === dayOfWeek
    );
    
    if (schedule) {
      return {
        isWorkingDay: schedule.is_working_day,
        startTime: schedule.start_time || DEFAULT_START,
        endTime: schedule.end_time || DEFAULT_END,
        breakHours: employeeSettings?.break_hours ?? DEFAULT_BREAK,
        source: 'work_schedule',
        isDayOff: !schedule.is_working_day,
      };
    }
  }
  
  // Priority 2.5: Check employee-level settings (shift_start_time, shift_end_time)
  if (employeeSettings?.shift_start_time && employeeSettings?.shift_end_time) {
    return {
      isWorkingDay: defaultWorkingDays.has(dayOfWeek),
      startTime: employeeSettings.shift_start_time,
      endTime: employeeSettings.shift_end_time,
      breakHours: employeeSettings.break_hours ?? DEFAULT_BREAK,
      source: 'default', // Mark as default since it's not from shift_assignments or work_schedules
      isDayOff: !defaultWorkingDays.has(dayOfWeek),
    };
  }
  
  // Priority 3: Default (Mon-Fri, 09:00-18:00)
  return {
    isWorkingDay: defaultWorkingDays.has(dayOfWeek),
    startTime: DEFAULT_START,
    endTime: DEFAULT_END,
    breakHours: DEFAULT_BREAK,
    source: 'default',
    isDayOff: !defaultWorkingDays.has(dayOfWeek),
  };
}

/**
 * Build a map of effective schedules for multiple employees over a date range
 */
export function buildEffectiveScheduleMap(
  employees: { id: string; shift_start_time?: string | null; shift_end_time?: string | null; break_hours?: number | null }[],
  dates: Date[],
  shiftAssignments: ShiftAssignment[] | null,
  shiftTemplates: Map<string, ShiftTemplate>,
  workSchedules: WorkSchedule[] | null,
): Map<string, Map<string, EffectiveSchedule>> {
  const map = new Map<string, Map<string, EffectiveSchedule>>();
  
  for (const emp of employees) {
    const empScheduleMap = new Map<string, EffectiveSchedule>();
    
    for (const date of dates) {
      const dateStr = date.toISOString().split('T')[0];
      
      const effectiveSchedule = getEffectiveSchedule({
        employeeId: emp.id,
        date,
        shiftAssignments,
        shiftTemplates,
        workSchedules,
        employeeSettings: emp,
      });
      
      empScheduleMap.set(dateStr, effectiveSchedule);
    }
    
    map.set(emp.id, empScheduleMap);
  }
  
  return map;
}

/**
 * Calculate scheduled work days from effective schedule map
 */
export function countScheduledWorkDays(
  scheduleMap: Map<string, EffectiveSchedule>,
  upToDate?: Date,
): number {
  let count = 0;
  
  for (const [dateStr, schedule] of scheduleMap.entries()) {
    if (upToDate) {
      const date = parseISO(dateStr);
      if (date > upToDate) continue;
    }
    
    if (schedule.isWorkingDay && !schedule.isDayOff) {
      count++;
    }
  }
  
  return count;
}
