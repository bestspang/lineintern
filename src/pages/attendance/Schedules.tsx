import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ChevronLeft, 
  ChevronRight, 
  Wand2, 
  Download, 
  Send, 
  Calendar as CalendarIcon,
  Users,
  AlertCircle,
  History
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, isWeekend } from 'date-fns';
import { th } from 'date-fns/locale';
import ScheduleCalendar, { ScheduleCalendarHandle } from '@/components/attendance/ScheduleCalendar';

interface Branch {
  id: string;
  name: string;
}

interface WeeklySchedule {
  id: string;
  branch_id: string;
  week_start_date: string;
  status: 'draft' | 'published' | 'archived';
  notes: string | null;
  published_at: string | null;
}

interface ShiftTemplate {
  id: string;
  name: string;
  short_code: string;
  start_time: string;
  end_time: string;
  color: string;
  break_hours: number;
}

interface Employee {
  id: string;
  full_name: string;
  branch_id: string | null;
  is_active: boolean;
  shift_start_time: string | null;
  shift_end_time: string | null;
}

interface ShiftAssignment {
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
}

export default function Schedules() {
  const queryClient = useQueryClient();
  const calendarRef = useRef<ScheduleCalendarHandle>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

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
        .select('id, full_name, branch_id, is_active, shift_start_time, shift_end_time')
        .eq('branch_id', selectedBranch)
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!selectedBranch,
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

  // Auto-generate mutation
  const autoGenerateMutation = useMutation({
    mutationFn: async () => {
      if (!weeklySchedule) throw new Error('No schedule');
      
      // Delete existing assignments
      await supabase
        .from('shift_assignments')
        .delete()
        .eq('schedule_id', weeklySchedule.id);
      
      // Generate new assignments based on employee shift times
      const newAssignments: any[] = [];
      const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
      
      for (const employee of employees) {
        for (let i = 0; i < 7; i++) {
          const date = weekDays[i];
          const workDate = format(date, 'yyyy-MM-dd');
          const isWeekendDay = isWeekend(date);
          
          // If employee has shift times set, use them for weekdays
          if (employee.shift_start_time && !isWeekendDay) {
            // Find matching shift template
            const matchingTemplate = shiftTemplates.find(t => 
              t.start_time.slice(0, 5) === employee.shift_start_time?.slice(0, 5)
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
          } else {
            // Weekend or no shift set = day off
            newAssignments.push({
              schedule_id: weeklySchedule.id,
              employee_id: employee.id,
              work_date: workDate,
              is_day_off: true,
              day_off_type: isWeekendDay ? 'weekend' : 'regular',
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

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const isLoading = scheduleLoading || assignmentsLoading;
  const selectedBranchName = branches.find(b => b.id === selectedBranch)?.name;

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
            </div>
            <div className="flex items-center gap-2">
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
                      onClick={() => autoGenerateMutation.mutate()}
                      disabled={autoGenerateMutation.isPending || !employees.length}
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      สร้างอัตโนมัติ
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    สร้างตารางจากข้อมูล work_schedules ของพนักงาน
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="outline"
                onClick={() => calendarRef.current?.exportToImage()}
                disabled={employees.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              {weeklySchedule?.status === 'draft' && (
                <Button
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  เผยแพร่
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
      ) : employees.length === 0 ? (
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
          employees={employees}
          assignments={assignments}
          shiftTemplates={shiftTemplates}
          onAssignmentChange={(data) => updateAssignmentMutation.mutate(data)}
          isEditable={weeklySchedule?.status === 'draft'}
          branchName={selectedBranchName}
          weekLabel={`${format(currentWeekStart, 'd MMM', { locale: th })} - ${format(addDays(currentWeekStart, 6), 'd MMM yyyy', { locale: th })}`}
        />
      )}

      {/* Stats */}
      {employees.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{employees.length}</p>
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
    </div>
  );
}
