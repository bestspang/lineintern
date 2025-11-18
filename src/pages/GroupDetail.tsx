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

  const { data: messages } = useQuery({
    queryKey: ['messages', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          user:users(display_name, line_user_id)
        `)
        .eq('group_id', id)
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: members } = useQuery({
    queryKey: ['group-members', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select(`
          *,
          user:users(
            id,
            display_name,
            avatar_url,
            line_user_id,
            last_seen_at
          )
        `)
        .eq('group_id', id)
        .order('joined_at', { ascending: false });
      if (error) throw error;
      return data || [];
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
          <TabsTrigger value="members">Members</TabsTrigger>
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

        <TabsContent value="members" className="space-y-4">
          {/* Current Members Section */}
          <Card>
            <CardHeader>
              <CardTitle>
                Current Members ({members?.filter(m => !m.left_at).length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {members && members.filter(m => !m.left_at).length > 0 ? (
                <div className="space-y-3">
                  {members
                    .filter(m => !m.left_at)
                    .map((member) => (
                      <div 
                        key={member.id} 
                        className="flex items-center justify-between p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {member.user?.avatar_url ? (
                              <img 
                                src={member.user.avatar_url} 
                                alt={member.user.display_name}
                                className="w-10 h-10 rounded-full"
                              />
                            ) : (
                              <span className="text-primary font-semibold">
                                {member.user?.display_name?.[0]?.toUpperCase() || '?'}
                              </span>
                            )}
                          </div>
                          
                          {/* User Info */}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {member.user?.display_name || 'Unknown User'}
                              </span>
                              {member.role && (
                                <Badge variant="secondary" className="text-xs">
                                  {member.role}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Joined {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        
                        {/* Last Seen */}
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {member.user?.last_seen_at ? (
                              <>
                                Last seen{' '}
                                {formatDistanceToNow(new Date(member.user.last_seen_at), { addSuffix: true })}
                              </>
                            ) : (
                              'Never seen'
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No current members</p>
              )}
            </CardContent>
          </Card>

          {/* Historical Members Section */}
          <Card>
            <CardHeader>
              <CardTitle>
                Historical Members ({members?.filter(m => m.left_at).length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {members && members.filter(m => m.left_at).length > 0 ? (
                <div className="space-y-3">
                  {members
                    .filter(m => m.left_at)
                    .map((member) => (
                      <div 
                        key={member.id} 
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 opacity-75"
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            {member.user?.avatar_url ? (
                              <img 
                                src={member.user.avatar_url} 
                                alt={member.user.display_name}
                                className="w-10 h-10 rounded-full grayscale"
                              />
                            ) : (
                              <span className="text-muted-foreground font-semibold">
                                {member.user?.display_name?.[0]?.toUpperCase() || '?'}
                              </span>
                            )}
                          </div>
                          
                          {/* User Info */}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-muted-foreground">
                                {member.user?.display_name || 'Unknown User'}
                              </span>
                              {member.role && (
                                <Badge variant="outline" className="text-xs">
                                  {member.role}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Member from{' '}
                              {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}{' '}
                              to{' '}
                              {formatDistanceToNow(new Date(member.left_at!), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        
                        {/* Left Badge */}
                        <Badge variant="secondary" className="text-xs">
                          Left
                        </Badge>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No historical members</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle>Recent Messages ({messages?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {messages && messages.length > 0 ? (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`p-3 rounded-lg ${
                        msg.direction === 'bot' 
                          ? 'bg-blue-50 border-l-4 border-blue-500' 
                          : 'bg-muted'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-sm">
                          {msg.direction === 'bot' ? '🤖 GoodLime' : msg.user?.display_name || 'User'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(msg.sent_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      {msg.command_type && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {msg.command_type}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No messages yet</p>
              )}
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
