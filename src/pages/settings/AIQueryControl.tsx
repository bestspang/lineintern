import { useState } from 'react';
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
import { toast } from 'sonner';
import { Plus, Trash2, Shield, Users, MessageSquare, Clock, Search, Eye } from 'lucide-react';
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
        <TabsList>
          <TabsTrigger value="policies">{t('กฎการเข้าถึง', 'Access Rules')}</TabsTrigger>
          <TabsTrigger value="export">{t('นโยบายส่งออก', 'Group Export Policy')}</TabsTrigger>
          <TabsTrigger value="log">{t('คำถามล่าสุด', 'Recent Queries')}</TabsTrigger>
        </TabsList>

        <TabsContent value="policies"><PoliciesTab /></TabsContent>
        <TabsContent value="export"><ExportPolicyTab /></TabsContent>
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

  // sync existing scope groups
  useState(() => {
    if (existingScopeGroups) setScopeGroupIds(existingScopeGroups);
  });

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

// ── Tab C: Recent Queries ──────────────────────────────────────

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
