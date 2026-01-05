import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  ChevronLeft, 
  ChevronRight, 
  Wand2, 
  Download, 
  Send, 
  Calendar as CalendarIcon,
  Users,
  AlertCircle,
  Copy,
  AlertTriangle,
  UserPlus,
  Pencil,
  Trash2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format, startOfWeek, addDays, addWeeks, subWeeks, getDay } from 'date-fns';
import { th } from 'date-fns/locale';
import ScheduleCalendar, { ScheduleCalendarHandle } from '@/components/attendance/ScheduleCalendar';

type Branch = {
  id: string;
  name: string;
};

type WeeklySchedule = {
  id: string;
  branch_id: string;
  week_start_date: string;
  status: 'draft' | 'published' | 'archived';
  notes: string | null;
  published_at: string | null;
};

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
  branch_id: string | null;
  is_active: boolean;
  shift_start_time: string | null;
  shift_end_time: string | null;
  working_time_type: string | null;
  employee_type?: string | null;
  primary_branch_id?: string | null;
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
  is_borrowed?: boolean;
  shift_templates?: ShiftTemplate | null;
};

type Conflict = {
  employeeId: string;
  employeeName: string;
  date: string;
  type: 'overtime' | 'double_shift' | 'consecutive_days';
  message: string;
};

