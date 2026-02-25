import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format, isSameDay, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { th, enUS } from "date-fns/locale";
import { Radio, Send, Clock, Users, FileText, History, Loader2, Plus, Trash2, Copy, Eye, Pause, Play, X, Check, Image, MessageSquare, CalendarDays, Pencil, Search, FileSearch } from "lucide-react";
import { getBangkokNow, formatBangkokDateTime, formatBangkokISODate, formatBangkokTimeShort, bangkokLocalToUTC } from "@/lib/timezone";
import { useLocale } from "@/contexts/LocaleContext";

type MessageType = "text" | "image" | "text_image";
type RecurrencePattern = "daily" | "every_3_days" | "weekly" | "monthly" | "yearly";

interface Broadcast {
  id: string;
  title: string;
  message_type: MessageType;
  content: string | null;
  image_url: string | null;
  status: string;
  scheduled_at: string | null;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  recurrence_end_date: string | null;
  next_run_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  message_type: MessageType;
  content: string | null;
  image_url: string | null;
  category: string;
  usage_count: number;
}

interface RecipientGroup {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
}

interface BroadcastLog {
  id: string;
  broadcast_id: string;
  recipient_id: string | null;
  recipient_name: string | null;
  line_id: string | null;
  delivery_status: string;
  error_message: string | null;
  sent_at: string | null;
  broadcast?: {
    id: string;
    title: string;
  };
}

