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
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Detection Rules</CardTitle>
          <CardDescription>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
              <span className="text-xs sm:text-sm text-muted-foreground">
                Customize patterns for spam, scams, and toxic content detection
              </span>
              <Button
                className="w-full sm:w-auto shrink-0 text-sm"
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
                        <TableHead className="min-w-[60px] text-[10px] sm:text-xs">Status</TableHead>
                        <TableHead className="min-w-[120px] text-[10px] sm:text-xs">Name</TableHead>
                        <TableHead className="hidden sm:table-cell min-w-[100px] text-[10px] sm:text-xs">Type</TableHead>
                        <TableHead className="min-w-[150px] text-[10px] sm:text-xs">Pattern</TableHead>
                        <TableHead className="min-w-[70px] text-[10px] sm:text-xs">Severity</TableHead>
                        <TableHead className="min-w-[80px] text-[10px] sm:text-xs">Action</TableHead>
                        <TableHead className="hidden sm:table-cell min-w-[90px] text-[10px] sm:text-xs">Scope</TableHead>
                        <TableHead className="hidden sm:table-cell min-w-[80px] text-[10px] sm:text-xs text-center">Matches</TableHead>
                        <TableHead className="min-w-[100px] text-[10px] sm:text-xs">Last Matched</TableHead>
                        <TableHead className="min-w-[60px] text-[10px] sm:text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="py-1 sm:py-2">
                            <Switch
                              checked={rule.is_enabled}
                              onCheckedChange={() =>
                                toggleRuleMutation.mutate({ id: rule.id, isEnabled: rule.is_enabled })
                              }
                            />
                          </TableCell>
                          <TableCell className="py-1 sm:py-2 align-top">
                            <div className="font-medium text-[10px] sm:text-xs truncate max-w-[120px]">{rule.name}</div>
                            {rule.description && (
                              <div className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 break-words max-w-[150px]">
                                {rule.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell py-1 sm:py-2 align-top">
                            <Badge variant="outline" className="text-[10px] sm:text-xs">
                              {rule.rule_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1 sm:py-2 align-top max-w-[150px]">
                            <code className="text-[10px] sm:text-xs bg-muted px-2 py-1 rounded break-all block">
                              {rule.pattern}
                            </code>
                          </TableCell>
                          <TableCell className="py-1 sm:py-2 align-top">
                            {getSeverityBadge(rule.severity)}
                          </TableCell>
                          <TableCell className="py-1 sm:py-2 align-top">
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">
                              {rule.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell py-1 sm:py-2 align-top">
                            <Badge variant="outline" className="text-[10px] sm:text-xs">
                              {rule.scope}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell py-1 sm:py-2 text-center align-top text-[10px] sm:text-xs">
                            {rule.match_count || 0}
                          </TableCell>
                          <TableCell className="py-1 sm:py-2 align-top text-[10px] sm:text-xs text-muted-foreground">
                            {rule.last_matched_at
                              ? formatDistanceToNow(new Date(rule.last_matched_at), { addSuffix: true })
                              : 'Never'}
                          </TableCell>
                          <TableCell className="py-1 sm:py-2 align-top">
                            <div className="flex gap-0.5 justify-end">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => {
                                  setEditingRule(rule);
                                  setIsDialogOpen(true);
                                }}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => deleteRuleMutation.mutate(rule.id)}
                              >
                                <Trash2 className="w-3 h-3" />
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
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">
              {editingRule?.id ? 'Edit Safety Rule' : 'Create Safety Rule'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Configure detection patterns to monitor and protect your community
            </DialogDescription>
          </DialogHeader>
          {editingRule && (
            <div className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Rule Name *</Label>
                  <Input
                    value={editingRule.name}
                    onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                    placeholder="Suspicious Links"
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Rule Type *</Label>
                  <Select
                    value={editingRule.rule_type}
                    onValueChange={(val) => setEditingRule({ ...editingRule, rule_type: val })}
                  >
                    <SelectTrigger className="text-sm h-9 sm:h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="url_pattern" className="text-sm">URL Pattern</SelectItem>
                      <SelectItem value="keyword" className="text-sm">Keyword</SelectItem>
                      <SelectItem value="spam_rate" className="text-sm">Spam Rate</SelectItem>
                      <SelectItem value="toxicity" className="text-sm">Toxicity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Description</Label>
                <Textarea
                  value={editingRule.description || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  rows={2}
                  placeholder="Describe what this rule detects..."
                  className="text-sm min-h-[60px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Pattern (Regex or keywords) *</Label>
                <Input
                  value={editingRule.pattern}
                  onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                  placeholder="(bit\.ly|tinyurl\.com|suspicious\.xyz)"
                  className="font-mono text-sm h-9 sm:h-10"
                />
                <p className="text-xs text-muted-foreground">
                  Use regex for URL patterns, keywords separated by | for keyword detection
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Severity *</Label>
                  <Select
                    value={editingRule.severity}
                    onValueChange={(val) => setEditingRule({ ...editingRule, severity: val })}
                  >
                    <SelectTrigger className="text-sm h-9 sm:h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low" className="text-sm">Low</SelectItem>
                      <SelectItem value="medium" className="text-sm">Medium</SelectItem>
                      <SelectItem value="high" className="text-sm">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Action *</Label>
                  <Select
                    value={editingRule.action}
                    onValueChange={(val) => setEditingRule({ ...editingRule, action: val })}
                  >
                    <SelectTrigger className="text-sm h-9 sm:h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="log" className="text-sm">Log Only</SelectItem>
                      <SelectItem value="warn" className="text-sm">Warn Group</SelectItem>
                      <SelectItem value="notify_admin" className="text-sm">Notify Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Scope *</Label>
                  <Select
                    value={editingRule.scope}
                    onValueChange={(val) => setEditingRule({ ...editingRule, scope: val })}
                  >
                    <SelectTrigger className="text-sm h-9 sm:h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global" className="text-sm">Global</SelectItem>
                      <SelectItem value="group" className="text-sm">Per-Group</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between py-2">
                <Label className="text-xs sm:text-sm">Enabled</Label>
                <Switch
                  checked={editingRule.is_enabled}
                  onCheckedChange={(checked) => setEditingRule({ ...editingRule, is_enabled: checked })}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto text-sm h-9 sm:h-10">
              Cancel
            </Button>
            <Button onClick={() => saveRuleMutation.mutate(editingRule)} className="w-full sm:w-auto text-sm h-9 sm:h-10">
              {editingRule?.id ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
