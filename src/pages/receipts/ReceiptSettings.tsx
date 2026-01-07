import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Settings, Save, Building2, MessageSquare, 
  CheckCircle2, AlertCircle, ArrowLeft, RefreshCcw,
  Plus, X, Search, Link2, Users
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

interface Branch {
  id: string;
  name: string;
}

interface LineGroup {
  id: string;
  line_group_id: string;
  display_name: string;
}

interface GroupMapping {
  id?: string;
  group_id: string;
  branch_id: string | null;
  is_enabled: boolean;
}

export default function ReceiptSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Local state for settings
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [requireBusiness, setRequireBusiness] = useState(false);
  const [autoAssignBranch, setAutoAssignBranch] = useState(true);
  const [collectionMode, setCollectionMode] = useState<'mapped' | 'centralized'>('mapped');
  const [centralizedGroupId, setCentralizedGroupId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mappings state - local copy that we modify
  const [localMappings, setLocalMappings] = useState<GroupMapping[]>([]);

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

  // Fetch LINE groups
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['line-groups-for-receipts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('id, line_group_id, display_name')
        .order('display_name');
      if (error) throw error;
      return (data || []) as LineGroup[];
    },
  });

  // Fetch branches
  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['branches-for-receipts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return (data || []) as Branch[];
    },
  });

  // Fetch existing mappings
  const { data: existingMappings = [], isLoading: mappingsLoading } = useQuery({
    queryKey: ['receipt-group-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_group_mappings')
        .select('id, group_id, branch_id, is_enabled')
        .order('created_at');
      if (error) throw error;
      return (data || []) as GroupMapping[];
    },
  });

  // Initialize local state from settings
  useEffect(() => {
    if (settings) {
      const enabledSetting = settings.find(s => s.setting_key === 'system_enabled');
      const requireSetting = settings.find(s => s.setting_key === 'require_business');
      const autoAssignSetting = settings.find(s => s.setting_key === 'auto_assign_branch');
      const modeSetting = settings.find(s => s.setting_key === 'collection_mode');

      if (enabledSetting) {
        setSystemEnabled((enabledSetting.setting_value as { enabled?: boolean }).enabled ?? true);
      }
      if (requireSetting) {
        setRequireBusiness((requireSetting.setting_value as { enabled?: boolean }).enabled ?? false);
      }
      if (autoAssignSetting) {
        setAutoAssignBranch((autoAssignSetting.setting_value as { enabled?: boolean }).enabled ?? true);
      }
      if (modeSetting) {
        const modeValue = modeSetting.setting_value as { mode?: string; centralized_group_id?: string | null };
        setCollectionMode((modeValue.mode as 'mapped' | 'centralized') ?? 'mapped');
        setCentralizedGroupId(modeValue.centralized_group_id ?? null);
      }
    }
  }, [settings]);

  // Initialize local mappings from DB
  useEffect(() => {
    if (existingMappings) {
      setLocalMappings(existingMappings);
    }
  }, [existingMappings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Save general settings
      const updates = [
        { key: 'system_enabled', value: { enabled: systemEnabled } },
        { key: 'require_business', value: { enabled: requireBusiness } },
        { key: 'auto_assign_branch', value: { enabled: autoAssignBranch } },
        { key: 'collection_mode', value: { mode: collectionMode, centralized_group_id: centralizedGroupId } },
      ];

      for (const { key, value } of updates) {
        const { error } = await supabase
          .from('receipt_settings')
          .update({ setting_value: value })
          .eq('setting_key', key);
        if (error) throw error;
      }

      // Sync mappings - delete removed, update existing, insert new
      const existingIds = existingMappings.map(m => m.id).filter(Boolean);
      const localIds = localMappings.map(m => m.id).filter(Boolean);
      
      // Delete removed mappings
      const toDelete = existingIds.filter(id => !localIds.includes(id));
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('receipt_group_mappings')
          .delete()
          .in('id', toDelete);
        if (error) throw error;
      }

      // Upsert all local mappings
      for (const mapping of localMappings) {
        if (mapping.id) {
          // Update existing
          const { error } = await supabase
            .from('receipt_group_mappings')
            .update({
              branch_id: mapping.branch_id,
              is_enabled: mapping.is_enabled,
            })
            .eq('id', mapping.id);
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from('receipt_group_mappings')
            .insert({
              group_id: mapping.group_id,
              branch_id: mapping.branch_id,
              is_enabled: mapping.is_enabled,
            });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success('Settings saved successfully');
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['receipt-settings'] });
      queryClient.invalidateQueries({ queryKey: ['receipt-group-mappings'] });
    },
    onError: (error) => {
      toast.error('Failed to save settings: ' + error.message);
    },
  });

  // Mapping handlers
  const toggleMappingEnabled = (groupId: string, enabled: boolean) => {
    setLocalMappings(prev => 
      prev.map(m => m.group_id === groupId ? { ...m, is_enabled: enabled } : m)
    );
    setHasChanges(true);
  };

  const updateMappingBranch = (groupId: string, branchId: string | null) => {
    setLocalMappings(prev => 
      prev.map(m => m.group_id === groupId ? { ...m, branch_id: branchId } : m)
    );
    setHasChanges(true);
  };

  const addGroupMapping = (groupId: string) => {
    const exists = localMappings.some(m => m.group_id === groupId);
    if (exists) {
      toast.error('This group is already added');
      return;
    }
    setLocalMappings(prev => [
      ...prev,
      { group_id: groupId, branch_id: null, is_enabled: true }
    ]);
    setHasChanges(true);
  };

  const removeGroupMapping = (groupId: string) => {
    setLocalMappings(prev => prev.filter(m => m.group_id !== groupId));
    setHasChanges(true);
  };

  const enableAllGroups = () => {
    // Add all groups that aren't already in mappings
    const existingGroupIds = new Set(localMappings.map(m => m.group_id));
    const newMappings = groups
      .filter(g => !existingGroupIds.has(g.id))
      .map(g => ({ group_id: g.id, branch_id: null, is_enabled: true }));
    
    setLocalMappings(prev => [...prev, ...newMappings]);
    setHasChanges(true);
  };

  const disableAllGroups = () => {
    setLocalMappings([]);
    setHasChanges(true);
  };

  // Helper functions
  const getGroupById = (id: string) => groups.find(g => g.id === id);
  const getBranchById = (id: string | null) => id ? branches.find(b => b.id === id) : null;

  const isLoading = settingsLoading || groupsLoading || branchesLoading || mappingsLoading;

  // Filter groups for search
  const filteredGroups = groups.filter(g => 
    g.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.line_group_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Groups that are mapped
  const mappedGroupIds = new Set(localMappings.map(m => m.group_id));
  const enabledCount = localMappings.filter(m => m.is_enabled).length;

  // Groups not yet added
  const unmappedGroups = filteredGroups.filter(g => !mappedGroupIds.has(g.id));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

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
              Configure receipt system and group-to-branch mapping
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

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-assign-branch">Auto-assign Branch</Label>
              <p className="text-sm text-muted-foreground">
                Automatically assign receipts to branches based on the mapping below
              </p>
            </div>
            <Switch
              id="auto-assign-branch"
              checked={autoAssignBranch}
              onCheckedChange={(checked) => {
                setAutoAssignBranch(checked);
                setHasChanges(true);
              }}
              disabled={collectionMode === 'centralized'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Collection Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Collection Mode
          </CardTitle>
          <CardDescription>
            Choose how receipts are collected from LINE groups
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={collectionMode}
            onValueChange={(value: 'mapped' | 'centralized') => {
              setCollectionMode(value);
              setHasChanges(true);
            }}
          >
            <div className="flex items-start space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
              <RadioGroupItem value="mapped" id="mode-mapped" className="mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="mode-mapped" className="font-medium cursor-pointer">
                  Mapped Mode (Per-Group Branch)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Each LINE group maps to a specific branch. Receipts are automatically tagged with the branch.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
              <RadioGroupItem value="centralized" id="mode-centralized" className="mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="mode-centralized" className="font-medium cursor-pointer">
                  Centralized Mode (Single Group)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Use one LINE group for all receipts. No automatic branch tagging.
                </p>
              </div>
            </div>
          </RadioGroup>

          {collectionMode === 'centralized' && (
            <div className="space-y-3 pt-2">
              <Label>Select Centralized Group</Label>
              <Select
                value={centralizedGroupId || 'none'}
                onValueChange={(val) => {
                  setCentralizedGroupId(val === 'none' ? null : val);
                  setHasChanges(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a group for receipts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Select a group...</span>
                  </SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3 w-3" />
                        {g.display_name || 'Unnamed Group'}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Note:</strong> In centralized mode, receipts will NOT have branch information. 
                  All receipts will be collected without automatic branch assignment.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Group to Branch Mapping - only show in mapped mode */}
      {collectionMode === 'mapped' && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Group to Branch Mapping
          </CardTitle>
          <CardDescription>
            Map LINE groups to branches for receipt auto-assignment ({enabledCount} enabled)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Actions Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={enableAllGroups}>
              <Plus className="h-4 w-4 mr-1" />
              Add All Groups
            </Button>
            <Button variant="outline" size="sm" onClick={disableAllGroups}>
              <X className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>

          {/* Mapped Groups */}
          <div className="border rounded-lg divide-y max-h-[500px] overflow-y-auto">
            {localMappings.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No groups configured for receipt submission</p>
                <p className="text-sm mt-1">Add groups below to enable them</p>
              </div>
            ) : (
              localMappings.map((mapping) => {
                const group = getGroupById(mapping.group_id);
                const branch = getBranchById(mapping.branch_id);
                if (!group) return null;

                return (
                  <div
                    key={mapping.group_id}
                    className={`p-4 ${mapping.is_enabled ? 'bg-background' : 'bg-muted/30'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={mapping.is_enabled}
                            onCheckedChange={(checked) => toggleMappingEnabled(mapping.group_id, checked)}
                          />
                          <span className={`font-medium truncate ${!mapping.is_enabled ? 'text-muted-foreground' : ''}`}>
                            {group.display_name || 'Unnamed Group'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 ml-11 truncate">
                          {group.line_group_id}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Select
                          value={mapping.branch_id || 'none'}
                          onValueChange={(val) => updateMappingBranch(mapping.group_id, val === 'none' ? null : val)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-muted-foreground">No branch</span>
                            </SelectItem>
                            {branches.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-3 w-3" />
                                  {b.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeGroupMapping(mapping.group_id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {branch && mapping.is_enabled && (
                      <div className="mt-2 ml-11">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          <Building2 className="h-3 w-3 mr-1" />
                          {branch.name}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Add Group */}
          {unmappedGroups.length > 0 && (
            <div className="space-y-2">
              <Label>Add Group</Label>
              <Select onValueChange={(val) => addGroupMapping(val)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a group to add..." />
                </SelectTrigger>
                <SelectContent>
                  {unmappedGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3 w-3" />
                        {g.display_name || 'Unnamed Group'}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Status Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {systemEnabled ? (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
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
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['receipt-settings'] });
                queryClient.invalidateQueries({ queryKey: ['receipt-group-mappings'] });
              }}
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
