import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Plus, Trash2, Shield, Users, MessageSquare, Clock, Search, Eye, Play, Grid3X3, FileText, ChevronDown, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';

// ── Types ──────────────────────────────────────────────────────

interface AiQueryPolicy {
  id: string;
  source_type: 'group' | 'user';
  source_group_id: string | null;
  source_user_id: string | null;
  enabled: boolean;
  scope_mode: 'all' | 'include' | 'exclude';
  allowed_data_sources: string[];
  time_window_days: number;
  pii_mode: string;
  max_hits_per_group: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

interface AiQueryScopeGroup {
  id: string;
  policy_id: string;
  group_id: string;
}

interface GroupExport {
  id: string;
  group_id: string;
  export_enabled: boolean;
  allowed_data_sources: string[];
  synonyms: string[];
  masking_level: string;
  created_at: string;
  updated_at: string;
}

interface GroupInfo {
  id: string;
  display_name: string;
  line_group_id: string | null;
}

interface UserInfo {
  id: string;
  display_name: string | null;
  line_user_id: string | null;
}

interface AiQueryMemoryRow {
  id: string;
  user_id: string;
  group_id: string;
  question: string;
  answer: string;
  sources_used: any;
  created_at: string;
  expires_at: string;
}

interface AuditLogRow {
  id: string;
  request_id: string;
  user_id: string;
  group_id: string;
  question: string;
  answer: string;
  target_group_ids: string[];
  data_sources_used: string[];
  sources_used: any;
  policy_id: string | null;
  evidence_count: number;
  response_time_ms: number;
  created_at: string;
}

const ALL_DATA_SOURCES = ['messages', 'attendance', 'employees', 'tasks'];

// ── Main Component ─────────────────────────────────────────────

export default function AIQueryControl() {
  const { t } = useLocale();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('AI Cross-Group Query', 'AI Cross-Group Query')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('ควบคุมว่าใครถามได้บ้าง และเข้าถึงข้อมูลกลุ่มไหน', 'Control who can query and which group data they can access')}
        </p>
      </div>

      <Tabs defaultValue="policies">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="policies">{t('กฎการเข้าถึง', 'Access Rules')}</TabsTrigger>
          <TabsTrigger value="export">{t('นโยบายส่งออก', 'Export Policy')}</TabsTrigger>
          <TabsTrigger value="matrix">{t('Access Matrix', 'Access Matrix')}</TabsTrigger>
          <TabsTrigger value="test">{t('ทดสอบ AI', 'Test Console')}</TabsTrigger>
          <TabsTrigger value="audit">{t('Audit Logs', 'Audit Logs')}</TabsTrigger>
          <TabsTrigger value="log">{t('คำถามล่าสุด', 'Recent Queries')}</TabsTrigger>
        </TabsList>

        <TabsContent value="policies"><PoliciesTab /></TabsContent>
        <TabsContent value="export"><ExportPolicyTab /></TabsContent>
        <TabsContent value="matrix"><AccessMatrixTab /></TabsContent>
        <TabsContent value="test"><TestConsoleTab /></TabsContent>
        <TabsContent value="audit"><AuditLogsTab /></TabsContent>
        <TabsContent value="log"><RecentQueriesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tab A: Access Rules ────────────────────────────────────────

function PoliciesTab() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<AiQueryPolicy | null>(null);

