import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Bell, Users, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DepositSettings {
  id: string;
  scope: string;
  branch_id: string | null;
  deposit_deadline: string;
  reminder_time: string;
  notify_line_group_id: string | null;
  enable_reminder: boolean;
  enable_face_verification: boolean;
}

export default function DepositSettings() {
  const queryClient = useQueryClient();
  
  const [deadline, setDeadline] = useState("16:00");
  const [reminderTime, setReminderTime] = useState("15:00");
  const [notifyGroupId, setNotifyGroupId] = useState("");
  const [enableReminder, setEnableReminder] = useState(true);
  const [enableFaceVerification, setEnableFaceVerification] = useState(true);

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['deposit-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_settings')
        .select('*')
        .eq('scope', 'global')
        .maybeSingle();
      
      if (error) throw error;
      return data as DepositSettings | null;
    }
  });

  // Fetch LINE groups
  const { data: groups } = useQuery({
    queryKey: ['line-groups'],
    queryFn: async () => {
      const { data } = await supabase
        .from('groups')
        .select('id, line_group_id, display_name')
        .eq('status', 'active')
        .order('display_name');
      return data || [];
    }
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setDeadline(settings.deposit_deadline?.slice(0, 5) || "16:00");
      setReminderTime(settings.reminder_time?.slice(0, 5) || "15:00");
      setNotifyGroupId(settings.notify_line_group_id || "");
      setEnableReminder(settings.enable_reminder);
      setEnableFaceVerification(settings.enable_face_verification);
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const settingsData = {
        scope: 'global',
        deposit_deadline: `${deadline}:00`,
        reminder_time: `${reminderTime}:00`,
        notify_line_group_id: notifyGroupId || null,
        enable_reminder: enableReminder,
        enable_face_verification: enableFaceVerification,
        updated_at: new Date().toISOString()
      };

      if (settings?.id) {
        const { error } = await supabase
          .from('deposit_settings')
          .update(settingsData)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('deposit_settings')
          .insert(settingsData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกการตั้งค่าสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ['deposit-settings'] });
    },
    onError: (error) => {
      toast.error("เกิดข้อผิดพลาดในการบันทึก");
      console.error(error);
    }
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">ตั้งค่าระบบฝากเงิน</h1>
          <p className="text-muted-foreground">กำหนดเวลาฝากเงินและการแจ้งเตือน</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Time Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                ตั้งค่าเวลา
              </CardTitle>
              <CardDescription>
                กำหนดเวลาที่ต้องฝากเงินและเวลาแจ้งเตือน
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deadline">เวลาสิ้นสุดการฝากเงิน</Label>
                <Input
                  id="deadline"
                  type="time"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  พนักงานควรฝากเงินก่อนเวลานี้
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reminder">เวลาแจ้งเตือน</Label>
                <Input
                  id="reminder"
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  ระบบจะแจ้งเตือนหากยังไม่มีการฝากเงิน
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                ตั้งค่าการแจ้งเตือน
              </CardTitle>
              <CardDescription>
                เลือกกลุ่ม LINE สำหรับรับการแจ้งเตือน
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>กลุ่ม LINE รับแจ้งเตือน</Label>
                <Select value={notifyGroupId} onValueChange={setNotifyGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกกลุ่ม LINE" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">ไม่แจ้งเตือน</SelectItem>
                    {groups?.map(group => (
                      <SelectItem key={group.id} value={group.line_group_id}>
                        {group.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  กลุ่มนี้จะได้รับแจ้งเตือนเมื่อมีการฝากเงิน
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>เปิดการแจ้งเตือนอัตโนมัติ</Label>
                  <p className="text-xs text-muted-foreground">
                    แจ้งเตือนเมื่อสาขายังไม่ฝากเงิน
                  </p>
                </div>
                <Switch
                  checked={enableReminder}
                  onCheckedChange={setEnableReminder}
                />
              </div>
            </CardContent>
          </Card>

          {/* Verification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                ตั้งค่าการยืนยันตัวตน
              </CardTitle>
              <CardDescription>
                กำหนดว่าต้องยืนยันตัวตนก่อนอัพโหลดหรือไม่
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>ต้องยืนยันตัวตนด้วยใบหน้า</Label>
                  <p className="text-xs text-muted-foreground">
                    พนักงานต้องถ่ายรูปหน้าก่อนอัพโหลดใบฝาก
                  </p>
                </div>
                <Switch
                  checked={enableFaceVerification}
                  onCheckedChange={setEnableFaceVerification}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button 
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                บันทึกการตั้งค่า
              </>
            )}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}