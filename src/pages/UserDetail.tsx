import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MessageSquare, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Fetch user details
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) throw new Error('User not found');
      return data;
    },
    enabled: !!id,
  });

  // Fetch groups user is member of
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['user-groups', id],
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
            mode
          )
        `)
        .eq('user_id', id)
        .is('left_at', null);
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

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
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="font-medium">
                    {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
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
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>Groups</CardTitle>
          </div>
          <CardDescription>
            Groups where this user is a member
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groupsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : groups && groups.length > 0 ? (
            <div className="space-y-3">
              {groups.map((membership: any) => {
                const group = membership.groups;
                if (!group) return null;
                
                return (
                  <div
                    key={membership.group_id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/groups/${group.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={group.avatar_url || undefined} />
                        <AvatarFallback>
                          {group.display_name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{group.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Joined {formatDistanceToNow(new Date(membership.joined_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{group.mode}</Badge>
                      {membership.role && (
                        <Badge variant="outline">{membership.role}</Badge>
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
