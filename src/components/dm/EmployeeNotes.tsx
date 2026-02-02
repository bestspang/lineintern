import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogDescription, DialogFooter 
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { 
  StickyNote, Plus, Pin, PinOff, Pencil, Trash2, 
  AlertTriangle, CheckCircle, Clock, MessageSquare, Loader2 
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ConversationItem } from './ConversationList';
import { useAuth } from '@/contexts/AuthContext';

interface EmployeeNote {
  id: string;
  employee_id: string;
  created_by: string;
  content: string;
  category: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

const categoryConfig = {
  general: { label: 'ทั่วไป', icon: MessageSquare, color: 'bg-muted' },
  'follow-up': { label: 'ติดตาม', icon: Clock, color: 'bg-yellow-500/10 text-yellow-600' },
  warning: { label: 'เตือน', icon: AlertTriangle, color: 'bg-red-500/10 text-red-600' },
  resolved: { label: 'แก้ไขแล้ว', icon: CheckCircle, color: 'bg-green-500/10 text-green-600' },
};

interface EmployeeNotesProps {
  conversation: ConversationItem | null;
}

export function EmployeeNotes({ conversation }: EmployeeNotesProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<EmployeeNote | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<string>('general');

  // Fetch notes for employee
  const { data: notes, isLoading } = useQuery({
    queryKey: ['employee-notes', conversation?.employee_id],
    queryFn: async () => {
      if (!conversation?.employee_id) return [];
      
      const { data, error } = await supabase
        .from('employee_notes')
        .select('*')
        .eq('employee_id', conversation.employee_id)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as EmployeeNote[];
    },
    enabled: !!conversation?.employee_id,
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async ({ content, category }: { content: string; category: string }) => {
      if (!conversation?.employee_id || !user?.id) {
        throw new Error('Missing required data');
      }

      const { data, error } = await supabase
        .from('employee_notes')
        .insert({
          employee_id: conversation.employee_id,
          created_by: user.id,
          content,
          category,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-notes', conversation?.employee_id] });
      setIsAddDialogOpen(false);
      setNoteContent('');
      setNoteCategory('general');
      toast.success('เพิ่ม Note สำเร็จ');
    },
    onError: (error: any) => {
      toast.error(`เพิ่มไม่สำเร็จ: ${error.message}`);
    },
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: async ({ 
      id, content, category, is_pinned 
    }: { 
      id: string; content?: string; category?: string; is_pinned?: boolean 
    }) => {
      const updates: any = { updated_at: new Date().toISOString() };
      if (content !== undefined) updates.content = content;
      if (category !== undefined) updates.category = category;
      if (is_pinned !== undefined) updates.is_pinned = is_pinned;

      const { error } = await supabase
        .from('employee_notes')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-notes', conversation?.employee_id] });
      setEditingNote(null);
      setNoteContent('');
      setNoteCategory('general');
      toast.success('อัปเดตสำเร็จ');
    },
    onError: (error: any) => {
      toast.error(`อัปเดตไม่สำเร็จ: ${error.message}`);
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('employee_notes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-notes', conversation?.employee_id] });
      toast.success('ลบสำเร็จ');
    },
    onError: (error: any) => {
      toast.error(`ลบไม่สำเร็จ: ${error.message}`);
    },
  });

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    addNoteMutation.mutate({ content: noteContent.trim(), category: noteCategory });
  };

  const handleUpdateNote = () => {
    if (!editingNote || !noteContent.trim()) return;
    updateNoteMutation.mutate({ 
      id: editingNote.id, 
      content: noteContent.trim(), 
      category: noteCategory 
    });
  };

  const handleTogglePin = (note: EmployeeNote) => {
    updateNoteMutation.mutate({ id: note.id, is_pinned: !note.is_pinned });
  };

  const openEditDialog = (note: EmployeeNote) => {
    setEditingNote(note);
    setNoteContent(note.content);
    setNoteCategory(note.category);
  };

  if (!conversation?.employee_id) {
    return null;
  }

  return (
    <>
      <Card className="m-4 mt-0">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Notes
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsAddDialogOpen(true)}
              className="h-8"
            >
              <Plus className="h-4 w-4 mr-1" />
              เพิ่ม
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : notes?.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <StickyNote className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <p className="text-sm">ยังไม่มี Notes</p>
            </div>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {notes?.map((note) => {
                  const config = categoryConfig[note.category as keyof typeof categoryConfig] 
                    || categoryConfig.general;
                  const Icon = config.icon;
                  
                  return (
                    <div
                      key={note.id}
                      className={cn(
                        "p-3 rounded-lg border text-sm",
                        note.is_pinned && "border-primary/50 bg-primary/5"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <Badge variant="outline" className={cn("text-[10px]", config.color)}>
                          <Icon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {note.is_pinned && <Pin className="h-3 w-3 text-primary" />}
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(note.created_at), 'dd MMM', { locale: th })}
                          </span>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed">
                        {note.content}
                      </p>
                      {note.created_by === user?.id && (
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-xs"
                            onClick={() => handleTogglePin(note)}
                          >
                            {note.is_pinned ? (
                              <><PinOff className="h-3 w-3 mr-1" /> เลิกปักหมุด</>
                            ) : (
                              <><Pin className="h-3 w-3 mr-1" /> ปักหมุด</>
                            )}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-xs"
                            onClick={() => openEditDialog(note)}
                          >
                            <Pencil className="h-3 w-3 mr-1" /> แก้ไข
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => deleteNoteMutation.mutate(note.id)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> ลบ
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog 
        open={isAddDialogOpen || !!editingNote} 
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setEditingNote(null);
            setNoteContent('');
            setNoteCategory('general');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingNote ? 'แก้ไข Note' : 'เพิ่ม Note ใหม่'}
            </DialogTitle>
            <DialogDescription>
              บันทึกข้อมูลเกี่ยวกับพนักงาน {conversation?.employee_name || ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">หมวดหมู่</label>
              <Select value={noteCategory} onValueChange={setNoteCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">เนื้อหา</label>
              <Textarea
                placeholder="เขียน note..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsAddDialogOpen(false);
                setEditingNote(null);
              }}
            >
              ยกเลิก
            </Button>
            <Button 
              onClick={editingNote ? handleUpdateNote : handleAddNote}
              disabled={!noteContent.trim() || addNoteMutation.isPending || updateNoteMutation.isPending}
            >
              {(addNoteMutation.isPending || updateNoteMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingNote ? 'บันทึก' : 'เพิ่ม'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
