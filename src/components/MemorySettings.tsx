import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Settings, RefreshCw, RotateCcw } from 'lucide-react';

export function MemorySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Global settings state
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [maxItemsPerUser, setMaxItemsPerUser] = useState(50);
  const [maxItemsPerGroup, setMaxItemsPerGroup] = useState(100);
  const [consolidationFrequency, setConsolidationFrequency] = useState(24);
  const [autoDecayEnabled, setAutoDecayEnabled] = useState(false);
  const [decayThreshold, setDecayThreshold] = useState(90);
  const [passiveLearningEnabled, setPassiveLearningEnabled] = useState(false);
  
  // Group-specific settings
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  
  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .order('display_name');
      if (error) throw error;
      return data;
    },
  });
  
  // Fetch global settings
  const { data: globalSettings } = useQuery({
    queryKey: ['memory-settings-global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memory_settings')
        .select('*')
        .eq('scope', 'global')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  
  // Update state when settings are loaded
  useEffect(() => {
    if (globalSettings) {
      setMemoryEnabled(globalSettings.memory_enabled ?? true);
      setMaxItemsPerUser(globalSettings.max_items_per_user ?? 50);
      setMaxItemsPerGroup(globalSettings.max_items_per_group ?? 100);
      setAutoDecayEnabled(globalSettings.auto_decay_enabled ?? false);
      setDecayThreshold(globalSettings.decay_threshold_days ?? 90);
      setPassiveLearningEnabled(globalSettings.passive_learning_enabled ?? false);
    }
  }, [globalSettings]);
  
  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: any) => {
      if (globalSettings?.id) {
        const { error } = await supabase
          .from('memory_settings')
          .update(settings)
          .eq('id', globalSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('memory_settings')
          .insert({ ...settings, scope: 'global' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-settings-global'] });
      toast({ title: 'Settings saved successfully' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error saving settings', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    },
  });
  
  // Trigger consolidation mutation
  const triggerConsolidationMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('memory-consolidator', {
        body: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Memory consolidation triggered', description: 'Working memories will be processed shortly' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error triggering consolidation', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    },
  });
  
  const handleSaveSettings = () => {
    saveSettingsMutation.mutate({
      memory_enabled: memoryEnabled,
      max_items_per_user: maxItemsPerUser,
      max_items_per_group: maxItemsPerGroup,
      auto_decay_enabled: autoDecayEnabled,
      decay_threshold_days: decayThreshold,
      passive_learning_enabled: passiveLearningEnabled,
    });
  };
  
  const handleResetDefaults = () => {
    setMemoryEnabled(true);
    setMaxItemsPerUser(50);
    setMaxItemsPerGroup(100);
    setConsolidationFrequency(24);
    setAutoDecayEnabled(false);
    setDecayThreshold(90);
    setPassiveLearningEnabled(false);
    toast({ title: 'Settings reset to defaults' });
  };
  
  return (
    <div className="space-y-6">
      {/* Global Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Global Memory Settings
          </CardTitle>
          <CardDescription>
            Configure default memory behavior for all groups and users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Memory Enabled Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Memory System Enabled</Label>
                <p className="text-sm text-muted-foreground">
                  Enable or disable the entire memory system
                </p>
              </div>
              <Switch 
                checked={memoryEnabled} 
                onCheckedChange={setMemoryEnabled} 
              />
            </div>
            
            {/* Max Items Per User */}
            <div className="space-y-2">
              <Label>Max Items Per User</Label>
              <Input 
                type="number" 
                min="1"
                max="500"
                value={maxItemsPerUser} 
                onChange={(e) => setMaxItemsPerUser(parseInt(e.target.value) || 50)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of memories stored per user (default: 50)
              </p>
            </div>
            
            {/* Max Items Per Group */}
            <div className="space-y-2">
              <Label>Max Items Per Group</Label>
              <Input 
                type="number" 
                min="1"
                max="1000"
                value={maxItemsPerGroup} 
                onChange={(e) => setMaxItemsPerGroup(parseInt(e.target.value) || 100)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of memories stored per group (default: 100)
              </p>
            </div>
            
            {/* Consolidation Frequency */}
            <div className="space-y-2">
              <Label>Consolidation Frequency (hours)</Label>
              <Input 
                type="number" 
                min="1"
                max="168"
                value={consolidationFrequency} 
                onChange={(e) => setConsolidationFrequency(parseInt(e.target.value) || 24)}
                disabled
              />
              <p className="text-xs text-muted-foreground">
                How often to convert short-term to long-term memory (configured via cron job)
              </p>
            </div>
            
            {/* Auto-Decay Settings */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Auto-Decay Enabled</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically weaken unused memories over time
                </p>
              </div>
              <Switch 
                checked={autoDecayEnabled} 
                onCheckedChange={setAutoDecayEnabled} 
              />
            </div>
            
            <div className="space-y-2">
              <Label>Decay Threshold (days)</Label>
              <Input 
                type="number" 
                min="1"
                max="365"
                value={decayThreshold} 
                onChange={(e) => setDecayThreshold(parseInt(e.target.value) || 90)}
              />
              <p className="text-xs text-muted-foreground">
                Memories unused for this long will start to decay (default: 90 days)
              </p>
            </div>
            
            {/* Passive Learning */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Passive Learning Enabled</Label>
                <p className="text-sm text-muted-foreground">
                  Learn from all messages, not just when bot is mentioned
                </p>
              </div>
              <Switch 
                checked={passiveLearningEnabled} 
                onCheckedChange={setPassiveLearningEnabled} 
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button onClick={handleSaveSettings} disabled={saveSettingsMutation.isPending}>
            {saveSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
          <Button variant="outline" onClick={handleResetDefaults}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Defaults
          </Button>
        </CardFooter>
      </Card>
      
      {/* Group-Specific Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Group-Specific Settings</CardTitle>
          <CardDescription>
            Override global settings for specific groups (coming soon)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger>
              <SelectValue placeholder="Select a group..." />
            </SelectTrigger>
            <SelectContent>
              {groups?.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedGroup && (
            <div className="mt-4 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
              Group-specific overrides will be available in a future update
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Manual Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Actions</CardTitle>
          <CardDescription>
            Trigger memory operations manually
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="text-base">Consolidate Memories Now</Label>
                <p className="text-sm text-muted-foreground">
                  Manually trigger memory consolidation (normally runs automatically every 24h)
                </p>
              </div>
              <Button 
                onClick={() => triggerConsolidationMutation.mutate()}
                disabled={triggerConsolidationMutation.isPending}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${triggerConsolidationMutation.isPending ? 'animate-spin' : ''}`} />
                Consolidate Now
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
