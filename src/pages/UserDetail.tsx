import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowLeft, MessageSquare, Users, Star, Building2, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface GroupWithMembership {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  mode: string;
  line_group_id: string | null;
  role?: string;
  joined_at?: string;
  source: 'member' | 'messages';
  branch?: {
    id: string;
    name: string;
  } | null;
}

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddGroupDialog, setShowAddGroupDialog] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Fetch user details with primary_group_id
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*, primary_group:primary_group_id(id, display_name)')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) throw new Error('User not found');
      return data;
    },
    enabled: !!id,
  });

  // Fetch groups user is member of (from group_members)
  const { data: memberGroups } = useQuery({
    queryKey: ['user-member-groups', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select(`
          group_id,
          role,
          joined_at,
          groups:group_id (
            id,
            display_name,
            avatar_url,
            status,
            mode,
            line_group_id
          )
        `)
        .eq('user_id', id)
        .is('left_at', null);
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch groups user has sent messages to (even if not in group_members)
  const { data: messageGroups } = useQuery({
    queryKey: ['user-message-groups', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          group_id,
          groups:group_id (
            id,
            display_name,
            avatar_url,
            status,
            mode,
            line_group_id
          )
        `)
        .eq('user_id', id)
        .eq('direction', 'human')
        .order('sent_at', { ascending: false });
      
      if (error) throw error;
      
      // Get unique groups
      const uniqueGroups = new Map();
      data?.forEach((msg: any) => {
        if (msg.groups && !uniqueGroups.has(msg.groups.id)) {
          uniqueGroups.set(msg.groups.id, msg.groups);
        }
      });
      
      return Array.from(uniqueGroups.values());
    },
    enabled: !!id,
  });

  // Fetch branches to map line_group_id → branch
  const { data: branches } = useQuery({
    queryKey: ['branches-for-mapping'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, line_group_id')
        .not('line_group_id', 'is', null);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all groups for "Add to Group" dialog
  const { data: allAvailableGroups } = useQuery({
    queryKey: ['all-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('id, display_name, status')
        .eq('status', 'active')
        .order('display_name');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Merge groups from both sources
  const allGroups: GroupWithMembership[] = [];
  const groupIds = new Set<string>();

  // Add groups from group_members first
  memberGroups?.forEach((membership: any) => {
    const group = membership.groups;
    if (group && !groupIds.has(group.id)) {
      groupIds.add(group.id);
      
      // Find matching branch
      const matchingBranch = branches?.find(b => b.line_group_id === group.line_group_id);
      
      allGroups.push({
        ...group,
        role: membership.role,
        joined_at: membership.joined_at,
        source: 'member' as const,
        branch: matchingBranch ? { id: matchingBranch.id, name: matchingBranch.name } : null,
      });
    }
  });

  // Add groups from messages if not already in list
  messageGroups?.forEach((group: any) => {
    if (!groupIds.has(group.id)) {
      groupIds.add(group.id);
      
      // Find matching branch
      const matchingBranch = branches?.find(b => b.line_group_id === group.line_group_id);
      
      allGroups.push({
        ...group,
        source: 'messages' as const,
        branch: matchingBranch ? { id: matchingBranch.id, name: matchingBranch.name } : null,
      });
    }
  });

  // Sort: primary group first, then by source (member before messages), then by name
  const sortedGroups = allGroups.sort((a, b) => {
    // Primary group first
    if (user?.primary_group_id === a.id) return -1;
    if (user?.primary_group_id === b.id) return 1;
    
    // Branch groups before non-branch groups
    if (a.branch && !b.branch) return -1;
    if (!a.branch && b.branch) return 1;
    
    // Members before message-only
    if (a.source === 'member' && b.source === 'messages') return -1;
    if (a.source === 'messages' && b.source === 'member') return 1;
    
    return a.display_name.localeCompare(b.display_name);
  });

  const groupsLoading = !memberGroups && !messageGroups;

  // Mutation to set primary group
  const setPrimaryGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from('users')
        .update({ primary_group_id: groupId })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', id] });
      toast.success('Primary group updated');
    },
    onError: (error) => {
      toast.error('Failed to update primary group');
      console.error(error);
    },
  });

  // Mutation to add user to group
  const addToGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from('group_members')
        .insert({
          user_id: id,
          group_id: groupId,
          role: 'member',
          joined_at: new Date().toISOString(),
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-member-groups', id] });
      setShowAddGroupDialog(false);
      setSelectedGroupId('');
      toast.success('User added to group');
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('User is already in this group');
      } else {
        toast.error('Failed to add user to group');
      }
      console.error(error);
    },
  });

  // Filter out groups user is already in
  const groupsNotIn = allAvailableGroups?.filter(
    (g) => !groupIds.has(g.id)
  ) || [];

  // Fetch recent messages
  const { data: recentMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ['user-messages', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          text,
          sent_at,
          direction,
          command_type,
          groups:group_id (display_name)
        `)
        .eq('user_id', id)
        .order('sent_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (userLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            User not found
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* User Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {user.display_name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-2xl font-bold">{user.display_name}</h2>
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  LINE ID: {user.line_user_id}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <p className="text-sm text-muted-foreground">Language</p>
                  <p className="font-medium">{user.primary_language || 'Auto'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Seen</p>
                  <p className="font-medium">
                    {user.last_seen_at
                      ? formatDistanceToNow(new Date(user.last_seen_at), { addSuffix: true })
                      : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Primary Group</p>
                  <p className="font-medium">
                    {(user as any).primary_group?.display_name || 
                     <span className="text-muted-foreground italic">Not set</span>}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Groups Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle>Groups</CardTitle>
            </div>
            <Dialog open={showAddGroupDialog} onOpenChange={setShowAddGroupDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Group
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add User to Group</DialogTitle>
                  <DialogDescription>
                    เลือก group ที่ต้องการเพิ่ม {user.display_name} เข้าไป
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Select Group</Label>
                    <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                      <SelectTrigger>
                        <SelectValue placeholder="เลือก group..." />
                      </SelectTrigger>
                      <SelectContent>
                        {groupsNotIn.length > 0 ? (
                          groupsNotIn.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.display_name}
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                            User อยู่ใน group ทั้งหมดแล้ว
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddGroupDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => selectedGroupId && addToGroupMutation.mutate(selectedGroupId)}
                    disabled={!selectedGroupId || addToGroupMutation.isPending}
                  >
                    {addToGroupMutation.isPending ? 'Adding...' : 'Add to Group'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>
            All groups where this user is a member or has sent messages ({sortedGroups.length} groups)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groupsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : sortedGroups.length > 0 ? (
            <div className="space-y-3">
              {sortedGroups.map((group) => {
                const isPrimary = user.primary_group_id === group.id;
                
                return (
                  <div
                    key={group.id}
                    className={`flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors ${
                      isPrimary ? 'ring-2 ring-primary/50 bg-primary/5' : ''
                    }`}
                  >
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => navigate(`/groups/${group.id}`)}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={group.avatar_url || undefined} />
                        <AvatarFallback>
                          {group.display_name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{group.display_name}</p>
                          {isPrimary && (
                            <Badge variant="default" className="gap-1 shrink-0">
                              <Star className="h-3 w-3" />
                              Primary
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {group.branch && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {group.branch.name}
                            </span>
                          )}
                          {group.joined_at && (
                            <span>
                              Joined {formatDistanceToNow(new Date(group.joined_at), { addSuffix: true })}
                            </span>
                          )}
                          {group.source === 'messages' && (
                            <span className="italic">(from messages only)</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{group.mode}</Badge>
                      {group.role && (
                        <Badge variant="outline">{group.role}</Badge>
                      )}
                      {!isPrimary && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrimaryGroupMutation.mutate(group.id);
                          }}
                          disabled={setPrimaryGroupMutation.isPending}
                          title="Set as primary group"
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">
              Not a member of any groups
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Messages Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <CardTitle>Recent Messages</CardTitle>
          </div>
          <CardDescription>
            Last 10 messages from this user
          </CardDescription>
        </CardHeader>
        <CardContent>
          {messagesLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : recentMessages && recentMessages.length > 0 ? (
            <div className="space-y-3">
              {recentMessages.map((message: any) => (
                <div
                  key={message.id}
                  className="p-3 rounded-lg border bg-card space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {message.groups?.display_name || 'DM'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(message.sent_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm line-clamp-2">{message.text}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {message.direction}
                    </Badge>
                    {message.command_type && (
                      <Badge variant="secondary" className="text-xs">
                        {message.command_type}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">
              No messages yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
