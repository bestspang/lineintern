import { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, isToday, isWeekend } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

type ShiftTemplate = {
  id: string;
  name: string;
  short_code: string;
  start_time: string;
  end_time: string;
  color: string;
  break_hours: number;
};

type Employee = {
  id: string;
  full_name: string;
  nickname?: string | null;
};

type ShiftAssignment = {
  id: string;
  schedule_id: string;
  employee_id: string;
  work_date: string;
  shift_template_id: string | null;
  custom_start_time: string | null;
  custom_end_time: string | null;
  is_day_off: boolean;
  day_off_type: string | null;
  note: string | null;
  shift_templates?: ShiftTemplate | null;
};

export interface ScheduleCalendarHandle {
  exportToImage: () => Promise<void>;
}

interface ScheduleCalendarProps {
  weekDays: Date[];
  employees: Employee[];
  assignments: ShiftAssignment[];
  shiftTemplates: ShiftTemplate[];
  onAssignmentChange: (data: Partial<ShiftAssignment> & { employee_id: string; work_date: string }) => void;
  isEditable: boolean;
  branchName?: string;
  weekLabel?: string;
}

const ScheduleCalendar = forwardRef<ScheduleCalendarHandle, ScheduleCalendarProps>(
  ({ weekDays, employees, assignments, shiftTemplates, onAssignmentChange, isEditable, branchName, weekLabel }, ref) => {
    const [editingCell, setEditingCell] = useState<{ employeeId: string; date: string } | null>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const exportToImage = async () => {
      if (!tableRef.current) return;

      try {
        toast.loading('กำลังสร้างรูปภาพ...');
        
        const canvas = await html2canvas(tableRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
          logging: false,
          useCORS: true,
        });

        const link = document.createElement('a');
        const filename = `schedule-${branchName || 'branch'}-${weekLabel || 'week'}.png`
          .replace(/\s+/g, '-')
          .replace(/[^\w\-\.]/g, '');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        toast.dismiss();
        toast.success('ดาวน์โหลดรูปภาพเรียบร้อย');
      } catch (error) {
        toast.dismiss();
        toast.error('ไม่สามารถสร้างรูปภาพได้');
        console.error('Export error:', error);
      }
    };

    useImperativeHandle(ref, () => ({
      exportToImage,
    }));

    const getAssignment = (employeeId: string, date: Date): ShiftAssignment | undefined => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return assignments.find(a => a.employee_id === employeeId && a.work_date === dateStr);
    };

    const handleShiftSelect = (employeeId: string, date: Date, value: string) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const existingAssignment = getAssignment(employeeId, date);

      if (value === 'off') {
        onAssignmentChange({
          id: existingAssignment?.id,
          employee_id: employeeId,
          work_date: dateStr,
          shift_template_id: null,
          is_day_off: true,
          day_off_type: 'regular',
        });
      } else {
        onAssignmentChange({
          id: existingAssignment?.id,
          employee_id: employeeId,
          work_date: dateStr,
          shift_template_id: value,
          is_day_off: false,
          day_off_type: null,
        });
      }
      setEditingCell(null);
    };

    const renderShiftCell = (employee: Employee, date: Date) => {
      const assignment = getAssignment(employee.id, date);
      const dateStr = format(date, 'yyyy-MM-dd');
      const isEditing = editingCell?.employeeId === employee.id && editingCell?.date === dateStr;
      const weekend = isWeekend(date);
      const today = isToday(date);

      if (isEditing && isEditable) {
        return (
          <Popover open={true} onOpenChange={() => setEditingCell(null)}>
            <PopoverTrigger asChild>
              <div className="w-full h-full" />
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="space-y-1">
                {shiftTemplates.map((template) => (
                  <Button
                    key={template.id}
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => handleShiftSelect(employee.id, date, template.id)}
                  >
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: template.color }}
                    />
                    <span>{template.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {template.start_time.slice(0, 5)}
                    </span>
                  </Button>
                ))}
                <hr className="my-1" />
                <Button
                  variant="ghost"
                  className="w-full justify-start text-orange-500"
                  onClick={() => handleShiftSelect(employee.id, date, 'off')}
                >
                  หยุด
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      }

      if (!assignment) {
        return (
          <div
            className={cn(
              'w-full h-full flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors',
              !isEditable && 'cursor-default'
            )}
            onClick={() => isEditable && setEditingCell({ employeeId: employee.id, date: dateStr })}
          >
            -
          </div>
        );
      }

      // Case: Has note but no shift (flexible or not configured)
      if (assignment.note && !assignment.shift_template_id && !assignment.custom_start_time && !assignment.is_day_off) {
        const isWarning = assignment.note.includes('ยังไม่ได้ตั้งค่า');
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'w-full h-full flex items-center justify-center cursor-pointer text-xs font-medium',
                    isWarning ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
                    !isEditable && 'cursor-default'
                  )}
                  onClick={() => isEditable && setEditingCell({ employeeId: employee.id, date: dateStr })}
                >
                  {isWarning ? '⚠️' : '🕐'}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{assignment.note}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      if (assignment.is_day_off) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'w-full h-full flex items-center justify-center bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium cursor-pointer',
                    !isEditable && 'cursor-default'
                  )}
                  onClick={() => isEditable && setEditingCell({ employeeId: employee.id, date: dateStr })}
                >
                  OFF
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>วันหยุด{assignment.day_off_type ? ` (${assignment.day_off_type})` : ''}</p>
                {assignment.note && <p className="text-xs">{assignment.note}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      const template = assignment.shift_templates;
      const displayTime = assignment.custom_start_time || template?.start_time;

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'w-full h-full flex items-center justify-center font-medium cursor-pointer transition-colors',
                  !isEditable && 'cursor-default'
                )}
                style={{
                  backgroundColor: template?.color ? `${template.color}20` : undefined,
                  color: template?.color,
                }}
                onClick={() => isEditable && setEditingCell({ employeeId: employee.id, date: dateStr })}
              >
                {template?.short_code || displayTime?.slice(0, 5) || '?'}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{template?.name || 'กะพิเศษ'}</p>
              <p className="text-xs">
                {displayTime?.slice(0, 5)} - {(assignment.custom_end_time || template?.end_time)?.slice(0, 5)}
              </p>
              {assignment.note && <p className="text-xs mt-1">{assignment.note}</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    };

    return (
      <Card>
        <CardContent className="p-0 overflow-x-auto" ref={tableRef}>
          {/* Export Header */}
          {branchName && weekLabel && (
            <div className="p-4 border-b bg-muted/50">
              <h2 className="text-xl font-bold">{branchName}</h2>
              <p className="text-muted-foreground">{weekLabel}</p>
            </div>
          )}
          
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b">
                <th className="p-3 text-left font-medium bg-muted/50 sticky left-0 z-10 min-w-[150px]">
                  พนักงาน
                </th>
                {weekDays.map((day) => (
                  <th
                    key={day.toISOString()}
                    className={cn(
                      'p-3 text-center font-medium min-w-[80px]',
                      isToday(day) && 'bg-primary/10',
                      isWeekend(day) && 'bg-orange-50 dark:bg-orange-900/20'
                    )}
                  >
                    <div className="text-xs text-muted-foreground">
                      {format(day, 'EEE', { locale: th })}
                    </div>
                    <div className={cn(
                      'text-lg',
                      isToday(day) && 'text-primary font-bold'
                    )}>
                      {format(day, 'd')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 bg-muted/50 sticky left-0 z-10">
                    <div className="font-medium truncate max-w-[140px]">
                      {employee.nickname || employee.full_name}
                    </div>
                  </td>
                  {weekDays.map((day) => (
                    <td
                      key={day.toISOString()}
                      className={cn(
                        'p-0 text-center h-12 border-l',
                        isToday(day) && 'bg-primary/5',
                        isWeekend(day) && 'bg-orange-50/50 dark:bg-orange-900/10'
                      )}
                    >
                      {renderShiftCell(employee, day)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Legend */}
          <div className="p-4 border-t flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">Legend:</span>
            {shiftTemplates.map((template) => (
              <div key={template.id} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: template.color }}
                />
                <span>{template.short_code} = {template.name}</span>
                <span className="text-muted-foreground">
                  ({template.start_time.slice(0, 5)}-{template.end_time.slice(0, 5)})
                </span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="bg-orange-100 text-orange-600 border-orange-200">
                OFF
              </Badge>
              <span>= วันหยุด</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

ScheduleCalendar.displayName = 'ScheduleCalendar';

export default ScheduleCalendar;

