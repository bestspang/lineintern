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
import { Copy, Building2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

export default function GroupDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('');
  const [features, setFeatures] = useState<Record<string, boolean | string | null>>({});

  const { data: group, isLoading, error: groupError } = useQuery({
    queryKey: ['group', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      
      if (!data) {
        throw new Error('Group not found');
      }
      
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

  // Fetch branches for linking
  const { data: branches } = useQuery({
    queryKey: ['branches-for-group'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold truncate">{group.display_name}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
            <span className="truncate">LINE ID: {group.line_group_id}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0"
              onClick={() => copyToClipboard(group.line_group_id)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </p>
        </div>
        <Badge className="shrink-0">{group.status}</Badge>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="members" className="text-xs sm:text-sm">Members</TabsTrigger>
          <TabsTrigger value="messages" className="text-xs sm:text-sm">Messages</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs sm:text-sm hidden sm:inline-flex">Tasks</TabsTrigger>
          <TabsTrigger value="knowledge" className="text-xs sm:text-sm hidden md:inline-flex">Knowledge</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs sm:text-sm hidden md:inline-flex">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 sm:space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Group Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="text-xs sm:text-sm text-muted-foreground">Status</Label>
                  <p className="text-sm sm:text-base font-medium">{group.status}</p>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm text-muted-foreground">Members</Label>
                  <p className="text-sm sm:text-base font-medium">{group.member_count || 0}</p>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm text-muted-foreground">Joined</Label>
                  <p className="text-xs sm:text-sm font-medium">
                    {formatDistanceToNow(new Date(group.joined_at), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm text-muted-foreground">Last Activity</Label>
                  <p className="text-xs sm:text-sm font-medium">
                    {group.last_activity_at
                      ? formatDistanceToNow(new Date(group.last_activity_at), { addSuffix: true })
                      : 'Never'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="space-y-2">
                <Label className="text-sm">Mode</Label>
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
                <Label className="text-sm">Features</Label>
                <div className="space-y-2">
                  {['summary', 'faq', 'todos', 'reports', 'safety'].map((feature) => (
                    <div key={feature} className="flex items-center space-x-2">
                      <Checkbox
                        id={feature}
                        checked={!!features[feature]}
                        onCheckedChange={(checked) =>
                          setFeatures({ ...features, [feature]: !!checked })
                        }
                      />
                      <Label htmlFor={feature} className="text-sm capitalize cursor-pointer">
                        {feature}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  เชื่อมต่อกับสาขา (สำหรับใบฝากเงิน)
                </Label>
                <Select 
                  value={(features as any).branch_id || '__none__'} 
                  onValueChange={(value) => setFeatures({ ...features, branch_id: value === '__none__' ? null : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกสาขา..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">ไม่ระบุ</SelectItem>
                    {branches?.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  เมื่อเลือกสาขา: รูปใบฝากเงินที่ส่งในกลุ่มนี้จะถูกบันทึกเป็นการฝากของสาขาที่เลือก
                </p>
              </div>

              <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full sm:w-auto">
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-3 sm:space-y-4">
          {/* Current Members Section */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">
                Current Members ({members?.filter(m => !m.left_at).length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              {members && members.filter(m => !m.left_at).length > 0 ? (
                <div className="space-y-2 sm:space-y-3">
                  {members
                    .filter(m => !m.left_at)
                    .map((member) => (
                      <div 
                        key={member.id} 
                        className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          {/* Avatar */}
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            {member.user?.avatar_url ? (
                              <img 
                                src={member.user.avatar_url} 
                                alt={member.user.display_name}
                                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full"
                              />
                            ) : (
                              <span className="text-primary text-xs sm:text-sm font-semibold">
                                {member.user?.display_name?.[0]?.toUpperCase() || '?'}
                              </span>
                            )}
                          </div>
                          
                          {/* User Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm sm:text-base font-medium truncate">
                                {member.user?.display_name || 'Unknown User'}
                              </span>
                              {member.role && (
                                <Badge variant="secondary" className="text-[10px] sm:text-xs h-4 sm:h-5">
                                  {member.role}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                              Joined {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        
                        {/* Last Seen */}
                        <div className="text-right shrink-0 hidden sm:block">
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
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">
                Historical Members ({members?.filter(m => m.left_at).length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
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
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Recent Messages ({messages?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              {messages && messages.length > 0 ? (
                <div className="space-y-2 sm:space-y-3">
                  {messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`p-2 sm:p-3 rounded-lg ${
                        msg.direction === 'bot' 
                          ? 'bg-blue-50 dark:bg-blue-950 border-l-2 sm:border-l-4 border-blue-500' 
                          : 'bg-muted'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <span className="font-semibold text-xs sm:text-sm truncate">
                          {msg.direction === 'bot' ? '🤖 GoodLime' : msg.user?.display_name || 'User'}
                        </span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {formatDistanceToNow(new Date(msg.sent_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                      {msg.command_type && (
                        <Badge variant="outline" className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs h-4 sm:h-5">
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
