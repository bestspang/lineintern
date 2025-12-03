import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Settings as SettingsIcon, Save, Building2, BarChart3 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// Query options for caching
const queryOptions = {
  staleTime: 5 * 60 * 1000,      // 5 นาที - ไม่ re-fetch ถ้าข้อมูลยังใหม่
  gcTime: 10 * 60 * 1000,        // 10 นาที - keep in cache
  refetchOnWindowFocus: false,   // ไม่ re-fetch เมื่อกลับมาหน้าต่าง
};

export default function AttendanceSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    enable_attendance: true,
    require_location: true,
    require_photo: true,
    daily_summary_enabled: true,
    daily_summary_time: '18:00',
    time_zone: 'Asia/Bangkok',
    token_validity_minutes: 10,
    grace_period_minutes: 15
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['attendance-settings-global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_settings')
        .select('*')
        .eq('scope', 'global')
        .is('branch_id', null)
        .is('employee_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    ...queryOptions
  });

  const { data: branches, isLoading: isLoadingBranches } = useQuery({
    queryKey: ['branches-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, address')
        .eq('is_deleted', false)
        .order('name');
      
      if (error) throw error;
      return data;
    },
    ...queryOptions
  });

  const { data: branchSettings, isLoading: isLoadingBranchSettings } = useQuery({
    queryKey: ['branch-attendance-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_settings')
        .select('branch_id, require_photo')
        .eq('scope', 'branch');
      
      if (error) throw error;
      return data;
    },
    ...queryOptions
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setFormData({
        enable_attendance: settings.enable_attendance ?? true,
        require_location: settings.require_location ?? true,
        require_photo: settings.require_photo ?? true,
        daily_summary_enabled: settings.daily_summary_enabled ?? true,
        daily_summary_time: settings.daily_summary_time || '18:00',
        time_zone: settings.time_zone || 'Asia/Bangkok',
        token_validity_minutes: settings.token_validity_minutes || 10,
        grace_period_minutes: settings.grace_period_minutes || 15
      });
    }
  }, [settings]);

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
      queryClient.invalidateQueries({ queryKey: ['attendance-settings-global'] });
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

  const toggleBranchPhotoRequirement = useMutation({
    mutationFn: async ({ branchId, requirePhoto }: { branchId: string, requirePhoto: boolean }) => {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert({
          scope: 'branch',
          branch_id: branchId,
          require_photo: requirePhoto,
          require_location: true,
          enable_attendance: true,
          token_validity_minutes: 10,
          time_zone: 'Asia/Bangkok'
        }, { onConflict: 'scope, branch_id, employee_id' });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-attendance-settings'] });
      toast({
        title: 'Success',
        description: 'Branch settings updated successfully',
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

  const getBranchPhotoRequirement = (branchId: string) => {
    const setting = branchSettings?.find(s => s.branch_id === branchId);
    return setting?.require_photo ?? false;
  };

  // Skeleton Loading UI
  if (isLoading || isLoadingBranches || isLoadingBranchSettings) {
    return (
      <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            ))}
            <Skeleton className="h-24 w-full rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-40" />
            </div>
            <Skeleton className="h-10 w-32" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-48 mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>
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

            <Separator className="my-4" />

            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                  <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 space-y-2">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                    Daily Summary & Delivery Settings
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Daily attendance summaries and delivery schedules are now managed on the Reports & Summaries page with advanced scheduling options, multiple delivery destinations, and delivery history tracking.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-2">
                    <a href="/attendance/summaries" className="flex items-center gap-2">
                      <SettingsIcon className="h-4 w-4" />
                      Configure Summaries & Delivery →
                    </a>
                  </Button>
                </div>
              </div>
            </div>

            <Separator className="my-4" />

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

            <div className="space-y-2">
              <Label htmlFor="grace_period_minutes">Grace Period สำหรับเข้าสาย (นาที)</Label>
              <Input
                id="grace_period_minutes"
                type="number"
                min="0"
                max="120"
                value={formData.grace_period_minutes}
                onChange={(e) => setFormData({ ...formData, grace_period_minutes: parseInt(e.target.value) })}
                className="w-40"
              />
              <p className="text-sm text-muted-foreground">
                ถ้า check-in ช้าไม่เกิน {formData.grace_period_minutes} นาที จะถือว่าเข้าตรงเวลา
              </p>
              <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg text-sm">
                <p className="text-blue-700 dark:text-blue-300">
                  <strong>ตัวอย่าง:</strong> ถ้าเวลาเริ่มงาน 09:00 และ grace period = {formData.grace_period_minutes} นาที
                </p>
                <ul className="mt-1 space-y-1 text-blue-600 dark:text-blue-400 text-xs list-disc list-inside">
                  <li>Check-in ก่อน 09:00 → <span className="font-semibold text-green-600">เข้าตรงเวลา</span></li>
                  <li>Check-in 09:00-09:{formData.grace_period_minutes.toString().padStart(2, '0')} → <span className="font-semibold text-green-600">เข้าตรงเวลา</span></li>
                  <li>Check-in หลัง 09:{formData.grace_period_minutes.toString().padStart(2, '0')} → <span className="font-semibold text-amber-600">เข้าสาย</span></li>
                </ul>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
            Branch-Specific Photo Requirements
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Override photo requirements for specific branches
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {branches && branches.length > 0 ? (
            <div className="space-y-3">
              {branches.map((branch) => {
                const requiresPhoto = getBranchPhotoRequirement(branch.id);
                return (
                  <div key={branch.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{branch.name}</h4>
                        {requiresPhoto && (
                          <Badge variant="secondary" className="text-xs">
                            Photo Required
                          </Badge>
                        )}
                      </div>
                      {branch.address && (
                        <p className="text-sm text-muted-foreground">{branch.address}</p>
                      )}
                    </div>
                    <Switch
                      checked={requiresPhoto}
                      onCheckedChange={(checked) => 
                        toggleBranchPhotoRequirement.mutate({ 
                          branchId: branch.id, 
                          requirePhoto: checked 
                        })
                      }
                      disabled={toggleBranchPhotoRequirement.isPending}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No branches found. Create a branch first.</p>
            </div>
          )}
          
          <Separator className="my-4" />
          
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">How it works:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Enable photo requirement per branch using the toggle</li>
              <li>Branch settings override global settings</li>
              <li>Employees in enabled branches must take a selfie when checking in/out</li>
              <li>Other branches follow global settings</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}