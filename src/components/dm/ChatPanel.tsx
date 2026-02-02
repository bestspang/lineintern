import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Shield, Loader2, MessageSquare } from 'lucide-react';
import { formatBangkokDateTime } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ConversationItem } from './ConversationList';

interface Message {
  id: string;
  text: string;
  direction: string;
  sent_at: string;
  command_type: string | null;
}

interface ChatPanelProps {
  conversation: ConversationItem | null;
}

export function ChatPanel({ conversation }: ChatPanelProps) {
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch messages for selected conversation
  const { data: messages, isLoading } = useQuery({
    queryKey: ['dm-messages', conversation?.id],
    queryFn: async () => {
      if (!conversation) return [];
      
      const { data, error } = await supabase
        .from('messages')
        .select('id, text, direction, sent_at, command_type')
        .eq('group_id', conversation.id)
        .order('sent_at', { ascending: true })
        .limit(200);

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversation,
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!conversation) return;

    const channel = supabase
      .channel(`dm-chat-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `group_id=eq.${conversation.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dm-messages', conversation.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation, queryClient]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !conversation || isSending) return;

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('dm-send', {
        body: {
          line_user_id: conversation.line_user_id,
          message: messageInput.trim(),
          group_id: conversation.id
        }
      });

      if (error) throw error;
      
      if (data?.success) {
        setMessageInput('');
        toast.success('ส่งข้อความสำเร็จ');
        queryClient.invalidateQueries({ queryKey: ['dm-messages', conversation.id] });
        queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
      } else {
        throw new Error(data?.error || 'Failed to send message');
      }
    } catch (error: any) {
      console.error('Send message error:', error);
      toast.error(`ส่งไม่สำเร็จ: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getMessageStyle = (direction: string) => {
    switch (direction) {
      case 'bot_reply':
        return 'bg-muted text-foreground justify-start';
      case 'admin_reply':
        return 'bg-blue-500/10 text-foreground border border-blue-500/20 justify-start';
      default: // incoming from user
        return 'bg-primary text-primary-foreground justify-end';
    }
  };

  const getMessageIcon = (direction: string) => {
    switch (direction) {
      case 'bot_reply':
        return <Bot className="h-3 w-3" />;
      case 'admin_reply':
        return <Shield className="h-3 w-3 text-blue-500" />;
      default:
        return <User className="h-3 w-3" />;
    }
  };

  const getMessageLabel = (direction: string) => {
    switch (direction) {
      case 'bot_reply':
        return 'Bot';
      case 'admin_reply':
        return 'Admin';
      default:
        return 'User';
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">เลือกการสนทนา</p>
          <p className="text-sm">เลือกจากรายการทางซ้ายเพื่อเริ่มแชท</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Chat header */}
      <div className="p-4 border-b bg-background flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={conversation.user_avatar_url || undefined} />
          <AvatarFallback>
            {conversation.user_display_name?.substring(0, 2).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">
              {conversation.user_display_name || 'Unknown'}
            </h3>
            {conversation.employee_id && (
              <Badge variant="default" className="shrink-0">พนักงาน</Badge>
            )}
          </div>
          {conversation.branch_name && (
            <p className="text-xs text-muted-foreground">{conversation.branch_name}</p>
          )}
        </div>
        <Badge variant="outline">{messages?.length || 0} ข้อความ</Badge>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : messages?.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>ยังไม่มีข้อความ</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages?.map((msg) => {
              const isUserMessage = msg.direction === 'incoming';
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    isUserMessage ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2",
                      msg.direction === 'bot_reply' && "bg-muted",
                      msg.direction === 'admin_reply' && "bg-blue-500/10 border border-blue-500/20",
                      msg.direction === 'incoming' && "bg-primary text-primary-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {getMessageIcon(msg.direction)}
                      <span className="text-xs opacity-70">
                        {getMessageLabel(msg.direction)}
                      </span>
                      {msg.command_type && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
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
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="p-4 border-t bg-background">
        <div className="flex gap-2">
          <Textarea
            placeholder="พิมพ์ข้อความ... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[60px] resize-none"
            disabled={isSending}
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={!messageInput.trim() || isSending}
            className="h-auto px-6"
          >
            {isSending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
