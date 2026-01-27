import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Bell, BellOff, Clock, Zap } from 'lucide-react';

interface BotAlertSetting {
  enabled: boolean;
  mode: 'realtime' | 'aggregate';
  aggregate_interval_hours: number;
}

const defaultSetting: BotAlertSetting = {
  enabled: false,
  mode: 'aggregate',
  aggregate_interval_hours: 24,
};

export default function BotAlertSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [setting, setSetting] = useState<BotAlertSetting>(defaultSetting);

  // Fetch current setting
  const { data: settingData, isLoading } = useQuery({
    queryKey: ['bot-alert-unregistered-user'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'bot_alert_unregistered_user')
        .maybeSingle();
      
      if (error) throw error;
      
      // Parse and validate the setting
      const value = data?.setting_value;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const parsed = value as Record<string, unknown>;
        return {
          enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaultSetting.enabled,
          mode: (parsed.mode === 'realtime' || parsed.mode === 'aggregate') ? parsed.mode : defaultSetting.mode,
          aggregate_interval_hours: typeof parsed.aggregate_interval_hours === 'number' 
            ? parsed.aggregate_interval_hours 
            : defaultSetting.aggregate_interval_hours,
        } as BotAlertSetting;
      }
      return defaultSetting;
    },
  });

  useEffect(() => {
    if (settingData) {
      setSetting(settingData);
    }
  }, [settingData]);

  const updateMutation = useMutation({
    mutationFn: async (newSetting: BotAlertSetting) => {
      // Convert to JSON-compatible format
      const jsonValue = {
        enabled: newSetting.enabled,
        mode: newSetting.mode,
        aggregate_interval_hours: newSetting.aggregate_interval_hours,
      };
      
      const { error } = await supabase
        .from('system_settings')
        .update({ 
          setting_value: jsonValue,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', 'bot_alert_unregistered_user');
      
      if (error) throw error;
      return newSetting;
    },
    onSuccess: (newSetting) => {
      queryClient.invalidateQueries({ queryKey: ['bot-alert-unregistered-user'] });
      toast({
        title: 'บันทึกสำเร็จ',
        description: newSetting.enabled 
          ? `เปิดการแจ้งเตือน (${newSetting.mode === 'realtime' ? 'Real-time' : 'สรุปรายวัน'})`
          : 'ปิดการแจ้งเตือนแล้ว',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const handleEnabledChange = (enabled: boolean) => {
    const newSetting = { ...setting, enabled };
    setSetting(newSetting);
    updateMutation.mutate(newSetting);
  };

  const handleModeChange = (mode: 'realtime' | 'aggregate') => {
    const newSetting = { ...setting, mode };
    setSetting(newSetting);
    updateMutation.mutate(newSetting);
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          Bot Alert Settings
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          ตั้งค่าการแจ้งเตือนเมื่อผู้ใช้ที่ไม่ได้ลงทะเบียนส่งรูปในกลุ่ม
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Main toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            {setting.enabled ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <Label htmlFor="alert-enabled" className="font-medium cursor-pointer">
                แจ้งเตือนเมื่อผู้ใช้ที่ไม่ได้ลงทะเบียนส่งรูป
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {setting.enabled ? 'เปิดอยู่ - จะได้รับการแจ้งเตือน' : 'ปิดอยู่ - ไม่แจ้งเตือน'}
              </p>
            </div>
          </div>
          <Switch
            id="alert-enabled"
            checked={setting.enabled}
            onCheckedChange={handleEnabledChange}
            disabled={updateMutation.isPending}
          />
        </div>

        {/* Mode selection - only show when enabled */}
        {setting.enabled && (
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
            <Label className="text-sm font-medium">โหมดการแจ้งเตือน</Label>
            <RadioGroup 
              value={setting.mode} 
              onValueChange={(value) => handleModeChange(value as 'realtime' | 'aggregate')}
              className="space-y-2"
            >
              <div className="flex items-start space-x-3 p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="realtime" id="realtime" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="realtime" className="flex items-center gap-2 cursor-pointer">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">Real-time</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    ส่งแจ้งเตือนทันทีทุกครั้งที่มีผู้ใช้ที่ไม่ได้ลงทะเบียนส่งรูป
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="aggregate" id="aggregate" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="aggregate" className="flex items-center gap-2 cursor-pointer">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Aggregate (สรุปรายวัน)</span>
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">แนะนำ</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    รวบรวมแจ้งเตือนแล้วส่งสรุปวันละครั้ง (18:00)
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Status indicator */}
        <div className={`p-3 rounded-lg ${
          !setting.enabled 
            ? 'bg-muted' 
            : setting.mode === 'realtime'
            ? 'bg-amber-50 dark:bg-amber-950/30'
            : 'bg-blue-50 dark:bg-blue-950/30'
        }`}>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={
              !setting.enabled 
                ? 'bg-muted-foreground/20 text-muted-foreground' 
                : setting.mode === 'realtime'
                ? 'bg-amber-100 text-amber-700 border-amber-300'
                : 'bg-blue-100 text-blue-700 border-blue-300'
            }>
              {!setting.enabled 
                ? 'ปิดอยู่' 
                : setting.mode === 'realtime' 
                ? 'Real-time' 
                : 'Aggregate'}
            </Badge>
            <span className={`text-sm ${
              !setting.enabled 
                ? 'text-muted-foreground' 
                : setting.mode === 'realtime'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-blue-700 dark:text-blue-400'
            }`}>
              {!setting.enabled 
                ? 'ไม่มีการแจ้งเตือนเมื่อผู้ใช้ที่ไม่ได้ลงทะเบียนส่งรูป' 
                : setting.mode === 'realtime'
                ? 'แจ้งเตือนทันทีทุกครั้ง'
                : 'สรุปแจ้งเตือนวันละครั้งเวลา 18:00'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
