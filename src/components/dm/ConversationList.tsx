import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Building, User, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface ConversationItem {
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
  line_user_id: string;
}

interface ConversationListProps {
  conversations: ConversationItem[];
  selectedId: string | null;
  onSelect: (conversation: ConversationItem) => void;
  isLoading: boolean;
}

export function ConversationList({ 
  conversations, 
  selectedId, 
  onSelect, 
  isLoading 
}: ConversationListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'employees' | 'non-employees'>('all');

  const filteredConversations = conversations.filter(conv => {
    // Search filter
    const matchesSearch = 
      conv.user_display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.branch_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.line_group_id.toLowerCase().includes(searchTerm.toLowerCase());

    // Employee filter
    if (filter === 'employees') {
      return matchesSearch && conv.employee_id;
    } else if (filter === 'non-employees') {
      return matchesSearch && !conv.employee_id;
    }
    return matchesSearch;
  });

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="flex flex-col h-full border-r">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chats
          </h2>
          <Badge variant="secondary">{conversations.length}</Badge>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาชื่อ, สาขา..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Filter tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-8">
            <TabsTrigger value="all" className="text-xs">ทั้งหมด</TabsTrigger>
            <TabsTrigger value="employees" className="text-xs">พนักงาน</TabsTrigger>
            <TabsTrigger value="non-employees" className="text-xs">อื่นๆ</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">ไม่พบการสนทนา</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={cn(
                  "w-full p-3 rounded-lg transition-colors text-left flex items-start gap-3",
                  selectedId === conv.id 
                    ? "bg-primary/10 border border-primary/20" 
                    : "hover:bg-muted/50"
                )}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={conv.user_avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(conv.user_display_name)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm truncate">
                      {conv.user_display_name || 'Unknown'}
                    </span>
                    {conv.employee_id ? (
                      <Badge variant="default" className="h-5 px-1.5 text-[10px] shrink-0">
                        <Building className="h-2.5 w-2.5 mr-0.5" />
                        {conv.branch_name?.substring(0, 6) || 'Staff'}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] shrink-0">
                        <User className="h-2.5 w-2.5" />
                      </Badge>
                    )}
                  </div>
                  
                  {conv.employee_name && conv.employee_name !== conv.user_display_name && (
                    <p className="text-xs text-muted-foreground truncate mb-0.5">
                      {conv.employee_name}
                    </p>
                  )}
                  
                  {conv.last_message && (
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.last_message}
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {conv.message_count}
                  </span>
                  {conv.last_activity && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(conv.last_activity), {
                        addSuffix: false,
                        locale: th,
                      })}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