export default function Schedules() {
  const queryClient = useQueryClient();
  const calendarRef = useRef<ScheduleCalendarHandle>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkSelectedEmployees, setBulkSelectedEmployees] = useState<string[]>([]);
  const [bulkSelectedShift, setBulkSelectedShift] = useState<string>('');
  const [bulkSelectedDays, setBulkSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [showConflictsDialog, setShowConflictsDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddEmployeeDialog, setShowAddEmployeeDialog] = useState(false);
  const [addEmployeeTab, setAddEmployeeTab] = useState<'temporary' | 'borrow'>('temporary');
  const [tempEmployeeName, setTempEmployeeName] = useState('');
  const [tempEmployeeStartTime, setTempEmployeeStartTime] = useState('09:00');
  const [tempEmployeeEndTime, setTempEmployeeEndTime] = useState('18:00');
  const [borrowFromBranch, setBorrowFromBranch] = useState('');
  const [borrowEmployeeId, setBorrowEmployeeId] = useState('');

  // Fetch branches
  const { data: branches = [] } = useQuery({
    queryKey: ['branches-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return data as Branch[];
    },
  });

  // Auto-select first branch
  useMemo(() => {
    if (branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0].id);
    }
  }, [branches, selectedBranch]);

  // Fetch shift templates for selected branch
  const { data: shiftTemplates = [] } = useQuery({
    queryKey: ['shift-templates', selectedBranch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shift_templates')
        .select('*')
        .eq('is_active', true)
        .or(`branch_id.is.null,branch_id.eq.${selectedBranch}`)
        .order('start_time');
      if (error) throw error;
      return data as ShiftTemplate[];
    },
    enabled: !!selectedBranch,
  });

  // Fetch employees for selected branch
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-branch', selectedBranch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, branch_id, is_active, shift_start_time, shift_end_time, working_time_type, employee_type, primary_branch_id')
        .eq('branch_id', selectedBranch)
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!selectedBranch,
  });

  // Fetch employees from OTHER branches (for borrowing)
  const { data: otherBranchEmployees = [] } = useQuery({
    queryKey: ['employees-other-branches', selectedBranch, borrowFromBranch],
    queryFn: async () => {
      if (!borrowFromBranch) return [];
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, branch_id, is_active, shift_start_time, shift_end_time')
        .eq('branch_id', borrowFromBranch)
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!borrowFromBranch && borrowFromBranch !== selectedBranch,
  });

  // Fetch or create weekly schedule
  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
  
  const { data: weeklySchedule, isLoading: scheduleLoading } = useQuery({
    queryKey: ['weekly-schedule', selectedBranch, weekStartStr],
    queryFn: async () => {
      // Try to get existing schedule
      const { data: existing, error: fetchError } = await supabase
        .from('weekly_schedules')
        .select('*')
        .eq('branch_id', selectedBranch)
        .eq('week_start_date', weekStartStr)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      
      if (existing) return existing as WeeklySchedule;
      
      // Create new schedule if not exists
      const { data: newSchedule, error: insertError } = await supabase
        .from('weekly_schedules')
        .insert({
          branch_id: selectedBranch,
          week_start_date: weekStartStr,
          status: 'draft',
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      return newSchedule as WeeklySchedule;
    },
    enabled: !!selectedBranch,
  });

  // Fetch shift assignments for current schedule
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['shift-assignments', weeklySchedule?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shift_assignments')
        .select('*, shift_templates(*)')
        .eq('schedule_id', weeklySchedule!.id);
      if (error) throw error;
      return data as ShiftAssignment[];
    },
    enabled: !!weeklySchedule?.id,
  });

  // Fetch borrowed employees (employees from other branches who are borrowed into this schedule)
  const borrowedEmployeeIds = useMemo(() => {
    return [...new Set(
      assignments
        .filter(a => a.is_borrowed)
        .map(a => a.employee_id)
    )];
  }, [assignments]);

  const { data: borrowedEmployees = [] } = useQuery({
    queryKey: ['borrowed-employees', borrowedEmployeeIds],
    queryFn: async () => {
      if (borrowedEmployeeIds.length === 0) return [];
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, branch_id, is_active, shift_start_time, shift_end_time, working_time_type, employee_type, primary_branch_id')
        .in('id', borrowedEmployeeIds);
      if (error) throw error;
      return (data || []).map(emp => ({
        ...emp,
        // Mark as borrowed for display purposes
        primary_branch_id: emp.branch_id, // Their home branch
      })) as Employee[];
    },
    enabled: borrowedEmployeeIds.length > 0,
  });

  // Combine regular employees with borrowed employees
  const allEmployees = useMemo(() => {
    const combined = [...employees];
    for (const borrowed of borrowedEmployees) {
      if (!combined.some(e => e.id === borrowed.id)) {
        combined.push(borrowed);
      }
    }
    return combined;
  }, [employees, borrowedEmployees]);

  // Fetch work_schedules for employees
  const { data: workSchedules = [] } = useQuery({
    queryKey: ['work-schedules-for-auto', employees.map(e => e.id)],
    queryFn: async () => {
      if (employees.length === 0) return [];
      const { data, error } = await supabase
        .from('work_schedules')
        .select('*')
        .in('employee_id', employees.map(e => e.id));
      if (error) throw error;
      return data || [];
    },
    enabled: employees.length > 0,
  });

  // Auto-generate mutation
  const autoGenerateMutation = useMutation({
    mutationFn: async () => {
      if (!weeklySchedule) throw new Error('No schedule');
      
      // Delete existing assignments
      await supabase
        .from('shift_assignments')
        .delete()
        .eq('schedule_id', weeklySchedule.id);
      
      // Generate new assignments based on work_schedules
      const newAssignments: any[] = [];
      const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
      
      for (const employee of employees) {
        // Get work_schedules for this employee
        const employeeSchedules = workSchedules.filter(
          ws => ws.employee_id === employee.id
        );
        
        for (let i = 0; i < 7; i++) {
          const date = weekDays[i];
          const workDate = format(date, 'yyyy-MM-dd');
          const dayOfWeek = getDay(date); // 0 = Sunday, 1 = Monday, ...
          
          // Find work_schedule for this day
          const daySchedule = employeeSchedules.find(
            ws => ws.day_of_week === dayOfWeek
          );
          
          // Case 1: Has work_schedule and it's a day off
          if (daySchedule && !daySchedule.is_working_day) {
            newAssignments.push({
              schedule_id: weeklySchedule.id,
              employee_id: employee.id,
              work_date: workDate,
              is_day_off: true,
              day_off_type: 'scheduled',
            });
            continue;
          }
          
          // Case 2: Has work_schedule and it's a working day
          if (daySchedule && daySchedule.is_working_day) {
            const startTime = daySchedule.start_time;
            const endTime = daySchedule.end_time;
            
            // Find matching shift template
            const matchingTemplate = shiftTemplates.find(t => 
              t.start_time?.slice(0, 5) === startTime?.slice(0, 5) &&
              t.end_time?.slice(0, 5) === endTime?.slice(0, 5)
            );
            
            newAssignments.push({
              schedule_id: weeklySchedule.id,
              employee_id: employee.id,
              work_date: workDate,
              shift_template_id: matchingTemplate?.id || null,
              custom_start_time: matchingTemplate ? null : startTime,
              custom_end_time: matchingTemplate ? null : endTime,
              is_day_off: false,
            });
            continue;
          }
          
          // Case 3: No work_schedule - fallback to employee shift times
          if (employee.shift_start_time && employee.shift_end_time) {
            const matchingTemplate = shiftTemplates.find(t => 
              t.start_time.slice(0, 5) === employee.shift_start_time?.slice(0, 5) &&
              t.end_time.slice(0, 5) === employee.shift_end_time?.slice(0, 5)
            );
            
            newAssignments.push({
              schedule_id: weeklySchedule.id,
              employee_id: employee.id,
              work_date: workDate,
              shift_template_id: matchingTemplate?.id || null,
              custom_start_time: matchingTemplate ? null : employee.shift_start_time,
              custom_end_time: matchingTemplate ? null : employee.shift_end_time,
              is_day_off: false,
            });
            continue;
          }
          
          // Case 4: hours_based employee (flexible hours)
          if (employee.working_time_type === 'hours_based') {
            const defaultTemplate = shiftTemplates[0];
            newAssignments.push({
              schedule_id: weeklySchedule.id,
              employee_id: employee.id,
              work_date: workDate,
              shift_template_id: defaultTemplate?.id || null,
              is_day_off: false,
              note: 'ชั่วโมงยืดหยุ่น',
            });
            continue;
          }
          
          // Case 5: No schedule data at all - mark as blank (no assignment)
          // Skip creating assignment to leave as "-"
        }
      }
      
      if (newAssignments.length > 0) {
        const { error } = await supabase
          .from('shift_assignments')
          .insert(newAssignments);
        if (error) throw error;
      }
      
      return newAssignments.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      toast.success(`สร้างตารางอัตโนมัติ ${count} รายการ`);
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + (error as Error).message);
    },
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!weeklySchedule) throw new Error('No schedule');
      
      const { error } = await supabase
        .from('weekly_schedules')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .eq('id', weeklySchedule.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-schedule'] });
      toast.success('เผยแพร่ตารางเรียบร้อย');
    },
  });

  // Unpublish mutation (revert to draft)
  const unpublishMutation = useMutation({
    mutationFn: async () => {
      if (!weeklySchedule) throw new Error('No schedule');
      
      const { error } = await supabase
        .from('weekly_schedules')
        .update({
          status: 'draft',
          published_at: null,
        })
        .eq('id', weeklySchedule.id);
      
      if (error) throw error;
      
      // Log the change
      await supabase.from('schedule_change_logs').insert({
        schedule_id: weeklySchedule.id,
        change_type: 'unpublished',
        reason: 'Reverted to draft for editing',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-schedule'] });
      toast.success('เปลี่ยนเป็นฉบับร่างเรียบร้อย สามารถแก้ไขได้แล้ว');
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + (error as Error).message);
    },
  });

  // Delete schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!weeklySchedule) throw new Error('No schedule');
      
      // Delete assignments first
      await supabase
        .from('shift_assignments')
        .delete()
        .eq('schedule_id', weeklySchedule.id);
      
      // Delete schedule
      const { error } = await supabase
        .from('weekly_schedules')
        .delete()
        .eq('id', weeklySchedule.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      toast.success('ลบตารางเรียบร้อย');
      setShowDeleteDialog(false);
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + (error as Error).message);
    },
  });

  // Update assignment mutation with change tracking
  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: Partial<ShiftAssignment> & { id?: string; employee_id: string; work_date: string }) => {
      const oldAssignment = data.id ? assignments.find(a => a.id === data.id) : null;
      
      if (data.id) {
        // Update existing
        const { error } = await supabase
          .from('shift_assignments')
          .update({
            shift_template_id: data.shift_template_id,
            is_day_off: data.is_day_off,
            day_off_type: data.day_off_type,
            note: data.note,
            custom_start_time: data.custom_start_time,
            custom_end_time: data.custom_end_time,
          })
          .eq('id', data.id);
        if (error) throw error;
        
        // Log change
        await supabase.from('schedule_change_logs').insert({
          schedule_id: weeklySchedule!.id,
          employee_id: data.employee_id,
          work_date: data.work_date,
          change_type: 'modified',
          old_value: oldAssignment ? {
            shift_template_id: oldAssignment.shift_template_id,
            is_day_off: oldAssignment.is_day_off,
            day_off_type: oldAssignment.day_off_type,
          } : null,
          new_value: {
            shift_template_id: data.shift_template_id,
            is_day_off: data.is_day_off,
            day_off_type: data.day_off_type,
          },
        });
      } else {
        // Insert new
        const { error } = await supabase
          .from('shift_assignments')
          .insert({
            schedule_id: weeklySchedule!.id,
            employee_id: data.employee_id,
            work_date: data.work_date,
            shift_template_id: data.shift_template_id,
            is_day_off: data.is_day_off || false,
            day_off_type: data.day_off_type,
            note: data.note,
            custom_start_time: data.custom_start_time,
            custom_end_time: data.custom_end_time,
          });
        if (error) throw error;
        
        // Log addition
        await supabase.from('schedule_change_logs').insert({
          schedule_id: weeklySchedule!.id,
          employee_id: data.employee_id,
          work_date: data.work_date,
          change_type: 'added',
          new_value: {
            shift_template_id: data.shift_template_id,
            is_day_off: data.is_day_off,
            day_off_type: data.day_off_type,
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
    },
  });

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const assignment = assignments.find(a => a.id === assignmentId);
      
      const { error } = await supabase
        .from('shift_assignments')
        .delete()
        .eq('id', assignmentId);
      if (error) throw error;
      
      // Log deletion
      if (assignment && weeklySchedule) {
        await supabase.from('schedule_change_logs').insert({
          schedule_id: weeklySchedule.id,
          employee_id: assignment.employee_id,
          work_date: assignment.work_date,
          change_type: 'deleted',
          old_value: {
            shift_template_id: assignment.shift_template_id,
            is_day_off: assignment.is_day_off,
            day_off_type: assignment.day_off_type,
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      toast.success('ล้างข้อมูลเรียบร้อย');
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + (error as Error).message);
    },
  });

  const copyFromPreviousWeekMutation = useMutation({
    mutationFn: async () => {
      if (!weeklySchedule) throw new Error('No schedule');
      
      const prevWeekStart = format(subWeeks(currentWeekStart, 1), 'yyyy-MM-dd');
      
      // Find previous week's schedule
      const { data: prevSchedule } = await supabase
        .from('weekly_schedules')
        .select('id')
        .eq('branch_id', selectedBranch)
        .eq('week_start_date', prevWeekStart)
        .maybeSingle();
      
      if (!prevSchedule) {
        throw new Error('ไม่พบตารางสัปดาห์ก่อนหน้า');
      }
      
      // Fetch previous week's assignments
      const { data: prevAssignments, error: fetchError } = await supabase
        .from('shift_assignments')
        .select('employee_id, shift_template_id, is_day_off, day_off_type, note, custom_start_time, custom_end_time, work_date')
        .eq('schedule_id', prevSchedule.id);
      
      if (fetchError) throw fetchError;
      if (!prevAssignments?.length) {
        throw new Error('ไม่พบข้อมูลกะในสัปดาห์ก่อนหน้า');
      }
      
      // Delete existing assignments
      await supabase
        .from('shift_assignments')
        .delete()
        .eq('schedule_id', weeklySchedule.id);
      
      // Map previous assignments to current week
      const newAssignments = prevAssignments.map(prev => {
        const prevDate = new Date(prev.work_date);
        const dayOfWeek = prevDate.getDay() === 0 ? 6 : prevDate.getDay() - 1; // Convert to Mon=0
        const newDate = format(addDays(currentWeekStart, dayOfWeek), 'yyyy-MM-dd');
        
        return {
          schedule_id: weeklySchedule.id,
          employee_id: prev.employee_id,
          work_date: newDate,
          shift_template_id: prev.shift_template_id,
          is_day_off: prev.is_day_off,
          day_off_type: prev.day_off_type,
          note: prev.note,
          custom_start_time: prev.custom_start_time,
          custom_end_time: prev.custom_end_time,
        };
      });
      
      const { error: insertError } = await supabase
        .from('shift_assignments')
        .insert(newAssignments);
      
      if (insertError) throw insertError;
      
      return newAssignments.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      toast.success(`คัดลอก ${count} รายการจากสัปดาห์ก่อนหน้า`);
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  // Bulk assignment mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      if (!weeklySchedule) throw new Error('No schedule');
      if (!bulkSelectedEmployees.length) throw new Error('กรุณาเลือกพนักงาน');
      if (!bulkSelectedDays.length) throw new Error('กรุณาเลือกวัน');
      
      const newAssignments: any[] = [];
      
      for (const employeeId of bulkSelectedEmployees) {
        for (const dayIndex of bulkSelectedDays) {
          const workDate = format(addDays(currentWeekStart, dayIndex), 'yyyy-MM-dd');
          
          // Check if assignment exists
          const existing = assignments.find(
            a => a.employee_id === employeeId && a.work_date === workDate
          );
          
          if (existing) {
            // Update existing
            await supabase
              .from('shift_assignments')
              .update({
                shift_template_id: bulkSelectedShift || null,
                is_day_off: bulkSelectedShift === 'off',
                day_off_type: bulkSelectedShift === 'off' ? 'regular' : null,
              })
              .eq('id', existing.id);
          } else {
            newAssignments.push({
              schedule_id: weeklySchedule.id,
              employee_id: employeeId,
              work_date: workDate,
              shift_template_id: bulkSelectedShift === 'off' ? null : bulkSelectedShift,
              is_day_off: bulkSelectedShift === 'off',
              day_off_type: bulkSelectedShift === 'off' ? 'regular' : null,
            });
          }
        }
      }
      
      if (newAssignments.length > 0) {
        const { error } = await supabase
          .from('shift_assignments')
          .insert(newAssignments);
        if (error) throw error;
      }
      
      return bulkSelectedEmployees.length * bulkSelectedDays.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      toast.success(`อัปเดต ${count} รายการ`);
      setShowBulkDialog(false);
      setBulkSelectedEmployees([]);
      setBulkSelectedShift('');
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  // Conflict detection
  const conflicts = useMemo((): Conflict[] => {
    const result: Conflict[] = [];
    
    for (const employee of employees) {
      const empAssignments = assignments.filter(a => a.employee_id === employee.id && !a.is_day_off);
      
      // Check consecutive working days (more than 6)
      let consecutiveDays = 0;
      const sortedAssignments = [...empAssignments].sort((a, b) => 
        new Date(a.work_date).getTime() - new Date(b.work_date).getTime()
      );
      
      for (let i = 0; i < sortedAssignments.length; i++) {
        if (i === 0) {
          consecutiveDays = 1;
        } else {
          const prevDate = new Date(sortedAssignments[i - 1].work_date);
          const currDate = new Date(sortedAssignments[i].work_date);
          const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            consecutiveDays++;
            if (consecutiveDays >= 7) {
              result.push({
                employeeId: employee.id,
                employeeName: employee.full_name,
                date: sortedAssignments[i].work_date,
                type: 'consecutive_days',
                message: `ทำงานติดต่อกัน ${consecutiveDays} วัน`,
              });
            }
          } else {
            consecutiveDays = 1;
          }
        }
      }
      
      // Check weekly hours (rough estimate)
      const weeklyShifts = empAssignments.filter(a => {
        const assignDate = new Date(a.work_date);
        return assignDate >= currentWeekStart && assignDate <= addDays(currentWeekStart, 6);
      });
      
      let totalHours = 0;
      for (const shift of weeklyShifts) {
        const template = shift.shift_templates;
        if (template) {
          const start = template.start_time.split(':').map(Number);
          const end = template.end_time.split(':').map(Number);
          const hours = (end[0] + end[1] / 60) - (start[0] + start[1] / 60) - template.break_hours;
          totalHours += hours;
        } else if (shift.custom_start_time && shift.custom_end_time) {
          const start = shift.custom_start_time.split(':').map(Number);
          const end = shift.custom_end_time.split(':').map(Number);
          totalHours += (end[0] + end[1] / 60) - (start[0] + start[1] / 60);
        }
      }
      
      if (totalHours > 48) {
        result.push({
          employeeId: employee.id,
          employeeName: employee.full_name,
          date: weekStartStr,
          type: 'overtime',
          message: `ชั่วโมงทำงานรวม ${Math.round(totalHours)} ชม./สัปดาห์ (เกิน 48 ชม.)`,
        });
      }
    }
    
    return result;
  }, [assignments, employees, currentWeekStart, weekStartStr]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const isLoading = scheduleLoading || assignmentsLoading;
  const selectedBranchName = branches.find(b => b.id === selectedBranch)?.name;
  const dayLabels = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">ตารางกะรายสัปดาห์</h1>
          <p className="text-muted-foreground">จัดตารางกะทำงานและเผยแพร่ให้พนักงาน</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="เลือกสาขา" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Week Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2 ml-2">
                <CalendarIcon className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">
                  {format(currentWeekStart, 'd MMM', { locale: th })} - {format(addDays(currentWeekStart, 6), 'd MMM yyyy', { locale: th })}
                </span>
              </div>
              {weeklySchedule && (
                <Badge variant={weeklySchedule.status === 'published' ? 'default' : 'secondary'}>
                  {weeklySchedule.status === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
                </Badge>
              )}
              {conflicts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-amber-600 hover:text-amber-700"
                  onClick={() => setShowConflictsDialog(true)}
                >
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  {conflicts.length} ข้อขัดแย้ง
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              >
                วันนี้
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => copyFromPreviousWeekMutation.mutate()}
                      disabled={copyFromPreviousWeekMutation.isPending || weeklySchedule?.status !== 'draft'}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      คัดลอกสัปดาห์ก่อน
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>คัดลอกตารางจากสัปดาห์ก่อนหน้า</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => setShowBulkDialog(true)}
                      disabled={!employees.length || weeklySchedule?.status !== 'draft'}
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      กำหนดเป็นกลุ่ม
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>กำหนดกะให้พนักงานหลายคนพร้อมกัน</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => autoGenerateMutation.mutate()}
                      disabled={autoGenerateMutation.isPending || !employees.length || weeklySchedule?.status !== 'draft'}
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      สร้างอัตโนมัติ
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    สร้างตารางจากข้อมูลกะของพนักงาน
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="outline"
                onClick={() => calendarRef.current?.exportToImage()}
                disabled={allEmployees.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              {weeklySchedule && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              {weeklySchedule?.status === 'draft' && (
                <Button
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  เผยแพร่
                </Button>
              )}
              {weeklySchedule?.status === 'published' && (
                <Button
                  variant="outline"
                  onClick={() => unpublishMutation.mutate()}
                  disabled={unpublishMutation.isPending}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  แก้ไข
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Calendar */}
      {!selectedBranch ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            กรุณาเลือกสาขา
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            กำลังโหลด...
          </CardContent>
        </Card>
      ) : allEmployees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">ไม่พบพนักงานในสาขานี้</p>
          </CardContent>
        </Card>
      ) : (
        <ScheduleCalendar
          ref={calendarRef}
          weekDays={weekDays}
          employees={allEmployees}
          assignments={assignments}
          shiftTemplates={shiftTemplates}
          onAssignmentChange={(data) => updateAssignmentMutation.mutate(data)}
          onAssignmentDelete={(id) => deleteAssignmentMutation.mutate(id)}
          isEditable={weeklySchedule?.status === 'draft'}
          branchName={selectedBranchName}
          weekLabel={`${format(currentWeekStart, 'd MMM', { locale: th })} - ${format(addDays(currentWeekStart, 6), 'd MMM yyyy', { locale: th })}`}
          currentBranchId={selectedBranch}
          onAddTemporaryEmployee={() => setShowAddEmployeeDialog(true)}
        />
      )}

      {/* Stats */}
      {allEmployees.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{allEmployees.length}</p>
                  <p className="text-sm text-muted-foreground">พนักงานทั้งหมด</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CalendarIcon className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {assignments.filter(a => !a.is_day_off).length}
                  </p>
                  <p className="text-sm text-muted-foreground">กะทำงาน</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CalendarIcon className="w-8 h-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {assignments.filter(a => a.is_day_off).length}
                  </p>
                  <p className="text-sm text-muted-foreground">วันหยุด</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CalendarIcon className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{shiftTemplates.length}</p>
                  <p className="text-sm text-muted-foreground">รูปแบบกะ</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bulk Assignment Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>กำหนดกะเป็นกลุ่ม</DialogTitle>
            <DialogDescription>
              เลือกพนักงานและกะที่ต้องการกำหนด
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Select Shift */}
            <div>
              <Label className="mb-2 block">เลือกกะ</Label>
              <Select value={bulkSelectedShift} onValueChange={setBulkSelectedShift}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือกกะ" />
                </SelectTrigger>
                <SelectContent>
                  {shiftTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: template.color }}
                        />
                        {template.name} ({template.start_time.slice(0, 5)}-{template.end_time.slice(0, 5)})
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="off">
                    <span className="text-orange-500">หยุด</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Select Days */}
            <div>
              <Label className="mb-2 block">เลือกวัน</Label>
              <div className="flex flex-wrap gap-2">
                {dayLabels.map((label, idx) => (
                  <label key={idx} className="flex items-center gap-1 cursor-pointer">
                    <Checkbox
                      checked={bulkSelectedDays.includes(idx)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setBulkSelectedDays([...bulkSelectedDays, idx]);
                        } else {
                          setBulkSelectedDays(bulkSelectedDays.filter(d => d !== idx));
                        }
                      }}
                    />
                    <span className={idx >= 5 ? 'text-orange-500' : ''}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Select Employees */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>เลือกพนักงาน</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (bulkSelectedEmployees.length === employees.length) {
                      setBulkSelectedEmployees([]);
                    } else {
                      setBulkSelectedEmployees(employees.map(e => e.id));
                    }
                  }}
                >
                  {bulkSelectedEmployees.length === employees.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                {employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-muted rounded">
                    <Checkbox
                      checked={bulkSelectedEmployees.includes(emp.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setBulkSelectedEmployees([...bulkSelectedEmployees, emp.id]);
                        } else {
                          setBulkSelectedEmployees(bulkSelectedEmployees.filter(id => id !== emp.id));
                        }
                      }}
                    />
                    <span>{emp.full_name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => bulkAssignMutation.mutate()}
              disabled={bulkAssignMutation.isPending || !bulkSelectedShift || !bulkSelectedEmployees.length}
            >
              กำหนดกะ ({bulkSelectedEmployees.length} คน × {bulkSelectedDays.length} วัน)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflicts Dialog */}
      <Dialog open={showConflictsDialog} onOpenChange={setShowConflictsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              ข้อขัดแย้งในตาราง
            </DialogTitle>
            <DialogDescription>
              พบปัญหาที่ควรตรวจสอบก่อนเผยแพร่
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {conflicts.map((conflict, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{conflict.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{conflict.message}</p>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowConflictsDialog(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบตาราง</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบตารางกะสัปดาห์นี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้
              {weeklySchedule?.status === 'published' && (
                <span className="block mt-2 text-amber-600 font-medium">
                  ⚠️ ตารางนี้เผยแพร่แล้ว พนักงานอาจเห็นตารางนี้อยู่
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteScheduleMutation.mutate()}
              disabled={deleteScheduleMutation.isPending}
            >
              ลบตาราง
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Temporary Employee / Borrow Employee Dialog */}
      <Dialog open={showAddEmployeeDialog} onOpenChange={(open) => {
        setShowAddEmployeeDialog(open);
        if (!open) {
          setAddEmployeeTab('temporary');
          setTempEmployeeName('');
          setBorrowFromBranch('');
          setBorrowEmployeeId('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มพนักงานชั่วคราว</DialogTitle>
            <DialogDescription>
              เพิ่มพนักงาน Daywork หรือยืมพนักงานจากสาขาอื่น
            </DialogDescription>
          </DialogHeader>
          
          {/* Tab Buttons */}
          <div className="flex gap-2 border-b pb-3">
            <Button
              variant={addEmployeeTab === 'temporary' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAddEmployeeTab('temporary')}
              className="flex-1"
            >
              ⚡ พนักงานฉุกเฉิน
            </Button>
            <Button
              variant={addEmployeeTab === 'borrow' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAddEmployeeTab('borrow')}
              className="flex-1"
            >
              🔄 ยืมจากสาขาอื่น
            </Button>
          </div>

          {/* Tab Content: Temporary Employee */}
          {addEmployeeTab === 'temporary' && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>ชื่อ-นามสกุล</Label>
                <input
                  type="text"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="กรอกชื่อพนักงาน"
                  value={tempEmployeeName}
                  onChange={(e) => setTempEmployeeName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>เวลาเริ่ม</Label>
                  <input
                    type="time"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={tempEmployeeStartTime}
                    onChange={(e) => setTempEmployeeStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>เวลาสิ้นสุด</Label>
                  <input
                    type="time"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={tempEmployeeEndTime}
                    onChange={(e) => setTempEmployeeEndTime(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddEmployeeDialog(false)}>
                  ยกเลิก
                </Button>
                <Button
                  disabled={!tempEmployeeName.trim()}
                  onClick={async () => {
                    try {
                      // Create temporary employee
                      const code = `TEMP-${Date.now().toString().slice(-6)}`;
                      const { data: newEmp, error: empError } = await supabase
                        .from('employees')
                        .insert({
                          code,
                          full_name: tempEmployeeName.trim(),
                          branch_id: selectedBranch,
                          primary_branch_id: selectedBranch,
                          employee_type: 'temporary',
                          is_active: true,
                        })
                        .select()
                        .single();
                      
                      if (empError) throw empError;
                      
                      // Create shift assignments for the week
                      if (weeklySchedule && newEmp) {
                        const weekAssignments = weekDays.map(day => ({
                          schedule_id: weeklySchedule.id,
                          employee_id: newEmp.id,
                          work_date: format(day, 'yyyy-MM-dd'),
                          custom_start_time: tempEmployeeStartTime,
                          custom_end_time: tempEmployeeEndTime,
                          is_day_off: false,
                        }));
                        
                        await supabase.from('shift_assignments').insert(weekAssignments);
                      }
                      
                      queryClient.invalidateQueries({ queryKey: ['employees-branch'] });
                      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
                      toast.success('เพิ่มพนักงานฉุกเฉินเรียบร้อย');
                      setShowAddEmployeeDialog(false);
                      setTempEmployeeName('');
                    } catch (error: any) {
                      toast.error(error.message || 'เกิดข้อผิดพลาด');
                    }
                  }}
                >
                  เพิ่มพนักงาน
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Tab Content: Borrow Employee */}
          {addEmployeeTab === 'borrow' && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>เลือกสาขาต้นทาง</Label>
                <Select value={borrowFromBranch} onValueChange={(v) => {
                  setBorrowFromBranch(v);
                  setBorrowEmployeeId(''); // Reset employee selection
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกสาขา" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.filter(b => b.id !== selectedBranch).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {borrowFromBranch && (
                <div className="space-y-2">
                  <Label>เลือกพนักงาน</Label>
                  <Select value={borrowEmployeeId} onValueChange={setBorrowEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="เลือกพนักงาน" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherBranchEmployees.length === 0 ? (
                        <div className="px-2 py-1 text-sm text-muted-foreground">ไม่พบพนักงานในสาขานี้</div>
                      ) : (
                        otherBranchEmployees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.full_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {borrowEmployeeId && (
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  💡 พนักงานนี้จะถูกเพิ่มในตารางของสาขานี้ และจะแสดง tag "ยืมมา" ส่วนสาขาต้นทางจะแสดง tag "ยืมไป"
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddEmployeeDialog(false)}>
                  ยกเลิก
                </Button>
                <Button
                  disabled={!borrowEmployeeId}
                  onClick={async () => {
                    try {
                      if (!weeklySchedule) throw new Error('ไม่พบตาราง');
                      
                      const borrowedEmployee = otherBranchEmployees.find(e => e.id === borrowEmployeeId);
                      if (!borrowedEmployee) throw new Error('ไม่พบพนักงาน');
                      
                      // Create shift assignments for the borrowed employee with is_borrowed = true
                      const startTime = borrowedEmployee.shift_start_time || '09:00';
                      const endTime = borrowedEmployee.shift_end_time || '18:00';
                      
                      const weekAssignments = weekDays.map(day => ({
                        schedule_id: weeklySchedule.id,
                        employee_id: borrowEmployeeId,
                        work_date: format(day, 'yyyy-MM-dd'),
                        custom_start_time: startTime,
                        custom_end_time: endTime,
                        is_day_off: false,
                        is_borrowed: true,
                      }));
                      
                      const { error } = await supabase.from('shift_assignments').insert(weekAssignments);
                      if (error) throw error;
                      
                      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
                      toast.success(`ยืมพนักงาน ${borrowedEmployee.full_name} เรียบร้อย`);
                      setShowAddEmployeeDialog(false);
                      setBorrowFromBranch('');
                      setBorrowEmployeeId('');
                    } catch (error: any) {
                      toast.error(error.message || 'เกิดข้อผิดพลาด');
                    }
                  }}
                >
                  ยืมพนักงาน
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
