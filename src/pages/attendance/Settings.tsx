import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings as SettingsIcon } from 'lucide-react';

export default function AttendanceSettings() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['attendance-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_settings')
        .select('*')
        .order('scope', { ascending: true });
      
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const globalSettings = settings?.find(s => s.scope === 'global');

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Attendance Settings
          </CardTitle>
          <CardDescription>
            Configure attendance system behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {globalSettings && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Global Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Attendance Enabled</div>
                  <Badge variant={globalSettings.enable_attendance ? 'default' : 'secondary'}>
                    {globalSettings.enable_attendance ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Require Location</div>
                  <Badge variant={globalSettings.require_location ? 'default' : 'secondary'}>
                    {globalSettings.require_location ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Require Photo</div>
                  <Badge variant={globalSettings.require_photo ? 'default' : 'secondary'}>
                    {globalSettings.require_photo ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Daily Summary</div>
                  <Badge variant={globalSettings.daily_summary_enabled ? 'default' : 'secondary'}>
                    {globalSettings.daily_summary_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Summary Time</div>
                  <div className="text-sm">{globalSettings.daily_summary_time}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Timezone</div>
                  <div className="text-sm">{globalSettings.time_zone}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Token Validity</div>
                  <div className="text-sm">{globalSettings.token_validity_minutes} minutes</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
