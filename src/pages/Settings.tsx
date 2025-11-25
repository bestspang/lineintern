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
import { getMapboxToken, setMapboxToken as saveMapboxToken, clearMapboxToken } from '@/lib/api-config';
import { toast } from 'sonner';

export default function Settings() {
  const { toast: showToast } = useToast();
  const queryClient = useQueryClient();
  const [environmentName, setEnvironmentName] = useState('');
  const [defaultMode, setDefaultMode] = useState<any>('');
  const [defaultLanguage, setDefaultLanguage] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');
  const [maxSummaryMessages, setMaxSummaryMessages] = useState('');
  const [mapboxToken, setMapboxToken] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .single();
      if (error) throw error;
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

  // Load Mapbox token
  useEffect(() => {
    getMapboxToken().then(token => {
      if (token) setMapboxToken(token);
    });
  }, []);

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

  const handleSaveMapboxToken = () => {
    if (mapboxToken.trim()) {
      saveMapboxToken(mapboxToken.trim());
      toast.success('Mapbox token updated successfully');
    }
  };

  const handleClearMapboxToken = () => {
    clearMapboxToken();
    setMapboxToken('');
    toast.info('Mapbox token cleared');
  };

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

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">API Configuration</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Manage external API keys and tokens</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="mapbox-token" className="text-sm">Mapbox Public Token</Label>
            <div className="flex gap-2">
              <Input
                id="mapbox-token"
                value={mapboxToken}
                onChange={(e) => setMapboxToken(e.target.value)}
                placeholder="pk.eyJ1..."
                className="font-mono text-xs flex-1"
              />
              <Button onClick={handleSaveMapboxToken} disabled={!mapboxToken.trim()}>
                Save
              </Button>
              <Button variant="outline" onClick={handleClearMapboxToken}>
                Clear
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used for: Map Picker, Location Heatmap. Get your token from{' '}
              <a
                href="https://account.mapbox.com/access-tokens/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Mapbox
              </a>
            </p>
          </div>
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
