/**
 * Payroll Mini Calendar Component
 * Displays a compact inline calendar showing attendance status for each day of the month
 */

import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from "date-fns";
import { th } from "date-fns/locale";

export interface DayStatus {
  date: string;
  status: 'present' | 'late' | 'absent' | 'leave' | 'weekend' | 'future' | 'holiday';
  check_in?: string;
  check_out?: string;
  work_hours?: number;
  is_overtime?: boolean;
  late_minutes?: number;
}

interface PayrollMiniCalendarProps {
  currentMonth: Date;
  attendanceData: DayStatus[];
  className?: string;
}

const statusColors: Record<DayStatus['status'], string> = {
  present: 'bg-green-500',
  late: 'bg-yellow-500',
  absent: 'bg-red-500',
  leave: 'bg-blue-500',
  weekend: 'bg-muted',
  future: 'bg-muted/50',
  holiday: 'bg-purple-500',
};

const statusLabels: Record<DayStatus['status'], string> = {
  present: 'มาปกติ',
  late: 'มาสาย',
  absent: 'ขาด',
  leave: 'ลา',
  weekend: 'วันหยุด',
  future: 'ยังไม่ถึง',
  holiday: 'วันหยุดพิเศษ',
};

export function PayrollMiniCalendar({ 
  currentMonth, 
  attendanceData,
  className = ""
}: PayrollMiniCalendarProps) {
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const attendanceMap = useMemo(() => {
    const map = new Map<string, DayStatus>();
    attendanceData.forEach(day => {
      map.set(day.date, day);
    });
    return map;
  }, [attendanceData]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      return format(parseISO(isoString), 'HH:mm');
    } catch {
      return '-';
    }
  };

  return (
    <div className={`flex gap-0.5 items-center ${className}`}>
      <TooltipProvider delayDuration={100}>
        {calendarDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayData = attendanceMap.get(dateStr);
          const status = dayData?.status || 'future';
          const dayOfWeek = getDay(day);
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          // Determine final status
          const finalStatus = dayData?.status || (isWeekend ? 'weekend' : 'future');
          
          return (
            <Tooltip key={dateStr}>
              <TooltipTrigger asChild>
                <div
                  className={`w-2 h-4 rounded-sm cursor-pointer transition-all hover:scale-150 hover:z-10 ${statusColors[finalStatus]}`}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="p-2 min-w-[140px]">
                <div className="space-y-1">
                  <div className="font-medium text-xs">
                    {format(day, "d MMMM", { locale: th })} ({format(day, "EEEEEE", { locale: th })})
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${statusColors[finalStatus]}`} />
                    <span className="text-xs">{statusLabels[finalStatus]}</span>
                  </div>
                  {dayData?.check_in && (
                    <div className="text-xs text-muted-foreground">
                      เข้า: {formatTime(dayData.check_in)}
                      {dayData.late_minutes && dayData.late_minutes > 0 && (
                        <span className="text-yellow-600 ml-1">(สาย {dayData.late_minutes} นาที)</span>
                      )}
                    </div>
                  )}
                  {dayData?.check_out && (
                    <div className="text-xs text-muted-foreground">
                      ออก: {formatTime(dayData.check_out)}
                    </div>
                  )}
                  {dayData?.work_hours !== undefined && dayData.work_hours > 0 && (
                    <div className="text-xs font-medium">
                      รวม: {dayData.work_hours.toFixed(1)} ชม.
                      {dayData.is_overtime && <span className="text-orange-600 ml-1">(OT)</span>}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}

// Legend component for mini calendar
export function PayrollCalendarLegend({ className = "" }: { className?: string }) {
  const legendItems = [
    { status: 'present', label: 'ปกติ' },
    { status: 'late', label: 'สาย' },
    { status: 'absent', label: 'ขาด' },
    { status: 'leave', label: 'ลา' },
    { status: 'weekend', label: 'หยุด' },
  ] as const;

  return (
    <div className={`flex gap-3 items-center text-xs text-muted-foreground ${className}`}>
      {legendItems.map(({ status, label }) => (
        <div key={status} className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-sm ${statusColors[status]}`} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
