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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Clock, Bell, Users, Save, Loader2, Camera, MessageSquare, UserCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DepositSettings {
  id: string;
  scope: string;
  branch_id: string | null;
  deposit_deadline: string;
  reminder_time: string;
  notify_line_group_id: string | null;
  notify_admin_ids: string[] | null;
  notify_additional_groups: string[] | null;
  enable_reminder: boolean;
  enable_face_verification: boolean;
  enabled_deposit_groups: string[] | null;
}

export default function DepositSettings() {
  const queryClient = useQueryClient();
  
  const [deadline, setDeadline] = useState("16:00");
  const [reminderTime, setReminderTime] = useState("15:00");
  const [notifyGroupId, setNotifyGroupId] = useState("");
  const [notifyAdminIds, setNotifyAdminIds] = useState<string[]>([]);
  const [notifyAdditionalGroups, setNotifyAdditionalGroups] = useState<string[]>([]);
  const [enableReminder, setEnableReminder] = useState(true);
  const [enableFaceVerification, setEnableFaceVerification] = useState(true);
  const [enabledDepositGroups, setEnabledDepositGroups] = useState<string[]>([]);

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

  // Fetch admin employees for direct notification
  const { data: adminEmployees } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, full_name, code, line_user_id, role')
        .eq('is_active', true)
        .in('role', ['admin', 'manager', 'supervisor'])
        .not('line_user_id', 'is', null)
        .order('full_name');
      return data || [];
    }
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setDeadline(settings.deposit_deadline?.slice(0, 5) || "16:00");
      setReminderTime(settings.reminder_time?.slice(0, 5) || "15:00");
      setNotifyGroupId(settings.notify_line_group_id || "");
      setNotifyAdminIds((settings.notify_admin_ids as string[]) || []);
      setNotifyAdditionalGroups((settings.notify_additional_groups as string[]) || []);
      setEnableReminder(settings.enable_reminder);
      setEnableFaceVerification(settings.enable_face_verification);
      setEnabledDepositGroups(settings.enabled_deposit_groups || []);
    }
  }, [settings]);

  // Toggle admin selection
  const toggleAdminId = (lineUserId: string) => {
    setNotifyAdminIds(prev => 
      prev.includes(lineUserId)
        ? prev.filter(id => id !== lineUserId)
        : [...prev, lineUserId]
    );
  };

  // Toggle additional group selection
  const toggleAdditionalGroup = (lineGroupId: string) => {
    setNotifyAdditionalGroups(prev => 
      prev.includes(lineGroupId)
        ? prev.filter(id => id !== lineGroupId)
        : [...prev, lineGroupId]
    );
  };

  // Toggle group selection
  const toggleDepositGroup = (lineGroupId: string) => {
    setEnabledDepositGroups(prev => 
      prev.includes(lineGroupId)
        ? prev.filter(id => id !== lineGroupId)
        : [...prev, lineGroupId]
    );
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const settingsData = {
        scope: 'global',
        deposit_deadline: `${deadline}:00`,
        reminder_time: `${reminderTime}:00`,
        notify_line_group_id: notifyGroupId || null,
        notify_admin_ids: notifyAdminIds,
        notify_additional_groups: notifyAdditionalGroups,
        enable_reminder: enableReminder,
        enable_face_verification: enableFaceVerification,
        enabled_deposit_groups: enabledDepositGroups,
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

          {/* Additional Notification Groups */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                กลุ่ม LINE เพิ่มเติมสำหรับแจ้งเตือน
              </CardTitle>
              <CardDescription>
                เลือกกลุ่ม LINE เพิ่มเติมที่ต้องการให้ระบบส่งการแจ้งเตือนเมื่อมีใบฝากใหม่ (นอกเหนือจากกลุ่มหลัก)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {groups && groups.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.filter(g => g.line_group_id !== notifyGroupId).map(group => (
                    <div
                      key={group.id}
                      className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`notify-group-${group.id}`}
                        checked={notifyAdditionalGroups.includes(group.line_group_id)}
                        onCheckedChange={() => toggleAdditionalGroup(group.line_group_id)}
                      />
                      <label
                        htmlFor={`notify-group-${group.id}`}
                        className="flex-1 cursor-pointer text-sm font-medium leading-none"
                      >
                        {group.display_name}
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  ยังไม่มีกลุ่ม LINE ที่เชื่อมต่อ
                </p>
              )}
              {notifyAdditionalGroups.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {notifyAdditionalGroups.map(groupId => {
                    const group = groups?.find(g => g.line_group_id === groupId);
                    return (
                      <Badge key={groupId} variant="secondary" className="gap-1">
                        {group?.display_name || groupId}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => toggleAdditionalGroup(groupId)} 
                        />
                      </Badge>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin Direct Notification */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                ผู้ดูแลที่รับแจ้งเตือนโดยตรง (DM)
              </CardTitle>
              <CardDescription>
                เลือกผู้ดูแลที่ต้องการให้ระบบส่งข้อความแจ้งเตือนโดยตรง (Direct Message) เมื่อมีใบฝากใหม่
              </CardDescription>
            </CardHeader>
            <CardContent>
              {adminEmployees && adminEmployees.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {adminEmployees.map(emp => (
                    <div
                      key={emp.id}
                      className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`admin-${emp.id}`}
                        checked={notifyAdminIds.includes(emp.line_user_id!)}
                        onCheckedChange={() => toggleAdminId(emp.line_user_id!)}
                      />
                      <label
                        htmlFor={`admin-${emp.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="text-sm font-medium">{emp.full_name}</div>
                        <div className="text-xs text-muted-foreground">{emp.code} • {emp.role}</div>
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  ไม่พบพนักงานที่มีบทบาท Admin/Manager และเชื่อมต่อ LINE แล้ว
                </p>
              )}
              {notifyAdminIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {notifyAdminIds.map(lineUserId => {
                    const emp = adminEmployees?.find(e => e.line_user_id === lineUserId);
                    return (
                      <Badge key={lineUserId} variant="outline" className="gap-1">
                        {emp?.full_name || lineUserId}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => toggleAdminId(lineUserId)} 
                        />
                      </Badge>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                💡 ผู้ดูแลที่เลือกจะได้รับการ์ดแจ้งเตือนพร้อมปุ่ม "ตรวจสอบ" เพื่อเข้าหน้าตรวจสอบได้ทันที
              </p>
            </CardContent>
          </Card>

          {/* LINE Group Deposit Detection */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                กลุ่ม LINE ที่เปิดใช้งานการตรวจจับใบฝาก
              </CardTitle>
              <CardDescription>
                เลือกกลุ่ม LINE ที่ต้องการให้ระบบตรวจจับและบันทึกใบฝากเงินอัตโนมัติ
                เมื่อพนักงานส่งรูปใบฝากในกลุ่มที่เลือก ระบบจะสแกนและบันทึกข้อมูลโดยใช้ LINE ID ยืนยันตัวตน
              </CardDescription>
            </CardHeader>
            <CardContent>
              {groups && groups.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.map(group => (
                    <div
                      key={group.id}
                      className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`group-${group.id}`}
                        checked={enabledDepositGroups.includes(group.line_group_id)}
                        onCheckedChange={() => toggleDepositGroup(group.line_group_id)}
                      />
                      <label
                        htmlFor={`group-${group.id}`}
                        className="flex-1 cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {group.display_name}
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  ยังไม่มีกลุ่ม LINE ที่เชื่อมต่อ
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                💡 เมื่อเลือกกลุ่ม: พนักงานสามารถส่งรูปใบฝากเงินในกลุ่มนั้นได้เลย ระบบจะ OCR ข้อมูล ตรวจสอบซ้ำ และแจ้ง Admin อัตโนมัติ
              </p>
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