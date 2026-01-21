/**
 * Payroll Mini Calendar Component
 * Displays a compact inline calendar showing attendance status for each day of the month
 * Supports bulk selection mode for multi-day attendance adjustments
 */

import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { th } from "date-fns/locale";
import { getBangkokNow, formatBangkokISODate } from "@/lib/timezone";
import { Check } from "lucide-react";

export interface DayStatus {
  date: string;
  status: 'present' | 'within_grace' | 'late' | 'absent' | 'leave' | 'weekend' | 'regular_weekend' | 'day_off' | 'future' | 'holiday' | 'not_started' | 'skip_tracking' | 'unpaid_leave';
  check_in?: string;
  check_out?: string;
  work_hours?: number;
  is_overtime?: boolean;
  late_minutes?: number;
  leave_type?: string;
  holiday_name?: string;
  has_adjustment?: boolean;
  schedule_source?: 'shift' | 'work_schedule' | 'default';
}

interface PayrollMiniCalendarProps {
  currentMonth: Date;
  attendanceData: DayStatus[];
  className?: string;
  onDayClick?: (date: string, data?: DayStatus) => void;
  // Bulk selection props
  bulkSelectMode?: boolean;
  selectedDates?: Set<string>;
  onDateSelect?: (date: string, selected: boolean) => void;
}

const statusColors: Record<DayStatus['status'], string> = {
  present: 'bg-emerald-600',
  within_grace: 'bg-emerald-300',
  late: 'bg-amber-500',
  absent: 'bg-red-500',
  leave: 'bg-sky-500',
  weekend: 'bg-muted',
  regular_weekend: 'bg-muted',
  day_off: 'bg-indigo-400',
  future: 'bg-muted/30',
  holiday: 'bg-violet-500',
  not_started: 'bg-slate-400',
  skip_tracking: 'bg-emerald-600',
  unpaid_leave: 'bg-rose-400',
};

const statusLabels: Record<DayStatus['status'], string> = {
  present: 'มาตรงเวลา',
  within_grace: 'สายไม่เกิน grace',
  late: 'มาสาย',
  absent: 'ขาด',
  leave: 'ลา',
  weekend: 'วันหยุด',
  regular_weekend: 'วันหยุดประจำ',
  day_off: 'วันหยุด (ตารางกะ)',
  future: 'ยังไม่ถึง',
  holiday: 'วันหยุดนักขัตฤกษ์',
  not_started: 'ยังไม่เริ่มงาน',
  skip_tracking: 'ไม่ track (ตรงเวลาอัตโนมัติ)',
  unpaid_leave: 'ลาไม่รับค่าจ้าง',
};

export function PayrollMiniCalendar({ 
  currentMonth, 
  attendanceData,
  className = "",
  onDayClick,
  bulkSelectMode = false,
  selectedDates,
  onDateSelect,
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

  // Get today's date in Bangkok timezone for highlighting
  const todayStr = useMemo(() => formatBangkokISODate(getBangkokNow()), []);

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
          
          const isSelected = selectedDates?.has(dateStr) || false;
          
          return (
            <Tooltip key={dateStr}>
              <TooltipTrigger asChild>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (bulkSelectMode) {
                      // In bulk mode, toggle selection
                      onDateSelect?.(dateStr, !isSelected);
                    } else {
                      // Normal mode - open single-day edit
                      onDayClick?.(dateStr, dayData);
                    }
                  }}
                  className={`w-2 h-4 rounded-sm cursor-pointer transition-all hover:scale-150 hover:z-10 relative ${statusColors[finalStatus]} ${dateStr === todayStr ? 'ring-2 ring-offset-1 ring-primary' : ''} ${isSelected ? 'ring-2 ring-offset-1 ring-green-500' : ''}`}
                >
                  {/* Bulk selection indicator */}
                  {bulkSelectMode && isSelected && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Check className="h-2 w-2 text-white drop-shadow-md" />
                    </span>
                  )}
                  {/* Adjustment indicator */}
                  {dayData?.has_adjustment && !isSelected && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full border border-background" />
                  )}
                </div>
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
                  {dayData?.schedule_source && (
                    <div className="text-[10px] text-muted-foreground/70 pt-0.5 border-t border-border/50">
                      ที่มา: {dayData.schedule_source === 'shift' ? 'ตารางกะ' : 
                        dayData.schedule_source === 'work_schedule' ? 'ตั้งค่า OT' : 'ค่าเริ่มต้น'}
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
    { status: 'present', label: 'ตรงเวลา' },
    { status: 'within_grace', label: 'สายไม่เกิน 15 นาที' },
    { status: 'late', label: 'สาย' },
    { status: 'absent', label: 'ขาด' },
    { status: 'leave', label: 'ลา' },
    { status: 'holiday', label: 'นักขัตฤกษ์' },
    { status: 'weekend', label: 'หยุด' },
    { status: 'not_started', label: 'ยังไม่เริ่มงาน' },
  ] as const;

  return (
    <div className={`flex flex-wrap gap-3 items-center text-xs text-muted-foreground ${className}`}>
      {legendItems.map(({ status, label }) => (
        <div key={status} className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-sm ${statusColors[status]}`} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
