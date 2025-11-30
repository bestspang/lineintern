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
import { ArrowLeft, Save, Clock, Bell, MapPin, DollarSign, FlaskConical, Wallet, Plus, Trash2 } from "lucide-react";
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
  });

  // Payroll settings state (separate for clarity)
  const [payrollData, setPayrollData] = useState<PayrollSettings>({ ...defaultPayrollSettings });

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
        // time_based
        updateData.shift_start_time = data.shift_start_time ? data.shift_start_time + ":00" : null;
        updateData.shift_end_time = data.shift_end_time ? data.shift_end_time + ":00" : null;
        updateData.hours_per_day = null;
        updateData.break_hours = null;
        updateData.allowed_work_start_time = null;
        updateData.allowed_work_end_time = null;
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
      const payrollUpdateData: any = {
        employee_id: id,
        pay_type: payrollData.pay_type,
        salary_per_month: payrollData.salary_per_month ? parseFloat(payrollData.salary_per_month) : null,
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
    },
    onSuccess: () => {
      toast.success("บันทึกการตั้งค่าสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-settings", id] });
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
            <div className="space-y-2">
              <Label htmlFor="salary">เงินเดือน (บาท/เดือน)</Label>
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
                ใช้สำหรับคำนวณค่า OT ต่อชั่วโมง
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
            {/* Pay Type Selection */}
            <div className="space-y-3">
              <Label>ประเภทการจ่ายเงินเดือน</Label>
              <RadioGroup
                value={payrollData.pay_type}
                onValueChange={(value: 'salary' | 'hourly') =>
                  setPayrollData({ ...payrollData, pay_type: value })
                }
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="salary" id="pay_salary" className="mt-1" />
                  <Label htmlFor="pay_salary" className="cursor-pointer space-y-1">
                    <span className="font-medium">พนักงานเงินเดือน (Salary)</span>
                    <p className="text-sm text-muted-foreground font-normal">
                      จ่ายเป็นรายเดือน คำนวณตามวันทำงาน
                    </p>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="hourly" id="pay_hourly" className="mt-1" />
                  <Label htmlFor="pay_hourly" className="cursor-pointer space-y-1">
                    <span className="font-medium">พนักงาน Part-time (Hourly)</span>
                    <p className="text-sm text-muted-foreground font-normal">
                      จ่ายเป็นรายชั่วโมง คำนวณตามชั่วโมงจริง
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Salary/Hourly Rate */}
            {payrollData.pay_type === 'salary' ? (
              <div className="space-y-2 p-4 rounded-lg bg-muted/30 border">
                <Label htmlFor="payroll_salary">เงินเดือน (บาท/เดือน)</Label>
                <Input
                  id="payroll_salary"
                  type="number"
                  step="0.01"
                  placeholder="เช่น 30000"
                  value={payrollData.salary_per_month}
                  onChange={(e) => setPayrollData({ ...payrollData, salary_per_month: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  ใช้สำหรับคำนวณ Payroll รายเดือน
                </p>
              </div>
            ) : (
              <div className="space-y-2 p-4 rounded-lg bg-muted/30 border">
                <Label htmlFor="payroll_hourly">อัตราค่าจ้าง (บาท/ชั่วโมง)</Label>
                <Input
                  id="payroll_hourly"
                  type="number"
                  step="0.01"
                  placeholder="เช่น 80"
                  value={payrollData.hourly_rate}
                  onChange={(e) => setPayrollData({ ...payrollData, hourly_rate: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  ใช้สำหรับคำนวณ Payroll ตามชั่วโมงทำงานจริง
                </p>
              </div>
            )}

            {/* Deductions Section */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                📉 รายการหักค่าใช้จ่าย
              </h4>
              
              {/* Social Security */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex-1">
                  <Label htmlFor="ss_toggle" className="text-sm font-medium">ประกันสังคม</Label>
                  <p className="text-xs text-muted-foreground">หัก 5% สูงสุด 750 บาท/เดือน</p>
                </div>
                <Switch
                  id="ss_toggle"
                  checked={payrollData.has_social_security}
                  onCheckedChange={(checked) => setPayrollData({ ...payrollData, has_social_security: checked })}
                />
              </div>

              {payrollData.has_social_security && (
                <div className="grid grid-cols-2 gap-3 pl-4">
                  <div className="space-y-1">
                    <Label className="text-xs">อัตรา (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={payrollData.social_security_rate}
                      onChange={(e) => setPayrollData({ ...payrollData, social_security_rate: e.target.value })}
                      className="h-8"
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
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex-1">
                  <Label htmlFor="tax_toggle" className="text-sm font-medium">ภาษีหัก ณ ที่จ่าย</Label>
                  <p className="text-xs text-muted-foreground">หักภาษีจากเงินเดือน</p>
                </div>
                <Switch
                  id="tax_toggle"
                  checked={payrollData.has_withholding_tax}
                  onCheckedChange={(checked) => setPayrollData({ ...payrollData, has_withholding_tax: checked })}
                />
              </div>

              {payrollData.has_withholding_tax && (
                <div className="pl-4">
                  <div className="space-y-1 w-1/2">
                    <Label className="text-xs">อัตราภาษี (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={payrollData.withholding_tax_rate}
                      onChange={(e) => setPayrollData({ ...payrollData, withholding_tax_rate: e.target.value })}
                      className="h-8"
                    />
                  </div>
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

            {/* Allowances Section */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium flex items-center gap-2">
                📈 เบี้ยเลี้ยงและสวัสดิการ
              </h4>
              
              {/* Transportation */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex-1">
                  <Label htmlFor="transport_toggle" className="text-sm font-medium">ค่าเดินทาง</Label>
                  <p className="text-xs text-muted-foreground">เบี้ยเลี้ยงค่าเดินทาง</p>
                </div>
                <Switch
                  id="transport_toggle"
                  checked={payrollData.has_transportation}
                  onCheckedChange={(checked) => setPayrollData({ ...payrollData, has_transportation: checked })}
                />
              </div>

              {payrollData.has_transportation && (
                <div className="pl-4">
                  <div className="space-y-1 w-1/2">
                    <Label className="text-xs">จำนวน (บาท/เดือน)</Label>
                    <Input
                      type="number"
                      value={payrollData.transportation_allowance}
                      onChange={(e) => setPayrollData({ ...payrollData, transportation_allowance: e.target.value })}
                      className="h-8"
                    />
                  </div>
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