export default function Broadcast() {
  const queryClient = useQueryClient();
  const { locale, setLocale, t } = useLocale();
  const [activeTab, setActiveTab] = useState("create");
  
  // Create form state
  const [title, setTitle] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("text");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("daily");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  
  // Recipient selection
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedRecipientGroups, setSelectedRecipientGroups] = useState<string[]>([]);
  
  // Dialogs
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [recipientGroupDialogOpen, setRecipientGroupDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  
  const [sending, setSending] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(getBangkokNow());
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBroadcast, setEditingBroadcast] = useState<Broadcast | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editMessageType, setEditMessageType] = useState<MessageType>("text");

  // Employee filter state
  const [filterBranchId, setFilterBranchId] = useState<string>("all");
  const [filterRoleId, setFilterRoleId] = useState<string>("all");

  // Logs state
  const [logSearchTerm, setLogSearchTerm] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState<"all" | "sent" | "failed" | "skipped">("all");
  const [selectedBroadcastForLogs, setSelectedBroadcastForLogs] = useState<Broadcast | null>(null);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [logsDialogSearchTerm, setLogsDialogSearchTerm] = useState("");

  // Date-fns locale based on current locale
  const dateLocale = locale === 'th' ? th : enUS;

  // Realtime subscription for broadcasts changes
  useEffect(() => {
    const channel = supabase
      .channel('broadcasts-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'broadcasts'
        },
        (payload) => {
          console.log('[Realtime] Broadcast changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
          queryClient.invalidateQueries({ queryKey: ['scheduled-broadcasts'] });
          
          // Toast notification for status changes
          if (payload.eventType === 'UPDATE') {
            const newData = payload.new as Broadcast;
            if (newData.status === 'sent') {
              toast.success(`📨 "${newData.title}" ${t('ส่งเรียบร้อยแล้ว!', 'sent successfully!')}`);
            } else if (newData.status === 'failed') {
              toast.error(`❌ "${newData.title}" ${t('ส่งไม่สำเร็จ', 'failed to send')}`);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'broadcast_templates'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['broadcast-templates'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recipient_groups'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['recipient-groups'] });
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Broadcast subscription status:', status);
      });

    return () => {
      console.log('[Realtime] Cleaning up broadcast subscription');
      supabase.removeChannel(channel);
    };
  }, [queryClient, t]);

  // Fetch broadcasts history
  const { data: broadcasts, isLoading: broadcastsLoading } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadcasts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Broadcast[];
    },
  });

  // Fetch scheduled/recurring broadcasts for calendar
  const { data: scheduledBroadcasts } = useQuery({
    queryKey: ["scheduled-broadcasts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadcasts")
        .select("*")
        .in("status", ["scheduled", "paused"])
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data as Broadcast[];
    },
  });

  // Fetch broadcast logs for Logs tab
  const { data: broadcastLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["broadcast-logs", logSearchTerm, logStatusFilter],
    queryFn: async () => {
      let query = supabase
        .from("broadcast_logs")
        .select(`
          *,
          broadcast:broadcasts(id, title)
        `)
        .order("sent_at", { ascending: false })
        .limit(100);

      if (logSearchTerm) {
        query = query.or(`recipient_name.ilike.%${logSearchTerm}%,line_id.ilike.%${logSearchTerm}%`);
      }
      if (logStatusFilter && logStatusFilter !== "all") {
        query = query.eq("delivery_status", logStatusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BroadcastLog[];
    },
  });

  // Fetch logs for specific broadcast (dialog)
  const { data: specificBroadcastLogs, isLoading: specificLogsLoading } = useQuery({
    queryKey: ["broadcast-logs-specific", selectedBroadcastForLogs?.id, logsDialogSearchTerm],
    queryFn: async () => {
      if (!selectedBroadcastForLogs) return [];
      
      let query = supabase
        .from("broadcast_logs")
        .select("*")
        .eq("broadcast_id", selectedBroadcastForLogs.id)
        .order("sent_at", { ascending: false });

      if (logsDialogSearchTerm) {
        query = query.or(`recipient_name.ilike.%${logsDialogSearchTerm}%,line_id.ilike.%${logsDialogSearchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BroadcastLog[];
    },
    enabled: !!selectedBroadcastForLogs,
  });

  // Fetch templates
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["broadcast-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadcast_templates")
        .select("*")
        .eq("is_active", true)
        .order("usage_count", { ascending: false });
      if (error) throw error;
      return data as Template[];
    },
  });

  // Fetch recipient groups
  const { data: recipientGroups, isLoading: recipientGroupsLoading } = useQuery({
    queryKey: ["recipient-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipient_groups")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as RecipientGroup[];
    },
  });

  // Fetch users with LINE ID
  const { data: users } = useQuery({
    queryKey: ["broadcast-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, display_name, line_user_id")
        .not("line_user_id", "is", null)
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch groups
  const { data: groups } = useQuery({
    queryKey: ["broadcast-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("id, display_name, line_group_id")
        .eq("status", "active")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch employees with LINE ID (include branch & role for filtering)
  const { data: employees } = useQuery({
    queryKey: ["broadcast-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, line_user_id, branch_id, role_id")
        .eq("is_active", true)
        .not("line_user_id", "is", null)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch branches for filter
  const { data: branches } = useQuery({
    queryKey: ["broadcast-branches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name")
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch employee roles for filter
  const { data: employeeRoles } = useQuery({
    queryKey: ["broadcast-employee-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_roles")
        .select("id, role_key, display_name_th, display_name_en")
        .order("priority");
      if (error) throw error;
      return data;
    },
  });

  // Create broadcast mutation
  const createBroadcastMutation = useMutation({
    mutationFn: async () => {
      setSending(true);
      
      // Create broadcast
      const { data: broadcast, error: broadcastError } = await supabase
        .from("broadcasts")
        .insert({
          title,
          message_type: messageType,
          content: content || null,
          image_url: imageUrl || null,
          status: scheduleType === "now" ? "scheduled" : "scheduled",
          scheduled_at: scheduleType === "later" 
            ? bangkokLocalToUTC(scheduledAt)
            : new Date().toISOString(),
          is_recurring: isRecurring,
          recurrence_pattern: isRecurring ? recurrencePattern : null,
          recurrence_end_date: isRecurring && recurrenceEndDate ? recurrenceEndDate : null,
          next_run_at: isRecurring && scheduleType === "later" ? bangkokLocalToUTC(scheduledAt) : null,
        })
        .select()
        .single();

      if (broadcastError) throw broadcastError;

      // Build recipients list
      const recipients: Array<{
        broadcast_id: string;
        recipient_type: string;
        recipient_id: string;
        line_id: string | null;
        recipient_name: string | null;
      }> = [];

      // Add selected users
      for (const userId of selectedUsers) {
        const user = users?.find((u) => u.id === userId);
        if (user) {
          recipients.push({
            broadcast_id: broadcast.id,
            recipient_type: "user",
            recipient_id: userId,
            line_id: user.line_user_id,
            recipient_name: user.display_name,
          });
        }
      }

      // Add selected groups
      for (const groupId of selectedGroups) {
        const group = groups?.find((g) => g.id === groupId);
        if (group) {
          recipients.push({
            broadcast_id: broadcast.id,
            recipient_type: "group",
            recipient_id: groupId,
            line_id: group.line_group_id,
            recipient_name: group.display_name,
          });
        }
      }

      // Add selected employees
      for (const empId of selectedEmployees) {
        const emp = employees?.find((e) => e.id === empId);
        if (emp) {
          recipients.push({
            broadcast_id: broadcast.id,
            recipient_type: "employee",
            recipient_id: empId,
            line_id: emp.line_user_id,
            recipient_name: emp.full_name,
          });
        }
      }

      // Add members from selected recipient groups
      for (const rgId of selectedRecipientGroups) {
        const { data: members } = await supabase
          .from("recipient_group_members")
          .select("*")
          .eq("group_id", rgId);

        for (const member of members || []) {
          // Avoid duplicates
          const exists = recipients.some(
            (r) => r.recipient_type === member.member_type && r.recipient_id === member.member_id
          );
          if (!exists) {
            recipients.push({
              broadcast_id: broadcast.id,
              recipient_type: member.member_type,
              recipient_id: member.member_id,
              line_id: member.line_id,
              recipient_name: member.member_name,
            });
          }
        }
      }

      if (recipients.length === 0) {
        throw new Error(t("ยังไม่ได้เลือกผู้รับ", "No recipients selected"));
      }

      // Insert recipients
      const { error: recipientsError } = await supabase
        .from("broadcast_recipients")
        .insert(recipients);

      if (recipientsError) throw recipientsError;

      // Update total recipients count
      await supabase
        .from("broadcasts")
        .update({ total_recipients: recipients.length })
        .eq("id", broadcast.id);

      // If sending now, trigger the send
      if (scheduleType === "now") {
        const { error: sendError } = await supabase.functions.invoke("broadcast-send", {
          body: { broadcast_id: broadcast.id },
        });
        if (sendError) throw sendError;
      }

      return broadcast;
    },
    onSuccess: () => {
      toast.success(scheduleType === "now" 
        ? t("ส่ง Broadcast สำเร็จ!", "Broadcast sent successfully!") 
        : t("ตั้งเวลา Broadcast สำเร็จ!", "Broadcast scheduled!")
      );
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (error) => {
      toast.error(`${t("ส่ง Broadcast ไม่สำเร็จ", "Failed to send broadcast")}: ${error.message}`);
    },
    onSettled: () => {
      setSending(false);
      setConfirmSendOpen(false);
    },
  });

  // Cancel broadcast mutation
  const cancelBroadcastMutation = useMutation({
    mutationFn: async (broadcastId: string) => {
      const { error } = await supabase
        .from("broadcasts")
        .update({ status: "cancelled" })
        .eq("id", broadcastId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("ยกเลิก Broadcast แล้ว", "Broadcast cancelled"));
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (error) => {
      toast.error(`${t("ยกเลิกไม่สำเร็จ", "Failed to cancel")}: ${error.message}`);
    },
  });

  // Pause/Resume broadcast mutation
  const togglePauseMutation = useMutation({
    mutationFn: async ({ broadcastId, pause }: { broadcastId: string; pause: boolean }) => {
      const { error } = await supabase
        .from("broadcasts")
        .update({ status: pause ? "paused" : "scheduled" })
        .eq("id", broadcastId);
      if (error) throw error;
    },
    onSuccess: (_, { pause }) => {
      toast.success(pause 
        ? t("หยุด Broadcast ชั่วคราว", "Broadcast paused") 
        : t("เริ่ม Broadcast ต่อ", "Broadcast resumed")
      );
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
  });

  // Edit broadcast mutation
  const editBroadcastMutation = useMutation({
    mutationFn: async () => {
      if (!editingBroadcast) throw new Error("No broadcast selected");
      
      const { error } = await supabase
        .from("broadcasts")
        .update({
          title: editTitle,
          content: editContent || null,
          image_url: editImageUrl || null,
          message_type: editMessageType,
          scheduled_at: bangkokLocalToUTC(editScheduledAt),
          next_run_at: editingBroadcast.is_recurring 
            ? bangkokLocalToUTC(editScheduledAt) 
            : null,
        })
        .eq("id", editingBroadcast.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("อัพเดท Broadcast เรียบร้อย!", "Broadcast updated successfully!"));
      setEditDialogOpen(false);
      setEditingBroadcast(null);
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-broadcasts"] });
    },
    onError: (error) => {
      toast.error(`${t("แก้ไขไม่สำเร็จ", "Failed to update")}: ${error.message}`);
    },
  });

  // Open edit dialog with broadcast data
  const openEditDialog = (broadcast: Broadcast) => {
    setEditingBroadcast(broadcast);
    setEditTitle(broadcast.title);
    setEditContent(broadcast.content || "");
    setEditImageUrl(broadcast.image_url || "");
    setEditMessageType(broadcast.message_type);
    
    // Convert UTC to Bangkok local time for datetime-local input
    if (broadcast.scheduled_at) {
      const date = new Date(broadcast.scheduled_at);
      const bangkokTime = date.toLocaleString('sv-SE', { 
        timeZone: 'Asia/Bangkok',
        hour12: false 
      }).replace(' ', 'T').slice(0, 16);
      setEditScheduledAt(bangkokTime);
    }
    
    setEditDialogOpen(true);
  };

  // Open logs dialog for specific broadcast
  const openLogsDialog = (broadcast: Broadcast) => {
    setSelectedBroadcastForLogs(broadcast);
    setLogsDialogSearchTerm("");
    setLogsDialogOpen(true);
  };

  // Clone broadcast mutation
  const cloneBroadcastMutation = useMutation({
    mutationFn: async (broadcast: Broadcast) => {
      setTitle(`${broadcast.title} (Copy)`);
      setMessageType(broadcast.message_type);
      setContent(broadcast.content || "");
      setImageUrl(broadcast.image_url || "");
      setActiveTab("create");
    },
    onSuccess: () => {
      toast.success(t("คัดลอก Broadcast ไปยัง Editor", "Broadcast cloned to editor"));
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("broadcast_templates").insert({
        name: newTemplateName,
        description: newTemplateDesc || null,
        message_type: messageType,
        content: content || null,
        image_url: imageUrl || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("บันทึกเทมเพลตแล้ว!", "Template saved!"));
      setTemplateDialogOpen(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
      queryClient.invalidateQueries({ queryKey: ["broadcast-templates"] });
    },
    onError: (error) => {
      toast.error(`${t("บันทึกเทมเพลตไม่สำเร็จ", "Failed to save template")}: ${error.message}`);
    },
  });

  // Create recipient group mutation
  const createRecipientGroupMutation = useMutation({
    mutationFn: async () => {
      const { data: group, error: groupError } = await supabase
        .from("recipient_groups")
        .insert({
          name: newGroupName,
          description: newGroupDesc || null,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add selected recipients as members
      const members: Array<{
        group_id: string;
        member_type: string;
        member_id: string;
        line_id: string | null;
        member_name: string | null;
      }> = [];

      for (const userId of selectedUsers) {
        const user = users?.find((u) => u.id === userId);
        if (user) {
          members.push({
            group_id: group.id,
            member_type: "user",
            member_id: userId,
            line_id: user.line_user_id,
            member_name: user.display_name,
          });
        }
      }

      for (const groupId of selectedGroups) {
        const grp = groups?.find((g) => g.id === groupId);
        if (grp) {
          members.push({
            group_id: group.id,
            member_type: "group",
            member_id: groupId,
            line_id: grp.line_group_id,
            member_name: grp.display_name,
          });
        }
      }

      for (const empId of selectedEmployees) {
        const emp = employees?.find((e) => e.id === empId);
        if (emp) {
          members.push({
            group_id: group.id,
            member_type: "employee",
            member_id: empId,
            line_id: emp.line_user_id,
            member_name: emp.full_name,
          });
        }
      }

      if (members.length > 0) {
        const { error: membersError } = await supabase
          .from("recipient_group_members")
          .insert(members);
        if (membersError) throw membersError;
      }

      return group;
    },
    onSuccess: () => {
      toast.success(t("สร้างกลุ่มผู้รับแล้ว!", "Recipient group created!"));
      setRecipientGroupDialogOpen(false);
      setNewGroupName("");
      setNewGroupDesc("");
      queryClient.invalidateQueries({ queryKey: ["recipient-groups"] });
    },
    onError: (error) => {
      toast.error(`${t("สร้างกลุ่มไม่สำเร็จ", "Failed to create group")}: ${error.message}`);
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("broadcast_templates")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("ลบเทมเพลตแล้ว", "Template deleted"));
      queryClient.invalidateQueries({ queryKey: ["broadcast-templates"] });
    },
  });

  // Load template
  const loadTemplate = (template: Template) => {
    setMessageType(template.message_type);
    setContent(template.content || "");
    setImageUrl(template.image_url || "");
    
    // Update usage count
    supabase
      .from("broadcast_templates")
      .update({ usage_count: template.usage_count + 1 })
      .eq("id", template.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["broadcast-templates"] }));
    
    toast.success(`${t("โหลดเทมเพลต", "Template")} "${template.name}" ${t("แล้ว", "loaded")}`);
  };

  // Helper function to replace template variables for preview
  const replaceTemplateVariables = (text: string, recipientName: string = t("ชื่อผู้รับ", "Recipient Name")): string => {
    const now = getBangkokNow();
    const dateStr = now.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US');
    const timeStr = now.toLocaleTimeString(locale === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    const datetimeStr = now.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US');
    
    return text
      .replace(/\{\{name\}\}/gi, recipientName)
      .replace(/\{\{date\}\}/gi, dateStr)
      .replace(/\{\{time\}\}/gi, timeStr)
      .replace(/\{\{datetime\}\}/gi, datetimeStr);
  };

  const resetForm = () => {
    setTitle("");
    setMessageType("text");
    setContent("");
    setImageUrl("");
    setScheduleType("now");
    setScheduledAt("");
    setIsRecurring(false);
    setRecurrencePattern("daily");
    setRecurrenceEndDate("");
    setSelectedUsers([]);
    setSelectedGroups([]);
    setSelectedEmployees([]);
    setSelectedRecipientGroups([]);
  };

  const getTotalRecipients = () => {
    let total = selectedUsers.length + selectedGroups.length + selectedEmployees.length;
    for (const rgId of selectedRecipientGroups) {
      const rg = recipientGroups?.find((r) => r.id === rgId);
      if (rg) total += rg.member_count;
    }
    return total;
  };

  const getStatusBadge = (status: string) => {
    const statusLabels: Record<string, { th: string; en: string }> = {
      draft: { th: 'แบบร่าง', en: 'Draft' },
      scheduled: { th: 'กำหนดเวลา', en: 'Scheduled' },
      sending: { th: 'กำลังส่ง', en: 'Sending' },
      completed: { th: 'เสร็จสิ้น', en: 'Completed' },
      sent: { th: 'ส่งแล้ว', en: 'Sent' },
      failed: { th: 'ล้มเหลว', en: 'Failed' },
      paused: { th: 'หยุดชั่วคราว', en: 'Paused' },
      cancelled: { th: 'ยกเลิก', en: 'Cancelled' },
      skipped: { th: 'ข้าม', en: 'Skipped' },
    };
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      scheduled: "outline",
      sending: "default",
      completed: "default",
      sent: "default",
      failed: "destructive",
      paused: "secondary",
      cancelled: "destructive",
      skipped: "secondary",
    };
    const label = statusLabels[status] || { th: status, en: status };
    return <Badge variant={variants[status] || "secondary"}>{t(label.th, label.en)}</Badge>;
  };

  const canSend = () => {
    if (!title.trim()) return false;
    if (messageType === "text" && !content.trim()) return false;
    if (messageType === "image" && !imageUrl.trim()) return false;
    if (messageType === "text_image" && !content.trim() && !imageUrl.trim()) return false;
    if (getTotalRecipients() === 0) return false;
    if (scheduleType === "later" && !scheduledAt) return false;
    return true;
  };

  // Real-time subscription for broadcasts
  useEffect(() => {
    const channel = supabase
      .channel("broadcasts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broadcasts" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
          queryClient.invalidateQueries({ queryKey: ["scheduled-broadcasts"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Calendar helper: Get dates that have scheduled broadcasts
  const datesWithBroadcasts = useMemo(() => {
    if (!scheduledBroadcasts) return [];
    return scheduledBroadcasts
      .map((b) => b.scheduled_at || b.next_run_at)
      .filter(Boolean)
      .map((dateStr) => new Date(dateStr!));
  }, [scheduledBroadcasts]);

  // Calendar helper: Get broadcasts for selected date
  const broadcastsForSelectedDate = useMemo(() => {
    if (!scheduledBroadcasts || !selectedCalendarDate) return [];
    const selectedDateStr = formatBangkokISODate(selectedCalendarDate);
    return scheduledBroadcasts.filter((b) => {
      const broadcastDate = b.scheduled_at || b.next_run_at;
      if (!broadcastDate) return false;
      return formatBangkokISODate(broadcastDate) === selectedDateStr;
    }).sort((a, b) => {
      const aTime = new Date(a.scheduled_at || a.next_run_at!).getTime();
      const bTime = new Date(b.scheduled_at || b.next_run_at!).getTime();
      return aTime - bTime;
    });
  }, [scheduledBroadcasts, selectedCalendarDate]);

  // Calendar helper: Calculate upcoming stats
  const upcomingStats = useMemo(() => {
    if (!scheduledBroadcasts) return { today: 0, thisWeek: 0, recurring: 0, paused: 0 };
    
    const now = getBangkokNow();
    const todayStr = formatBangkokISODate(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    
    return {
      today: scheduledBroadcasts.filter((b) => {
        const d = b.scheduled_at || b.next_run_at;
        return d && formatBangkokISODate(d) === todayStr;
      }).length,
      thisWeek: scheduledBroadcasts.filter((b) => {
        const d = b.scheduled_at || b.next_run_at;
        if (!d) return false;
        const date = new Date(d);
        return isWithinInterval(date, { start: weekStart, end: weekEnd });
      }).length,
      recurring: scheduledBroadcasts.filter((b) => b.is_recurring).length,
      paused: scheduledBroadcasts.filter((b) => b.status === "paused").length,
    };
  }, [scheduledBroadcasts]);

  // Calendar helper: Check if a date has broadcasts
  const hasbroadcastModifier = (date: Date) => {
    return datesWithBroadcasts.some((d) => isSameDay(d, date));
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header with Language Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{t('การส่งข้อความ', 'Broadcast Management')}</h1>
            <p className="text-muted-foreground">{t('ส่งข้อความถึงผู้ใช้ กลุ่ม และพนักงาน', 'Send messages to users, groups, and employees')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={locale === 'th' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLocale('th')}
          >
            TH
          </Button>
          <Button
            variant={locale === 'en' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLocale('en')}
          >
            EN
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            {t('สร้างใหม่', 'Create New')}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {t('ปฏิทิน', 'Calendar')}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t('ประวัติ', 'History')}
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            {t('บันทึกการส่ง', 'Logs')}
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('เทมเพลต', 'Templates')}
          </TabsTrigger>
          <TabsTrigger value="groups" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('กลุ่มผู้รับ', 'Recipients')}
          </TabsTrigger>
        </TabsList>

        {/* CREATE NEW TAB */}
        <TabsContent value="create" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Message Form */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('เนื้อหาข้อความ', 'Message Content')}</CardTitle>
                  <CardDescription>{t('เขียนข้อความของคุณ', 'Compose your broadcast message')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">{t('หัวข้อ (ภายใน)', 'Title (Internal)')}</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('เช่น Newsletter เดือนธันวาคม', 'e.g., Monthly Newsletter - December')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t('ประเภทข้อความ', 'Message Type')}</Label>
                    <Select value={messageType} onValueChange={(v) => setMessageType(v as MessageType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" /> {t('ข้อความเท่านั้น', 'Text Only')}
                          </div>
                        </SelectItem>
                        <SelectItem value="image">
                          <div className="flex items-center gap-2">
                            <Image className="h-4 w-4" /> {t('รูปภาพเท่านั้น', 'Image Only')}
                          </div>
                        </SelectItem>
                        <SelectItem value="text_image">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />+
                            <Image className="h-4 w-4" /> {t('ข้อความ + รูปภาพ', 'Text + Image')}
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(messageType === "text" || messageType === "text_image") && (
                    <div className="space-y-2">
                      <Label htmlFor="content">{t('ข้อความ', 'Message Text')}</Label>
                      <Textarea
                        id="content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={t('พิมพ์ข้อความของคุณ...', 'Enter your message...')}
                        rows={5}
                      />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{content.length} {t('ตัวอักษร', 'characters')}</span>
                        <span className="text-border">|</span>
                        <span>{t('ตัวแปร', 'Variables')}:</span>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{"{{name}}"}</code>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{"{{date}}"}</code>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{"{{time}}"}</code>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{"{{datetime}}"}</code>
                      </div>
                    </div>
                  )}

                  {(messageType === "image" || messageType === "text_image") && (
                    <div className="space-y-2">
                      <Label htmlFor="imageUrl">{t('URL รูปภาพ', 'Image URL')}</Label>
                      <Input
                        id="imageUrl"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://..."
                      />
                      {imageUrl && (
                        <img
                          src={imageUrl}
                          alt="Preview"
                          className="max-w-xs rounded-lg border"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={!content && !imageUrl}>
                          <Plus className="h-4 w-4 mr-1" /> {t('บันทึกเป็นเทมเพลต', 'Save as Template')}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t('บันทึกเป็นเทมเพลต', 'Save as Template')}</DialogTitle>
                          <DialogDescription>{t('บันทึกข้อความนี้เป็นเทมเพลตที่ใช้ซ้ำได้', 'Save this message as a reusable template')}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>{t('ชื่อเทมเพลต', 'Template Name')}</Label>
                            <Input
                              value={newTemplateName}
                              onChange={(e) => setNewTemplateName(e.target.value)}
                              placeholder={t('เช่น ข้อความต้อนรับ', 'e.g., Welcome Message')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t('คำอธิบาย (ไม่บังคับ)', 'Description (Optional)')}</Label>
                            <Input
                              value={newTemplateDesc}
                              onChange={(e) => setNewTemplateDesc(e.target.value)}
                              placeholder={t('คำอธิบายสั้นๆ...', 'Brief description...')}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => saveTemplateMutation.mutate()}
                            disabled={!newTemplateName.trim() || saveTemplateMutation.isPending}
                          >
                            {saveTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                            {t('บันทึกเทมเพลต', 'Save Template')}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {templates && templates.length > 0 && (
                      <Select onValueChange={(id) => {
                        const t = templates.find((t) => t.id === id);
                        if (t) loadTemplate(t);
                      }}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder={t('โหลดเทมเพลต...', 'Load Template...')} />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Schedule Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" /> {t('กำหนดเวลา', 'Schedule')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <Button
                      variant={scheduleType === "now" ? "default" : "outline"}
                      onClick={() => setScheduleType("now")}
                      className="flex-1"
                    >
                      {t('ส่งตอนนี้', 'Send Now')}
                    </Button>
                    <Button
                      variant={scheduleType === "later" ? "default" : "outline"}
                      onClick={() => setScheduleType("later")}
                      className="flex-1"
                    >
                      {t('ตั้งเวลาส่ง', 'Schedule')}
                    </Button>
                  </div>

                  {scheduleType === "later" && (
                    <div className="space-y-2">
                      <Label>{t('วันและเวลาที่กำหนด', 'Scheduled Date & Time')}</Label>
                      <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                    <Label>{t('ส่งซ้ำ', 'Recurring Broadcast')}</Label>
                  </div>

                  {isRecurring && (
                    <div className="grid grid-cols-2 gap-4 pl-6">
                      <div className="space-y-2">
                        <Label>{t('ส่งซ้ำ', 'Repeat')}</Label>
                        <Select value={recurrencePattern} onValueChange={(v) => setRecurrencePattern(v as RecurrencePattern)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">{t('ทุกวัน', 'Daily')}</SelectItem>
                            <SelectItem value="every_3_days">{t('ทุก 3 วัน', 'Every 3 Days')}</SelectItem>
                            <SelectItem value="weekly">{t('ทุกสัปดาห์', 'Weekly')}</SelectItem>
                            <SelectItem value="monthly">{t('ทุกเดือน', 'Monthly')}</SelectItem>
                            <SelectItem value="yearly">{t('ทุกปี', 'Yearly')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('วันสิ้นสุด (ไม่บังคับ)', 'End Date (Optional)')}</Label>
                        <Input
                          type="date"
                          value={recurrenceEndDate}
                          onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recipients Panel */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" /> {t('ผู้รับ', 'Recipients')}
                  </CardTitle>
                  <CardDescription>
                    {t('เลือกแล้ว', 'Selected')}: <span className="font-semibold text-foreground">{getTotalRecipients()}</span> {t('คน', 'recipients')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Recipient Groups */}
                  {recipientGroups && recipientGroups.length > 0 && (
                    <div className="space-y-2">
                      <Label>{t('กลุ่มที่บันทึก', 'Saved Groups')}</Label>
                      <ScrollArea className="h-24 border rounded-md p-2">
                        {recipientGroups.map((rg) => (
                          <div key={rg.id} className="flex items-center gap-2 py-1">
                            <Checkbox
                              checked={selectedRecipientGroups.includes(rg.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedRecipientGroups([...selectedRecipientGroups, rg.id]);
                                } else {
                                  setSelectedRecipientGroups(selectedRecipientGroups.filter((id) => id !== rg.id));
                                }
                              }}
                            />
                            <span className="text-sm">{rg.name}</span>
                            <Badge variant="secondary" className="ml-auto">{rg.member_count}</Badge>
                          </div>
                        ))}
                      </ScrollArea>
                    </div>
                  )}

                  {/* Users */}
                  <div className="space-y-2">
                    <Label>{t('ผู้ใช้', 'Users')} ({users?.length || 0})</Label>
                    <ScrollArea className="h-32 border rounded-md p-2">
                      {users?.map((user) => (
                        <div key={user.id} className="flex items-center gap-2 py-1">
                          <Checkbox
                            checked={selectedUsers.includes(user.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedUsers([...selectedUsers, user.id]);
                              } else {
                                setSelectedUsers(selectedUsers.filter((id) => id !== user.id));
                              }
                            }}
                          />
                          <span className="text-sm">{user.display_name || "Unknown"}</span>
                        </div>
                      ))}
                      {!users?.length && <p className="text-sm text-muted-foreground">{t('ไม่มีผู้ใช้ที่มี LINE ID', 'No users with LINE ID')}</p>}
                    </ScrollArea>
                  </div>

                  {/* Groups */}
                  <div className="space-y-2">
                    <Label>{t('กลุ่ม LINE', 'LINE Groups')} ({groups?.length || 0})</Label>
                    <ScrollArea className="h-32 border rounded-md p-2">
                      {groups?.map((group) => (
                        <div key={group.id} className="flex items-center gap-2 py-1">
                          <Checkbox
                            checked={selectedGroups.includes(group.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedGroups([...selectedGroups, group.id]);
                              } else {
                                setSelectedGroups(selectedGroups.filter((id) => id !== group.id));
                              }
                            }}
                          />
                          <span className="text-sm">{group.display_name}</span>
                        </div>
                      ))}
                      {!groups?.length && <p className="text-sm text-muted-foreground">{t('ไม่มีกลุ่มที่ใช้งาน', 'No active groups')}</p>}
                    </ScrollArea>
                  </div>

                  {/* Employees with Branch/Role Filter */}
                  <div className="space-y-2">
                    <Label>{t('พนักงาน', 'Employees')}</Label>
                    <div className="flex gap-2">
                      <Select value={filterBranchId} onValueChange={setFilterBranchId}>
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue placeholder={t('ทุกสาขา', 'All Branches')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('ทุกสาขา', 'All Branches')}</SelectItem>
                          {branches?.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={filterRoleId} onValueChange={setFilterRoleId}>
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue placeholder={t('ทุกตำแหน่ง', 'All Roles')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('ทุกตำแหน่ง', 'All Roles')}</SelectItem>
                          {employeeRoles?.map((r) => (
                            <SelectItem key={r.id} value={r.id}>{locale === 'th' ? (r.display_name_th || r.role_key) : (r.display_name_en || r.role_key)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(() => {
                      const filtered = employees?.filter((emp) => {
                        if (filterBranchId !== 'all' && emp.branch_id !== filterBranchId) return false;
                        if (filterRoleId !== 'all' && emp.role_id !== filterRoleId) return false;
                        return true;
                      }) || [];
                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{filtered.length} {t('คน', 'people')}</span>
                            {filtered.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => {
                                  const ids = filtered.map(e => e.id);
                                  const allSelected = ids.every(id => selectedEmployees.includes(id));
                                  if (allSelected) {
                                    setSelectedEmployees(selectedEmployees.filter(id => !ids.includes(id)));
                                  } else {
                                    setSelectedEmployees([...new Set([...selectedEmployees, ...ids])]);
                                  }
                                }}
                              >
                                {filtered.every(e => selectedEmployees.includes(e.id)) ? t('ยกเลิกทั้งหมด', 'Deselect All') : t('เลือกทั้งหมด', 'Select All')}
                              </Button>
                            )}
                          </div>
                          <ScrollArea className="h-32 border rounded-md p-2">
                            {filtered.map((emp) => (
                              <div key={emp.id} className="flex items-center gap-2 py-1">
                                <Checkbox
                                  checked={selectedEmployees.includes(emp.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedEmployees([...selectedEmployees, emp.id]);
                                    } else {
                                      setSelectedEmployees(selectedEmployees.filter((id) => id !== emp.id));
                                    }
                                  }}
                                />
                                <span className="text-sm">{emp.full_name}</span>
                              </div>
                            ))}
                            {filtered.length === 0 && <p className="text-sm text-muted-foreground">{t('ไม่มีพนักงานที่ตรงตามเงื่อนไข', 'No employees match filter')}</p>}
                          </ScrollArea>
                        </>
                      );
                    })()}
                  </div>

                  {/* Save as Recipient Group */}
                  <Dialog open={recipientGroupDialogOpen} onOpenChange={setRecipientGroupDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full" disabled={getTotalRecipients() === 0}>
                        <Plus className="h-4 w-4 mr-1" /> {t('บันทึกการเลือกเป็นกลุ่ม', 'Save Selection as Group')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t('บันทึกเป็นกลุ่มผู้รับ', 'Save as Recipient Group')}</DialogTitle>
                        <DialogDescription>{t('บันทึกการเลือกปัจจุบัน', 'Save current selection')} ({getTotalRecipients()} {t('คน', 'recipients')}) {t('เป็นกลุ่มที่ใช้ซ้ำได้', 'as a reusable group')}</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>{t('ชื่อกลุ่ม', 'Group Name')}</Label>
                          <Input
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder={t('เช่น ทีม Marketing', 'e.g., Marketing Team')}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('คำอธิบาย (ไม่บังคับ)', 'Description (Optional)')}</Label>
                          <Input
                            value={newGroupDesc}
                            onChange={(e) => setNewGroupDesc(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => createRecipientGroupMutation.mutate()}
                          disabled={!newGroupName.trim() || createRecipientGroupMutation.isPending}
                        >
                          {createRecipientGroupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          {t('บันทึกกลุ่ม', 'Save Group')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button variant="outline" className="w-full" onClick={() => setPreviewOpen(true)} disabled={!content && !imageUrl}>
                  <Eye className="h-4 w-4 mr-2" /> {t('ดูตัวอย่าง', 'Preview')}
                </Button>
                <Button className="w-full" onClick={() => setConfirmSendOpen(true)} disabled={!canSend() || sending}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {scheduleType === "now" ? t('ส่งตอนนี้', 'Send Now') : t('ตั้งเวลาส่ง', 'Schedule')}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* CALENDAR TAB */}
        <TabsContent value="calendar" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" /> {t('ปฏิทิน Broadcast', 'Broadcast Calendar')}
                </CardTitle>
                <CardDescription>{t('เลือกวันเพื่อดู Broadcast', 'Select a date to view scheduled broadcasts')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedCalendarDate}
                  onSelect={setSelectedCalendarDate}
                  modifiers={{
                    hasbroadcast: hasbroadcastModifier,
                  }}
                  modifiersStyles={{
                    hasbroadcast: { 
                      fontWeight: 'bold',
                      backgroundColor: 'hsl(var(--primary) / 0.15)',
                      borderRadius: '50%'
                    }
                  }}
                  className="rounded-md border pointer-events-auto"
                />
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-primary/20"></div>
                  <span>{t('มี Broadcast ที่กำหนดไว้', 'Has scheduled broadcasts')}</span>
                </div>
              </CardContent>
            </Card>

            {/* Broadcasts for selected date */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {selectedCalendarDate 
                    ? format(selectedCalendarDate, "EEEE, d MMMM yyyy", { locale: dateLocale })
                    : t("เลือกวัน", "Select a date")}
                </CardTitle>
                <CardDescription>
                  {broadcastsForSelectedDate.length} broadcast(s) {t('ที่กำหนดไว้', 'scheduled')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {broadcastsForSelectedDate.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{t('ไม่มี Broadcast ที่กำหนดไว้', 'No broadcasts scheduled for this date')}</p>
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab("create")}>
                      <Plus className="h-4 w-4 mr-2" /> {t('สร้าง Broadcast ใหม่', 'Create New Broadcast')}
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3 pr-4">
                      {broadcastsForSelectedDate.map((broadcast) => (
                        <div 
                          key={broadcast.id} 
                          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate">{broadcast.title}</span>
                                {getStatusBadge(broadcast.status)}
                                {broadcast.is_recurring && (
                                  <Badge variant="secondary" className="shrink-0">
                                    🔁 {broadcast.recurrence_pattern}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatBangkokTimeShort(broadcast.scheduled_at || broadcast.next_run_at!)}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {broadcast.total_recipients} {t('คน', 'recipients')}
                                </span>
                              </div>
                              {broadcast.content && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                  {broadcast.content}
                                </p>
                              )}
                            </div>
                            {/* Quick Actions */}
                            <div className="flex gap-1 shrink-0">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => openEditDialog(broadcast)} 
                                title={t("แก้ไข", "Edit")}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => cloneBroadcastMutation.mutate(broadcast)} 
                                title={t("คัดลอก", "Clone")}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              {broadcast.status === "scheduled" && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => togglePauseMutation.mutate({ broadcastId: broadcast.id, pause: true })} 
                                  title={t("หยุดชั่วคราว", "Pause")}
                                >
                                  <Pause className="h-4 w-4" />
                                </Button>
                              )}
                              {broadcast.status === "paused" && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => togglePauseMutation.mutate({ broadcastId: broadcast.id, pause: false })} 
                                  title={t("เริ่มต่อ", "Resume")}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => cancelBroadcastMutation.mutate(broadcast.id)} 
                                title={t("ยกเลิก", "Cancel")}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Upcoming broadcasts summary */}
          <Card>
            <CardHeader>
              <CardTitle>📊 {t('สรุปกำหนดการ', 'Upcoming Summary')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-primary">{upcomingStats.today}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t('วันนี้', 'Today')}</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-accent-foreground">{upcomingStats.thisWeek}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t('สัปดาห์นี้', 'This Week')}</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-secondary-foreground">{upcomingStats.recurring}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t('ส่งซ้ำ', 'Recurring')}</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-muted-foreground">{upcomingStats.paused}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t('หยุดชั่วคราว', 'Paused')}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> {t('ประวัติ Broadcast', 'Broadcast History')}
              </CardTitle>
              <CardDescription>{t('ดูและจัดการ Broadcast ที่ผ่านมา', 'View and manage past broadcasts')}</CardDescription>
            </CardHeader>
            <CardContent>
              {broadcastsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : broadcasts?.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">{t('ยังไม่มี Broadcast', 'No broadcasts yet')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('หัวข้อ', 'Title')}</TableHead>
                      <TableHead>{t('ประเภท', 'Type')}</TableHead>
                      <TableHead>{t('ผู้รับ', 'Recipients')}</TableHead>
                      <TableHead>{t('สถานะ', 'Status')}</TableHead>
                      <TableHead>{t('กำหนดเวลา', 'Scheduled')}</TableHead>
                      <TableHead>{t('อัตราสำเร็จ', 'Success Rate')}</TableHead>
                      <TableHead>{t('การดำเนินการ', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {broadcasts?.map((broadcast) => (
                      <TableRow key={broadcast.id}>
                        <TableCell className="font-medium">{broadcast.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{broadcast.message_type}</Badge>
                          {broadcast.is_recurring && <Badge variant="secondary" className="ml-1">{t('ส่งซ้ำ', 'Recurring')}</Badge>}
                        </TableCell>
                        <TableCell>{broadcast.total_recipients}</TableCell>
                        <TableCell>{getStatusBadge(broadcast.status)}</TableCell>
                        <TableCell>
                          {broadcast.scheduled_at
                            ? formatBangkokDateTime(broadcast.scheduled_at)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {broadcast.total_recipients > 0 ? (
                            <div className="flex items-center gap-2">
                              <span className="text-green-600">{broadcast.sent_count}</span>
                              <span>/</span>
                              <span className="text-red-600">{broadcast.failed_count}</span>
                              <span className="text-muted-foreground text-xs">
                                ({Math.round((broadcast.sent_count / broadcast.total_recipients) * 100)}%)
                              </span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openLogsDialog(broadcast)}
                              title={t("ดูบันทึก", "View Logs")}
                            >
                              <FileSearch className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => cloneBroadcastMutation.mutate(broadcast)}
                              title={t("คัดลอก", "Clone")}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {broadcast.status === "scheduled" && broadcast.is_recurring && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => togglePauseMutation.mutate({ broadcastId: broadcast.id, pause: true })}
                                title={t("หยุดชั่วคราว", "Pause")}
                              >
                                <Pause className="h-4 w-4" />
                              </Button>
                            )}
                            {broadcast.status === "paused" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => togglePauseMutation.mutate({ broadcastId: broadcast.id, pause: false })}
                                title={t("เริ่มต่อ", "Resume")}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {(broadcast.status === "scheduled" || broadcast.status === "paused") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => cancelBroadcastMutation.mutate(broadcast.id)}
                                title={t("ยกเลิก", "Cancel")}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOGS TAB */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSearch className="h-5 w-5" /> {t('บันทึกการส่ง', 'Delivery Logs')}
              </CardTitle>
              <CardDescription>{t('ดูประวัติการส่งแบบละเอียด', 'View detailed delivery history')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search and Filter */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('ค้นหาชื่อผู้รับ, LINE ID...', 'Search recipient name, LINE ID...')}
                    value={logSearchTerm}
                    onChange={(e) => setLogSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={logStatusFilter} onValueChange={(v) => setLogStatusFilter(v as typeof logStatusFilter)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t('กรองตามสถานะ', 'Filter by status')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('ทั้งหมด', 'All')}</SelectItem>
                    <SelectItem value="sent">{t('ส่งแล้ว', 'Sent')}</SelectItem>
                    <SelectItem value="failed">{t('ล้มเหลว', 'Failed')}</SelectItem>
                    <SelectItem value="skipped">{t('ข้าม', 'Skipped')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Logs Table */}
              {logsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : broadcastLogs?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSearch className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>{t('ไม่พบบันทึกการส่ง', 'No delivery logs found')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Broadcast</TableHead>
                      <TableHead>{t('ผู้รับ', 'Recipient')}</TableHead>
                      <TableHead>LINE ID</TableHead>
                      <TableHead>{t('สถานะ', 'Status')}</TableHead>
                      <TableHead>{t('ส่งเมื่อ', 'Sent At')}</TableHead>
                      <TableHead>{t('ข้อผิดพลาด', 'Error')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {broadcastLogs?.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.broadcast?.title || '-'}</TableCell>
                        <TableCell>{log.recipient_name || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{log.line_id ? `${log.line_id.slice(0, 8)}...` : '-'}</TableCell>
                        <TableCell>{getStatusBadge(log.delivery_status)}</TableCell>
                        <TableCell>
                          {log.sent_at ? formatBangkokDateTime(log.sent_at) : '-'}
                        </TableCell>
                        <TableCell className="text-destructive text-sm">
                          {log.error_message || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TEMPLATES TAB */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> {t('เทมเพลตข้อความ', 'Message Templates')}
              </CardTitle>
              <CardDescription>{t('เทมเพลตข้อความที่ใช้ซ้ำได้', 'Reusable message templates for quick broadcasting')}</CardDescription>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : templates?.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">{t('ยังไม่มีเทมเพลต สร้างจากแท็บสร้างใหม่', 'No templates yet. Create one from the Create New tab.')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('ชื่อ', 'Name')}</TableHead>
                      <TableHead>{t('ประเภท', 'Type')}</TableHead>
                      <TableHead>{t('คำอธิบาย', 'Description')}</TableHead>
                      <TableHead>{t('ใช้แล้ว', 'Used')}</TableHead>
                      <TableHead>{t('การดำเนินการ', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates?.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{template.message_type}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{template.description || "-"}</TableCell>
                        <TableCell>{template.usage_count} {t('ครั้ง', 'times')}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                loadTemplate(template);
                                setActiveTab("create");
                              }}
                            >
                              {t('ใช้', 'Use')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RECIPIENT GROUPS TAB */}
        <TabsContent value="groups">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> {t('กลุ่มผู้รับ', 'Recipient Groups')}
              </CardTitle>
              <CardDescription>{t('กลุ่มผู้รับที่บันทึกไว้', 'Saved groups of recipients for quick selection')}</CardDescription>
            </CardHeader>
            <CardContent>
              {recipientGroupsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : recipientGroups?.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">{t('ยังไม่มีกลุ่มผู้รับ สร้างจากแท็บสร้างใหม่', 'No recipient groups yet. Create one from the Create New tab.')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('ชื่อ', 'Name')}</TableHead>
                      <TableHead>{t('คำอธิบาย', 'Description')}</TableHead>
                      <TableHead>{t('สมาชิก', 'Members')}</TableHead>
                      <TableHead>{t('การดำเนินการ', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipientGroups?.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell className="text-muted-foreground">{group.description || "-"}</TableCell>
                        <TableCell>
                          <Badge>{group.member_count} {t('สมาชิก', 'members')}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRecipientGroups([group.id]);
                              setActiveTab("create");
                              toast.success(`${t('เลือกกลุ่ม', 'Group')} "${group.name}" ${t('แล้ว', 'selected')}`);
                            }}
                          >
                            {t('ใช้', 'Use')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" /> {t('ตัวอย่าง Broadcast', 'Broadcast Preview')}
            </DialogTitle>
            <DialogDescription>{t('ตรวจสอบข้อความและผู้รับก่อนส่ง', 'Review message and recipients before sending')}</DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Message Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('ตัวอย่างข้อความ (พร้อมตัวแปรตัวอย่าง)', 'Message Preview (with sample variables)')}</Label>
              <div className="bg-muted rounded-lg p-4 space-y-3">
                {(messageType === "text" || messageType === "text_image") && content && (
                  <div className="bg-primary text-primary-foreground rounded-lg p-3 max-w-[80%]">
                    <p className="whitespace-pre-wrap text-sm">{replaceTemplateVariables(content)}</p>
                  </div>
                )}
                {(messageType === "image" || messageType === "text_image") && imageUrl && (
                  <div className="max-w-[80%]">
                    <img src={imageUrl} alt="Preview" className="rounded-lg" />
                  </div>
                )}
              </div>
              {content && content.includes("{{") && (
                <p className="text-xs text-muted-foreground">
                  * {t('ตัวแปรเช่น', 'Variables like')} {"{{name}}"} {t('จะถูกแทนที่ด้วยชื่อจริงของผู้รับ', 'will be replaced with each recipient\'s actual name')}
                </p>
              )}
            </div>

            {/* Recipients Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t('ผู้รับ', 'Recipients')} ({getTotalRecipients()} {t('ทั้งหมด', 'total')})
              </Label>
              <ScrollArea className="h-40 border rounded-md">
                <div className="p-3 space-y-3">
                  {selectedUsers.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase">{t('ผู้ใช้', 'Users')} ({selectedUsers.length})</span>
                      <div className="mt-1 space-y-0.5">
                        {selectedUsers.slice(0, 10).map(id => {
                          const user = users?.find(u => u.id === id);
                          return <div key={id} className="text-sm">{user?.display_name || id}</div>;
                        })}
                        {selectedUsers.length > 10 && (
                          <div className="text-xs text-muted-foreground">...{t('และอีก', 'and')} {selectedUsers.length - 10} {t('คน', 'more')}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedGroups.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase">{t('กลุ่ม', 'Groups')} ({selectedGroups.length})</span>
                      <div className="mt-1 space-y-0.5">
                        {selectedGroups.slice(0, 10).map(id => {
                          const group = groups?.find(g => g.id === id);
                          return <div key={id} className="text-sm">{group?.display_name || id}</div>;
                        })}
                        {selectedGroups.length > 10 && (
                          <div className="text-xs text-muted-foreground">...{t('และอีก', 'and')} {selectedGroups.length - 10} {t('กลุ่ม', 'more')}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedEmployees.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase">{t('พนักงาน', 'Employees')} ({selectedEmployees.length})</span>
                      <div className="mt-1 space-y-0.5">
                        {selectedEmployees.slice(0, 10).map(id => {
                          const emp = employees?.find(e => e.id === id);
                          return <div key={id} className="text-sm">{emp?.full_name || id}</div>;
                        })}
                        {selectedEmployees.length > 10 && (
                          <div className="text-xs text-muted-foreground">...{t('และอีก', 'and')} {selectedEmployees.length - 10} {t('คน', 'more')}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedRecipientGroups.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase">{t('กลุ่มที่บันทึก', 'Saved Groups')} ({selectedRecipientGroups.length})</span>
                      <div className="mt-1 space-y-0.5">
                        {selectedRecipientGroups.map(id => {
                          const rg = recipientGroups?.find(r => r.id === id);
                          return <div key={id} className="text-sm">{rg?.name || id} ({rg?.member_count || 0} {t('สมาชิก', 'members')})</div>;
                        })}
                      </div>
                    </div>
                  )}
                  {getTotalRecipients() === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('ยังไม่ได้เลือกผู้รับ', 'No recipients selected')}</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>{t('ปิด', 'Close')}</Button>
            <Button onClick={() => { setPreviewOpen(false); setConfirmSendOpen(true); }} disabled={!canSend()}>
              <Send className="h-4 w-4 mr-2" />
              {t('ดำเนินการส่ง', 'Continue to Send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Send Dialog */}
      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ยืนยันการส่ง Broadcast', 'Confirm Broadcast')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t('คุณกำลังจะ', 'You are about to')} {scheduleType === "now" ? t("ส่ง", "send") : t("ตั้งเวลาส่ง", "schedule")} broadcast {t('ไปยัง', 'to')}:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>{getTotalRecipients()}</strong> {t('ผู้รับ', 'recipients')}</li>
                {isRecurring && <li>{t('ส่งซ้ำ', 'Recurring')}: <strong>{recurrencePattern}</strong></li>}
                {scheduleType === "later" && scheduledAt && (
                  <li>{t('กำหนดเวลา', 'Scheduled')}: <strong>{format(new Date(scheduledAt), "PPpp", { locale: dateLocale })}</strong></li>
                )}
              </ul>
              <p className="text-destructive font-medium mt-4">{t('การดำเนินการนี้ไม่สามารถยกเลิกได้สำหรับข้อความที่ส่งแล้ว', 'This action cannot be undone for sent messages.')}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ยกเลิก', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => createBroadcastMutation.mutate()} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {scheduleType === "now" ? t('ส่งตอนนี้', 'Send Now') : t('ตั้งเวลาส่ง', 'Schedule')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Broadcast Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>✏️ {t('แก้ไข Broadcast', 'Edit Broadcast')}</DialogTitle>
            <DialogDescription>
              {t('แก้ไขข้อความหรือเวลาที่ต้องการส่ง', 'Edit message or scheduled time')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label>{t('หัวข้อ (ภายใน)', 'Title (Internal)')}</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t('ชื่อ broadcast', 'Broadcast name')}
              />
            </div>

            {/* Message Type */}
            <div className="space-y-2">
              <Label>{t('ประเภทข้อความ', 'Message Type')}</Label>
              <Select value={editMessageType} onValueChange={(v) => setEditMessageType(v as MessageType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">{t('ข้อความเท่านั้น', 'Text Only')}</SelectItem>
                  <SelectItem value="image">{t('รูปภาพเท่านั้น', 'Image Only')}</SelectItem>
                  <SelectItem value="text_image">{t('ข้อความ + รูปภาพ', 'Text + Image')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            {(editMessageType === "text" || editMessageType === "text_image") && (
              <div className="space-y-2">
                <Label>{t('ข้อความ', 'Message')}</Label>
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={4}
                />
              </div>
            )}

            {/* Image URL */}
            {(editMessageType === "image" || editMessageType === "text_image") && (
              <div className="space-y-2">
                <Label>{t('URL รูปภาพ', 'Image URL')}</Label>
                <Input
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                />
                {editImageUrl && (
                  <img src={editImageUrl} alt="Preview" className="max-w-[200px] rounded" />
                )}
              </div>
            )}

            {/* Scheduled Time */}
            <div className="space-y-2">
              <Label>{t('เวลาส่ง (Bangkok Time)', 'Send Time (Bangkok Time)')}</Label>
              <Input
                type="datetime-local"
                value={editScheduledAt}
                onChange={(e) => setEditScheduledAt(e.target.value)}
              />
            </div>

            {/* Recurring info (read-only) */}
            {editingBroadcast?.is_recurring && (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                🔁 {t('ส่งซ้ำ', 'Recurring')}: {editingBroadcast.recurrence_pattern}
                {editingBroadcast.recurrence_end_date && (
                  <> | {t('สิ้นสุด', 'End date')}: {editingBroadcast.recurrence_end_date}</>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {t('ยกเลิก', 'Cancel')}
            </Button>
            <Button
              onClick={() => editBroadcastMutation.mutate()}
              disabled={editBroadcastMutation.isPending || !editTitle.trim() || !editScheduledAt}
            >
              {editBroadcastMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('บันทึกการเปลี่ยนแปลง', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Broadcast Logs Dialog */}
      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5" /> 
              {selectedBroadcastForLogs?.title} - {t('รายละเอียดการส่ง', 'Delivery Details')}
            </DialogTitle>
            <DialogDescription>
              {selectedBroadcastForLogs && (
                <span>
                  {t('ส่งแล้ว', 'Sent')}: <span className="text-green-600 font-medium">{selectedBroadcastForLogs.sent_count}</span> | 
                  {t('ล้มเหลว', 'Failed')}: <span className="text-red-600 font-medium">{selectedBroadcastForLogs.failed_count}</span> | 
                  {t('ทั้งหมด', 'Total')}: {selectedBroadcastForLogs.total_recipients}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('ค้นหาผู้รับ...', 'Search recipient...')}
              value={logsDialogSearchTerm}
              onChange={(e) => setLogsDialogSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Logs Table */}
          <ScrollArea className="flex-1">
            {specificLogsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : specificBroadcastLogs?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileSearch className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{t('ไม่พบบันทึกการส่ง', 'No delivery logs found')}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('ผู้รับ', 'Recipient')}</TableHead>
                    <TableHead>LINE ID</TableHead>
                    <TableHead>{t('สถานะ', 'Status')}</TableHead>
                    <TableHead>{t('เวลา', 'Time')}</TableHead>
                    <TableHead>{t('ข้อผิดพลาด', 'Error')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {specificBroadcastLogs?.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.recipient_name || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{log.line_id ? `${log.line_id.slice(0, 10)}...` : '-'}</TableCell>
                      <TableCell>{getStatusBadge(log.delivery_status)}</TableCell>
                      <TableCell className="text-sm">
                        {log.sent_at ? formatBangkokTimeShort(log.sent_at) : '-'}
                      </TableCell>
                      <TableCell className="text-destructive text-sm max-w-[200px] truncate">
                        {log.error_message || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLogsDialogOpen(false)}>
              {t('ปิด', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
