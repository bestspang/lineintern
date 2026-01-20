import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Settings2, 
  Clock, 
  MessageSquare, 
  Flame, 
  Heart, 
  AlertTriangle,
  Save,
  X,
  Bell,
  ChevronDown,
  Users,
  User
} from 'lucide-react';
import { toast } from 'sonner';

interface PointRule {
  id: string;
  rule_key: string;
  name: string;
  name_th: string | null;
  description: string | null;
  description_th: string | null;
  category: string;
  points: number;
  is_active: boolean;
  conditions: Record<string, any>;
  notify_enabled: boolean;
  notify_message_template: string | null;
  notify_group: boolean;
  notify_dm: boolean;
}

const categoryConfig: Record<string, { icon: any; label: string; labelTh: string; color: string }> = {
  attendance: { icon: Clock, label: 'Attendance', labelTh: 'การเข้างาน', color: 'bg-blue-500' },
  response: { icon: MessageSquare, label: 'Response', labelTh: 'การตอบกลับ', color: 'bg-green-500' },
  streak: { icon: Flame, label: 'Streak', labelTh: 'ความต่อเนื่อง', color: 'bg-orange-500' },
  health: { icon: Heart, label: 'Health', labelTh: 'สุขภาพ', color: 'bg-pink-500' },
  penalty: { icon: AlertTriangle, label: 'Penalty', labelTh: 'การหักแต้ม', color: 'bg-red-500' },
};

