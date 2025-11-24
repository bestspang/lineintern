import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";

export default function EmployeeSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    salary_per_month: "",
    ot_rate_multiplier: "1.5",
    auto_ot_enabled: false,
    allow_remote_checkin: false,
    max_work_hours_per_day: "8.0",
    ot_warning_minutes: "15",
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

  // Update form when employee data loads
  useEffect(() => {
    if (employee) {
      setFormData({
        salary_per_month: employee.salary_per_month?.toString() || "",
        ot_rate_multiplier: employee.ot_rate_multiplier?.toString() || "1.5",
        auto_ot_enabled: employee.auto_ot_enabled || false,
        allow_remote_checkin: employee.allow_remote_checkin || false,
        max_work_hours_per_day: employee.max_work_hours_per_day?.toString() || "8.0",
        ot_warning_minutes: employee.ot_warning_minutes?.toString() || "15",
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
          allow_remote_checkin: data.allow_remote_checkin,
          max_work_hours_per_day: parseFloat(data.max_work_hours_per_day),
          ot_warning_minutes: parseInt(data.ot_warning_minutes),
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
          <h1 className="text-3xl font-bold">ตั้งค่า OT & เงินเดือน</h1>
          <p className="text-muted-foreground">
            {employee.full_name} ({employee.code})
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
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

            {/* Allow Remote Check-in */}
            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="allow_remote" className="text-base">
                  🌐 อนุญาตให้ Check-in จากที่ไหนก็ได้
                </Label>
                <p className="text-sm text-muted-foreground">
                  สำหรับ Field Worker ไม่ตรวจสอบพื้นที่ (ยังบันทึก location)
                </p>
              </div>
              <Switch
                id="allow_remote"
                checked={formData.allow_remote_checkin}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, allow_remote_checkin: checked })
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
