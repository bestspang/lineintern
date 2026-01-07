import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Settings, Save, Building2, MessageSquare, 
  CheckCircle2, AlertCircle, ArrowLeft, RefreshCcw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface ReceiptSetting {
  id: string;
  setting_key: string;
  setting_value: Record<string, unknown>;
  description: string | null;
}

interface LineGroup {
  id: string;
  line_group_id: string;
  display_name: string;
  features: { receipts?: boolean } | null;
  branches?: { id: string; name: string } | null;
}

export default function ReceiptSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Local state for settings
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [requireBusiness, setRequireBusiness] = useState(false);
  const [autoAssignBranch, setAutoAssignBranch] = useState(true);
  const [groupMode, setGroupMode] = useState<'all' | 'selected' | 'branch_linked'>('all');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['receipt-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_settings')
        .select('*');
      if (error) throw error;
      return data as ReceiptSetting[];
    },
  });

  // Fetch LINE groups with branch info
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['line-groups-with-branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select(`
          id, line_group_id, display_name, features,
          branches:branches!branches_line_group_id_fkey(id, name)
        `)
        .order('display_name');
      if (error) throw error;
      return (data || []).map(g => ({
        ...g,
        branches: Array.isArray(g.branches) ? g.branches[0] : g.branches
      })) as LineGroup[];
    },
  });

  // Initialize local state from settings
  useEffect(() => {
    if (settings) {
      const enabledSetting = settings.find(s => s.setting_key === 'system_enabled');
      const requireSetting = settings.find(s => s.setting_key === 'require_business');
      const autoAssignSetting = settings.find(s => s.setting_key === 'auto_assign_branch');
      const groupsSetting = settings.find(s => s.setting_key === 'enabled_groups');

      if (enabledSetting) {
        setSystemEnabled((enabledSetting.setting_value as { enabled?: boolean }).enabled ?? true);
      }
      if (requireSetting) {
        setRequireBusiness((requireSetting.setting_value as { enabled?: boolean }).enabled ?? false);
      }
      if (autoAssignSetting) {
        setAutoAssignBranch((autoAssignSetting.setting_value as { enabled?: boolean }).enabled ?? true);
      }
      if (groupsSetting) {
        const groupValue = groupsSetting.setting_value as { mode?: string; group_ids?: string[] };
        setGroupMode((groupValue.mode || 'all') as 'all' | 'selected' | 'branch_linked');
        setSelectedGroupIds(groupValue.group_ids || []);
      }
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = [
        { key: 'system_enabled', value: { enabled: systemEnabled } },
        { key: 'require_business', value: { enabled: requireBusiness } },
        { key: 'auto_assign_branch', value: { enabled: autoAssignBranch } },
        { key: 'enabled_groups', value: { mode: groupMode, group_ids: selectedGroupIds } },
      ];

      for (const { key, value } of updates) {
        const { error } = await supabase
          .from('receipt_settings')
          .update({ setting_value: value })
          .eq('setting_key', key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Settings saved successfully');
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['receipt-settings'] });
    },
    onError: (error) => {
      toast.error('Failed to save settings: ' + error.message);
    },
  });

  const handleGroupToggle = (groupId: string, checked: boolean) => {
    setSelectedGroupIds(prev => 
      checked 
        ? [...prev, groupId] 
        : prev.filter(id => id !== groupId)
    );
    setHasChanges(true);
  };

  const handleSelectAll = () => {
    setSelectedGroupIds(groups.map(g => g.id));
    setHasChanges(true);
  };

  const handleDeselectAll = () => {
    setSelectedGroupIds([]);
    setHasChanges(true);
  };

  const isLoading = settingsLoading || groupsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Count groups by mode
  const branchLinkedGroups = groups.filter(g => g.branches);
  const enabledCount = groupMode === 'all' 
    ? groups.length 
    : groupMode === 'branch_linked' 
      ? branchLinkedGroups.length 
      : selectedGroupIds.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/receipts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Receipt Settings
            </h1>
            <p className="text-muted-foreground">
              Configure receipt system behavior and access control
            </p>
          </div>
        </div>
        <Button 
          onClick={() => saveMutation.mutate()} 
          disabled={saveMutation.isPending || !hasChanges}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>
            Control the overall behavior of the receipt system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* System Enabled */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="system-enabled">Enable Receipt System</Label>
              <p className="text-sm text-muted-foreground">
                Turn on/off the entire receipt capture system
              </p>
            </div>
            <Switch
              id="system-enabled"
              checked={systemEnabled}
              onCheckedChange={(checked) => {
                setSystemEnabled(checked);
                setHasChanges(true);
              }}
            />
          </div>

          {/* Require Business */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="require-business">Require Business Creation</Label>
              <p className="text-sm text-muted-foreground">
                Users must create a business before submitting receipts
              </p>
            </div>
            <Switch
              id="require-business"
              checked={requireBusiness}
              onCheckedChange={(checked) => {
                setRequireBusiness(checked);
                setHasChanges(true);
              }}
            />
          </div>

          {/* Auto Assign Branch */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-assign-branch">Auto-assign Branch</Label>
              <p className="text-sm text-muted-foreground">
                Automatically assign receipts to branches based on the LINE group
              </p>
            </div>
            <Switch
              id="auto-assign-branch"
              checked={autoAssignBranch}
              onCheckedChange={(checked) => {
                setAutoAssignBranch(checked);
                setHasChanges(true);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Group Access Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Group Access Control
          </CardTitle>
          <CardDescription>
            Select which LINE groups can submit receipts ({enabledCount} enabled)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mode Selection */}
          <div className="space-y-2">
            <Label>Access Mode</Label>
            <Select 
              value={groupMode} 
              onValueChange={(value: 'all' | 'selected' | 'branch_linked') => {
                setGroupMode(value);
                setHasChanges(true);
              }}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    All Groups - ทุก Group สามารถส่งได้
                  </div>
                </SelectItem>
                <SelectItem value="selected">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    Selected Groups - เลือกเฉพาะ Group
                  </div>
                </SelectItem>
                <SelectItem value="branch_linked">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    Branch-linked Only - เฉพาะ Group ที่เชื่อมกับสาขา
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Group List - only show when mode is 'selected' */}
          {groupMode === 'selected' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Select Groups</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                    Deselect All
                  </Button>
                </div>
              </div>
              
              <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                {groups.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No LINE groups found</p>
                  </div>
                ) : (
                  groups.map((group) => (
                    <div
                      key={group.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={group.id}
                          checked={selectedGroupIds.includes(group.id)}
                          onCheckedChange={(checked) => 
                            handleGroupToggle(group.id, checked as boolean)
                          }
                        />
                        <div>
                          <Label htmlFor={group.id} className="font-medium cursor-pointer">
                            {group.display_name || 'Unnamed Group'}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {group.line_group_id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {group.branches ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                            <Building2 className="h-3 w-3 mr-1" />
                            {group.branches.name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            No branch
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Info for other modes */}
          {groupMode === 'all' && (
            <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4 inline mr-2" />
                All {groups.length} LINE groups can submit receipts
              </p>
            </div>
          )}

          {groupMode === 'branch_linked' && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <Building2 className="h-4 w-4 inline mr-2" />
                Only {branchLinkedGroups.length} groups linked to branches can submit receipts
              </p>
              {branchLinkedGroups.length > 0 && (
                <ul className="mt-2 ml-6 text-sm text-blue-600 dark:text-blue-400 list-disc">
                  {branchLinkedGroups.slice(0, 5).map(g => (
                    <li key={g.id}>
                      {g.display_name} → {g.branches?.name}
                    </li>
                  ))}
                  {branchLinkedGroups.length > 5 && (
                    <li>...and {branchLinkedGroups.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {systemEnabled ? (
                <Badge className="bg-green-100 text-green-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  System Active
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  System Disabled
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {enabledCount} groups enabled • 
                {requireBusiness ? ' Business required' : ' No business required'} • 
                {autoAssignBranch ? ' Auto-assign branch' : ' Manual branch'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['receipt-settings'] })}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
