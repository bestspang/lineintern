/**
 * Attendance Edit Dialog
 * Allows admins to edit historical attendance data with audit logging
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { 
  Calendar,
  Clock,
  Save,
  RotateCcw,
  History,
  AlertTriangle,
  CheckCircle,
  ShieldCheck
} from "lucide-react";

interface AttendanceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  date: string; // yyyy-MM-dd format
  currentData?: {
    status: string;
    check_in?: string;
    check_out?: string;
    work_hours?: number;
    is_overtime?: boolean;
  };
  onSaved?: () => void;
}

const STATUS_OPTIONS = [
  { value: 'present', label: 'มาทำงาน', color: 'bg-emerald-500' },
  { value: 'regular_weekend', label: 'วันหยุดประจำสัปดาห์', color: 'bg-slate-400' },
  { value: 'day_off', label: 'วันหยุดพิเศษ', color: 'bg-gray-500' },
  { value: 'holiday', label: 'วันหยุดนักขัตฤกษ์', color: 'bg-violet-400' },
  { value: 'vacation', label: 'ลาพักร้อน', color: 'bg-sky-500' },
  { value: 'sick', label: 'ลาป่วย', color: 'bg-amber-500' },
  { value: 'personal', label: 'ลากิจ', color: 'bg-violet-500' },
  { value: 'unpaid_leave', label: 'ลาไม่รับค่าจ้าง', color: 'bg-rose-400' },
  { value: 'not_started', label: 'ยังไม่เริ่มงาน', color: 'bg-slate-400' },
  { value: 'absent', label: 'ขาดงาน', color: 'bg-red-500' },
];

export function AttendanceEditDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  date,
  currentData,
  onSaved,
}: AttendanceEditDialogProps) {
  const queryClient = useQueryClient();
  
  // Validate date format (yyyy-MM-dd)
  const isValidDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date);
  
  // Form state
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [checkInTime, setCheckInTime] = useState<string>('');
  const [checkOutTime, setCheckOutTime] = useState<string>('');
  const [otHours, setOtHours] = useState<string>('0');
  const [workHours, setWorkHours] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [approvedLateStart, setApprovedLateStart] = useState<boolean>(false);
  const [approvedLateReason, setApprovedLateReason] = useState<string>('');
  
  // Fetch existing adjustment (use enabled to prevent fetch when date invalid)
  const { data: existingAdjustment, isLoading } = useQuery({
    queryKey: ['attendance-adjustment', employeeId, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_adjustments')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('adjustment_date', date)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: open && !!employeeId && isValidDate,
  });
  
  // Fetch audit history for this date
  const { data: auditHistory } = useQuery({
    queryKey: ['attendance-audit', employeeId, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('resource_type', 'attendance_adjustment')
        .eq('resource_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      // Filter by date in metadata
      return data?.filter(log => 
        log.metadata && (log.metadata as any).adjustment_date === date
      ) || [];
    },
    enabled: open && !!employeeId && isValidDate,
  });
  
  // Initialize form when dialog opens or data changes
  useEffect(() => {
    if (existingAdjustment) {
      setSelectedStatus(existingAdjustment.override_status || '');
      setCheckInTime(existingAdjustment.override_check_in || '');
      setCheckOutTime(existingAdjustment.override_check_out || '');
      setOtHours(String(existingAdjustment.override_ot_hours || 0));
      setWorkHours(existingAdjustment.override_work_hours ? String(existingAdjustment.override_work_hours) : '');
      setReason('');
      setApprovedLateStart((existingAdjustment as any).approved_late_start || false);
      setApprovedLateReason((existingAdjustment as any).approved_late_reason || '');
    } else if (currentData) {
      // Map current status to form values
      let mappedStatus = currentData.status;
      if (currentData.status === 'late' || currentData.status === 'within_grace') {
        mappedStatus = 'present';
      } else if (currentData.status === 'weekend' || currentData.status === 'future') {
        mappedStatus = '';
      }
      setSelectedStatus(mappedStatus);
      
      // Extract time from check_in/check_out
      if (currentData.check_in) {
        try {
          setCheckInTime(format(parseISO(currentData.check_in), 'HH:mm'));
        } catch { setCheckInTime(''); }
      } else {
        setCheckInTime('');
      }
      
      if (currentData.check_out) {
        try {
          setCheckOutTime(format(parseISO(currentData.check_out), 'HH:mm'));
        } catch { setCheckOutTime(''); }
      } else {
        setCheckOutTime('');
      }
      
      setWorkHours(currentData.work_hours ? String(currentData.work_hours.toFixed(1)) : '');
      setOtHours('0');
      setReason('');
    } else {
      // Reset form
      setSelectedStatus('');
      setCheckInTime('');
      setCheckOutTime('');
      setWorkHours('');
      setOtHours('0');
      setReason('');
      setApprovedLateStart(false);
      setApprovedLateReason('');
    }
  }, [existingAdjustment, currentData, open]);
  
  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) {
        throw new Error('กรุณาระบุเหตุผลในการแก้ไข');
      }
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      const adjustmentData = {
        employee_id: employeeId,
        adjustment_date: date,
        override_status: approvedLateStart ? 'on_time' : (selectedStatus || null),
        override_check_in: checkInTime || null,
        override_check_out: checkOutTime || null,
        override_work_hours: workHours ? parseFloat(workHours) : null,
        override_ot_hours: parseFloat(otHours) || 0,
        leave_type: ['vacation', 'sick', 'personal'].includes(selectedStatus) ? selectedStatus : null,
        reason: reason.trim(),
        adjusted_by_user_id: user?.id || null,
        approved_late_start: approvedLateStart,
        approved_late_reason: approvedLateStart ? approvedLateReason : null,
      };
      
      // Check if adjustment exists
      if (existingAdjustment) {
        // Update existing
        const { error } = await supabase
          .from('attendance_adjustments')
          .update(adjustmentData)
          .eq('id', existingAdjustment.id);
        
        if (error) throw error;
        
        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'update',
          resource_type: 'attendance_adjustment',
          resource_id: employeeId,
          old_values: existingAdjustment,
          new_values: adjustmentData,
          reason: reason.trim(),
          performed_by_user_id: user?.id,
          metadata: { 
            adjustment_date: date,
            employee_name: employeeName,
          },
        });
      } else {
        // Insert new
        const { error } = await supabase
          .from('attendance_adjustments')
          .insert(adjustmentData);
        
        if (error) throw error;
        
        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'create',
          resource_type: 'attendance_adjustment',
          resource_id: employeeId,
          new_values: adjustmentData,
          reason: reason.trim(),
          performed_by_user_id: user?.id,
          metadata: { 
            adjustment_date: date,
            employee_name: employeeName,
          },
        });
      }
    },
      onSuccess: () => {
        toast.success('บันทึกการแก้ไขสำเร็จ');
        // Invalidate all related queries for immediate UI refresh
        queryClient.invalidateQueries({ queryKey: ['attendance-adjustment'] });
        queryClient.invalidateQueries({ queryKey: ['attendance-adjustments'] });
        queryClient.invalidateQueries({ queryKey: ['payroll-records'] });
        queryClient.invalidateQueries({ queryKey: ['employees-payroll'] });
        queryClient.invalidateQueries({ queryKey: ['attendance'] });
        queryClient.invalidateQueries({ queryKey: ['calendar-data'] });
        onSaved?.();
        onOpenChange(false);
      },
    onError: (error) => {
      toast.error(error.message || 'เกิดข้อผิดพลาดในการบันทึก');
    },
  });
  
  // Delete/restore mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existingAdjustment) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('attendance_adjustments')
        .delete()
        .eq('id', existingAdjustment.id);
      
      if (error) throw error;
      
      // Log audit
      await supabase.from('audit_logs').insert({
        action_type: 'delete',
        resource_type: 'attendance_adjustment',
        resource_id: employeeId,
        old_values: existingAdjustment,
        reason: 'ยกเลิกการแก้ไข - คืนค่าเดิม',
        performed_by_user_id: user?.id,
        metadata: { 
          adjustment_date: date,
          employee_name: employeeName,
        },
      });
    },
      onSuccess: () => {
        toast.success('คืนค่าเดิมสำเร็จ');
        // Invalidate all related queries for immediate UI refresh
        queryClient.invalidateQueries({ queryKey: ['attendance-adjustment'] });
        queryClient.invalidateQueries({ queryKey: ['attendance-adjustments'] });
        queryClient.invalidateQueries({ queryKey: ['payroll-records'] });
        queryClient.invalidateQueries({ queryKey: ['employees-payroll'] });
        queryClient.invalidateQueries({ queryKey: ['attendance'] });
        queryClient.invalidateQueries({ queryKey: ['calendar-data'] });
        onSaved?.();
        onOpenChange(false);
      },
    onError: (error) => {
      toast.error(error.message || 'เกิดข้อผิดพลาด');
    },
  });
  
  // Early return if date is invalid - MUST be after ALL hooks
  if (!isValidDate) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ข้อมูลไม่ถูกต้อง</DialogTitle>
            <DialogDescription>กรุณาเลือกวันที่จากปฏิทินก่อนแก้ไขข้อมูล</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  
  const formattedDate = (() => {
    try {
      return format(parseISO(date), 'd MMMM yyyy (EEEE)', { locale: th });
    } catch {
      return date;
    }
  })();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            แก้ไขข้อมูลวันที่ {formattedDate.split(' ').slice(0, 2).join(' ')}
          </DialogTitle>
          <DialogDescription>
            {employeeName} • {formattedDate}
            {existingAdjustment && (
              <Badge variant="secondary" className="ml-2 text-xs">
                มีการแก้ไขแล้ว
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1 min-h-0 pr-4">
          <div className="space-y-6 py-4">
            {/* Status Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">สถานะ</Label>
              <RadioGroup 
                value={selectedStatus} 
                onValueChange={setSelectedStatus}
                className="grid grid-cols-2 gap-2"
              >
                {STATUS_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={option.value} id={option.value} />
                    <Label htmlFor={option.value} className="flex items-center gap-2 cursor-pointer">
                      <div className={`w-2 h-2 rounded-full ${option.color}`} />
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            
            {/* Approved Late Start Toggle - แสดงเมื่อเลือกสถานะ "มาทำงาน" */}
            {selectedStatus === 'present' && (
              <>
                <Separator />
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <Label className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        อนุญาตเข้าสาย
                      </Label>
                    </div>
                    <Switch
                      checked={approvedLateStart}
                      onCheckedChange={setApprovedLateStart}
                    />
                  </div>
                  {approvedLateStart && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-emerald-600">เหตุผล</Label>
                      <Textarea
                        value={approvedLateReason}
                        onChange={(e) => setApprovedLateReason(e.target.value)}
                        placeholder="เช่น ทำงานกะพิเศษถึงเที่ยงคืน"
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    ⚠️ พนักงานจะยังได้รับคะแนน Punctuality และ Streak ต่อเนื่อง
                  </p>
                </div>
              </>
            )}
            
            <Separator />
            
            {/* Time Fields - Only show if status is present */}
            {(selectedStatus === 'present' || selectedStatus === '') && (
              <div className="space-y-4">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  เวลาเข้า-ออกงาน
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="checkIn" className="text-xs text-muted-foreground">เข้างาน</Label>
                    <Input
                      id="checkIn"
                      type="time"
                      value={checkInTime}
                      onChange={(e) => setCheckInTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkOut" className="text-xs text-muted-foreground">ออกงาน</Label>
                    <Input
                      id="checkOut"
                      type="time"
                      value={checkOutTime}
                      onChange={(e) => setCheckOutTime(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="workHours" className="text-xs text-muted-foreground">ชั่วโมงทำงาน</Label>
                    <Input
                      id="workHours"
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      value={workHours}
                      onChange={(e) => setWorkHours(e.target.value)}
                      placeholder="อัตโนมัติ"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="otHours" className="text-xs text-muted-foreground">ชั่วโมง OT</Label>
                    <Input
                      id="otHours"
                      type="number"
                      step="0.5"
                      min="0"
                      max="12"
                      value={otHours}
                      onChange={(e) => setOtHours(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
            
            <Separator />
            
            {/* Reason Field */}
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                เหตุผลในการแก้ไข <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="กรุณาระบุเหตุผลในการแก้ไขข้อมูล..."
                className="min-h-[80px]"
              />
            </div>
            
            {/* Audit History */}
            {auditHistory && auditHistory.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <History className="h-4 w-4" />
                    ประวัติการแก้ไข
                  </Label>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto">
                    {auditHistory.map((log) => (
                      <div key={log.id} className="text-xs p-2 bg-muted/50 rounded-md space-y-1">
                        <div className="flex justify-between">
                          <Badge variant="outline" className="text-[10px]">
                            {log.action_type}
                          </Badge>
                          <span className="text-muted-foreground">
                            {format(parseISO(log.created_at || ''), 'd MMM HH:mm', { locale: th })}
                          </span>
                        </div>
                        {log.reason && (
                          <p className="text-muted-foreground">"{log.reason}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
        
        <DialogFooter className="flex gap-2 pt-4 border-t">
          {existingAdjustment && (
            <Button
              variant="outline"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="mr-auto"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              คืนค่าเดิม
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button 
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !reason.trim()}
          >
            <Save className="h-4 w-4 mr-2" />
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}