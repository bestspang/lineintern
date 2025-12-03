/*
 * DO NOT MODIFY - Employee Settings Page
 * 
 * CRITICAL INVARIANTS:
 * 1. employees.salary_per_month is the SINGLE SOURCE OF TRUTH for salary data
 * 2. Auto-sync salary to employee_payroll_settings.salary_per_month when saving
 * 3. OT calculation uses employees.salary_per_month (with fallback to payroll_settings)
 * 4. Never create duplicate salary fields in UI
 * 
 * COMMON BUGS TO AVOID:
 * - Adding another "เงินเดือน" field in Payroll section → causes user confusion
 * - Changing OT calculation to use different source → breaks consistency
 * - Removing salary auto-sync → causes data inconsistency
 * - Modifying upsert logic without testing → breaks save functionality
 */

import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { ArrowLeft, Save, Clock, Bell, MapPin, DollarSign, FlaskConical, Wallet, Plus, Trash2, CalendarDays, Building2, CreditCard, AlertTriangle, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useUserRole } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
interface ReminderPreferences {
  check_in_reminder_enabled: boolean;
  check_out_reminder_enabled: boolean;
  notification_type: string;
  grace_period_minutes: number;
  check_out_reminder_after_minutes: number;
  soft_checkin_reminder_enabled: boolean;
  soft_checkin_reminder_minutes_before: number;
  second_checkin_reminder_enabled: boolean;
}

const defaultReminderPreferences: ReminderPreferences = {
  check_in_reminder_enabled: true,
  check_out_reminder_enabled: true,
  notification_type: 'private',
  grace_period_minutes: 15,
  check_out_reminder_after_minutes: 15,
  soft_checkin_reminder_enabled: true,
  soft_checkin_reminder_minutes_before: 15,
  second_checkin_reminder_enabled: true,
};

interface CustomItem {
  name: string;
  type: 'fixed' | 'percentage';
  value: number;
}

interface PayrollSettings {
  pay_type: 'salary' | 'hourly';
  salary_per_month: string;
  hourly_rate: string;
  has_social_security: boolean;
  social_security_rate: string;
  social_security_cap: string;
  has_transportation: boolean;
  transportation_allowance: string;
  has_withholding_tax: boolean;
  withholding_tax_rate: string;
  custom_deductions: CustomItem[];
  custom_allowances: CustomItem[];
}

const defaultPayrollSettings: PayrollSettings = {
  pay_type: 'salary',
  salary_per_month: '',
  hourly_rate: '',
  has_social_security: true,
  social_security_rate: '5',
  social_security_cap: '750',
  has_transportation: false,
  transportation_allowance: '0',
  has_withholding_tax: false,
  withholding_tax_rate: '0',
  custom_deductions: [],
  custom_allowances: [],
};

interface WorkScheduleDay {
  day_of_week: number;
  day_key: string;
  is_working_day: boolean;
  start_time: string;
  end_time: string;
  expected_hours: number;
}

const dayLabels: { [key: number]: { key: string; label: string } } = {
  0: { key: 'sun', label: 'อาทิตย์' },
  1: { key: 'mon', label: 'จันทร์' },
  2: { key: 'tue', label: 'อังคาร' },
  3: { key: 'wed', label: 'พุธ' },
  4: { key: 'thu', label: 'พฤหัสบดี' },
  5: { key: 'fri', label: 'ศุกร์' },
  6: { key: 'sat', label: 'เสาร์' },
};

const defaultWorkSchedule: WorkScheduleDay[] = [
  { day_of_week: 1, day_key: 'mon', is_working_day: true, start_time: '08:00', end_time: '17:00', expected_hours: 8 },
  { day_of_week: 2, day_key: 'tue', is_working_day: true, start_time: '08:00', end_time: '17:00', expected_hours: 8 },
  { day_of_week: 3, day_key: 'wed', is_working_day: true, start_time: '08:00', end_time: '17:00', expected_hours: 8 },
  { day_of_week: 4, day_key: 'thu', is_working_day: true, start_time: '08:00', end_time: '17:00', expected_hours: 8 },
  { day_of_week: 5, day_key: 'fri', is_working_day: true, start_time: '08:00', end_time: '17:00', expected_hours: 8 },
  { day_of_week: 6, day_key: 'sat', is_working_day: false, start_time: '08:00', end_time: '17:00', expected_hours: 8 },
  { day_of_week: 0, day_key: 'sun', is_working_day: false, start_time: '08:00', end_time: '17:00', expected_hours: 8 },
];

