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
import { th } from "date-fns/locale";
import { Radio, Send, Clock, Users, FileText, History, Loader2, Plus, Trash2, Copy, Eye, Pause, Play, X, Check, Image, MessageSquare, CalendarDays } from "lucide-react";
import { getBangkokNow, formatBangkokDateTime, formatBangkokISODate, formatBangkokTimeShort, bangkokLocalToUTC } from "@/lib/timezone";

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

export default function Broadcast() {
  const queryClient = useQueryClient();
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

  // Fetch employees with LINE ID
  const { data: employees } = useQuery({
    queryKey: ["broadcast-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, line_user_id")
        .eq("is_active", true)
        .not("line_user_id", "is", null)
        .order("full_name");
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
            ? bangkokLocalToUTC(scheduledAt)  // Convert Bangkok local time to UTC
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
        throw new Error("No recipients selected");
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
      toast.success(scheduleType === "now" ? "Broadcast sent successfully!" : "Broadcast scheduled!");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (error) => {
      toast.error(`Failed to send broadcast: ${error.message}`);
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
      toast.success("Broadcast cancelled");
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (error) => {
      toast.error(`Failed to cancel: ${error.message}`);
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
      toast.success(pause ? "Broadcast paused" : "Broadcast resumed");
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
  });

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
      toast.success("Broadcast cloned to editor");
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
      toast.success("Template saved!");
      setTemplateDialogOpen(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
      queryClient.invalidateQueries({ queryKey: ["broadcast-templates"] });
    },
    onError: (error) => {
      toast.error(`Failed to save template: ${error.message}`);
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
      toast.success("Recipient group created!");
      setRecipientGroupDialogOpen(false);
      setNewGroupName("");
      setNewGroupDesc("");
      queryClient.invalidateQueries({ queryKey: ["recipient-groups"] });
    },
    onError: (error) => {
      toast.error(`Failed to create group: ${error.message}`);
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
      toast.success("Template deleted");
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
    
    toast.success(`Template "${template.name}" loaded`);
  };

  // Helper function to replace template variables for preview
  const replaceTemplateVariables = (text: string, recipientName: string = "ชื่อผู้รับ"): string => {
    const now = getBangkokNow();
    const dateStr = now.toLocaleDateString('th-TH');
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const datetimeStr = now.toLocaleString('th-TH');
    
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
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      scheduled: "outline",
      sending: "default",
      completed: "default",
      failed: "destructive",
      paused: "secondary",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
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
      <div className="flex items-center gap-3">
        <Radio className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Broadcast Management</h1>
          <p className="text-muted-foreground">Send messages to users, groups, and employees</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Create New
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="groups" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Recipient Groups
          </TabsTrigger>
        </TabsList>

        {/* CREATE NEW TAB */}
        <TabsContent value="create" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Message Form */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Message Content</CardTitle>
                  <CardDescription>Compose your broadcast message</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title (Internal)</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Monthly Newsletter - December"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Message Type</Label>
                    <Select value={messageType} onValueChange={(v) => setMessageType(v as MessageType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" /> Text Only
                          </div>
                        </SelectItem>
                        <SelectItem value="image">
                          <div className="flex items-center gap-2">
                            <Image className="h-4 w-4" /> Image Only
                          </div>
                        </SelectItem>
                        <SelectItem value="text_image">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />+
                            <Image className="h-4 w-4" /> Text + Image
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(messageType === "text" || messageType === "text_image") && (
                    <div className="space-y-2">
                      <Label htmlFor="content">Message Text</Label>
                      <Textarea
                        id="content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Enter your message..."
                        rows={5}
                      />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{content.length} characters</span>
                        <span className="text-border">|</span>
                        <span>Variables:</span>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{"{{name}}"}</code>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{"{{date}}"}</code>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{"{{time}}"}</code>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{"{{datetime}}"}</code>
                      </div>
                    </div>
                  )}

                  {(messageType === "image" || messageType === "text_image") && (
                    <div className="space-y-2">
                      <Label htmlFor="imageUrl">Image URL</Label>
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
                          <Plus className="h-4 w-4 mr-1" /> Save as Template
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Save as Template</DialogTitle>
                          <DialogDescription>Save this message as a reusable template</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Template Name</Label>
                            <Input
                              value={newTemplateName}
                              onChange={(e) => setNewTemplateName(e.target.value)}
                              placeholder="e.g., Welcome Message"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Description (Optional)</Label>
                            <Input
                              value={newTemplateDesc}
                              onChange={(e) => setNewTemplateDesc(e.target.value)}
                              placeholder="Brief description..."
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => saveTemplateMutation.mutate()}
                            disabled={!newTemplateName.trim() || saveTemplateMutation.isPending}
                          >
                            {saveTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                            Save Template
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
                          <SelectValue placeholder="Load Template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
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
                    <Clock className="h-5 w-5" /> Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={scheduleType === "now"}
                        onChange={() => setScheduleType("now")}
                        className="w-4 h-4"
                      />
                      Send Now
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={scheduleType === "later"}
                        onChange={() => setScheduleType("later")}
                        className="w-4 h-4"
                      />
                      Schedule for Later
                    </label>
                  </div>

                  {scheduleType === "later" && (
                    <div className="space-y-2">
                      <Label>Scheduled Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                    <Label>Recurring Broadcast</Label>
                  </div>

                  {isRecurring && (
                    <div className="grid grid-cols-2 gap-4 pl-6">
                      <div className="space-y-2">
                        <Label>Repeat</Label>
                        <Select value={recurrencePattern} onValueChange={(v) => setRecurrencePattern(v as RecurrencePattern)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="every_3_days">Every 3 Days</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>End Date (Optional)</Label>
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
                    <Users className="h-5 w-5" /> Recipients
                  </CardTitle>
                  <CardDescription>
                    Selected: <span className="font-semibold text-foreground">{getTotalRecipients()}</span> recipients
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Recipient Groups */}
                  {recipientGroups && recipientGroups.length > 0 && (
                    <div className="space-y-2">
                      <Label>Saved Groups</Label>
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
                    <Label>Users ({users?.length || 0})</Label>
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
                      {!users?.length && <p className="text-sm text-muted-foreground">No users with LINE ID</p>}
                    </ScrollArea>
                  </div>

                  {/* Groups */}
                  <div className="space-y-2">
                    <Label>LINE Groups ({groups?.length || 0})</Label>
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
                      {!groups?.length && <p className="text-sm text-muted-foreground">No active groups</p>}
                    </ScrollArea>
                  </div>

                  {/* Employees */}
                  <div className="space-y-2">
                    <Label>Employees ({employees?.length || 0})</Label>
                    <ScrollArea className="h-32 border rounded-md p-2">
                      {employees?.map((emp) => (
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
                      {!employees?.length && <p className="text-sm text-muted-foreground">No employees with LINE ID</p>}
                    </ScrollArea>
                  </div>

                  {/* Save as Recipient Group */}
                  <Dialog open={recipientGroupDialogOpen} onOpenChange={setRecipientGroupDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full" disabled={getTotalRecipients() === 0}>
                        <Plus className="h-4 w-4 mr-1" /> Save Selection as Group
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Save as Recipient Group</DialogTitle>
                        <DialogDescription>Save current selection ({getTotalRecipients()} recipients) as a reusable group</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Group Name</Label>
                          <Input
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="e.g., Marketing Team"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Description (Optional)</Label>
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
                          Save Group
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button variant="outline" className="w-full" onClick={() => setPreviewOpen(true)} disabled={!content && !imageUrl}>
                  <Eye className="h-4 w-4 mr-2" /> Preview
                </Button>
                <Button className="w-full" onClick={() => setConfirmSendOpen(true)} disabled={!canSend() || sending}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {scheduleType === "now" ? "Send Now" : "Schedule"}
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
                  <CalendarDays className="h-5 w-5" /> Broadcast Calendar
                </CardTitle>
                <CardDescription>Select a date to view scheduled broadcasts</CardDescription>
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
                  <span>Has scheduled broadcasts</span>
                </div>
              </CardContent>
            </Card>

            {/* Broadcasts for selected date */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {selectedCalendarDate 
                    ? format(selectedCalendarDate, "EEEE, d MMMM yyyy", { locale: th })
                    : "Select a date"}
                </CardTitle>
                <CardDescription>
                  {broadcastsForSelectedDate.length} broadcast(s) scheduled
                </CardDescription>
              </CardHeader>
              <CardContent>
                {broadcastsForSelectedDate.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No broadcasts scheduled for this date</p>
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab("create")}>
                      <Plus className="h-4 w-4 mr-2" /> Create New Broadcast
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
                                  {broadcast.total_recipients} recipients
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
                                onClick={() => cloneBroadcastMutation.mutate(broadcast)} 
                                title="Clone"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              {broadcast.status === "scheduled" && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => togglePauseMutation.mutate({ broadcastId: broadcast.id, pause: true })} 
                                  title="Pause"
                                >
                                  <Pause className="h-4 w-4" />
                                </Button>
                              )}
                              {broadcast.status === "paused" && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => togglePauseMutation.mutate({ broadcastId: broadcast.id, pause: false })} 
                                  title="Resume"
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => cancelBroadcastMutation.mutate(broadcast.id)} 
                                title="Cancel"
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
              <CardTitle>📊 Upcoming Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-primary">{upcomingStats.today}</div>
                  <div className="text-sm text-muted-foreground mt-1">Today</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-blue-500">{upcomingStats.thisWeek}</div>
                  <div className="text-sm text-muted-foreground mt-1">This Week</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-orange-500">{upcomingStats.recurring}</div>
                  <div className="text-sm text-muted-foreground mt-1">Recurring</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-yellow-500">{upcomingStats.paused}</div>
                  <div className="text-sm text-muted-foreground mt-1">Paused</div>
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
                <History className="h-5 w-5" /> Broadcast History
              </CardTitle>
              <CardDescription>View and manage past broadcasts</CardDescription>
            </CardHeader>
            <CardContent>
              {broadcastsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : broadcasts?.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No broadcasts yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Success Rate</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {broadcasts?.map((broadcast) => (
                      <TableRow key={broadcast.id}>
                        <TableCell className="font-medium">{broadcast.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{broadcast.message_type}</Badge>
                          {broadcast.is_recurring && <Badge variant="secondary" className="ml-1">Recurring</Badge>}
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
                              onClick={() => cloneBroadcastMutation.mutate(broadcast)}
                              title="Clone"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {broadcast.status === "scheduled" && broadcast.is_recurring && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => togglePauseMutation.mutate({ broadcastId: broadcast.id, pause: true })}
                                title="Pause"
                              >
                                <Pause className="h-4 w-4" />
                              </Button>
                            )}
                            {broadcast.status === "paused" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => togglePauseMutation.mutate({ broadcastId: broadcast.id, pause: false })}
                                title="Resume"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {(broadcast.status === "scheduled" || broadcast.status === "paused") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => cancelBroadcastMutation.mutate(broadcast.id)}
                                title="Cancel"
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

        {/* TEMPLATES TAB */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Message Templates
              </CardTitle>
              <CardDescription>Reusable message templates for quick broadcasting</CardDescription>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : templates?.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No templates yet. Create one from the Create New tab.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Actions</TableHead>
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
                        <TableCell>{template.usage_count} times</TableCell>
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
                              Use
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
                <Users className="h-5 w-5" /> Recipient Groups
              </CardTitle>
              <CardDescription>Saved groups of recipients for quick selection</CardDescription>
            </CardHeader>
            <CardContent>
              {recipientGroupsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : recipientGroups?.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No recipient groups yet. Create one from the Create New tab.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipientGroups?.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell className="text-muted-foreground">{group.description || "-"}</TableCell>
                        <TableCell>
                          <Badge>{group.member_count} members</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRecipientGroups([group.id]);
                              setActiveTab("create");
                              toast.success(`Group "${group.name}" selected`);
                            }}
                          >
                            Use
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

      {/* Preview Dialog - Enhanced with recipients and variables */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" /> Broadcast Preview
            </DialogTitle>
            <DialogDescription>Review message and recipients before sending</DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Message Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Message Preview (with sample variables)</Label>
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
                  * Variables like {"{{name}}"} will be replaced with each recipient's actual name
                </p>
              )}
            </div>

            {/* Recipients Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Recipients ({getTotalRecipients()} total)
              </Label>
              <ScrollArea className="h-40 border rounded-md">
                <div className="p-3 space-y-3">
                  {selectedUsers.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase">Users ({selectedUsers.length})</span>
                      <div className="mt-1 space-y-0.5">
                        {selectedUsers.slice(0, 10).map(id => {
                          const user = users?.find(u => u.id === id);
                          return <div key={id} className="text-sm">{user?.display_name || id}</div>;
                        })}
                        {selectedUsers.length > 10 && (
                          <div className="text-xs text-muted-foreground">...and {selectedUsers.length - 10} more</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedGroups.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase">Groups ({selectedGroups.length})</span>
                      <div className="mt-1 space-y-0.5">
                        {selectedGroups.slice(0, 10).map(id => {
                          const group = groups?.find(g => g.id === id);
                          return <div key={id} className="text-sm">{group?.display_name || id}</div>;
                        })}
                        {selectedGroups.length > 10 && (
                          <div className="text-xs text-muted-foreground">...and {selectedGroups.length - 10} more</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedEmployees.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase">Employees ({selectedEmployees.length})</span>
                      <div className="mt-1 space-y-0.5">
                        {selectedEmployees.slice(0, 10).map(id => {
                          const emp = employees?.find(e => e.id === id);
                          return <div key={id} className="text-sm">{emp?.full_name || id}</div>;
                        })}
                        {selectedEmployees.length > 10 && (
                          <div className="text-xs text-muted-foreground">...and {selectedEmployees.length - 10} more</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedRecipientGroups.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase">Saved Groups ({selectedRecipientGroups.length})</span>
                      <div className="mt-1 space-y-0.5">
                        {selectedRecipientGroups.map(id => {
                          const rg = recipientGroups?.find(r => r.id === id);
                          return <div key={id} className="text-sm">{rg?.name || id} ({rg?.member_count || 0} members)</div>;
                        })}
                      </div>
                    </div>
                  )}
                  {getTotalRecipients() === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No recipients selected</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
            <Button onClick={() => { setPreviewOpen(false); setConfirmSendOpen(true); }} disabled={!canSend()}>
              <Send className="h-4 w-4 mr-2" />
              Continue to Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Send Dialog */}
      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Broadcast</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>You are about to {scheduleType === "now" ? "send" : "schedule"} a broadcast to:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>{getTotalRecipients()}</strong> recipients</li>
                {isRecurring && <li>Recurring: <strong>{recurrencePattern}</strong></li>}
                {scheduleType === "later" && scheduledAt && (
                  <li>Scheduled: <strong>{format(new Date(scheduledAt), "PPpp")}</strong></li>
                )}
              </ul>
              <p className="text-destructive font-medium mt-4">This action cannot be undone for sent messages.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => createBroadcastMutation.mutate()} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {scheduleType === "now" ? "Send Now" : "Schedule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