export default function PointRules() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState<number>(0);
  const [expandedNotify, setExpandedNotify] = useState<string | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['point-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_rules')
        .select('*')
        .order('category')
        .order('points', { ascending: false });

      if (error) throw error;
      return data as PointRule[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PointRule> }) => {
      const { error } = await supabase
        .from('point_rules')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['point-rules'] });
      toast.success('บันทึกเรียบร้อย');
      setEditingId(null);
    },
    onError: (error: any) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    },
  });

  const handleToggle = (rule: PointRule) => {
    updateMutation.mutate({
      id: rule.id,
      updates: { is_active: !rule.is_active },
    });
  };

  const handleStartEdit = (rule: PointRule) => {
    setEditingId(rule.id);
    setEditPoints(rule.points);
  };

  const handleSaveEdit = (rule: PointRule) => {
    updateMutation.mutate({
      id: rule.id,
      updates: { points: editPoints },
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleNotificationUpdate = (rule: PointRule, updates: Partial<PointRule>) => {
    updateMutation.mutate({
      id: rule.id,
      updates,
    });
  };

  // Group rules by category
  const groupedRules = rules?.reduce((acc, rule) => {
    if (!acc[rule.category]) {
      acc[rule.category] = [];
    }
    acc[rule.category].push(rule);
    return acc;
  }, {} as Record<string, PointRule[]>) || {};

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="h-6 w-6" />
            Point Rules Management
          </h1>
          <p className="text-muted-foreground">จัดการเงื่อนไขและค่าแต้ม</p>
        </div>
        <div className="grid gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="h-6 w-6" />
          Point Rules Management
        </h1>
        <p className="text-muted-foreground">จัดการเงื่อนไขและค่าแต้ม</p>
      </div>

      <div className="grid gap-6">
        {Object.entries(categoryConfig).map(([category, config]) => {
          const categoryRules = groupedRules[category] || [];
          if (categoryRules.length === 0) return null;

          const Icon = config.icon;

          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className={`p-2 rounded-lg ${config.color}`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  {config.label}
                  <span className="text-muted-foreground font-normal text-sm">
                    ({config.labelTh})
                  </span>
                </CardTitle>
                <CardDescription>
                  {categoryRules.length} rules
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categoryRules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`rounded-lg border ${
                        !rule.is_active ? 'opacity-50 bg-muted/50' : 'bg-card'
                      }`}
                    >
                      {/* Main rule row */}
                      <div className="flex items-center justify-between p-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{rule.name}</span>
                            {rule.name_th && (
                              <span className="text-muted-foreground text-sm truncate">
                                ({rule.name_th})
                              </span>
                            )}
                          </div>
                          {rule.description_th && (
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                              {rule.description_th}
                            </p>
                          )}
                          {rule.conditions && Object.keys(rule.conditions).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {Object.entries(rule.conditions).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {String(value)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3 ml-4">
                          {editingId === rule.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={editPoints}
                                onChange={(e) => setEditPoints(parseInt(e.target.value) || 0)}
                                className="w-20 h-8"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSaveEdit(rule)}
                                disabled={updateMutation.isPending}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Badge
                              variant={rule.points >= 0 ? 'default' : 'destructive'}
                              className="cursor-pointer hover:opacity-80 min-w-[60px] justify-center"
                              onClick={() => handleStartEdit(rule)}
                            >
                              {rule.points > 0 ? '+' : ''}{rule.points} pts
                            </Badge>
                          )}

                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={() => handleToggle(rule)}
                            disabled={updateMutation.isPending}
                          />
                        </div>
                      </div>

                      {/* Notification settings collapsible */}
                      <Collapsible
                        open={expandedNotify === rule.id}
                        onOpenChange={(open) => setExpandedNotify(open ? rule.id : null)}
                      >
                        <CollapsibleTrigger asChild>
                          <button className="w-full flex items-center justify-between px-3 py-2 border-t text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-2">
                              <Bell className="h-4 w-4" />
                              <span>Notification Settings</span>
                              {rule.notify_enabled && (
                                <Badge variant="outline" className="text-xs">
                                  เปิดอยู่
                                </Badge>
                              )}
                            </div>
                            <ChevronDown className={`h-4 w-4 transition-transform ${expandedNotify === rule.id ? 'rotate-180' : ''}`} />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="p-3 border-t bg-muted/30 space-y-4">
                            {/* Enable notification toggle */}
                            <div className="flex items-center justify-between">
                              <Label htmlFor={`notify-${rule.id}`} className="flex items-center gap-2">
                                <Bell className="h-4 w-4" />
                                เปิดส่ง Notification
                              </Label>
                              <Switch
                                id={`notify-${rule.id}`}
                                checked={rule.notify_enabled}
                                onCheckedChange={(checked) => 
                                  handleNotificationUpdate(rule, { notify_enabled: checked })
                                }
                                disabled={updateMutation.isPending}
                              />
                            </div>

                            {rule.notify_enabled && (
                              <>
                                {/* Message template */}
                                <div className="space-y-2">
                                  <Label>Message Template</Label>
                                  <Textarea
                                    value={rule.notify_message_template || ''}
                                    onChange={(e) => 
                                      handleNotificationUpdate(rule, { notify_message_template: e.target.value })
                                    }
                                    placeholder="เช่น: 🎉 {name} ได้รับ {points} แต้ม!"
                                    className="min-h-[80px]"
                                    disabled={updateMutation.isPending}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Variables: <code className="bg-muted px-1 rounded">{'{name}'}</code> <code className="bg-muted px-1 rounded">{'{points}'}</code> <code className="bg-muted px-1 rounded">{'{streak}'}</code> <code className="bg-muted px-1 rounded">{'{balance}'}</code>
                                  </p>
                                </div>

                                {/* Send destinations */}
                                <div className="space-y-3">
                                  <Label>ส่งไปที่ไหน</Label>
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between p-2 rounded-lg border bg-background">
                                      <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">ส่งในกลุ่ม (Announcement Group)</span>
                                      </div>
                                      <Switch
                                        checked={rule.notify_group}
                                        onCheckedChange={(checked) => 
                                          handleNotificationUpdate(rule, { notify_group: checked })
                                        }
                                        disabled={updateMutation.isPending}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded-lg border bg-background">
                                      <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">ส่งส่วนตัว (DM)</span>
                                      </div>
                                      <Switch
                                        checked={rule.notify_dm}
                                        onCheckedChange={(checked) => 
                                          handleNotificationUpdate(rule, { notify_dm: checked })
                                        }
                                        disabled={updateMutation.isPending}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-dashed">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            💡 คลิกที่แต้มเพื่อแก้ไขค่า • ใช้ Switch เพื่อเปิด/ปิด rule • กดที่ "Notification Settings" เพื่อตั้งค่าการแจ้งเตือน
          </p>
        </CardContent>
      </Card>
    </div>
  );
}