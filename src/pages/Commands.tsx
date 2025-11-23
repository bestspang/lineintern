import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ModeSelector } from '@/components/ModeSelector';
import { 
  Edit, 
  Trash2, 
  Plus, 
  Terminal,
  MessageSquare,
  FileText,
  HelpCircle,
  CheckSquare,
  BarChart3,
  Info,
  AlertCircle,
  Image as ImageIcon,
  Send,
  Sparkles
} from 'lucide-react';

const iconMap: Record<string, any> = {
  FileText,
  HelpCircle,
  CheckSquare,
  BarChart3,
  Info,
  MessageSquare,
  ImageIcon,
};

export default function Commands() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('commands');
  const [editingCommand, setEditingCommand] = useState<any>(null);
  const [editingAlias, setEditingAlias] = useState<any>(null);
  const [editingTrigger, setEditingTrigger] = useState<any>(null);
  const [isCommandDialogOpen, setIsCommandDialogOpen] = useState(false);
  const [isAliasDialogOpen, setIsAliasDialogOpen] = useState(false);
  const [isTriggerDialogOpen, setIsTriggerDialogOpen] = useState(false);
  const [testPrompt, setTestPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [testMode, setTestMode] = useState('helper');

  // Fetch commands
  const { data: commands } = useQuery({
    queryKey: ['bot-commands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bot_commands')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data;
    },
  });

  // Fetch aliases
  const { data: aliases } = useQuery({
    queryKey: ['command-aliases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('command_aliases')
        .select(`
          *,
          command:bot_commands!command_aliases_command_id_fkey(id, command_key, display_name_en, display_name_th)
        `)
        .order('command_id')
        .order('is_primary', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch triggers
  const { data: triggers } = useQuery({
    queryKey: ['bot-triggers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bot_triggers')
        .select('*')
        .order('is_primary', { ascending: false })
        .order('trigger_text');
      if (error) throw error;
      return data;
    },
  });

  // Mutations for commands
  const deleteCommandMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bot_commands').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-commands'] });
      toast({ title: 'คำสั่งถูกลบแล้ว' });
    },
  });

  const saveCommandMutation = useMutation({
    mutationFn: async (command: any) => {
      if (command.id) {
        const { error } = await supabase
          .from('bot_commands')
          .update(command)
          .eq('id', command.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bot_commands').insert(command);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-commands'] });
      setIsCommandDialogOpen(false);
      toast({ title: editingCommand?.id ? 'อัปเดตคำสั่งแล้ว' : 'สร้างคำสั่งแล้ว' });
    },
  });

  // Mutations for aliases
  const deleteAliasMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('command_aliases').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-aliases'] });
      toast({ title: 'Alias ถูกลบแล้ว' });
    },
  });

  const saveAliasMutation = useMutation({
    mutationFn: async (alias: any) => {
      if (alias.id) {
        const { error } = await supabase
          .from('command_aliases')
          .update(alias)
          .eq('id', alias.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('command_aliases').insert(alias);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-aliases'] });
      setIsAliasDialogOpen(false);
      toast({ title: editingAlias?.id ? 'อัปเดต Alias แล้ว' : 'สร้าง Alias แล้ว' });
    },
  });

  // Mutations for triggers
  const deleteTriggerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bot_triggers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-triggers'] });
      toast({ title: 'Trigger ถูกลบแล้ว' });
    },
  });

  const saveTriggerMutation = useMutation({
    mutationFn: async (trigger: any) => {
      if (trigger.id) {
        const { error } = await supabase
          .from('bot_triggers')
          .update(trigger)
          .eq('id', trigger.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bot_triggers').insert(trigger);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-triggers'] });
      setIsTriggerDialogOpen(false);
      toast({ title: editingTrigger?.id ? 'อัปเดต Trigger แล้ว' : 'สร้าง Trigger แล้ว' });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Terminal className="w-8 h-8" />
          Command Management
        </h1>
        <p className="text-muted-foreground">จัดการคำสั่งและ triggers ของบอท</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="commands">คำสั่งหลัก</TabsTrigger>
              <TabsTrigger value="aliases">Aliases</TabsTrigger>
              <TabsTrigger value="triggers">Bot Triggers</TabsTrigger>
              <TabsTrigger value="test">ทดสอบคำสั่ง</TabsTrigger>
            </TabsList>

            <TabsContent value="commands" className="space-y-4 mt-6">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  จัดการคำสั่งหลักของบอท เปิด/ปิด และกำหนดพฤติกรรม
                </p>
                <Button
                  onClick={() => {
                    setEditingCommand({
                      command_key: '',
                      display_name_en: '',
                      display_name_th: '',
                      description_en: '',
                      description_th: '',
                      usage_example_en: '',
                      usage_example_th: '',
                      is_enabled: true,
                      require_mention_in_group: false,
                      available_in_dm: true,
                      available_in_group: true,
                      icon_name: 'MessageSquare',
                      display_order: 999,
                    });
                    setIsCommandDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  เพิ่มคำสั่งใหม่
                </Button>
              </div>

              <div className="rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[55%] min-w-[220px]">คำสั่ง</TableHead>
                      <TableHead className="w-[25%] min-w-[160px]">คำอธิบาย</TableHead>
                      <TableHead className="w-[10%]">สถานะ</TableHead>
                      <TableHead className="w-[10%] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commands?.map((cmd) => {
                      const Icon = iconMap[cmd.icon_name || 'MessageSquare'] || MessageSquare;
                      return (
                        <TableRow key={cmd.id}>
                          <TableCell>
                            <div className="flex items-start gap-3 min-w-0">
                              <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                              <div className="space-y-1 min-w-0">
                                <code className="bg-muted px-2 py-0.5 rounded text-xs inline-block">
                                  {cmd.command_key}
                                </code>
                                <div className="text-sm font-medium truncate">
                                  {cmd.display_name_en}
                                </div>
                                {cmd.display_name_th && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    {cmd.display_name_th}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="space-y-1 max-w-md">
                              <p className="text-sm line-clamp-2">{cmd.description_en}</p>
                              {cmd.description_th && (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {cmd.description_th}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-col gap-1 text-xs">
                              <Badge variant={cmd.is_enabled ? 'default' : 'secondary'} className="w-fit">
                                {cmd.is_enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                              </Badge>
                              <div className="flex flex-wrap gap-1">
                                {cmd.require_mention_in_group && (
                                  <Badge variant="outline" className="text-[10px]">
                                    ต้อง @mention
                                  </Badge>
                                )}
                                {cmd.available_in_dm && <span>✓ DM</span>}
                                {cmd.available_in_group && <span>✓ Group</span>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  setEditingCommand(cmd);
                                  setIsCommandDialogOpen(true);
                                }}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => deleteCommandMutation.mutate(cmd.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="aliases" className="space-y-4 mt-6">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  กำหนด aliases หลายตัวสำหรับแต่ละคำสั่ง รองรับหลายภาษา
                </p>
                <Button
                  onClick={() => {
                    if (!commands || commands.length === 0) {
                      toast({
                        title: 'ไม่สามารถสร้าง Alias ได้',
                        description: 'กรุณาสร้างคำสั่งก่อน',
                        variant: 'destructive',
                      });
                      return;
                    }
                    setEditingAlias({
                      command_id: commands[0].id,
                      alias_text: '',
                      language: 'en',
                      is_primary: false,
                      is_prefix: true,
                      case_sensitive: false,
                    });
                    setIsAliasDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  เพิ่ม Alias
                </Button>
              </div>

              <div className="rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[45%] min-w-[200px]">Alias</TableHead>
                      <TableHead className="w-[25%] min-w-[140px]">ภาษา / ตัวเลือก</TableHead>
                      <TableHead className="w-[20%]">การใช้งาน</TableHead>
                      <TableHead className="w-[10%] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aliases?.map((alias) => (
                      <TableRow key={alias.id}>
                        <TableCell>
                          <div className="space-y-1 min-w-0">
                            <code className="bg-muted px-2 py-0.5 rounded text-xs inline-block">
                              {alias.command?.command_key}
                            </code>
                            <div>
                              <code className="bg-primary/10 px-2 py-0.5 rounded font-medium text-xs inline-block">
                                {alias.alias_text}
                              </code>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-1 text-xs">
                            <Badge variant="outline" className="w-fit">{alias.language}</Badge>
                            <div className="flex flex-wrap gap-1">
                              {alias.is_primary && <Badge className="text-[10px]">Primary</Badge>}
                              {alias.is_prefix && <span>Prefix</span>}
                              {alias.case_sensitive && <span>Case-sensitive</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground align-top">
                          ใช้ {alias.usage_count} ครั้ง
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditingAlias(alias);
                                setIsAliasDialogOpen(true);
                              }}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => deleteAliasMutation.mutate(alias.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="triggers" className="space-y-4 mt-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">
                    คำเรียกบอทในกลุ่ม เช่น @goodlime, Hi, เฮ้
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    เปลี่ยน trigger อาจทำให้คำสั่งเดิมไม่ทำงาน
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setEditingTrigger({
                      trigger_text: '',
                      trigger_type: 'mention',
                      language: 'en',
                      is_enabled: true,
                      is_primary: false,
                      case_sensitive: false,
                      match_type: 'contains',
                      available_in_dm: false,
                      available_in_group: true,
                    });
                    setIsTriggerDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  เพิ่ม Trigger
                </Button>
              </div>

              <div className="rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50%] min-w-[220px]">Trigger</TableHead>
                      <TableHead className="w-[30%] min-w-[160px]">รายละเอียด</TableHead>
                      <TableHead className="w-[10%]">สถานะ</TableHead>
                      <TableHead className="w-[10%] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {triggers?.map((trigger) => (
                      <TableRow key={trigger.id}>
                        <TableCell>
                          <div className="space-y-1 min-w-0">
                            <code className="bg-primary/10 px-2 py-0.5 rounded font-medium text-xs inline-block">
                              {trigger.trigger_text}
                            </code>
                            <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px]">{trigger.trigger_type}</Badge>
                              <Badge variant="outline" className="text-[10px]">{trigger.language}</Badge>
                              {trigger.is_primary && <Badge className="text-[10px]">Primary</Badge>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-1 text-xs">
                            <span>Match: {trigger.match_type}</span>
                            <span>
                              ใช้ {trigger.usage_count} ครั้ง
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={trigger.is_enabled ? 'default' : 'secondary'}>
                            {trigger.is_enabled ? 'เปิด' : 'ปิด'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditingTrigger(trigger);
                                setIsTriggerDialogOpen(true);
                              }}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => deleteTriggerMutation.mutate(trigger.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="test" className="space-y-6 mt-6">
              <div className="flex justify-end mb-4">
                <ModeSelector 
                  currentMode={testMode} 
                  onModeChange={setTestMode}
                />
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">ทดสอบคำสั่ง /imagine</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  ทดสอบการสร้างภาพด้วย AI โดยใช้คำสั่ง /imagine - ระบบจะสร้างภาพตามคำอธิบายที่คุณให้มา
                </p>

                <Card className="bg-muted/50">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="test-prompt" className="text-base">Prompt (คำอธิบายภาพ)</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          อธิบายภาพที่ต้องการให้ AI สร้าง เช่น "วาดภาพแมวน้อยน่ารักกำลังเล่นกับลูกบอล"
                        </p>
                        <Textarea
                          id="test-prompt"
                          placeholder="เช่น: A beautiful sunset over mountains with a lake in the foreground"
                          value={testPrompt}
                          onChange={(e) => setTestPrompt(e.target.value)}
                          rows={3}
                          disabled={isGenerating}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm">ตัวอย่าง Prompts</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {[
                            'A cute cat playing with a ball of yarn',
                            'Beautiful cherry blossoms in full bloom with Mount Fuji in the background',
                            'A cozy coffee shop interior with warm lighting',
                            'Futuristic city skyline at night with neon lights',
                            'Peaceful zen garden with koi pond',
                            'Delicious Thai food platter with pad thai and tom yum'
                          ].map((example, idx) => (
                            <Button
                              key={idx}
                              variant="outline"
                              size="sm"
                              className="justify-start text-left h-auto py-2"
                              onClick={() => setTestPrompt(example)}
                              disabled={isGenerating}
                            >
                              <span className="text-xs line-clamp-2">{example}</span>
                            </Button>
                          ))}
                        </div>
                      </div>

                      <Button
                        onClick={async () => {
                          if (!testPrompt.trim()) {
                            toast({
                              title: 'กรุณาใส่ prompt',
                              description: 'โปรดระบุคำอธิบายภาพที่ต้องการสร้าง',
                              variant: 'destructive'
                            });
                            return;
                          }

                          setIsGenerating(true);
                          setGeneratedImage(null);

                          try {
                            const { data, error } = await supabase.functions.invoke('test-bot', {
                              body: {
                                command: 'imagine',
                                prompt: testPrompt
                              }
                            });

                            if (error) throw error;

                            if (data?.imageUrl) {
                              setGeneratedImage(data.imageUrl);
                              toast({
                                title: 'สร้างภาพสำเร็จ!',
                                description: 'ภาพถูกสร้างและบันทึกแล้ว'
                              });
                            }
                          } catch (error: any) {
                            console.error('Error generating image:', error);
                            toast({
                              title: 'เกิดข้อผิดพลาด',
                              description: error.message || 'ไม่สามารถสร้างภาพได้',
                              variant: 'destructive'
                            });
                          } finally {
                            setIsGenerating(false);
                          }
                        }}
                        disabled={isGenerating || !testPrompt.trim()}
                        className="w-full"
                      >
                        {isGenerating ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            กำลังสร้างภาพ...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            สร้างภาพ
                          </>
                        )}
                      </Button>

                      {generatedImage && (
                        <Card className="overflow-hidden">
                          <CardContent className="p-0">
                            <div className="relative">
                              <img
                                src={generatedImage}
                                alt="Generated"
                                className="w-full h-auto"
                              />
                              <div className="absolute top-2 right-2">
                                <Badge className="bg-background/90 backdrop-blur">
                                  <ImageIcon className="w-3 h-3 mr-1" />
                                  Generated
                                </Badge>
                              </div>
                            </div>
                            <div className="p-4 space-y-2">
                              <p className="text-sm font-medium">Prompt:</p>
                              <p className="text-sm text-muted-foreground">{testPrompt}</p>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => window.open(generatedImage, '_blank')}
                                >
                                  เปิดในหน้าต่างใหม่
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    navigator.clipboard.writeText(generatedImage);
                                    toast({ title: 'คัดลอก URL แล้ว' });
                                  }}
                                >
                                  คัดลอก URL
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <div className="mt-4 p-4 bg-muted rounded-lg">
                        <div className="flex items-start gap-2">
                          <Info className="w-5 h-5 text-muted-foreground mt-0.5" />
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p className="font-medium">วิธีใช้ใน LINE:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                              <li>พิมพ์ <code className="bg-background px-1.5 py-0.5 rounded">/imagine</code> ตามด้วยคำอธิบายภาพ</li>
                              <li>รอสักครู่เพื่อให้ AI สร้างภาพ</li>
                              <li>บอทจะส่งภาพที่สร้างกลับมาให้ในแชท</li>
                            </ul>
                            <p className="mt-2">
                              ตัวอย่าง: <code className="bg-background px-1.5 py-0.5 rounded">/imagine A beautiful sunset over the ocean</code>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Command Edit Dialog */}
      <Dialog open={isCommandDialogOpen} onOpenChange={setIsCommandDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCommand?.id ? 'แก้ไขคำสั่ง' : 'สร้างคำสั่งใหม่'}
            </DialogTitle>
          </DialogHeader>
          {editingCommand && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Command Key *</Label>
                  <Input
                    value={editingCommand.command_key}
                    onChange={(e) =>
                      setEditingCommand({ ...editingCommand, command_key: e.target.value })
                    }
                    placeholder="summary, faq, todo"
                  />
                </div>
                <div>
                  <Label>Icon</Label>
                  <Select
                    value={editingCommand.icon_name}
                    onValueChange={(val) =>
                      setEditingCommand({ ...editingCommand, icon_name: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FileText">FileText</SelectItem>
                      <SelectItem value="HelpCircle">HelpCircle</SelectItem>
                      <SelectItem value="CheckSquare">CheckSquare</SelectItem>
                      <SelectItem value="BarChart3">BarChart3</SelectItem>
                      <SelectItem value="Info">Info</SelectItem>
                      <SelectItem value="MessageSquare">MessageSquare</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Display Name (EN) *</Label>
                  <Input
                    value={editingCommand.display_name_en}
                    onChange={(e) =>
                      setEditingCommand({ ...editingCommand, display_name_en: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Display Name (TH)</Label>
                  <Input
                    value={editingCommand.display_name_th || ''}
                    onChange={(e) =>
                      setEditingCommand({ ...editingCommand, display_name_th: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Description (EN) *</Label>
                <Textarea
                  value={editingCommand.description_en}
                  onChange={(e) =>
                    setEditingCommand({ ...editingCommand, description_en: e.target.value })
                  }
                  rows={2}
                />
              </div>

              <div>
                <Label>Description (TH)</Label>
                <Textarea
                  value={editingCommand.description_th || ''}
                  onChange={(e) =>
                    setEditingCommand({ ...editingCommand, description_th: e.target.value })
                  }
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Usage Example (EN)</Label>
                  <Input
                    value={editingCommand.usage_example_en || ''}
                    onChange={(e) =>
                      setEditingCommand({ ...editingCommand, usage_example_en: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Usage Example (TH)</Label>
                  <Input
                    value={editingCommand.usage_example_th || ''}
                    onChange={(e) =>
                      setEditingCommand({ ...editingCommand, usage_example_th: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>เปิดใช้งาน</Label>
                  <Switch
                    checked={editingCommand.is_enabled}
                    onCheckedChange={(checked) =>
                      setEditingCommand({ ...editingCommand, is_enabled: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>ต้อง @mention ในกลุ่ม</Label>
                  <Switch
                    checked={editingCommand.require_mention_in_group}
                    onCheckedChange={(checked) =>
                      setEditingCommand({ ...editingCommand, require_mention_in_group: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>ใช้ได้ใน DM</Label>
                  <Switch
                    checked={editingCommand.available_in_dm}
                    onCheckedChange={(checked) =>
                      setEditingCommand({ ...editingCommand, available_in_dm: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>ใช้ได้ในกลุ่ม</Label>
                  <Switch
                    checked={editingCommand.available_in_group}
                    onCheckedChange={(checked) =>
                      setEditingCommand({ ...editingCommand, available_in_group: checked })
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={editingCommand.display_order}
                  onChange={(e) =>
                    setEditingCommand({ ...editingCommand, display_order: parseInt(e.target.value) })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCommandDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={() => saveCommandMutation.mutate(editingCommand)}>
              {editingCommand?.id ? 'อัปเดต' : 'สร้าง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alias Edit Dialog */}
      <Dialog open={isAliasDialogOpen} onOpenChange={setIsAliasDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAlias?.id ? 'แก้ไข Alias' : 'สร้าง Alias ใหม่'}</DialogTitle>
          </DialogHeader>
          {editingAlias && (
            <div className="space-y-4">
              <div>
                <Label>คำสั่ง *</Label>
                <Select
                  value={editingAlias.command_id}
                  onValueChange={(val) => setEditingAlias({ ...editingAlias, command_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {commands?.map((cmd) => (
                      <SelectItem key={cmd.id} value={cmd.id}>
                        {cmd.command_key} - {cmd.display_name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Alias Text *</Label>
                <Input
                  value={editingAlias.alias_text}
                  onChange={(e) => setEditingAlias({ ...editingAlias, alias_text: e.target.value })}
                  placeholder="/สรุป, สรุปหน่อย, Hi"
                />
              </div>

              <div>
                <Label>ภาษา</Label>
                <Select
                  value={editingAlias.language}
                  onValueChange={(val) => setEditingAlias({ ...editingAlias, language: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="th">ไทย</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Primary Alias</Label>
                  <Switch
                    checked={editingAlias.is_primary}
                    onCheckedChange={(checked) =>
                      setEditingAlias({ ...editingAlias, is_primary: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>เป็น Prefix (ต้องอยู่ต้นข้อความ)</Label>
                  <Switch
                    checked={editingAlias.is_prefix}
                    onCheckedChange={(checked) =>
                      setEditingAlias({ ...editingAlias, is_prefix: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Case Sensitive</Label>
                  <Switch
                    checked={editingAlias.case_sensitive}
                    onCheckedChange={(checked) =>
                      setEditingAlias({ ...editingAlias, case_sensitive: checked })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAliasDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={() => saveAliasMutation.mutate(editingAlias)}>
              {editingAlias?.id ? 'อัปเดต' : 'สร้าง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trigger Edit Dialog */}
      <Dialog open={isTriggerDialogOpen} onOpenChange={setIsTriggerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTrigger?.id ? 'แก้ไข Trigger' : 'สร้าง Trigger ใหม่'}
            </DialogTitle>
          </DialogHeader>
          {editingTrigger && (
            <div className="space-y-4">
              <div>
                <Label>Trigger Text *</Label>
                <Input
                  value={editingTrigger.trigger_text}
                  onChange={(e) =>
                    setEditingTrigger({ ...editingTrigger, trigger_text: e.target.value })
                  }
                  placeholder="@goodlime, Hi, เฮ้"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ประเภท</Label>
                  <Select
                    value={editingTrigger.trigger_type}
                    onValueChange={(val) =>
                      setEditingTrigger({ ...editingTrigger, trigger_type: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mention">Mention (@)</SelectItem>
                      <SelectItem value="keyword">Keyword</SelectItem>
                      <SelectItem value="emoji">Emoji</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ภาษา</Label>
                  <Select
                    value={editingTrigger.language}
                    onValueChange={(val) => setEditingTrigger({ ...editingTrigger, language: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="th">ไทย</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Match Type</Label>
                <Select
                  value={editingTrigger.match_type}
                  onValueChange={(val) => setEditingTrigger({ ...editingTrigger, match_type: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">Exact match</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="starts_with">Starts with</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>เปิดใช้งาน</Label>
                  <Switch
                    checked={editingTrigger.is_enabled}
                    onCheckedChange={(checked) =>
                      setEditingTrigger({ ...editingTrigger, is_enabled: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Primary Trigger</Label>
                  <Switch
                    checked={editingTrigger.is_primary}
                    onCheckedChange={(checked) =>
                      setEditingTrigger({ ...editingTrigger, is_primary: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Case Sensitive</Label>
                  <Switch
                    checked={editingTrigger.case_sensitive}
                    onCheckedChange={(checked) =>
                      setEditingTrigger({ ...editingTrigger, case_sensitive: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>ใช้ได้ใน DM</Label>
                  <Switch
                    checked={editingTrigger.available_in_dm}
                    onCheckedChange={(checked) =>
                      setEditingTrigger({ ...editingTrigger, available_in_dm: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>ใช้ได้ในกลุ่ม</Label>
                  <Switch
                    checked={editingTrigger.available_in_group}
                    onCheckedChange={(checked) =>
                      setEditingTrigger({ ...editingTrigger, available_in_group: checked })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTriggerDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={() => saveTriggerMutation.mutate(editingTrigger)}>
              {editingTrigger?.id ? 'อัปเดต' : 'สร้าง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