  // fetch policies
  const { data: policies, isLoading } = useQuery({
    queryKey: ['ai-query-policies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_query_policies')
        .select('*')
        .order('priority', { ascending: false });
      if (error) throw error;
      return data as AiQueryPolicy[];
    },
  });

  // fetch groups for display
  const { data: groups } = useQuery({
    queryKey: ['groups-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('id, display_name, line_group_id').order('display_name');
      if (error) throw error;
      return data as GroupInfo[];
    },
  });

  // fetch users for display
  const { data: users } = useQuery({
    queryKey: ['users-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, display_name, line_user_id').order('display_name');
      if (error) throw error;
      return data as UserInfo[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('ai_query_policies').update({ enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-query-policies'] }),
    onError: () => toast.error('Failed to toggle policy'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_query_policies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-query-policies'] });
      toast.success(t('ลบสำเร็จ', 'Deleted'));
    },
    onError: () => toast.error('Failed to delete'),
  });

  const getSourceLabel = (p: AiQueryPolicy) => {
    if (p.source_type === 'group') {
      const g = groups?.find(g => g.id === p.source_group_id);
      return g?.display_name || p.source_group_id || '—';
    }
    const u = users?.find(u => u.id === p.source_user_id);
    return u?.display_name || p.source_user_id || '—';
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">{t('กฎการเข้าถึง', 'Access Rules')}</CardTitle>
          <CardDescription className="text-xs">
            {t('กำหนดว่ากลุ่ม/คนไหนถาม AI ข้ามกลุ่มได้', 'Define which groups/users can cross-group query')}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => { setEditingPolicy(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />{t('เพิ่ม', 'Add')}
        </Button>
      </CardHeader>
      <CardContent>
        {!policies?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('ยังไม่มีกฎ — ระบบจะทำงานแบบ single-group ปกติ', 'No rules yet — system works in single-group mode')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('ประเภท', 'Type')}</TableHead>
                <TableHead>{t('แหล่งที่มา', 'Source')}</TableHead>
                <TableHead>{t('โหมด', 'Scope')}</TableHead>
                <TableHead>{t('ข้อมูล', 'Data')}</TableHead>
                <TableHead>{t('วัน', 'Days')}</TableHead>
                <TableHead>{t('เปิด', 'On')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map(p => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {p.source_type === 'group' ? <Users className="h-3 w-3 mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
                      {p.source_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{getSourceLabel(p)}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{p.scope_mode}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.allowed_data_sources.join(', ')}</TableCell>
                  <TableCell className="text-xs">{p.time_window_days}d</TableCell>
                  <TableCell>
                    <Switch checked={p.enabled} onCheckedChange={v => toggleMutation.mutate({ id: p.id, enabled: v })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingPolicy(p); setDialogOpen(true); }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <PolicyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        policy={editingPolicy}
        groups={groups || []}
        users={users || []}
      />
    </Card>
  );
}

// ── Policy Create/Edit Dialog ──────────────────────────────────

function PolicyDialog({
  open, onOpenChange, policy, groups, users,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  policy: AiQueryPolicy | null;
  groups: GroupInfo[];
  users: UserInfo[];
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const isEdit = !!policy;

  const [sourceType, setSourceType] = useState<'group' | 'user'>(policy?.source_type || 'group');
  const [sourceGroupId, setSourceGroupId] = useState(policy?.source_group_id || '');
  const [sourceUserId, setSourceUserId] = useState(policy?.source_user_id || '');
  const [scopeMode, setScopeMode] = useState(policy?.scope_mode || 'all');
  const [dataSources, setDataSources] = useState<string[]>(policy?.allowed_data_sources || ['messages']);
  const [timeWindow, setTimeWindow] = useState(policy?.time_window_days || 30);
  const [piiMode, setPiiMode] = useState(policy?.pii_mode || 'mask_sensitive');
  const [maxHits, setMaxHits] = useState(policy?.max_hits_per_group || 50);
  const [priority, setPriority] = useState(policy?.priority || 0);
  const [scopeGroupIds, setScopeGroupIds] = useState<string[]>([]);

  // load scope groups when editing
  const { data: existingScopeGroups } = useQuery({
    queryKey: ['ai-query-scope-groups', policy?.id],
    queryFn: async () => {
      if (!policy) return [];
      const { data, error } = await supabase
        .from('ai_query_scope_groups')
        .select('group_id')
        .eq('policy_id', policy.id);
      if (error) throw error;
      return data.map(d => d.group_id);
    },
    enabled: !!policy,
  });

  // Reset form state when policy prop changes
  useEffect(() => {
    setSourceType(policy?.source_type || 'group');
    setSourceGroupId(policy?.source_group_id || '');
    setSourceUserId(policy?.source_user_id || '');
    setScopeMode(policy?.scope_mode || 'all');
    setDataSources(policy?.allowed_data_sources || ['messages']);
    setTimeWindow(policy?.time_window_days || 30);
    setPiiMode(policy?.pii_mode || 'mask_sensitive');
    setMaxHits(policy?.max_hits_per_group || 50);
    setPriority(policy?.priority || 0);
    setScopeGroupIds([]);
  }, [policy]);

  // sync existing scope groups
  useEffect(() => {
    if (existingScopeGroups) setScopeGroupIds(existingScopeGroups);
  }, [existingScopeGroups]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        source_type: sourceType,
        source_group_id: sourceType === 'group' ? sourceGroupId : null,
        source_user_id: sourceType === 'user' ? sourceUserId : null,
        scope_mode: scopeMode,
        allowed_data_sources: dataSources,
        time_window_days: timeWindow,
        pii_mode: piiMode,
        max_hits_per_group: maxHits,
        priority,
      };

      let policyId: string;

      if (isEdit) {
        const { error } = await supabase.from('ai_query_policies').update(payload).eq('id', policy!.id);
        if (error) throw error;
        policyId = policy!.id;
      } else {
        const { data, error } = await supabase.from('ai_query_policies').insert(payload).select('id').single();
        if (error) throw error;
        policyId = data.id;
      }

      // update scope groups (delete + re-insert)
      if (scopeMode !== 'all') {
        await supabase.from('ai_query_scope_groups').delete().eq('policy_id', policyId);
        if (scopeGroupIds.length > 0) {
          const rows = scopeGroupIds.map(gid => ({ policy_id: policyId, group_id: gid }));
          const { error } = await supabase.from('ai_query_scope_groups').insert(rows);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-query-policies'] });
      toast.success(t('บันทึกสำเร็จ', 'Saved'));
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || 'Save failed'),
  });

  const toggleDataSource = (ds: string) => {
    setDataSources(prev => prev.includes(ds) ? prev.filter(d => d !== ds) : [...prev, ds]);
  };

  const toggleScopeGroup = (gid: string) => {
    setScopeGroupIds(prev => prev.includes(gid) ? prev.filter(g => g !== gid) : [...prev, gid]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('แก้ไขกฎ', 'Edit Rule') : t('เพิ่มกฎใหม่', 'Add New Rule')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source type */}
          <div className="space-y-1.5">
            <Label>{t('ประเภทแหล่งที่มา', 'Source Type')}</Label>
            <Select value={sourceType} onValueChange={(v: 'group' | 'user') => setSourceType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="group">{t('กลุ่ม', 'Group')}</SelectItem>
                <SelectItem value="user">{t('ผู้ใช้', 'User')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source selection */}
          {sourceType === 'group' ? (
            <div className="space-y-1.5">
              <Label>{t('เลือกกลุ่มที่อนุญาตให้ถาม', 'Select requesting group')}</Label>
              <Select value={sourceGroupId} onValueChange={setSourceGroupId}>
                <SelectTrigger><SelectValue placeholder={t('เลือกกลุ่ม', 'Select group')} /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t('เลือกผู้ใช้ที่อนุญาตให้ถาม', 'Select requesting user')}</Label>
              <Select value={sourceUserId} onValueChange={setSourceUserId}>
                <SelectTrigger><SelectValue placeholder={t('เลือกผู้ใช้', 'Select user')} /></SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name || u.line_user_id || u.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Scope mode */}
          <div className="space-y-1.5">
            <Label>{t('ขอบเขตข้อมูล', 'Scope Mode')}</Label>
            <Select value={scopeMode} onValueChange={(v: 'all' | 'include' | 'exclude') => setScopeMode(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ทุกกลุ่ม', 'All Groups')}</SelectItem>
                <SelectItem value="include">{t('เฉพาะกลุ่มที่เลือก', 'Include Only')}</SelectItem>
                <SelectItem value="exclude">{t('ทุกกลุ่มยกเว้นที่เลือก', 'Exclude Selected')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Scope groups picker */}
          {scopeMode !== 'all' && (
            <div className="space-y-1.5">
              <Label>{scopeMode === 'include' ? t('กลุ่มที่เข้าถึงได้', 'Included Groups') : t('กลุ่มที่ยกเว้น', 'Excluded Groups')}</Label>
              <ScrollArea className="h-32 border rounded-md p-2">
                {groups.map(g => (
                  <div key={g.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={scopeGroupIds.includes(g.id)}
                      onCheckedChange={() => toggleScopeGroup(g.id)}
                    />
                    <span className="text-sm">{g.display_name}</span>
                  </div>
                ))}
              </ScrollArea>
            </div>
          )}

          {/* Data sources */}
          <div className="space-y-1.5">
            <Label>{t('ประเภทข้อมูลที่เข้าถึงได้', 'Accessible Data Sources')}</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_DATA_SOURCES.map(ds => (
                <div key={ds} className="flex items-center gap-1.5">
                  <Checkbox checked={dataSources.includes(ds)} onCheckedChange={() => toggleDataSource(ds)} />
                  <span className="text-sm capitalize">{ds}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Time window */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('ย้อนหลัง (วัน)', 'Time Window (days)')}</Label>
              <Input type="number" value={timeWindow} onChange={e => setTimeWindow(Number(e.target.value))} min={1} max={365} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('ผลลัพธ์สูงสุด/กลุ่ม', 'Max Hits/Group')}</Label>
              <Input type="number" value={maxHits} onChange={e => setMaxHits(Number(e.target.value))} min={1} max={500} />
            </div>
          </div>

          {/* PII mode */}
          <div className="space-y-1.5">
            <Label>{t('โหมดความเป็นส่วนตัว', 'PII Mode')}</Label>
            <Select value={piiMode} onValueChange={setPiiMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('ไม่ซ่อน', 'None')}</SelectItem>
                <SelectItem value="mask_sensitive">{t('ซ่อนข้อมูลอ่อนไหว', 'Mask Sensitive')}</SelectItem>
                <SelectItem value="strict">{t('เข้มงวด', 'Strict')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label>{t('ลำดับความสำคัญ', 'Priority')}</Label>
            <Input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">{t('ตัวเลขสูง = สำคัญกว่า', 'Higher = more important')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('ยกเลิก', 'Cancel')}</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? '...' : t('บันทึก', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab B: Group Export Policy ─────────────────────────────────

function ExportPolicyTab() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [editGroup, setEditGroup] = useState<GroupExport | null>(null);
  const [synonymInput, setSynonymInput] = useState('');

  const { data: groups } = useQuery({
    queryKey: ['groups-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('id, display_name, line_group_id').order('display_name');
      if (error) throw error;
      return data as GroupInfo[];
    },
  });

  const { data: exports, isLoading } = useQuery({
    queryKey: ['ai-query-group-export'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_query_group_export').select('*');
      if (error) throw error;
      return data as GroupExport[];
    },
  });

  const exportMap = new Map((exports || []).map(e => [e.group_id, e]));

  const toggleExportMutation = useMutation({
    mutationFn: async ({ groupId, enabled }: { groupId: string; enabled: boolean }) => {
      const existing = exportMap.get(groupId);
      if (existing) {
        const { error } = await supabase.from('ai_query_group_export').update({ export_enabled: enabled }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ai_query_group_export').insert({
          group_id: groupId,
          export_enabled: enabled,
          allowed_data_sources: ['messages'],
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-query-group-export'] }),
    onError: () => toast.error('Failed to toggle'),
  });

  const saveExportMutation = useMutation({
    mutationFn: async (exp: GroupExport) => {
      const { error } = await supabase.from('ai_query_group_export')
        .update({
          allowed_data_sources: exp.allowed_data_sources,
          synonyms: exp.synonyms,
          masking_level: exp.masking_level,
        })
        .eq('id', exp.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-query-group-export'] });
      toast.success(t('บันทึกสำเร็จ', 'Saved'));
      setEditGroup(null);
    },
    onError: () => toast.error('Save failed'),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('นโยบายส่งออกข้อมูลกลุ่ม', 'Group Export Policy')}</CardTitle>
          <CardDescription className="text-xs">
            {t('กำหนดว่ากลุ่มไหนอนุญาตให้ส่งข้อมูลออกไปใช้ในคำตอบ AI ข้ามกลุ่ม (default: ปิด)', 'Control which groups allow their data to be used in cross-group AI answers (default: off)')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('กลุ่ม', 'Group')}</TableHead>
                <TableHead>{t('ส่งออก', 'Export')}</TableHead>
                <TableHead>{t('ชื่อเรียกอื่น', 'Synonyms')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(groups || []).map(g => {
                const exp = exportMap.get(g.id);
                return (
                  <TableRow key={g.id}>
                    <TableCell className="text-sm font-medium">{g.display_name}</TableCell>
                    <TableCell>
                      <Switch
                        checked={exp?.export_enabled || false}
                        onCheckedChange={v => toggleExportMutation.mutate({ groupId: g.id, enabled: v })}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {exp?.synonyms?.length ? exp.synonyms.join(', ') : '—'}
                    </TableCell>
                    <TableCell>
                      {exp && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditGroup(exp); setSynonymInput(exp.synonyms.join(', ')); }}>
                          {t('แก้ไข', 'Edit')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Export Dialog */}
      <Dialog open={!!editGroup} onOpenChange={() => setEditGroup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('แก้ไขนโยบายส่งออก', 'Edit Export Policy')}</DialogTitle>
          </DialogHeader>
          {editGroup && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('ชื่อเรียกอื่น (คั่นด้วย ,)', 'Synonyms (comma separated)')}</Label>
                <Input value={synonymInput} onChange={e => setSynonymInput(e.target.value)} placeholder="e.g. eastvile, eastville, อีสวิลล์" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('ข้อมูลที่ส่งออกได้', 'Exportable Data')}</Label>
                <div className="flex flex-wrap gap-3">
                  {ALL_DATA_SOURCES.map(ds => (
                    <div key={ds} className="flex items-center gap-1.5">
                      <Checkbox
                        checked={editGroup.allowed_data_sources.includes(ds)}
                        onCheckedChange={() => {
                          setEditGroup(prev => prev ? {
                            ...prev,
                            allowed_data_sources: prev.allowed_data_sources.includes(ds)
                              ? prev.allowed_data_sources.filter(d => d !== ds)
                              : [...prev.allowed_data_sources, ds],
                          } : null);
                        }}
                      />
                      <span className="text-sm capitalize">{ds}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('ระดับการซ่อนข้อมูล', 'Masking Level')}</Label>
                <Select value={editGroup.masking_level} onValueChange={v => setEditGroup(prev => prev ? { ...prev, masking_level: v } : null)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('ไม่ซ่อน', 'None')}</SelectItem>
                    <SelectItem value="mask_sensitive">{t('ซ่อนข้อมูลอ่อนไหว', 'Mask Sensitive')}</SelectItem>
                    <SelectItem value="strict">{t('เข้มงวด', 'Strict')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGroup(null)}>{t('ยกเลิก', 'Cancel')}</Button>
            <Button onClick={() => {
              if (!editGroup) return;
              const syns = synonymInput.split(',').map(s => s.trim()).filter(Boolean);
              saveExportMutation.mutate({ ...editGroup, synonyms: syns });
            }}>
              {t('บันทึก', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Tab C: Effective Access Matrix ─────────────────────────────

function AccessMatrixTab() {
  const { t } = useLocale();

  const { data: policies } = useQuery({
    queryKey: ['ai-query-policies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_query_policies').select('*').eq('enabled', true).order('priority', { ascending: false });
      if (error) throw error;
      return data as AiQueryPolicy[];
    },
  });

  const { data: scopeGroups } = useQuery({
    queryKey: ['ai-query-scope-groups-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_query_scope_groups').select('*');
      if (error) throw error;
      return data as AiQueryScopeGroup[];
    },
  });

  const { data: groups } = useQuery({
    queryKey: ['groups-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('id, display_name, line_group_id').order('display_name');
      if (error) throw error;
      return data as GroupInfo[];
    },
  });

  const { data: exports } = useQuery({
    queryKey: ['ai-query-group-export'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_query_group_export').select('*');
      if (error) throw error;
      return data as GroupExport[];
    },
  });

  const { data: users } = useQuery({
    queryKey: ['users-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, display_name, line_user_id').order('display_name');
      if (error) throw error;
      return data as UserInfo[];
    },
  });

  const exportMap = new Map((exports || []).map(e => [e.group_id, e]));
  const allGroupIds = (groups || []).map(g => g.id);
  const exportEnabledIds = new Set((exports || []).filter(e => e.export_enabled).map(e => e.group_id));

  // Compute access for each policy → each target group
  const computeAccess = (policy: AiQueryPolicy, targetGroupId: string): { accessible: boolean; dataSources: string[] } => {
    // Check if target group allows export
    if (!exportEnabledIds.has(targetGroupId)) return { accessible: false, dataSources: [] };

    // Check if target group is in policy's scope
    const policyScopeGroupIds = (scopeGroups || []).filter(sg => sg.policy_id === policy.id).map(sg => sg.group_id);
    let inScope = false;
    if (policy.scope_mode === 'all') {
      inScope = true;
    } else if (policy.scope_mode === 'include') {
      inScope = policyScopeGroupIds.includes(targetGroupId);
    } else {
      inScope = !policyScopeGroupIds.includes(targetGroupId);
    }
    if (!inScope) return { accessible: false, dataSources: [] };

    // Intersect data sources
    const targetExport = exportMap.get(targetGroupId);
    const exportDs = targetExport?.allowed_data_sources || [];
    const intersection = policy.allowed_data_sources.filter(ds => exportDs.includes(ds));
    return { accessible: intersection.length > 0, dataSources: intersection };
  };

  const getSourceLabel = (p: AiQueryPolicy) => {
    if (p.source_type === 'group') {
      return groups?.find(g => g.id === p.source_group_id)?.display_name || '—';
    }
    return users?.find(u => u.id === p.source_user_id)?.display_name || '—';
  };

  if (!policies || !groups) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Grid3X3 className="h-4 w-4" />
          {t('Effective Access Matrix', 'Effective Access Matrix')}
        </CardTitle>
        <CardDescription className="text-xs">
          {t('แสดงว่า requester แต่ละคนเข้าถึงข้อมูลกลุ่มไหนได้บ้าง (เฉพาะ policy ที่เปิดอยู่)', 'Shows which target groups each requester can access (enabled policies only)')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!policies.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t('ไม่มี policy ที่เปิดอยู่', 'No enabled policies')}</p>
        ) : (
          <ScrollArea className="w-full">
            <div className="min-w-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px] sticky left-0 bg-background z-10">{t('Requester', 'Requester')}</TableHead>
                    {groups.map(g => (
                      <TableHead key={g.id} className="text-center text-xs px-2 min-w-[80px]">
                        <div className="truncate max-w-[80px]" title={g.display_name}>{g.display_name}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-1.5">
                          {p.source_type === 'group' ? <Users className="h-3 w-3 text-muted-foreground" /> : <Shield className="h-3 w-3 text-muted-foreground" />}
                          <span className="text-sm truncate max-w-[130px]">{getSourceLabel(p)}</span>
                        </div>
                      </TableCell>
                      {groups.map(g => {
                        const access = computeAccess(p, g.id);
                        return (
                          <TableCell key={g.id} className="text-center px-2">
                            {access.accessible ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <div className="flex flex-wrap justify-center gap-0.5">
                                  {access.dataSources.map(ds => (
                                    <Badge key={ds} variant="secondary" className="text-[9px] px-1 py-0 leading-tight">
                                      {ds.slice(0, 3)}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tab D: AI Test Console ─────────────────────────────────────

function TestConsoleTab() {
  const { t } = useLocale();
  const [groupId, setGroupId] = useState('');
  const [userId, setUserId] = useState('');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { data: groups } = useQuery({
    queryKey: ['groups-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('id, display_name, line_group_id').order('display_name');
      if (error) throw error;
      return data as GroupInfo[];
    },
  });

  const { data: users } = useQuery({
    queryKey: ['users-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, display_name, line_user_id').order('display_name');
      if (error) throw error;
      return data as UserInfo[];
    },
  });

  const runTest = async () => {
    if (!question.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-query-test', {
        body: {
          requester_group_id: groupId || null,
          requester_user_id: userId || null,
          question: question.trim(),
        },
      });
      if (error) throw error;
      setResult(data);
    } catch (err: any) {
      toast.error(err.message || 'Test failed');
      setResult({ error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Play className="h-4 w-4" />
          {t('AI Test Console (Dry-Run)', 'AI Test Console (Dry-Run)')}
        </CardTitle>
        <CardDescription className="text-xs">
          {t('จำลองคำถาม AI ข้ามกลุ่มโดยไม่ส่ง LINE จริง — ดู scope, evidence, คำตอบ', 'Simulate cross-group query without sending LINE — see scope, evidence, answer')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t('กลุ่มผู้ถาม', 'Requester Group')}</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue placeholder={t('เลือกกลุ่ม', 'Select group')} /></SelectTrigger>
              <SelectContent>
                {(groups || []).map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('ผู้ถาม', 'Requester User')}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder={t('เลือกผู้ใช้', 'Select user')} /></SelectTrigger>
              <SelectContent>
                {(users || []).map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.display_name || u.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t('คำถาม', 'Question')}</Label>
          <Textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder={t('เช่น เมื่อวานน้อง Eastville คนไหนมาบ้าง', 'e.g. Who came to Eastville yesterday?')}
            rows={2}
          />
        </div>

        <Button onClick={runTest} disabled={isLoading || !question.trim()}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
          {t('ทดสอบ', 'Run Test')}
        </Button>

        {/* Results */}
        {result && (
          <div className="space-y-3 pt-2">
            {result.error ? (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{result.error}</div>
            ) : (
              <>
                {result.duration_ms != null && (
                  <Badge variant="outline" className="text-xs">⏱ {result.duration_ms}ms</Badge>
                )}

                {/* Policy */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full text-left">
                    <ChevronDown className="h-4 w-4" />
                    {t('1. Policy', '1. Policy')}
                    {result.steps?.policy ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1">
                    <pre className="bg-muted rounded-md p-2 text-xs overflow-auto max-h-32">{JSON.stringify(result.steps?.policy, null, 2)}</pre>
                  </CollapsibleContent>
                </Collapsible>

                {/* Effective Scope */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full text-left">
                    <ChevronDown className="h-4 w-4" />
                    {t('2. Effective Scope', '2. Effective Scope')}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1">
                    <pre className="bg-muted rounded-md p-2 text-xs overflow-auto max-h-40">{JSON.stringify(result.steps?.effective_scope, null, 2)}</pre>
                  </CollapsibleContent>
                </Collapsible>

                {/* Resolved Entities */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full text-left">
                    <ChevronDown className="h-4 w-4" />
                    {t('3. Resolved Entities', '3. Resolved Entities')}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1">
                    <pre className="bg-muted rounded-md p-2 text-xs overflow-auto max-h-40">{JSON.stringify(result.steps?.resolved_entities, null, 2)}</pre>
                  </CollapsibleContent>
                </Collapsible>

                {/* Evidence */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full text-left">
                    <ChevronDown className="h-4 w-4" />
                    {t('4. Evidence', '4. Evidence')}
                    <Badge variant="secondary" className="text-[10px]">
                      {result.steps?.evidence?.sources_count || 0} sources
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1">
                    <pre className="bg-muted rounded-md p-2 text-xs overflow-auto max-h-60">{JSON.stringify(result.steps?.evidence, null, 2)}</pre>
                  </CollapsibleContent>
                </Collapsible>

                {/* Answer */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full text-left">
                    <ChevronDown className="h-4 w-4" />
                    {t('5. AI Answer', '5. AI Answer')}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1">
                    <div className="bg-primary/5 border border-primary/20 rounded-md p-3 text-sm whitespace-pre-wrap">
                      {result.steps?.answer || t('ไม่มีคำตอบ', 'No answer')}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tab E: Audit Logs ──────────────────────────────────────────

function AuditLogsTab() {
  const { t } = useLocale();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['ai-query-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_query_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as AuditLogRow[];
    },
  });

  const { data: groups } = useQuery({
    queryKey: ['groups-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('id, display_name, line_group_id').order('display_name');
      if (error) throw error;
      return data as GroupInfo[];
    },
  });

  const { data: users } = useQuery({
    queryKey: ['users-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, display_name, line_user_id').order('display_name');
      if (error) throw error;
      return data as UserInfo[];
    },
  });

  const groupMap = new Map((groups || []).map(g => [g.id, g.display_name]));
  const userMap = new Map((users || []).map(u => [u.id, u.display_name || u.line_user_id || u.id]));

  const filtered = (logs || []).filter(l => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return l.question.toLowerCase().includes(q) ||
      l.answer.toLowerCase().includes(q) ||
      (userMap.get(l.user_id) || '').toLowerCase().includes(q) ||
      (groupMap.get(l.group_id) || '').toLowerCase().includes(q);
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {t('Audit Logs', 'Audit Logs')}
        </CardTitle>
        <CardDescription className="text-xs">
          {t('บันทึกถาวรของทุกคำถาม AI ข้ามกลุ่ม (ไม่หมดอายุ)', 'Permanent record of all cross-group AI queries (no TTL)')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('ค้นหาคำถาม, คำตอบ, ผู้ถาม...', 'Search question, answer, requester...')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {!filtered.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t('ไม่มีข้อมูล', 'No audit logs')}</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(log => (
              <div key={log.id} className="border rounded-lg">
                <button
                  className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                      <span className="font-medium text-foreground truncate">{userMap.get(log.user_id) || '—'}</span>
                      <span>•</span>
                      <span className="truncate">{groupMap.get(log.group_id) || '—'}</span>
                      <span>•</span>
                      <span className="whitespace-nowrap">{new Date(log.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-[10px]">{log.evidence_count} ev</Badge>
                      <Badge variant="outline" className="text-[10px]">{log.response_time_ms}ms</Badge>
                      <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === log.id ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  <p className="text-sm font-medium mt-1 truncate">Q: {log.question}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">A: {log.answer.slice(0, 100)}{log.answer.length > 100 ? '…' : ''}</p>
                </button>

                {expandedId === log.id && (
                  <div className="px-3 pb-3 space-y-2 border-t pt-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{t('คำตอบเต็ม', 'Full Answer')}</p>
                      <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-2">{log.answer}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">{t('กลุ่มที่ค้นหา', 'Target Groups')}:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(log.target_group_ids || []).map(gid => (
                            <Badge key={gid} variant="secondary" className="text-[10px]">{groupMap.get(gid) || gid.slice(0, 8)}</Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('ข้อมูลที่ใช้', 'Data Sources')}:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(log.data_sources_used || []).map(ds => (
                            <Badge key={ds} variant="outline" className="text-[10px]">{ds}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    {log.sources_used && Array.isArray(log.sources_used) && log.sources_used.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <ChevronDown className="h-3 w-3" />
                          {t('แหล่งข้อมูล', 'Sources')} ({log.sources_used.length})
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1">
                          <pre className="bg-muted rounded p-2 text-[10px] overflow-auto max-h-40">{JSON.stringify(log.sources_used, null, 2)}</pre>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tab F: Recent Queries ──────────────────────────────────────

function RecentQueriesTab() {
  const { t } = useLocale();

  const { data: queries, isLoading } = useQuery({
    queryKey: ['ai-query-memory-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_query_memory')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as AiQueryMemoryRow[];
    },
  });

  const { data: groups } = useQuery({
    queryKey: ['groups-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('id, display_name, line_group_id').order('display_name');
      if (error) throw error;
      return data as GroupInfo[];
    },
  });

  const { data: users } = useQuery({
    queryKey: ['users-list-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, display_name, line_user_id').order('display_name');
      if (error) throw error;
      return data as UserInfo[];
    },
  });

  const groupMap = new Map((groups || []).map(g => [g.id, g.display_name]));
  const userMap = new Map((users || []).map(u => [u.id, u.display_name || u.line_user_id || u.id]));

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('คำถาม AI ล่าสุด', 'Recent AI Queries')}</CardTitle>
        <CardDescription className="text-xs">
          {t('ข้อมูลจาก ai_query_memory (หมดอายุ 1 ชม.)', 'From ai_query_memory (1hr TTL)')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!queries?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('ยังไม่มีคำถาม AI ข้ามกลุ่ม', 'No cross-group AI queries yet')}
          </p>
        ) : (
          <div className="space-y-3">
            {queries.map(q => (
              <div key={q.id} className="border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{userMap.get(q.user_id) || q.user_id}</span>
                  <span>•</span>
                  <span>{groupMap.get(q.group_id) || q.group_id}</span>
                  <span>•</span>
                  <span>{new Date(q.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</span>
                  {new Date(q.expires_at) < new Date() && <Badge variant="secondary" className="text-[10px]">expired</Badge>}
                </div>
                <p className="text-sm font-medium">Q: {q.question}</p>
                <p className="text-sm text-muted-foreground">A: {q.answer.length > 200 ? q.answer.slice(0, 200) + '…' : q.answer}</p>
                {q.sources_used && Array.isArray(q.sources_used) && q.sources_used.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('แหล่งข้อมูล', 'Sources')}: {q.sources_used.length} {t('รายการ', 'items')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