export default function EmployeeSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    // === OT Settings ===
    salary_per_month: "",
    ot_rate_multiplier: "1.5",
    auto_ot_enabled: false,
    max_work_hours_per_day: "8.0",
    ot_warning_minutes: "15",
    
    // === Time Settings ===
    working_time_type: "time_based" as "time_based" | "hours_based",
    earliest_checkin_time: "06:00",
    latest_checkin_time: "11:00",
    allowed_work_start_time: "06:00",
    allowed_work_end_time: "20:00",
    
    // === Work Schedule (moved from Employees.tsx) ===
    shift_start_time: "",
    shift_end_time: "",
    hours_per_day: "",
    break_hours: "1.0",
    
    // === Reminder Preferences (moved from Employees.tsx) ===
    reminder_preferences: { ...defaultReminderPreferences } as ReminderPreferences,
    
    // === Hours-Based Settings (moved from Employees.tsx) ===
    preferred_start_time: "",
    auto_checkout_grace_period_minutes: 60,
    enable_pattern_learning: true,
    enable_second_checkin_reminder: true,
    
    // === Attendance Settings (moved from Employees.tsx) ===
    allow_remote_checkin: false,
    require_photo: null as boolean | null,
    
    // === Test Mode (Admin/Owner Only) ===
    is_test_mode: false,
    
    // === Bank Account Info ===
    bank_name: "",
    bank_account_number: "",
    bank_branch: "",
    
    // === Flexible Day-Off Settings ===
    flexible_day_off_enabled: false,
    flexible_days_per_week: 1,
    flexible_advance_days_required: 1,
    flexible_auto_approve: false,
  });

  // Payroll settings state (separate for clarity)
  const [payrollData, setPayrollData] = useState<PayrollSettings>({ ...defaultPayrollSettings });

  // Work schedule state
  const [workSchedule, setWorkSchedule] = useState<WorkScheduleDay[]>([...defaultWorkSchedule]);

  // Check if current user is admin/owner
  const { hasFullAccess } = useUserRole();

  // Fetch employee data
  const { data: employee, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(`
          *,
          branches (
            id,
            name
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch payroll settings
  const { data: payrollSettings } = useQuery({
    queryKey: ["payroll-settings", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_payroll_settings")
        .select("*")
        .eq("employee_id", id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch work schedules
  const { data: workSchedulesData } = useQuery({
    queryKey: ["work-schedules", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_schedules")
        .select("*")
        .eq("employee_id", id);
      
      if (error) throw error;
      return data;
    },
  });

  // Update work schedule when data loads
  useEffect(() => {
    if (workSchedulesData && workSchedulesData.length > 0) {
      const scheduleMap = new Map(workSchedulesData.map(s => [s.day_of_week, s]));
      setWorkSchedule(defaultWorkSchedule.map(day => {
        const existing = scheduleMap.get(day.day_of_week);
        if (existing) {
          return {
            day_of_week: day.day_of_week,
            day_key: day.day_key,
            is_working_day: existing.is_working_day ?? true,
            start_time: existing.start_time?.substring(0, 5) || '08:00',
            end_time: existing.end_time?.substring(0, 5) || '17:00',
            expected_hours: Number(existing.expected_hours) || 8,
          };
        }
        return day;
      }));
    }
  }, [workSchedulesData]);

  // Helper to format time from DB (HH:mm:ss) to input (HH:mm)
  const formatTimeForInput = (time: string | null, fallback: string): string => {
    if (!time) return fallback;
    return time.substring(0, 5); // "06:00:00" -> "06:00"
  };

  // Update form when employee data loads
  useEffect(() => {
    if (employee) {
      const reminderPrefs = employee.reminder_preferences as unknown as ReminderPreferences | null;
      
      setFormData({
        // OT Settings
        salary_per_month: employee.salary_per_month?.toString() || "",
        ot_rate_multiplier: employee.ot_rate_multiplier?.toString() || "1.5",
        auto_ot_enabled: employee.auto_ot_enabled || false,
        max_work_hours_per_day: employee.max_work_hours_per_day?.toString() || "8.0",
        ot_warning_minutes: employee.ot_warning_minutes?.toString() || "15",
        
        // Time settings
        working_time_type: (employee.working_time_type as "time_based" | "hours_based") || "time_based",
        earliest_checkin_time: formatTimeForInput(employee.earliest_checkin_time, "06:00"),
        latest_checkin_time: formatTimeForInput(employee.latest_checkin_time, "11:00"),
        allowed_work_start_time: formatTimeForInput(employee.allowed_work_start_time, "06:00"),
        allowed_work_end_time: formatTimeForInput(employee.allowed_work_end_time, "20:00"),
        
        // Work Schedule
        shift_start_time: formatTimeForInput(employee.shift_start_time, ""),
        shift_end_time: formatTimeForInput(employee.shift_end_time, ""),
        hours_per_day: employee.hours_per_day?.toString() || "",
        break_hours: employee.break_hours?.toString() || "1.0",
        
        // Reminder Preferences
        reminder_preferences: reminderPrefs || { ...defaultReminderPreferences },
        
        // Hours-Based Settings
        preferred_start_time: formatTimeForInput(employee.preferred_start_time, ""),
        auto_checkout_grace_period_minutes: employee.auto_checkout_grace_period_minutes || 60,
        enable_pattern_learning: employee.enable_pattern_learning ?? true,
        enable_second_checkin_reminder: employee.enable_second_checkin_reminder ?? true,
        
        // Attendance Settings
        allow_remote_checkin: employee.allow_remote_checkin || false,
        require_photo: employee.require_photo ?? null,
        
        // Test Mode
        is_test_mode: (employee as any).is_test_mode || false,
        
        // Bank Account Info
        bank_name: (employee as any).bank_name || "",
        bank_account_number: (employee as any).bank_account_number || "",
        bank_branch: (employee as any).bank_branch || "",
        
        // Flexible Day-Off Settings
        flexible_day_off_enabled: (employee as any).flexible_day_off_enabled || false,
        flexible_days_per_week: (employee as any).flexible_days_per_week || 1,
        flexible_advance_days_required: (employee as any).flexible_advance_days_required || 1,
        flexible_auto_approve: (employee as any).flexible_auto_approve || false,
      });
    }
  }, [employee]);

  // Update payroll settings when data loads
  useEffect(() => {
    if (payrollSettings) {
      setPayrollData({
        pay_type: (payrollSettings.pay_type as 'salary' | 'hourly') || 'salary',
        salary_per_month: payrollSettings.salary_per_month?.toString() || '',
        hourly_rate: payrollSettings.hourly_rate?.toString() || '',
        has_social_security: payrollSettings.has_social_security ?? true,
        social_security_rate: ((payrollSettings.social_security_rate || 0.05) * 100).toString(),
        social_security_cap: payrollSettings.social_security_cap?.toString() || '750',
        has_transportation: payrollSettings.has_transportation ?? false,
        transportation_allowance: payrollSettings.transportation_allowance?.toString() || '0',
        has_withholding_tax: payrollSettings.has_withholding_tax ?? false,
        withholding_tax_rate: ((payrollSettings.withholding_tax_rate || 0) * 100).toString(),
        custom_deductions: (payrollSettings.custom_deductions as unknown as CustomItem[]) || [],
        custom_allowances: (payrollSettings.custom_allowances as unknown as CustomItem[]) || [],
      });
    }
  }, [payrollSettings]);

  // Update employee settings
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Prepare update data based on working_time_type
      const updateData: any = {
        // OT Settings
        salary_per_month: data.salary_per_month ? parseFloat(data.salary_per_month) : null,
        ot_rate_multiplier: parseFloat(data.ot_rate_multiplier),
        auto_ot_enabled: data.auto_ot_enabled,
        max_work_hours_per_day: parseFloat(data.max_work_hours_per_day),
        ot_warning_minutes: parseInt(data.ot_warning_minutes),
        
        // Time settings
        working_time_type: data.working_time_type,
        earliest_checkin_time: data.earliest_checkin_time + ":00",
        latest_checkin_time: data.latest_checkin_time + ":00",
        
        // Reminder Preferences
        reminder_preferences: data.reminder_preferences,
        
        // Attendance Settings
        allow_remote_checkin: data.allow_remote_checkin,
        require_photo: data.require_photo,
        
        // Test Mode (only include if user has access)
        is_test_mode: data.is_test_mode,
        
        // Bank Account Info
        bank_name: data.bank_name || null,
        bank_account_number: data.bank_account_number || null,
        bank_branch: data.bank_branch || null,
        
        // Flexible Day-Off Settings
        flexible_day_off_enabled: data.flexible_day_off_enabled,
        flexible_days_per_week: data.flexible_days_per_week,
        flexible_advance_days_required: data.flexible_advance_days_required,
        flexible_auto_approve: data.flexible_auto_approve,
      };

      // Handle fields based on working_time_type
      if (data.working_time_type === 'hours_based') {
        updateData.shift_start_time = null;
        updateData.shift_end_time = null;
        updateData.hours_per_day = data.hours_per_day ? parseFloat(data.hours_per_day) : null;
        updateData.break_hours = data.break_hours ? parseFloat(data.break_hours) : 1.0;
        updateData.allowed_work_start_time = data.allowed_work_start_time + ":00";
        updateData.allowed_work_end_time = data.allowed_work_end_time + ":00";
        updateData.preferred_start_time = data.preferred_start_time ? data.preferred_start_time + ":00" : null;
        updateData.auto_checkout_grace_period_minutes = data.auto_checkout_grace_period_minutes;
        updateData.enable_pattern_learning = data.enable_pattern_learning;
        updateData.enable_second_checkin_reminder = data.enable_second_checkin_reminder;
      } else {
        // time_based - AUTO-SYNC allowed_work fields from earliest_checkin_time
        updateData.shift_start_time = data.shift_start_time ? data.shift_start_time + ":00" : null;
        updateData.shift_end_time = data.shift_end_time ? data.shift_end_time + ":00" : null;
        updateData.hours_per_day = null;
        updateData.break_hours = null;
        updateData.allowed_work_start_time = data.earliest_checkin_time + ":00"; // Auto-sync from earliest_checkin_time
        updateData.allowed_work_end_time = '20:00:00'; // Default end time
        updateData.preferred_start_time = null;
        updateData.auto_checkout_grace_period_minutes = 60;
        updateData.enable_pattern_learning = true;
        updateData.enable_second_checkin_reminder = true;
      }

      const { error } = await supabase
        .from("employees")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      // Save payroll settings
      // AUTO-SYNC: Copy salary from employees.salary_per_month (single source of truth)
      const payrollUpdateData: any = {
        employee_id: id,
        pay_type: payrollData.pay_type,
        salary_per_month: data.salary_per_month ? parseFloat(data.salary_per_month) : null, // Use employees.salary_per_month
        hourly_rate: payrollData.hourly_rate ? parseFloat(payrollData.hourly_rate) : null,
        has_social_security: payrollData.has_social_security,
        social_security_rate: parseFloat(payrollData.social_security_rate) / 100,
        social_security_cap: parseFloat(payrollData.social_security_cap) || 750,
        has_transportation: payrollData.has_transportation,
        transportation_allowance: parseFloat(payrollData.transportation_allowance) || 0,
        has_withholding_tax: payrollData.has_withholding_tax,
        withholding_tax_rate: parseFloat(payrollData.withholding_tax_rate) / 100,
        custom_deductions: payrollData.custom_deductions,
        custom_allowances: payrollData.custom_allowances,
      };

      const { error: payrollError } = await supabase
        .from("employee_payroll_settings")
        .upsert(payrollUpdateData, { onConflict: 'employee_id' } as any);

      if (payrollError) throw payrollError;

      // Save work schedules
      for (const schedule of workSchedule) {
        const scheduleData = {
          employee_id: id,
          day_of_week: schedule.day_of_week,
          is_working_day: schedule.is_working_day,
          start_time: schedule.start_time + ':00',
          end_time: schedule.end_time + ':00',
          expected_hours: schedule.expected_hours,
        };

        const { error: scheduleError } = await supabase
          .from("work_schedules")
          .upsert(scheduleData, { onConflict: 'employee_id,day_of_week' } as any);

        if (scheduleError) throw scheduleError;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกการตั้งค่าสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-settings", id] });
      queryClient.invalidateQueries({ queryKey: ["work-schedules", id] });
    },
    onError: (error) => {
      toast.error("เกิดข้อผิดพลาด: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">ไม่พบข้อมูลพนักงาน</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">ตั้งค่า OT & เวลาทำงาน</h1>
          <p className="text-muted-foreground">
            {employee.full_name} ({employee.code})
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Working Time Type & Check-in Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              ตั้งค่าเวลา Check-in
            </CardTitle>
            <CardDescription>
              กำหนดรูปแบบการคำนวณเวลาและช่วงเวลาที่อนุญาตให้ Check-in
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Working Time Type */}
            <div className="space-y-3">
              <Label>รูปแบบการคำนวณเวลาทำงาน</Label>
              <RadioGroup
                value={formData.working_time_type}
                onValueChange={(value: "time_based" | "hours_based") =>
                  setFormData({ ...formData, working_time_type: value })
                }
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="time_based" id="time_based" className="mt-1" />
                  <Label htmlFor="time_based" className="cursor-pointer space-y-1">
                    <span className="font-medium">กำหนดเวลาเข้า-ออก</span>
                    <p className="text-sm text-muted-foreground font-normal">
                      สำหรับพนักงานประจำที่มีเวลาเข้างานชัดเจน (เช่น 08:00-17:00)
                    </p>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="hours_based" id="hours_based" className="mt-1" />
                  <Label htmlFor="hours_based" className="cursor-pointer space-y-1">
                    <span className="font-medium">กำหนดจำนวนชั่วโมง</span>
                    <p className="text-sm text-muted-foreground font-normal">
                      สำหรับพนักงานที่ยืดหยุ่นเวลา นับจากชั่วโมงทำงานจริง
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Time fields based on working_time_type */}
            {formData.working_time_type === "time_based" ? (
              <div className="space-y-4 p-4 rounded-lg bg-muted/30 border">
                <h4 className="font-medium text-sm">⏰ เวลา Check-in ที่อนุญาต (time_based)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="earliest_checkin">Check-in เร็วสุด</Label>
                    <Input
                      id="earliest_checkin"
                      type="time"
                      value={formData.earliest_checkin_time}
                      onChange={(e) =>
                        setFormData({ ...formData, earliest_checkin_time: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      พนักงานจะไม่สามารถ check-in ก่อนเวลานี้ได้
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="latest_checkin">Check-in ช้าสุด</Label>
                    <Input
                      id="latest_checkin"
                      type="time"
                      value={formData.latest_checkin_time}
                      onChange={(e) =>
                        setFormData({ ...formData, latest_checkin_time: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      พนักงานจะไม่สามารถ check-in หลังเวลานี้ได้
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-4 rounded-lg bg-muted/30 border">
                <h4 className="font-medium text-sm">⏰ ช่วงเวลาทำงานที่อนุญาต (hours_based)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="work_start">เวลาเริ่มงาน</Label>
                    <Input
                      id="work_start"
                      type="time"
                      value={formData.allowed_work_start_time}
                      onChange={(e) =>
                        setFormData({ ...formData, allowed_work_start_time: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      เวลาที่เร็วที่สุดที่อนุญาตให้เริ่มงาน
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="work_end">เวลาสิ้นสุดงาน</Label>
                    <Input
                      id="work_end"
                      type="time"
                      value={formData.allowed_work_end_time}
                      onChange={(e) =>
                        setFormData({ ...formData, allowed_work_end_time: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      เวลาที่ช้าที่สุดที่อนุญาตให้ทำงาน
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Work Schedule Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              📅 ตารางเวลาทำงาน
            </CardTitle>
            <CardDescription>
              กำหนดเวลากะ หรือจำนวนชั่วโมงทำงานต่อวัน
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.working_time_type === "time_based" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shift_start">เวลาเริ่มกะ (Shift Start)</Label>
                  <Input
                    id="shift_start"
                    type="time"
                    value={formData.shift_start_time}
                    onChange={(e) => setFormData({ ...formData, shift_start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shift_end">เวลาสิ้นสุดกะ (Shift End)</Label>
                  <Input
                    id="shift_end"
                    type="time"
                    value={formData.shift_end_time}
                    onChange={(e) => setFormData({ ...formData, shift_end_time: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hours_per_day">จำนวนชั่วโมงทำงาน/วัน</Label>
                    <Input
                      id="hours_per_day"
                      type="number"
                      step="0.5"
                      min="1"
                      max="24"
                      value={formData.hours_per_day}
                      onChange={(e) => setFormData({ ...formData, hours_per_day: e.target.value })}
                      placeholder="เช่น 8 หรือ 8.5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="break_hours">ชั่วโมงพัก</Label>
                    <Input
                      id="break_hours"
                      type="number"
                      step="0.5"
                      min="0"
                      max="4"
                      value={formData.break_hours}
                      onChange={(e) => setFormData({ ...formData, break_hours: e.target.value })}
                      placeholder="เช่น 1 หรือ 1.5"
                    />
                  </div>
                </div>
                
                {/* Hours-Based Preview */}
                {formData.hours_per_day && (
                  <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                    <AlertDescription className="text-sm">
                      <strong>สรุป:</strong> พนักงานต้องทำงาน {formData.hours_per_day} ชม. + พัก {formData.break_hours} ชม. = รวม {parseFloat(formData.hours_per_day || "0") + parseFloat(formData.break_hours || "0")} ชม./วัน
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* 3. Reminder Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              การแจ้งเตือน Reminder
            </CardTitle>
            <CardDescription>
              ตั้งค่าการแจ้งเตือน Check-in/Check-out
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="check_in_reminder">Check-In Reminder</Label>
                <p className="text-xs text-muted-foreground">แจ้งเตือนเมื่อยังไม่ check-in</p>
              </div>
              <Switch
                id="check_in_reminder"
                checked={formData.reminder_preferences.check_in_reminder_enabled}
                onCheckedChange={(checked) => setFormData({
                  ...formData,
                  reminder_preferences: {
                    ...formData.reminder_preferences,
                    check_in_reminder_enabled: checked
                  }
                })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="check_out_reminder">Check-Out Reminder</Label>
                <p className="text-xs text-muted-foreground">แจ้งเตือนเมื่อยังไม่ check-out</p>
              </div>
              <Switch
                id="check_out_reminder"
                checked={formData.reminder_preferences.check_out_reminder_enabled}
                onCheckedChange={(checked) => setFormData({
                  ...formData,
                  reminder_preferences: {
                    ...formData.reminder_preferences,
                    check_out_reminder_enabled: checked
                  }
                })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification_type">Notification Type</Label>
              <Select
                value={formData.reminder_preferences.notification_type}
                onValueChange={(value) => setFormData({
                  ...formData,
                  reminder_preferences: {
                    ...formData.reminder_preferences,
                    notification_type: value
                  }
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (DM)</SelectItem>
                  <SelectItem value="group">Group Only</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Where to send reminder notifications
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grace_period">Grace Period (minutes)</Label>
                <Input
                  id="grace_period"
                  type="number"
                  min="0"
                  max="60"
                  value={formData.reminder_preferences.grace_period_minutes}
                  onChange={(e) => setFormData({
                    ...formData,
                    reminder_preferences: {
                      ...formData.reminder_preferences,
                      grace_period_minutes: parseInt(e.target.value) || 0
                    }
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Minutes after shift start before sending reminder
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="checkout_delay">Check-Out Reminder Delay (minutes)</Label>
                <Input
                  id="checkout_delay"
                  type="number"
                  min="0"
                  max="120"
                  value={formData.reminder_preferences.check_out_reminder_after_minutes}
                  onChange={(e) => setFormData({
                    ...formData,
                    reminder_preferences: {
                      ...formData.reminder_preferences,
                      check_out_reminder_after_minutes: parseInt(e.target.value) || 0
                    }
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Minutes after shift end before sending reminder
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Hours-Based Specific Settings (only show for hours_based) */}
        {formData.working_time_type === "hours_based" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🎯 Hours-Based Settings
              </CardTitle>
              <CardDescription>
                ตั้งค่าเพิ่มเติมสำหรับพนักงานแบบนับชั่วโมง
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="preferred_start">เวลาเริ่มงานที่แนะนำ (Soft Reminder)</Label>
                <Input
                  id="preferred_start"
                  type="time"
                  value={formData.preferred_start_time}
                  onChange={(e) => setFormData({ ...formData, preferred_start_time: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  ระบบจะส่งการแนะนำเบาๆ ก่อนเวลานี้ (ไม่ใช่การบังคับ)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto_checkout_grace">Grace Period ก่อน Auto Checkout (นาที)</Label>
                <Input
                  id="auto_checkout_grace"
                  type="number"
                  min="0"
                  max="180"
                  value={formData.auto_checkout_grace_period_minutes}
                  onChange={(e) => setFormData({
                    ...formData,
                    auto_checkout_grace_period_minutes: parseInt(e.target.value) || 60
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  หลังครบชั่วโมงทำงาน รอกี่นาทีก่อน auto checkout
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="pattern_learning">เปิดใช้งาน Pattern Learning</Label>
                  <p className="text-xs text-muted-foreground">เรียนรู้รูปแบบการทำงานและเตือนอัจฉริยะ</p>
                </div>
                <Switch
                  id="pattern_learning"
                  checked={formData.enable_pattern_learning}
                  onCheckedChange={(checked) => setFormData({ ...formData, enable_pattern_learning: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="second_reminder">Second Check-In Reminder</Label>
                  <p className="text-xs text-muted-foreground">เตือนก่อนเวลาสิ้นสุดที่จะทำงานไม่ครบ</p>
                </div>
                <Switch
                  id="second_reminder"
                  checked={formData.enable_second_checkin_reminder}
                  onCheckedChange={(checked) => setFormData({ ...formData, enable_second_checkin_reminder: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="soft_checkin">Soft Check-In Reminder</Label>
                  <p className="text-xs text-muted-foreground">แจ้งเตือนเบาๆ ตาม preferred_start_time</p>
                </div>
                <Switch
                  id="soft_checkin"
                  checked={formData.reminder_preferences.soft_checkin_reminder_enabled}
                  onCheckedChange={(checked) => setFormData({
                    ...formData,
                    reminder_preferences: {
                      ...formData.reminder_preferences,
                      soft_checkin_reminder_enabled: checked
                    }
                  })}
                />
              </div>

              {formData.reminder_preferences.soft_checkin_reminder_enabled && (
                <div className="ml-6 space-y-2">
                  <Label htmlFor="soft_reminder_minutes">แจ้งเตือนก่อนกี่นาที</Label>
                  <Input
                    id="soft_reminder_minutes"
                    type="number"
                    min="5"
                    max="60"
                    value={formData.reminder_preferences.soft_checkin_reminder_minutes_before}
                    onChange={(e) => setFormData({
                      ...formData,
                      reminder_preferences: {
                        ...formData.reminder_preferences,
                        soft_checkin_reminder_minutes_before: parseInt(e.target.value) || 15
                      }
                    })}
                    className="w-32"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 5. Attendance Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Attendance Settings
            </CardTitle>
            <CardDescription>
              ตั้งค่าการ Check-in ระยะไกลและการถ่ายรูป
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="allow_remote">🌐 Allow Remote Check-in</Label>
                <p className="text-xs text-muted-foreground">
                  พนักงานสามารถ check-in จากที่ไหนก็ได้ (ไม่ตรวจสอบพื้นที่)
                </p>
              </div>
              <Switch
                id="allow_remote"
                checked={formData.allow_remote_checkin}
                onCheckedChange={(checked) => setFormData({ ...formData, allow_remote_checkin: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="require_photo">📸 Require Photo</Label>
                <p className="text-xs text-muted-foreground">
                  ต้องถ่ายรูปทุกครั้งที่ check-in/check-out
                </p>
              </div>
              <Switch
                id="require_photo"
                checked={formData.require_photo ?? false}
                onCheckedChange={(checked) => setFormData({ ...formData, require_photo: checked })}
              />
            </div>

            {/* Test Mode - Only visible to Admin/Owner */}
            {hasFullAccess && (
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <div className="flex items-start gap-3">
                    <FlaskConical className="h-5 w-5 text-orange-500 mt-0.5" />
                    <div>
                      <Label className="text-orange-600 dark:text-orange-400 font-medium">
                        🧪 Test Mode (Admin Only)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        เปิดใช้งานสำหรับทดสอบระบบ:
                      </p>
                      <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                        <li>Check-in/out ได้ตลอดเวลา (ไม่จำกัดเวลา)</li>
                        <li>ไม่ต้องทำงานครบ 8 ชม. (ถือว่าครบเสมอ)</li>
                        <li>ไม่ต้องขออนุมัติ OT/Early Leave</li>
                      </ul>
                    </div>
                  </div>
                  <Switch
                    id="is_test_mode"
                    checked={formData.is_test_mode}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_test_mode: checked })}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 6. OT Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              การตั้งค่าเงินเดือนและ OT
            </CardTitle>
            <CardDescription>
              กำหนดค่าเงินเดือน, อัตราค่าจ้าง OT, และเวลาทำงานสำหรับพนักงาน
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Warning if salary is empty or 0 */}
            {(!formData.salary_per_month || parseFloat(formData.salary_per_month) === 0) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  กรุณากรอกเงินเดือนเพื่อให้ระบบคำนวณค่า OT และ Payroll ได้ถูกต้อง
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="salary">เงินเดือน (บาท/เดือน) <span className="text-destructive">*</span></Label>
              <Input
                id="salary"
                type="number"
                step="0.01"
                placeholder="เช่น 30000"
                value={formData.salary_per_month}
                onChange={(e) =>
                  setFormData({ ...formData, salary_per_month: e.target.value })
                }
              />
              <p className="text-sm text-muted-foreground">
                ใช้สำหรับคำนวณค่า OT และ Payroll (จะถูก sync ไปยัง Payroll Settings โดยอัตโนมัติ)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ot_rate">อัตราค่าจ้าง OT (เท่า)</Label>
              <Input
                id="ot_rate"
                type="number"
                step="0.1"
                min="1"
                max="3"
                value={formData.ot_rate_multiplier}
                onChange={(e) =>
                  setFormData({ ...formData, ot_rate_multiplier: e.target.value })
                }
              />
              <p className="text-sm text-muted-foreground">
                ค่าเริ่มต้น: 1.5 เท่า (ตามกฎหมายแรงงาน)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_hours">ชั่วโมงทำงานสูงสุดต่อวัน</Label>
              <Input
                id="max_hours"
                type="number"
                step="0.5"
                min="1"
                max="24"
                value={formData.max_work_hours_per_day}
                onChange={(e) =>
                  setFormData({ ...formData, max_work_hours_per_day: e.target.value })
                }
              />
              <p className="text-sm text-muted-foreground">
                เมื่อทำงานเกินชั่วโมงนี้ จะได้รับการเตือนให้ check-out
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="warning_minutes">
                เวลาเตือนก่อนครบชั่วโมงทำงาน (นาที)
              </Label>
              <Input
                id="warning_minutes"
                type="number"
                min="5"
                max="60"
                value={formData.ot_warning_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, ot_warning_minutes: e.target.value })
                }
              />
              <p className="text-sm text-muted-foreground">
                ระบบจะส่งการแจ้งเตือนก่อนถึงเวลาเช็คเอาท์ปกติ
              </p>
            </div>

            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="auto_ot" className="text-base">
                  เปิดใช้งาน OT อัตโนมัติ
                </Label>
                <p className="text-sm text-muted-foreground">
                  อนุญาตให้ทำ OT โดยไม่ต้องขออนุมัติล่วงหน้า
                </p>
              </div>
              <Switch
                id="auto_ot"
                checked={formData.auto_ot_enabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, auto_ot_enabled: checked })
                }
              />
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <h4 className="font-medium">ℹ️ หมายเหตุ</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>ค่าว่าง = ใช้ค่าเริ่มต้นจากการตั้งค่าทั่วไป</li>
                <li>กรอกข้อมูล = ใช้ค่าเฉพาะสำหรับพนักงานคนนี้</li>
                <li>
                  หาก Auto OT ปิดอยู่ พนักงานต้องขออนุมัติก่อนทำ OT ทุกครั้ง
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* 7. Payroll Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              การตั้งค่า Payroll
            </CardTitle>
            <CardDescription>
              กำหนดประเภทเงินเดือน, การหักค่าใช้จ่าย และเบี้ยเลี้ยงสำหรับ Payroll
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Pay Type Selection - Enhanced Visual */}
            <div className="space-y-3">
              <Label className="text-base font-medium">ประเภทการจ่ายเงินเดือน</Label>
              <RadioGroup
                value={payrollData.pay_type}
                onValueChange={(value: 'salary' | 'hourly') =>
                  setPayrollData({ ...payrollData, pay_type: value })
                }
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div className={`flex items-start space-x-3 rounded-lg border-2 p-4 cursor-pointer transition-all ${payrollData.pay_type === 'salary' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'}`}>
                  <RadioGroupItem value="salary" id="pay_salary" className="mt-1" />
                  <Label htmlFor="pay_salary" className="cursor-pointer space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">💼</span>
                      <span className="font-semibold text-base">พนักงานเงินเดือน</span>
                    </div>
                    <p className="text-sm text-muted-foreground font-normal">
                      จ่ายเป็นรายเดือน คำนวณตามวันทำงาน
                    </p>
                  </Label>
                </div>
                <div className={`flex items-start space-x-3 rounded-lg border-2 p-4 cursor-pointer transition-all ${payrollData.pay_type === 'hourly' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'}`}>
                  <RadioGroupItem value="hourly" id="pay_hourly" className="mt-1" />
                  <Label htmlFor="pay_hourly" className="cursor-pointer space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">⏰</span>
                      <span className="font-semibold text-base">Part-time</span>
                    </div>
                    <p className="text-sm text-muted-foreground font-normal">
                      จ่ายเป็นรายชั่วโมง คำนวณตามชั่วโมงจริง
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Hourly Rate (only for hourly employees) */}
            {payrollData.pay_type === 'hourly' && (
              <div className="space-y-2 p-4 rounded-lg bg-primary/5 border-2 border-primary/20">
                <Label htmlFor="payroll_hourly" className="font-medium">อัตราค่าจ้าง (บาท/ชั่วโมง) <span className="text-destructive">*</span></Label>
                <Input
                  id="payroll_hourly"
                  type="number"
                  step="0.01"
                  placeholder="เช่น 80"
                  value={payrollData.hourly_rate}
                  onChange={(e) => setPayrollData({ ...payrollData, hourly_rate: e.target.value })}
                  className="text-base"
                />
                <p className="text-xs text-muted-foreground">
                  💡 ใช้สำหรับคำนวณ Payroll ตามชั่วโมงทำงานจริง
                </p>
              </div>
            )}

            {/* Deductions Section - Enhanced with Toggles */}
            <div className="space-y-4">
              <h4 className="font-medium text-base flex items-center gap-2">
                📉 รายการหักค่าใช้จ่าย
              </h4>
              
              {/* Social Security */}
              <div className="flex items-center justify-between p-4 rounded-lg border-2 bg-muted/30">
                <div className="flex-1">
                  <Label htmlFor="ss_toggle" className="text-sm font-semibold cursor-pointer">ประกันสังคม</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">หัก 5% สูงสุด 750 บาท/เดือน</p>
                </div>
                <Switch
                  id="ss_toggle"
                  checked={payrollData.has_social_security}
                  onCheckedChange={(checked) => setPayrollData({ ...payrollData, has_social_security: checked })}
                />
              </div>

              {payrollData.has_social_security && (
                <div className="grid grid-cols-2 gap-3 pl-6 animate-in slide-in-from-top-2">
                  <div className="space-y-1">
                    <Label className="text-xs">อัตรา (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={payrollData.social_security_rate}
                      onChange={(e) => setPayrollData({ ...payrollData, social_security_rate: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">สูงสุด (บาท)</Label>
                    <Input
                      type="number"
                      value={payrollData.social_security_cap}
                      onChange={(e) => setPayrollData({ ...payrollData, social_security_cap: e.target.value })}
                      className="h-8"
                    />
                  </div>
                </div>
              )}

              {/* Withholding Tax */}
              <div className="flex items-center justify-between p-4 rounded-lg border-2 bg-muted/30">
                <div className="flex-1">
                  <Label htmlFor="tax_toggle" className="text-sm font-semibold cursor-pointer">ภาษีหัก ณ ที่จ่าย</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">หักตามอัตราที่กำหนด</p>
                </div>
                <Switch
                  id="tax_toggle"
                  checked={payrollData.has_withholding_tax}
                  onCheckedChange={(checked) => setPayrollData({ ...payrollData, has_withholding_tax: checked })}
                />
              </div>

              {payrollData.has_withholding_tax && (
                <div className="pl-6 space-y-1 animate-in slide-in-from-top-2">
                  <Label className="text-xs font-medium">อัตรา (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={payrollData.withholding_tax_rate}
                    onChange={(e) => setPayrollData({ ...payrollData, withholding_tax_rate: e.target.value })}
                    placeholder="เช่น 3"
                    className="h-9"
                  />
                </div>
              )}

              {/* Custom Deductions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">รายการหักเพิ่มเติม</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPayrollData({
                      ...payrollData,
                      custom_deductions: [...payrollData.custom_deductions, { name: '', type: 'fixed', value: 0 }]
                    })}
                  >
                    <Plus className="h-3 w-3 mr-1" /> เพิ่ม
                  </Button>
                </div>
                {payrollData.custom_deductions.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      placeholder="ชื่อรายการ"
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...payrollData.custom_deductions];
                        updated[index].name = e.target.value;
                        setPayrollData({ ...payrollData, custom_deductions: updated });
                      }}
                      className="h-8 flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="จำนวน"
                      value={item.value}
                      onChange={(e) => {
                        const updated = [...payrollData.custom_deductions];
                        updated[index].value = parseFloat(e.target.value) || 0;
                        setPayrollData({ ...payrollData, custom_deductions: updated });
                      }}
                      className="h-8 w-24"
                    />
                    <Badge variant="secondary" className="text-xs">฿</Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPayrollData({
                        ...payrollData,
                        custom_deductions: payrollData.custom_deductions.filter((_, i) => i !== index)
                      })}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Allowances Section - Enhanced with Toggles */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-base flex items-center gap-2">
                📈 เบี้ยเลี้ยงและสวัสดิการ
              </h4>
              
              {/* Transportation */}
              <div className="flex items-center justify-between p-4 rounded-lg border-2 bg-muted/30">
                <div className="flex-1">
                  <Label htmlFor="transport_toggle" className="text-sm font-semibold cursor-pointer">ค่าเดินทาง</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">เพิ่มค่าเดินทางเป็นรายเดือน</p>
                </div>
                <Switch
                  id="transport_toggle"
                  checked={payrollData.has_transportation}
                  onCheckedChange={(checked) => setPayrollData({ ...payrollData, has_transportation: checked })}
                />
              </div>

              {payrollData.has_transportation && (
                <div className="pl-6 space-y-1 animate-in slide-in-from-top-2">
                  <Label className="text-xs font-medium">จำนวน (บาท/เดือน)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={payrollData.transportation_allowance}
                    onChange={(e) => setPayrollData({ ...payrollData, transportation_allowance: e.target.value })}
                    placeholder="เช่น 1500"
                    className="h-9"
                  />
                </div>
              )}

              {/* Custom Allowances */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">รายการเบี้ยเลี้ยงเพิ่มเติม</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPayrollData({
                      ...payrollData,
                      custom_allowances: [...payrollData.custom_allowances, { name: '', type: 'fixed', value: 0 }]
                    })}
                  >
                    <Plus className="h-3 w-3 mr-1" /> เพิ่ม
                  </Button>
                </div>
                {payrollData.custom_allowances.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      placeholder="ชื่อรายการ"
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...payrollData.custom_allowances];
                        updated[index].name = e.target.value;
                        setPayrollData({ ...payrollData, custom_allowances: updated });
                      }}
                      className="h-8 flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="จำนวน"
                      value={item.value}
                      onChange={(e) => {
                        const updated = [...payrollData.custom_allowances];
                        updated[index].value = parseFloat(e.target.value) || 0;
                        setPayrollData({ ...payrollData, custom_allowances: updated });
                      }}
                      className="h-8 w-24"
                    />
                    <Badge variant="secondary" className="text-xs">฿</Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPayrollData({
                        ...payrollData,
                        custom_allowances: payrollData.custom_allowances.filter((_, i) => i !== index)
                      })}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 8. Work Schedule Card - Enhanced Visual */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              ตารางงานรายสัปดาห์
            </CardTitle>
            <CardDescription>
              กำหนดวันทำงานและเวลาสำหรับแต่ละวันในสัปดาห์
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick Summary */}
            <div className="p-3 rounded-lg bg-primary/5 border">
              <div className="text-sm font-medium mb-1">สรุปตารางงาน</div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>วันทำงาน: {workSchedule.filter(d => d.is_working_day).length} วัน</span>
                <span>•</span>
                <span>รวมชั่วโมง/สัปดาห์: {workSchedule.filter(d => d.is_working_day).reduce((sum, d) => sum + d.expected_hours, 0)} ชม.</span>
              </div>
            </div>
            
            {/* Weekly Schedule Grid */}
            <div className="space-y-2">
              {workSchedule.map((day, index) => (
                <div 
                  key={day.day_of_week} 
                  className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors ${
                    day.is_working_day ? 'bg-background border-primary/20' : 'bg-muted/30 border-muted'
                  }`}
                >
                  <div className="flex items-center gap-3 w-36">
                    <Switch
                      checked={day.is_working_day}
                      onCheckedChange={(checked) => {
                        const updated = [...workSchedule];
                        updated[index].is_working_day = checked;
                        setWorkSchedule(updated);
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{day.is_working_day ? '✅' : '🔲'}</span>
                      <Label className="font-medium cursor-pointer">
                        {dayLabels[day.day_of_week]?.label || day.day_key}
                      </Label>
                    </div>
                  </div>
                  
                  {day.is_working_day ? (
                    <div className="flex-1 grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">เวลาเริ่ม</Label>
                        <Input
                          type="time"
                          value={day.start_time}
                          onChange={(e) => {
                            const updated = [...workSchedule];
                            updated[index].start_time = e.target.value;
                            setWorkSchedule(updated);
                          }}
                          className="h-9 font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">เวลาสิ้นสุด</Label>
                        <Input
                          type="time"
                          value={day.end_time}
                          onChange={(e) => {
                            const updated = [...workSchedule];
                            updated[index].end_time = e.target.value;
                            setWorkSchedule(updated);
                          }}
                          className="h-9 font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">ชั่วโมง/วัน</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={day.expected_hours}
                          onChange={(e) => {
                            const updated = [...workSchedule];
                            updated[index].expected_hours = parseFloat(e.target.value) || 8;
                            setWorkSchedule(updated);
                          }}
                          className="h-9 font-medium"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 text-sm text-muted-foreground italic">
                      วันหยุด - ไม่มีการทำงาน
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 9. Flexible Day-Off Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              วันหยุดยืดหยุ่น (Flexible Day-Off)
            </CardTitle>
            <CardDescription>
              สำหรับพนักงานที่เลือกวันหยุดประจำสัปดาห์ได้เอง (เช่น แทนที่จะหยุด เสาร์-อาทิตย์ สามารถเลือกวันหยุดแต่ละสัปดาห์ได้)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="flexible_day_off_enabled" className="font-medium">
                  เปิดใช้งานวันหยุดยืดหยุ่น
                </Label>
                <p className="text-sm text-muted-foreground">
                  พนักงานสามารถเลือกวันหยุดของตัวเองได้ในแต่ละสัปดาห์
                </p>
              </div>
              <Switch
                id="flexible_day_off_enabled"
                checked={formData.flexible_day_off_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, flexible_day_off_enabled: checked })}
              />
            </div>

            {formData.flexible_day_off_enabled && (
              <div className="space-y-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                {/* Days per Week */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="flexible_days_per_week">จำนวนวันหยุด/สัปดาห์</Label>
                    <Select
                      value={formData.flexible_days_per_week.toString()}
                      onValueChange={(value) => setFormData({ ...formData, flexible_days_per_week: parseInt(value) })}
                    >
                      <SelectTrigger id="flexible_days_per_week">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 วัน</SelectItem>
                        <SelectItem value="2">2 วัน</SelectItem>
                        <SelectItem value="3">3 วัน</SelectItem>
                        <SelectItem value="4">4 วัน</SelectItem>
                        <SelectItem value="5">5 วัน</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      จำนวนวันที่พนักงานสามารถเลือกหยุดได้ในแต่ละสัปดาห์
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="flexible_advance_days_required">แจ้งล่วงหน้าอย่างน้อย (วัน)</Label>
                    <Select
                      value={formData.flexible_advance_days_required.toString()}
                      onValueChange={(value) => setFormData({ ...formData, flexible_advance_days_required: parseInt(value) })}
                    >
                      <SelectTrigger id="flexible_advance_days_required">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">ไม่ต้องแจ้งล่วงหน้า (วันนี้ได้)</SelectItem>
                        <SelectItem value="1">1 วัน (พรุ่งนี้ขึ้นไป)</SelectItem>
                        <SelectItem value="2">2 วัน (มะรืนขึ้นไป)</SelectItem>
                        <SelectItem value="3">3 วัน</SelectItem>
                        <SelectItem value="7">7 วัน (สัปดาห์หน้า)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      ต้องแจ้งวันหยุดล่วงหน้ากี่วัน
                    </p>
                  </div>
                </div>

                {/* Auto Approve */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="flexible_auto_approve" className="font-medium">
                      อนุมัติอัตโนมัติ
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      อนุมัติวันหยุดทันทีโดยไม่ต้องรอ Admin
                    </p>
                  </div>
                  <Switch
                    id="flexible_auto_approve"
                    checked={formData.flexible_auto_approve}
                    onCheckedChange={(checked) => setFormData({ ...formData, flexible_auto_approve: checked })}
                  />
                </div>

                {/* Summary */}
                <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                  <AlertDescription className="text-sm">
                    <strong>สรุป:</strong> พนักงานสามารถเลือกหยุด {formData.flexible_days_per_week} วัน/สัปดาห์, 
                    {formData.flexible_advance_days_required === 0 
                      ? ' เลือกวันเดียวกันได้' 
                      : ` ต้องแจ้งล่วงหน้า ${formData.flexible_advance_days_required} วัน`}
                    {formData.flexible_auto_approve ? ', อนุมัติอัตโนมัติ' : ', ต้องรอ Admin อนุมัติ'}
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 10. Bank Account Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              ข้อมูลบัญชีธนาคาร
            </CardTitle>
            <CardDescription>
              สำหรับโอนเงินเดือนและ Export ไฟล์ Bank Transfer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bank_name">ธนาคาร</Label>
              <Select
                value={formData.bank_name}
                onValueChange={(value) => setFormData({ ...formData, bank_name: value })}
              >
                <SelectTrigger id="bank_name">
                  <Building2 className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="เลือกธนาคาร" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="กรุงเทพ (BBL)">ธนาคารกรุงเทพ (BBL)</SelectItem>
                  <SelectItem value="กสิกรไทย (KBANK)">ธนาคารกสิกรไทย (KBANK)</SelectItem>
                  <SelectItem value="ไทยพาณิชย์ (SCB)">ธนาคารไทยพาณิชย์ (SCB)</SelectItem>
                  <SelectItem value="กรุงไทย (KTB)">ธนาคารกรุงไทย (KTB)</SelectItem>
                  <SelectItem value="กรุงศรีอยุธยา (BAY)">ธนาคารกรุงศรีอยุธยา (BAY)</SelectItem>
                  <SelectItem value="ทหารไทยธนชาต (TTB)">ธนาคารทหารไทยธนชาต (TTB)</SelectItem>
                  <SelectItem value="ออมสิน (GSB)">ธนาคารออมสิน (GSB)</SelectItem>
                  <SelectItem value="ธ.ก.ส. (BAAC)">ธ.ก.ส. (BAAC)</SelectItem>
                  <SelectItem value="อื่นๆ">อื่นๆ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank_account_number">เลขบัญชี</Label>
              <Input
                id="bank_account_number"
                placeholder="เช่น 123-4-56789-0"
                value={formData.bank_account_number}
                onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank_branch">สาขา</Label>
              <Input
                id="bank_branch"
                placeholder="เช่น สาขาสยามพารากอน"
                value={formData.bank_branch}
                onChange={(e) => setFormData({ ...formData, bank_branch: e.target.value })}
              />
            </div>

            {formData.bank_name && formData.bank_account_number && (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-400">
                  ✅ ข้อมูลบัญชีครบถ้วน - พร้อมสำหรับ Export Bank Transfer
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit Buttons */}
        <div className="flex gap-4">
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            ยกเลิก
          </Button>
        </div>
      </form>
    </div>
  );
}
