import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Settings as SettingsIcon, Save } from 'lucide-react';

export default function AttendanceSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    enable_attendance: true,
    require_location: true,
    require_photo: false,
    daily_summary_enabled: true,
    daily_summary_time: '18:00',
    time_zone: 'Asia/Bangkok',
    token_validity_minutes: 10
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['attendance-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_settings')
        .select('*')
        .eq('scope', 'global')
        .maybeSingle();
      
      if (error) throw error;
      return data;
    }
  });

  // Update form when settings load
  useState(() => {
    if (settings) {
      setFormData({
        enable_attendance: settings.enable_attendance ?? true,
        require_location: settings.require_location ?? true,
        require_photo: settings.require_photo ?? false,
        daily_summary_enabled: settings.daily_summary_enabled ?? true,
        daily_summary_time: settings.daily_summary_time || '18:00',
        time_zone: settings.time_zone || 'Asia/Bangkok',
        token_validity_minutes: settings.token_validity_minutes || 10
      });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        scope: 'global',
        ...data
      };

      const { error } = await supabase
        .from('attendance_settings')
        .upsert(payload, { onConflict: 'scope, branch_id, employee_id' });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-settings'] });
      toast({
        title: 'Success',
        description: 'Settings updated successfully',
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

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <SettingsIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            Global Attendance Settings
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Configure default attendance system settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable_attendance">Enable Attendance System</Label>
                <p className="text-sm text-muted-foreground">
                  Allow employees to check in and out
                </p>
              </div>
              <Switch
                id="enable_attendance"
                checked={formData.enable_attendance}
                onCheckedChange={(checked) => setFormData({ ...formData, enable_attendance: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="require_location">Require Location</Label>
                <p className="text-sm text-muted-foreground">
                  Employees must share their location when checking in/out
                </p>
              </div>
              <Switch
                id="require_location"
                checked={formData.require_location}
                onCheckedChange={(checked) => setFormData({ ...formData, require_location: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="require_photo">Require Photo</Label>
                <p className="text-sm text-muted-foreground">
                  Employees must take a selfie when checking in/out
                </p>
              </div>
              <Switch
                id="require_photo"
                checked={formData.require_photo}
                onCheckedChange={(checked) => setFormData({ ...formData, require_photo: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="daily_summary_enabled">Enable Daily Summary</Label>
                <p className="text-sm text-muted-foreground">
                  Send attendance summary to LINE groups daily
                </p>
              </div>
              <Switch
                id="daily_summary_enabled"
                checked={formData.daily_summary_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, daily_summary_enabled: checked })}
              />
            </div>

            {formData.daily_summary_enabled && (
              <div className="ml-6 space-y-2">
                <Label htmlFor="daily_summary_time">Summary Time</Label>
                <Input
                  id="daily_summary_time"
                  type="time"
                  value={formData.daily_summary_time}
                  onChange={(e) => setFormData({ ...formData, daily_summary_time: e.target.value })}
                  className="w-40"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="time_zone">Timezone</Label>
              <Input
                id="time_zone"
                value={formData.time_zone}
                onChange={(e) => setFormData({ ...formData, time_zone: e.target.value })}
                placeholder="Asia/Bangkok"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="token_validity_minutes">Token Validity (minutes)</Label>
              <Input
                id="token_validity_minutes"
                type="number"
                min="1"
                max="60"
                value={formData.token_validity_minutes}
                onChange={(e) => setFormData({ ...formData, token_validity_minutes: parseInt(e.target.value) })}
                className="w-40"
              />
              <p className="text-sm text-muted-foreground">
                How long the check-in/out link remains valid
              </p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
