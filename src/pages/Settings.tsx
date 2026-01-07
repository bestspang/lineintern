import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Smartphone } from 'lucide-react';

// Separate component for Portal Access Mode to manage its own state
function PortalAccessModeSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [portalMode, setPortalMode] = useState<'liff' | 'token' | 'both'>('liff');

  // Fetch portal access mode setting
  const { data: portalSetting, isLoading } = useQuery({
    queryKey: ['portal-access-mode'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'portal_access_mode')
        .maybeSingle();
      
      if (error) throw error;
      return data?.setting_value as { mode: string; available_modes: string[] } | null;
    },
  });

  useEffect(() => {
    if (portalSetting?.mode) {
      setPortalMode(portalSetting.mode as 'liff' | 'token' | 'both');
    }
  }, [portalSetting]);

  const savePortalModeMutation = useMutation({
    mutationFn: async (mode: 'liff' | 'token' | 'both') => {
      const newValue = { mode, available_modes: ['liff', 'token', 'both'] };
      
      const { data, error } = await supabase
        .from('system_settings')
        .update({ 
          setting_value: newValue,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', 'portal_access_mode')
        .select()
        .single();
      
      if (error) throw error;
      if (!data) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-access-mode'] });
      toast({
        title: 'Success',
        description: 'Portal access mode updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const handleModeChange = (mode: 'liff' | 'token' | 'both') => {
    setPortalMode(mode);
    savePortalModeMutation.mutate(mode);
  };

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <div className="space-y-4">
      <RadioGroup value={portalMode} onValueChange={handleModeChange as (value: string) => void} className="space-y-3">
        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="liff" id="liff" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="liff" className="flex items-center gap-2 cursor-pointer">
              <span className="font-medium">LIFF Mode</span>
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">แนะนำ</Badge>
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              เข้าสู่ระบบอัตโนมัติผ่าน LINE App ไม่ต้องใช้ token
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Login อัตโนมัติ ไม่ต้อง copy link</li>
              <li>ปลอดภัยกว่า - ไม่มี token ใน URL</li>
              <li>ไม่หมดอายุ (ตราบใดที่ login LINE อยู่)</li>
              <li>แสดงรูปโปรไฟล์ LINE</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="token" id="token" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="token" className="font-medium cursor-pointer">Token Link Mode</Label>
            <p className="text-sm text-muted-foreground mt-1">
              ส่งลิงก์พร้อม token ที่มีอายุ 30 นาที
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>เปิดใน browser ภายนอกได้</li>
              <li>Token หมดอายุใน 30 นาที</li>
              <li>รองรับอุปกรณ์ที่ไม่มี LINE App</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="both" id="both" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="both" className="flex items-center gap-2 cursor-pointer">
              <span className="font-medium">Both Mode (Hybrid)</span>
              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">ใหม่</Badge>
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              ใช้ทั้ง LIFF และ Token Link ตามความเหมาะสม
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>/menu → LIFF URL (auto-login)</li>
              <li>checkin/checkout → Token Link (แบบเดิม)</li>
              <li>เหมาะสำหรับใช้งานทั่วไป</li>
            </ul>
          </div>
        </div>
      </RadioGroup>

      <div className={`p-3 rounded-lg ${
        portalMode === 'liff' ? 'bg-green-50 dark:bg-green-950/30' : 
        portalMode === 'both' ? 'bg-purple-50 dark:bg-purple-950/30' :
        'bg-blue-50 dark:bg-blue-950/30'
      }`}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={
            portalMode === 'liff' ? 'bg-green-100 text-green-700 border-green-300' : 
            portalMode === 'both' ? 'bg-purple-100 text-purple-700 border-purple-300' :
            'bg-blue-100 text-blue-700 border-blue-300'
          }>
            {portalMode === 'liff' ? 'LIFF Active' : portalMode === 'both' ? 'Both Active' : 'Token Active'}
          </Badge>
          <span className={`text-sm ${
            portalMode === 'liff' ? 'text-green-700 dark:text-green-400' : 
            portalMode === 'both' ? 'text-purple-700 dark:text-purple-400' :
            'text-blue-700 dark:text-blue-400'
          }`}>
            {portalMode === 'liff' 
              ? 'พนักงานจะได้รับ LIFF URL เมื่อพิมพ์ /menu' 
              : portalMode === 'both'
              ? '/menu ใช้ LIFF, checkin/checkout ใช้ Token Link'
              : 'พนักงานจะได้รับ Token Link เมื่อพิมพ์ /menu'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { toast: showToast } = useToast();
  const queryClient = useQueryClient();
  const [environmentName, setEnvironmentName] = useState('');
  const [defaultMode, setDefaultMode] = useState<any>('');
  const [defaultLanguage, setDefaultLanguage] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');
  const [maxSummaryMessages, setMaxSummaryMessages] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .maybeSingle();
      
      if (error) throw error;
      
      // Create default settings if none exist
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from('app_settings')
          .insert({
            environment_name: 'Sandbox',
            default_mode: 'helper',
            default_language: 'auto',
            openai_model: 'gpt-4',
            max_summary_messages: 100,
          })
          .select()
          .single();
        
        if (insertError) throw insertError;
        return newSettings;
      }
      
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setEnvironmentName(settings.environment_name || '');
      setDefaultMode(settings.default_mode || '');
      setDefaultLanguage(settings.default_language || '');
      setOpenaiModel(settings.openai_model || '');
      setMaxSummaryMessages(settings.max_summary_messages?.toString() || '');
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) return;
      const { error } = await supabase
        .from('app_settings')
        .update({
          environment_name: environmentName,
          default_mode: defaultMode,
          default_language: defaultLanguage,
          openai_model: openaiModel,
          max_summary_messages: parseInt(maxSummaryMessages),
        })
        .eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      showToast({ title: 'Settings updated successfully' });
    },
    onError: (error: any) => {
      showToast({
        variant: 'destructive',
        title: 'Failed to update settings',
        description: error.message,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">General Settings</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Configure global bot behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="env" className="text-sm">Environment Name</Label>
            <Input
              id="env"
              value={environmentName}
              onChange={(e) => setEnvironmentName(e.target.value)}
              placeholder="e.g., Sandbox, Production"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mode" className="text-sm">Default Mode for New Groups</Label>
            <Select value={defaultMode} onValueChange={setDefaultMode}>
              <SelectTrigger id="mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="helper">Helper</SelectItem>
                <SelectItem value="faq">FAQ</SelectItem>
                <SelectItem value="report">Report</SelectItem>
                <SelectItem value="fun">Fun</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lang" className="text-sm">Default Language</Label>
            <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
              <SelectTrigger id="lang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="th">Thai</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model" className="text-sm">OpenAI Model</Label>
            <Input
              id="model"
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              placeholder="e.g., gpt-4, gpt-3.5-turbo"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max" className="text-sm">Max Messages for Summaries</Label>
            <Input
              id="max"
              type="number"
              value={maxSummaryMessages}
              onChange={(e) => setMaxSummaryMessages(e.target.value)}
              placeholder="100"
              className="text-sm"
            />
          </div>

          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="w-full sm:w-auto">
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Portal Access Mode Configuration */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Smartphone className="h-4 w-4 sm:h-5 sm:w-5" />
            Portal Access Mode
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            วิธีเข้าใช้งาน Portal ของพนักงานเมื่อพิมพ์ /menu
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <PortalAccessModeSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Admin Accounts</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Manage dashboard access</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Admin management coming soon. Use authentication to control access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}