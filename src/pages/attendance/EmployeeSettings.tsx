import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Save, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function EmployeeSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    salary_per_month: "",
    ot_rate_multiplier: "1.5",
    auto_ot_enabled: false,
    max_work_hours_per_day: "8.0",
    ot_warning_minutes: "15",
    // Time settings
    working_time_type: "time_based" as "time_based" | "hours_based",
    earliest_checkin_time: "06:00",
    latest_checkin_time: "11:00",
    allowed_work_start_time: "06:00",
    allowed_work_end_time: "20:00",
  });

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

  // Helper to format time from DB (HH:mm:ss) to input (HH:mm)
  const formatTimeForInput = (time: string | null, fallback: string): string => {
    if (!time) return fallback;
    return time.substring(0, 5); // "06:00:00" -> "06:00"
  };

  // Update form when employee data loads
  useEffect(() => {
    if (employee) {
      setFormData({
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
      });
    }
  }, [employee]);

  // Update employee settings
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from("employees")
        .update({
          salary_per_month: data.salary_per_month ? parseFloat(data.salary_per_month) : null,
          ot_rate_multiplier: parseFloat(data.ot_rate_multiplier),
          auto_ot_enabled: data.auto_ot_enabled,
          max_work_hours_per_day: parseFloat(data.max_work_hours_per_day),
          ot_warning_minutes: parseInt(data.ot_warning_minutes),
          // Time settings - append :00 for seconds
          working_time_type: data.working_time_type,
          earliest_checkin_time: data.earliest_checkin_time + ":00",
          latest_checkin_time: data.latest_checkin_time + ":00",
          allowed_work_start_time: data.allowed_work_start_time + ":00",
          allowed_work_end_time: data.allowed_work_end_time + ":00",
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("บันทึกการตั้งค่าสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
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
        {/* Time Settings Card */}
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
                <p className="text-sm text-muted-foreground mt-2">
                  💡 ตัวอย่าง: ถ้าตั้ง 06:00 - 11:00 พนักงานจะ check-in ได้ตั้งแต่ 06:00 ถึง 11:00 เท่านั้น
                </p>
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
                      เวลาที่ช้าที่สุดที่อนุญาตให้ทำงาน (และ check-in)
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  💡 ตัวอย่าง: ถ้าตั้ง 06:00 - 22:00 พนักงานสามารถ check-in ได้ตลอดช่วงเวลานี้ และระบบจะนับชั่วโมงทำงานจริง
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* OT Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle>การตั้งค่าเงินเดือนและ OT</CardTitle>
            <CardDescription>
              กำหนดค่าเงินเดือน, อัตราค่าจ้าง OT, และเวลาทำงานสำหรับพนักงาน
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Salary */}
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

            {/* OT Rate Multiplier */}
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

            {/* Max Work Hours */}
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

            {/* OT Warning Time */}
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

            {/* Auto OT Enabled */}
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

            {/* Information Box */}
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

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
              >
                ยกเลิก
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
