import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Building, UserX, MessageSquare, PanelRightClose, PanelRight } from 'lucide-react';
import { formatSmartTime } from '@/lib/timezone';
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
  showInfoPanel?: boolean;
  onToggleInfoPanel?: () => void;
}

export function ConversationList({ 
  conversations, 
  selectedId, 
  onSelect, 
  isLoading,
  showInfoPanel,
  onToggleInfoPanel
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
    <div className="flex flex-col h-full">
      {/* Compact Header */}
      <div className="p-3 border-b space-y-2">
        {/* Row 1: Title + Search + Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">แชท</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs tabular-nums">
              {conversations.length}
            </Badge>
          </div>
          
          {/* Compact search */}
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="ค้นหา..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-7 text-sm"
            />
          </div>
          
          {/* Toggle button (desktop only) */}
          {onToggleInfoPanel && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 shrink-0"
              onClick={onToggleInfoPanel}
            >
              {showInfoPanel ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRight className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Row 2: Filter tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-7">
            <TabsTrigger value="all" className="text-xs h-6">ทั้งหมด</TabsTrigger>
            <TabsTrigger value="employees" className="text-xs h-6">พนักงาน</TabsTrigger>
            <TabsTrigger value="non-employees" className="text-xs h-6">ภายนอก</TabsTrigger>
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
                      {conv.user_display_name || 'ไม่ทราบชื่อ'}
                    </span>
                    {conv.employee_id ? (
                      <Badge variant="default" className="h-5 px-1.5 text-[10px] shrink-0">
                        <Building className="h-2.5 w-2.5 mr-0.5" />
                        {conv.branch_name?.substring(0, 6) || 'พนง.'}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] shrink-0">
                        <UserX className="h-2.5 w-2.5 mr-0.5" />
                        ภายนอก
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

                <div className="text-right shrink-0 space-y-1">
                  <Badge variant="outline" className="text-[10px] tabular-nums px-1.5">
                    {conv.message_count} 💬
                  </Badge>
                  {conv.last_activity && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {formatSmartTime(conv.last_activity)}
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
