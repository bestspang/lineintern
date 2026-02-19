import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Backpack, Plus, Gift, ShieldCheck, Zap, XCircle, Search } from 'lucide-react';

export default function BagManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);

  const { data: bagItems, isLoading } = useQuery({
    queryKey: ['admin-bag-items', statusFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('employee_bag_items')
        .select(`
          *,
          employee:employees!employee_bag_items_employee_id_fkey(full_name, code, is_active)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (typeFilter !== 'all') query = query.eq('item_type', typeFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-for-grant'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, code')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const grantMutation = useMutation({
    mutationFn: async (formData: Record<string, string>) => {
      const { error } = await supabase.from('employee_bag_items').insert({
        employee_id: formData.employee_id,
        item_name: formData.item_name,
        item_name_th: formData.item_name_th || null,
        item_icon: formData.item_icon || '🎁',
        item_type: formData.item_type,
        usage_rules: formData.usage_rules || null,
        usage_rules_th: formData.usage_rules_th || null,
        auto_activate: formData.auto_activate === 'true',
        granted_by: 'admin_grant',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bag-items'] });
      toast({ title: 'Item granted successfully' });
      setGrantDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Error granting item', description: error.message, variant: 'destructive' });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('employee_bag_items')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bag-items'] });
      toast({ title: 'Item revoked' });
    },
  });

  const handleGrant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const formData: Record<string, string> = {};
    fd.forEach((v, k) => (formData[k] = v.toString()));
    grantMutation.mutate(formData);
  };

  const filtered = bagItems?.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      item.item_name?.toLowerCase().includes(s) ||
      item.employee?.full_name?.toLowerCase().includes(s) ||
      item.employee?.code?.toLowerCase().includes(s)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'used': return 'secondary';
      case 'expired': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Backpack className="h-6 w-6 text-primary" />
            Bag Management
          </h1>
          <p className="text-muted-foreground">จัดการไอเทมในกระเป๋าของพนักงาน</p>
        </div>
        <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Grant Item</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Grant Item to Employee</DialogTitle></DialogHeader>
            <form onSubmit={handleGrant} className="space-y-4">
              <div>
                <Label>Employee</Label>
                <Select name="employee_id" required>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employees?.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name} ({e.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Item Name (EN)</Label>
                  <Input name="item_name" required />
                </div>
                <div>
                  <Label>Item Name (TH)</Label>
                  <Input name="item_name_th" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Icon</Label>
                  <Input name="item_icon" defaultValue="🎁" />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select name="item_type" defaultValue="badge">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reward">Reward</SelectItem>
                      <SelectItem value="shield">Shield</SelectItem>
                      <SelectItem value="badge">Badge</SelectItem>
                      <SelectItem value="special">Special</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Usage Rules (EN)</Label>
                <Textarea name="usage_rules" rows={2} />
              </div>
              <div>
                <Label>Usage Rules (TH)</Label>
                <Textarea name="usage_rules_th" rows={2} />
              </div>
              <div>
                <Label>Auto Activate</Label>
                <Select name="auto_activate" defaultValue="false">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">No - Manual use</SelectItem>
                    <SelectItem value="true">Yes - Auto-activate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={grantMutation.isPending}>
                {grantMutation.isPending ? 'Granting...' : 'Grant Item'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employee or item..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="reward">Reward</SelectItem>
            <SelectItem value="shield">Shield</SelectItem>
            <SelectItem value="badge">Badge</SelectItem>
            <SelectItem value="special">Special</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No bag items found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{item.item_icon}</span>
                          <div>
                            <p className="font-medium text-sm">{item.item_name}</p>
                            {item.item_name_th && (
                              <p className="text-xs text-muted-foreground">{item.item_name_th}</p>
                            )}
                          </div>
                          {item.auto_activate && (
                            <Zap className="h-3 w-3 text-amber-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{item.employee?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{item.employee?.code}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs capitalize">{item.item_type}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={getStatusColor(item.status)} className="text-xs capitalize">
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs text-muted-foreground capitalize">
                          {item.granted_by === 'admin_grant' ? '🎁 Admin' : '🛒 Purchase'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive text-xs"
                            onClick={() => {
                              if (confirm('Revoke this item?')) revokeMutation.mutate(item.id);
                            }}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
