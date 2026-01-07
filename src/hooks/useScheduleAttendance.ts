import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface AttendanceLog {
  id: string;
  employee_id: string;
  server_time: string;
  event_type: string;
}

interface AttendanceByDay {
  checkIn: string | null;
  checkOut: string | null;
  status: 'on_time' | 'late' | 'early_leave' | 'absent' | 'ot' | 'pending' | null;
  checkInTime: Date | null;
  checkOutTime: Date | null;
}

export interface AttendanceMap {
  [employeeId: string]: {
    [dateStr: string]: AttendanceByDay;
  };
}

export interface AttendanceStats {
  onTime: number;
  late: number;
  earlyLeave: number;
  absent: number;
  ot: number;
  pending: number;
  totalWorkDays: number;
}

export function useScheduleAttendance(
  employeeIds: string[],
  weekStart: Date,
  enabled: boolean = true
) {
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const { data: attendanceLogs = [], isLoading } = useQuery({
    queryKey: ['schedule-attendance-logs', weekStartStr, employeeIds],
    queryFn: async () => {
      if (employeeIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('id, employee_id, server_time, event_type')
        .in('employee_id', employeeIds)
        .gte('server_time', `${weekStartStr}T00:00:00+07:00`)
        .lte('server_time', `${weekEndStr}T23:59:59+07:00`)
        .order('server_time');
      
      if (error) throw error;
      return data as AttendanceLog[];
    },
    enabled: enabled && employeeIds.length > 0,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  // Process logs into a map: { employeeId: { dateStr: { checkIn, checkOut, status } } }
  const attendanceMap = useMemo((): AttendanceMap => {
    const map: AttendanceMap = {};
    
    for (const log of attendanceLogs) {
      const employeeId = log.employee_id;
      const logTime = new Date(log.server_time);
      // Convert to Bangkok timezone date string
      const dateStr = format(logTime, 'yyyy-MM-dd');
      
      if (!map[employeeId]) {
        map[employeeId] = {};
      }
      if (!map[employeeId][dateStr]) {
        map[employeeId][dateStr] = {
          checkIn: null,
          checkOut: null,
          status: null,
          checkInTime: null,
          checkOutTime: null,
        };
      }
      
      const timeStr = format(logTime, 'HH:mm');
      
      if (log.event_type === 'check_in' && !map[employeeId][dateStr].checkIn) {
        map[employeeId][dateStr].checkIn = timeStr;
        map[employeeId][dateStr].checkInTime = logTime;
      } else if (log.event_type === 'check_out') {
        // Take the last checkout
        map[employeeId][dateStr].checkOut = timeStr;
        map[employeeId][dateStr].checkOutTime = logTime;
      }
    }
    
    return map;
  }, [attendanceLogs]);

  // Calculate attendance status for a specific employee and date
  const getAttendanceStatus = (
    employeeId: string,
    dateStr: string,
    scheduledStart: string | null,
    scheduledEnd: string | null,
    isDayOff: boolean
  ): AttendanceByDay | null => {
    if (isDayOff) return null;
    
    const attendance = attendanceMap[employeeId]?.[dateStr];
    const today = format(new Date(), 'yyyy-MM-dd');
    const isPast = dateStr < today;
    const isToday = dateStr === today;
    
    if (!attendance) {
      if (isPast && !isDayOff) {
        return {
          checkIn: null,
          checkOut: null,
          status: 'absent',
          checkInTime: null,
          checkOutTime: null,
        };
      }
      if (isToday && scheduledStart) {
        const now = new Date();
        const scheduledTime = new Date(`${dateStr}T${scheduledStart}+07:00`);
        // If scheduled time has passed by more than 30 minutes and no check-in
        if (now.getTime() - scheduledTime.getTime() > 30 * 60 * 1000) {
          return {
            checkIn: null,
            checkOut: null,
            status: 'absent',
            checkInTime: null,
            checkOutTime: null,
          };
        }
        return {
          checkIn: null,
          checkOut: null,
          status: 'pending',
          checkInTime: null,
          checkOutTime: null,
        };
      }
      return null;
    }
    
    // Determine status based on check-in time vs scheduled time
    let status: AttendanceByDay['status'] = null;
    
    if (attendance.checkIn && scheduledStart) {
      const checkInTime = attendance.checkInTime!;
      const scheduledTime = new Date(`${dateStr}T${scheduledStart}+07:00`);
      const gracePeriod = 5 * 60 * 1000; // 5 minutes grace
      
      if (checkInTime.getTime() <= scheduledTime.getTime() + gracePeriod) {
        status = 'on_time';
      } else {
        status = 'late';
      }
    }
    
    // Check for early leave
    if (attendance.checkOut && scheduledEnd && status !== 'late') {
      const checkOutTime = attendance.checkOutTime!;
      const scheduledEndTime = new Date(`${dateStr}T${scheduledEnd}+07:00`);
      
      if (checkOutTime.getTime() < scheduledEndTime.getTime() - 10 * 60 * 1000) {
        status = 'early_leave';
      } else if (checkOutTime.getTime() > scheduledEndTime.getTime() + 30 * 60 * 1000) {
        // OT if checked out more than 30 minutes after scheduled end
        status = 'ot';
      }
    }
    
    // If only checked in (not checked out yet) today
    if (attendance.checkIn && !attendance.checkOut && isToday) {
      status = status || 'pending';
    }
    
    return {
      ...attendance,
      status: status || attendance.status,
    };
  };

  // Calculate stats
  const calculateStats = (
    assignments: Array<{
      employee_id: string;
      work_date: string;
      is_day_off: boolean;
      shift_templates?: { start_time: string; end_time: string } | null;
      custom_start_time?: string | null;
      custom_end_time?: string | null;
    }>
  ): AttendanceStats => {
    const stats: AttendanceStats = {
      onTime: 0,
      late: 0,
      earlyLeave: 0,
      absent: 0,
      ot: 0,
      pending: 0,
      totalWorkDays: 0,
    };
    
    const today = format(new Date(), 'yyyy-MM-dd');
    
    for (const assignment of assignments) {
      if (assignment.is_day_off) continue;
      if (assignment.work_date > today) continue; // Future dates
      
      stats.totalWorkDays++;
      
      const scheduledStart = assignment.custom_start_time || 
        assignment.shift_templates?.start_time?.slice(0, 5) || null;
      const scheduledEnd = assignment.custom_end_time || 
        assignment.shift_templates?.end_time?.slice(0, 5) || null;
      
      const attendance = getAttendanceStatus(
        assignment.employee_id,
        assignment.work_date,
        scheduledStart,
        scheduledEnd,
        false
      );
      
      if (attendance?.status === 'on_time') stats.onTime++;
      else if (attendance?.status === 'late') stats.late++;
      else if (attendance?.status === 'early_leave') stats.earlyLeave++;
      else if (attendance?.status === 'absent') stats.absent++;
      else if (attendance?.status === 'ot') stats.ot++;
      else if (attendance?.status === 'pending') stats.pending++;
    }
    
    return stats;
  };

  return {
    attendanceMap,
    getAttendanceStatus,
    calculateStats,
    isLoading,
    attendanceLogs,
  };
}
