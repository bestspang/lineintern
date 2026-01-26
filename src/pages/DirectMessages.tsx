import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search, MessageSquare, User, Bot, Building, ArrowLeft, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { formatBangkokDateTime } from '@/lib/timezone';

interface DMConversation {
  id: string;
  line_group_id: string;
  user_id: string | null;
  user_display_name: string | null;
  user_avatar_url: string | null;
  employee_id: string | null;
  employee_name: string | null;
  branch_name: string | null;
  message_count: number;
  last_message: string | null;
  last_activity: string | null;
}

interface Message {
  id: string;
  text: string;
  direction: string;
  sent_at: string;
  command_type: string | null;
}

export default function DirectMessages() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'employees' | 'non-employees'>('all');
  const [selectedConversation, setSelectedConversation] = useState<DMConversation | null>(null);
  const queryClient = useQueryClient();

  // Realtime subscription for DM groups
  useEffect(() => {
    const channel = supabase
      .channel('dm-groups-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'groups',
          filter: 'line_group_id=like.dm_%'
        },
        (payload) => {
          console.log('DM group changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Realtime subscription for messages
  useEffect(() => {
    const channel = supabase
      .channel('dm-messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('New message:', payload);
          queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
          if (selectedConversation) {
            queryClient.invalidateQueries({ 
              queryKey: ['dm-messages', selectedConversation.id] 
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, selectedConversation]);

  // Fetch DM conversations (groups where line_group_id starts with 'dm_' for user DMs)
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['dm-conversations'],
    queryFn: async () => {
      // Get all groups that are DMs (line_group_id starts with 'dm_U...')
      const { data: groups, error } = await supabase
        .from('groups')
        .select('id, line_group_id, display_name')
        .like('line_group_id', 'dm_%')
        .order('last_activity_at', { ascending: false });

      if (error) throw error;

      // For each DM group, get user info and message stats
      const dmConversations: DMConversation[] = [];

      for (const group of groups || []) {
        // Extract LINE User ID by removing 'dm_' prefix
        const lineUserId = group.line_group_id.replace('dm_', '');
        
        // Find user by line_user_id
        const { data: user } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .eq('line_user_id', lineUserId)
          .maybeSingle();

        // Check if user is an employee
        let employeeInfo = null;
        const { data: employee } = await supabase
          .from('employees')
          .select('id, full_name, branch_id, branches!branch_id(name)')
          .eq('line_user_id', lineUserId)
          .eq('is_active', true)
          .maybeSingle();
        
        if (employee) {
          employeeInfo = {
            employee_id: employee.id,
            employee_name: employee.full_name,
            branch_name: (employee.branches as any)?.name || null
          };
        }

        // Get message count
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', group.id);

        // Get last message
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('text, sent_at')
          .eq('group_id', group.id)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        dmConversations.push({
          id: group.id,
          line_group_id: group.line_group_id,
          user_id: user?.id || null,
          user_display_name: user?.display_name || group.display_name || 'Unknown User',
          user_avatar_url: user?.avatar_url || null,
          employee_id: employeeInfo?.employee_id || null,
          employee_name: employeeInfo?.employee_name || null,
          branch_name: employeeInfo?.branch_name || null,
          message_count: count || 0,
          last_message: lastMsg?.text?.substring(0, 50) || null,
          last_activity: lastMsg?.sent_at || null,
        });
      }

      return dmConversations;
    },
  });

  // Fetch messages for selected conversation
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['dm-messages', selectedConversation?.id],
    queryFn: async () => {
      if (!selectedConversation) return [];
      
      const { data, error } = await supabase
        .from('messages')
        .select('id, text, direction, sent_at, command_type')
        .eq('group_id', selectedConversation.id)
        .order('sent_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!selectedConversation,
  });

  // Filter conversations
  const filteredConversations = conversations?.filter(conv => {
    // Search filter
    const matchesSearch = 
      conv.user_display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.line_group_id.toLowerCase().includes(searchTerm.toLowerCase());

    // Employee filter
    if (filter === 'employees') {
      return matchesSearch && conv.employee_id;
    } else if (filter === 'non-employees') {
      return matchesSearch && !conv.employee_id;
    }
    return matchesSearch;
  }) || [];

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Direct Messages
          </h1>
          <p className="text-muted-foreground">
            ดูข้อความที่ผู้ใช้ส่งมาหา Bot โดยตรง (DM)
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-3 py-1">
          {conversations?.length || 0} conversations
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาชื่อผู้ใช้ หรือ LINE ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
            <TabsTrigger value="employees">พนักงาน</TabsTrigger>
            <TabsTrigger value="non-employees">ไม่ใช่พนักงาน</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Conversations List */}
      <Card>
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
          <CardDescription>
            {filteredConversations.length} conversations found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>ไม่พบ DM conversations</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className="w-full p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left flex items-start gap-4"
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={conv.user_avatar_url || undefined} />
                      <AvatarFallback>{getInitials(conv.user_display_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">
                          {conv.user_display_name}
                        </span>
                        {conv.employee_id ? (
                          <Badge variant="default" className="shrink-0">
                            <Building className="h-3 w-3 mr-1" />
                            {conv.employee_name}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">
                            <User className="h-3 w-3 mr-1" />
                            ไม่ใช่พนักงาน
                          </Badge>
                        )}
                      </div>
                      {conv.branch_name && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {conv.branch_name}
                        </p>
                      )}
                      {conv.last_message && (
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.last_message}...
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className="mb-1">
                        {conv.message_count} msgs
                      </Badge>
                      {conv.last_activity && (
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(conv.last_activity), {
                            addSuffix: true,
                            locale: th,
                          })}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedConversation} onOpenChange={() => setSelectedConversation(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={selectedConversation?.user_avatar_url || undefined} />
                <AvatarFallback>{getInitials(selectedConversation?.user_display_name || null)}</AvatarFallback>
              </Avatar>
              <div>
                <span>{selectedConversation?.user_display_name}</span>
                {selectedConversation?.employee_name && (
                  <Badge variant="default" className="ml-2">
                    {selectedConversation.employee_name}
                  </Badge>
                )}
                <p className="text-xs text-muted-foreground font-normal">
                  {selectedConversation?.line_group_id}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              ประวัติข้อความ Direct Message
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[calc(80vh-140px)] pr-4">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-3 py-4">
                {messages?.slice().reverse().map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'bot_reply' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        msg.direction === 'bot_reply'
                          ? 'bg-muted text-foreground'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {msg.direction === 'bot_reply' ? (
                          <Bot className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        <span className="text-xs opacity-70">
                          {msg.direction === 'bot_reply' ? 'Bot' : 'User'}
                        </span>
                        {msg.command_type && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {msg.command_type}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                      <p className="text-[10px] opacity-50 mt-1 text-right">
                        {formatBangkokDateTime(msg.sent_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
