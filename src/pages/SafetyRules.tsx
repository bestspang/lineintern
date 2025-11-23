import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Shield, Plus, Edit, Trash2, AlertTriangle } from 'lucide-react';

export default function SafetyRules() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['safety-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safety_rules')
        .select('*')
        .order('severity', { ascending: false })
        .order('match_count', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveRuleMutation = useMutation({
    mutationFn: async (rule: any) => {
      if (rule.id) {
        const { error } = await supabase.from('safety_rules').update(rule).eq('id', rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('safety_rules').insert(rule);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-rules'] });
      setIsDialogOpen(false);
      toast({ title: editingRule?.id ? 'Rule updated' : 'Rule created' });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('safety_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-rules'] });
      toast({ title: 'Rule deleted' });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const { error } = await supabase
        .from('safety_rules')
        .update({ is_enabled: !isEnabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-rules'] });
      toast({ title: 'Rule status updated' });
    },
  });

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      low: 'secondary',
      medium: 'default',
      high: 'destructive',
    };
    return <Badge variant={variants[severity] || 'default'}>{severity}</Badge>;
  };

  return (
    <div className="space-y-6 max-w-full px-4 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Detection Rules</CardTitle>
          <CardDescription>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                Customize patterns for spam, scams, and toxic content detection
              </span>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setEditingRule({
                    name: '',
                    description: '',
                    rule_type: 'url_pattern',
                    pattern: '',
                    severity: 'medium',
                    action: 'log',
                    scope: 'global',
                    is_enabled: true,
                  });
                  setIsDialogOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Rule
              </Button>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rules && rules.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[80px] text-xs sm:text-sm">Status</TableHead>
                        <TableHead className="min-w-[160px] text-xs sm:text-sm">Name</TableHead>
                        <TableHead className="min-w-[100px] text-xs sm:text-sm">Type</TableHead>
                        <TableHead className="min-w-[180px] text-xs sm:text-sm">Pattern</TableHead>
                        <TableHead className="min-w-[90px] text-xs sm:text-sm">Severity</TableHead>
                        <TableHead className="min-w-[100px] text-xs sm:text-sm">Action</TableHead>
                        <TableHead className="min-w-[90px] text-xs sm:text-sm">Scope</TableHead>
                        <TableHead className="min-w-[80px] text-xs sm:text-sm text-center">Matches</TableHead>
                        <TableHead className="min-w-[120px] text-xs sm:text-sm">Last Matched</TableHead>
                        <TableHead className="min-w-[80px] text-xs sm:text-sm text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="py-2">
                            <Switch
                              checked={rule.is_enabled}
                              onCheckedChange={() =>
                                toggleRuleMutation.mutate({ id: rule.id, isEnabled: rule.is_enabled })
                              }
                            />
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            <div className="font-medium text-sm truncate max-w-[200px]">{rule.name}</div>
                            {rule.description && (
                              <div className="text-[11px] text-muted-foreground line-clamp-2 break-words max-w-[260px]">
                                {rule.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            <Badge variant="outline" className="text-[11px]">
                              {rule.rule_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 align-top max-w-xs">
                            <code className="text-[11px] bg-muted px-2 py-1 rounded break-all block">
                              {rule.pattern}
                            </code>
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            {getSeverityBadge(rule.severity)}
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            <Badge variant="secondary" className="text-[11px]">
                              {rule.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            <Badge variant="outline" className="text-[11px]">
                              {rule.scope}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 text-center align-top text-sm">
                            {rule.match_count || 0}
                          </TableCell>
                          <TableCell className="py-2 align-top text-[11px] text-muted-foreground">
                            {rule.last_matched_at
                              ? formatDistanceToNow(new Date(rule.last_matched_at), { addSuffix: true })
                              : 'Never'}
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingRule(rule);
                                  setIsDialogOpen(true);
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => deleteRuleMutation.mutate(rule.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No safety rules configured</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule?.id ? 'Edit Safety Rule' : 'Create Safety Rule'}</DialogTitle>
            <DialogDescription>
              Configure detection patterns to monitor and protect your community
            </DialogDescription>
          </DialogHeader>
          {editingRule && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Rule Name *</Label>
                  <Input
                    value={editingRule.name}
                    onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                    placeholder="Suspicious Links"
                  />
                </div>
                <div>
                  <Label>Rule Type *</Label>
                  <Select
                    value={editingRule.rule_type}
                    onValueChange={(val) => setEditingRule({ ...editingRule, rule_type: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="url_pattern">URL Pattern</SelectItem>
                      <SelectItem value="keyword">Keyword</SelectItem>
                      <SelectItem value="spam_rate">Spam Rate</SelectItem>
                      <SelectItem value="toxicity">Toxicity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editingRule.description || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  rows={2}
                  placeholder="Describe what this rule detects..."
                />
              </div>
              <div>
                <Label>Pattern (Regex or keywords) *</Label>
                <Input
                  value={editingRule.pattern}
                  onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                  placeholder="(bit\.ly|tinyurl\.com|suspicious\.xyz)"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use regex for URL patterns, keywords separated by | for keyword detection
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Severity *</Label>
                  <Select
                    value={editingRule.severity}
                    onValueChange={(val) => setEditingRule({ ...editingRule, severity: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Action *</Label>
                  <Select
                    value={editingRule.action}
                    onValueChange={(val) => setEditingRule({ ...editingRule, action: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="log">Log Only</SelectItem>
                      <SelectItem value="warn">Warn Group</SelectItem>
                      <SelectItem value="notify_admin">Notify Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Scope *</Label>
                  <Select
                    value={editingRule.scope}
                    onValueChange={(val) => setEditingRule({ ...editingRule, scope: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global</SelectItem>
                      <SelectItem value="group">Per-Group</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Enabled</Label>
                <Switch
                  checked={editingRule.is_enabled}
                  onCheckedChange={(checked) => setEditingRule({ ...editingRule, is_enabled: checked })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveRuleMutation.mutate(editingRule)}>
              {editingRule?.id ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
