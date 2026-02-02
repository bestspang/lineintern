import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MessageSquare, PanelRightClose, PanelRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { ConversationList, ConversationItem } from '@/components/dm/ConversationList';
import { ChatPanel } from '@/components/dm/ChatPanel';
import { EmployeeInfoCard } from '@/components/dm/EmployeeInfoCard';
import { EmployeeNotes } from '@/components/dm/EmployeeNotes';

export default function DirectMessages() {
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel('dm-all-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fetch DM conversations
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['dm-conversations'],
    queryFn: async () => {
      // Get all groups that are DMs (line_group_id starts with 'dm_U...')
      const { data: groups, error } = await supabase
        .from('groups')
        .select('id, line_group_id, display_name')
        .like('line_group_id', 'dm_%')
        .order('last_activity_at', { ascending: false });

      if (error) throw error;

      const dmConversations: ConversationItem[] = [];

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
          user_display_name: user?.display_name || group.display_name || 'ไม่ทราบชื่อ',
          user_avatar_url: user?.avatar_url || null,
          employee_id: employeeInfo?.employee_id || null,
          employee_name: employeeInfo?.employee_name || null,
          branch_name: employeeInfo?.branch_name || null,
          message_count: count || 0,
          last_message: lastMsg?.text?.substring(0, 50) || null,
          last_activity: lastMsg?.sent_at || null,
          line_user_id: lineUserId,
        });
      }

      return dmConversations;
    },
  });

  // Handle conversation selection
  const handleSelectConversation = (conversation: ConversationItem) => {
    setSelectedConversation(conversation);
  };

  // Mobile view - show list or chat
  if (isMobile) {
    return (
      <div className="h-[calc(100vh-120px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {selectedConversation && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedConversation(null)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                กลับ
              </Button>
            )}
            <h1 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {selectedConversation ? selectedConversation.user_display_name : 'แชท'}
            </h1>
          </div>
        </div>

        {/* Content */}
        {selectedConversation ? (
          <ChatPanel 
            conversation={selectedConversation} 
            onShowInfo={() => setShowInfoSheet(true)}
            showInfoButton={!!selectedConversation.employee_id}
          />
        ) : (
          <ConversationList
            conversations={conversations}
            selectedId={null}
            onSelect={handleSelectConversation}
            isLoading={isLoading}
          />
        )}

        {/* Mobile Info Sheet */}
        <Sheet open={showInfoSheet} onOpenChange={setShowInfoSheet}>
          <SheetContent side="bottom" className="h-[75vh]">
            <SheetHeader>
              <SheetTitle>ข้อมูลและบันทึก</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100%-60px)] mt-4">
              <EmployeeInfoCard conversation={selectedConversation} />
              <EmployeeNotes conversation={selectedConversation} />
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // Desktop view - 3 columns
  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            แชท
          </h1>
          <p className="text-muted-foreground text-sm">
            สนทนากับผู้ใช้ LINE พร้อมบันทึกข้อมูลพนักงาน
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowInfoPanel(!showInfoPanel)}
          className="gap-2"
        >
          {showInfoPanel ? (
            <><PanelRightClose className="h-4 w-4" /> ซ่อนข้อมูล</>
          ) : (
            <><PanelRight className="h-4 w-4" /> แสดงข้อมูล</>
          )}
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Conversation list */}
        <div className="w-80 shrink-0 border-r">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?.id || null}
            onSelect={handleSelectConversation}
            isLoading={isLoading}
          />
        </div>

        {/* Center: Chat panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatPanel conversation={selectedConversation} />
        </div>

        {/* Right: Info panel */}
        {showInfoPanel && (
          <div 
            className={cn(
              "w-80 shrink-0 border-l bg-muted/30 overflow-hidden transition-all",
              selectedConversation ? "opacity-100" : "opacity-50"
            )}
          >
            <ScrollArea className="h-full">
              <EmployeeInfoCard conversation={selectedConversation} />
              <EmployeeNotes conversation={selectedConversation} />
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
