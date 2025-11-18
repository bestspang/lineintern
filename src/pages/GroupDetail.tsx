import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

export default function GroupDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('');
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  const { data: group, isLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      setMode(data.mode);
      setFeatures((data.features as Record<string, boolean>) || {});
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase
        .from('groups')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      toast({ title: 'Group updated successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update group',
        description: error.message,
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ mode, features });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!group) {
    return <div>Group not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{group.display_name}</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            LINE ID: {group.line_group_id}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(group.line_group_id)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </p>
        </div>
        <Badge>{group.status}</Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Group Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p className="font-medium">{group.status}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Members</Label>
                  <p className="font-medium">{group.member_count || 0}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Joined</Label>
                  <p className="font-medium">
                    {formatDistanceToNow(new Date(group.joined_at), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Last Activity</Label>
                  <p className="font-medium">
                    {group.last_activity_at
                      ? formatDistanceToNow(new Date(group.last_activity_at), { addSuffix: true })
                      : 'Never'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger>
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
                <Label>Features</Label>
                <div className="space-y-2">
                  {['summary', 'faq', 'todos', 'reports', 'safety'].map((feature) => (
                    <div key={feature} className="flex items-center space-x-2">
                      <Checkbox
                        id={feature}
                        checked={features[feature] || false}
                        onCheckedChange={(checked) =>
                          setFeatures({ ...features, [feature]: !!checked })
                        }
                      />
                      <Label htmlFor={feature} className="capitalize cursor-pointer">
                        {feature}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle>Recent Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">No messages to display</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>Tasks & Reminders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">No tasks to display</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">No knowledge items to display</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">No alerts to display</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
