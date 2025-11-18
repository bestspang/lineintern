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

export default function Settings() {
  const { toast } = useToast();
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
      toast({ title: 'Settings updated successfully' });
    },
    onError: (error: any) => {
      toast({
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Global bot configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Configure global bot behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="env">Environment Name</Label>
            <Input
              id="env"
              value={environmentName}
              onChange={(e) => setEnvironmentName(e.target.value)}
              placeholder="e.g., Sandbox, Production"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mode">Default Mode for New Groups</Label>
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
            <Label htmlFor="lang">Default Language</Label>
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
            <Label htmlFor="model">OpenAI Model</Label>
            <Input
              id="model"
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              placeholder="e.g., gpt-4, gpt-3.5-turbo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max">Max Messages for Summaries</Label>
            <Input
              id="max"
              type="number"
              value={maxSummaryMessages}
              onChange={(e) => setMaxSummaryMessages(e.target.value)}
              placeholder="100"
            />
          </div>

          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin Accounts</CardTitle>
          <CardDescription>Manage dashboard access</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Admin management coming soon. Use authentication to control access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
