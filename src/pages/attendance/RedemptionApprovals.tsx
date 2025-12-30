import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Gift, Search, CheckCircle, XCircle, Clock, User, Coins } from 'lucide-react';
import { format } from 'date-fns';

interface Redemption {
  id: string;
  employee_id: string;
  reward_id: string;
  point_cost: number;
  status: string;
  created_at: string;
  approved_at: string | null;
  notes: string | null;
  reward: {
    name: string;
    name_th: string | null;
    icon: string | null;
    category: string;
  };
  employee: {
    full_name: string;
    code: string;
    branch: { name: string } | null;
  };
}

export default function RedemptionApprovals() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRedemption, setSelectedRedemption] = useState<Redemption | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: redemptions, isLoading } = useQuery({
    queryKey: ['redemption-approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_redemptions')
        .select(`
          *,
          reward:point_rewards(name, name_th, icon, category),
          employee:employees(full_name, code, branch:branches(name))
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Redemption[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const updates: any = {
        status,
        notes: notes || null,
      };
      
      if (status === 'approved') {
        updates.approved_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('point_redemptions')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['redemption-approvals'] });
      toast({
        title: variables.status === 'approved' ? 'Redemption approved' : 'Redemption rejected',
      });
      setSelectedRedemption(null);
      setActionType(null);
      setNotes('');
    },
    onError: (error) => {
      toast({ title: 'Error updating redemption', description: error.message, variant: 'destructive' });
    },
  });

  const pendingRedemptions = redemptions?.filter(r => r.status === 'pending') || [];
  const approvedRedemptions = redemptions?.filter(r => r.status === 'approved') || [];
  const rejectedRedemptions = redemptions?.filter(r => r.status === 'rejected') || [];
  const usedRedemptions = redemptions?.filter(r => r.status === 'used') || [];

  const filterRedemptions = (items: Redemption[]) => {
    if (!searchTerm) return items;
    const lower = searchTerm.toLowerCase();
    return items.filter(r => 
      r.employee.full_name.toLowerCase().includes(lower) ||
      r.employee.code.toLowerCase().includes(lower) ||
      r.reward.name.toLowerCase().includes(lower)
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300"><Clock className="h-3 w-3 mr-1" />รอดำเนินการ</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />อนุมัติแล้ว</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />ปฏิเสธ</Badge>;
      case 'used':
        return <Badge className="bg-blue-100 text-blue-700"><Gift className="h-3 w-3 mr-1" />ใช้แล้ว</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const RedemptionTable = ({ items, showActions = false }: { items: Redemption[]; showActions?: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>พนักงาน</TableHead>
          <TableHead>รางวัล</TableHead>
          <TableHead className="text-right">แต้ม</TableHead>
          <TableHead>วันที่แลก</TableHead>
          <TableHead>สถานะ</TableHead>
          {showActions && <TableHead className="text-right">จัดการ</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showActions ? 6 : 5} className="text-center text-muted-foreground py-8">
              ไม่มีรายการ
            </TableCell>
          </TableRow>
        ) : (
          items.map((redemption) => (
            <TableRow key={redemption.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{redemption.employee.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {redemption.employee.code} • {redemption.employee.branch?.name || '-'}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{redemption.reward.icon || '🎁'}</span>
                  <div>
                    <p className="font-medium">{redemption.reward.name}</p>
                    {redemption.reward.name_th && (
                      <p className="text-xs text-muted-foreground">{redemption.reward.name_th}</p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="outline" className="gap-1">
                  <Coins className="h-3 w-3" />
                  {redemption.point_cost}
                </Badge>
              </TableCell>
              <TableCell>
                {format(new Date(redemption.created_at), 'dd/MM/yyyy HH:mm')}
              </TableCell>
              <TableCell>{getStatusBadge(redemption.status)}</TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-300 hover:bg-green-50"
                      onClick={() => {
                        setSelectedRedemption(redemption);
                        setActionType('approve');
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      อนุมัติ
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => {
                        setSelectedRedemption(redemption);
                        setActionType('reject');
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      ปฏิเสธ
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" />
            Redemption Approvals
          </h1>
          <p className="text-muted-foreground">จัดการคำขอแลกของรางวัล</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              รอดำเนินการ ({pendingRedemptions.length})
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาพนักงาน / รางวัล..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <RedemptionTable items={filterRedemptions(pendingRedemptions)} showActions />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ประวัติทั้งหมด</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="approved">
            <TabsList>
              <TabsTrigger value="approved">อนุมัติแล้ว ({approvedRedemptions.length})</TabsTrigger>
              <TabsTrigger value="used">ใช้แล้ว ({usedRedemptions.length})</TabsTrigger>
              <TabsTrigger value="rejected">ปฏิเสธ ({rejectedRedemptions.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="approved" className="mt-4">
              <RedemptionTable items={filterRedemptions(approvedRedemptions)} />
            </TabsContent>
            <TabsContent value="used" className="mt-4">
              <RedemptionTable items={filterRedemptions(usedRedemptions)} />
            </TabsContent>
            <TabsContent value="rejected" className="mt-4">
              <RedemptionTable items={filterRedemptions(rejectedRedemptions)} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!selectedRedemption && !!actionType} onOpenChange={(open) => {
        if (!open) {
          setSelectedRedemption(null);
          setActionType(null);
          setNotes('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'อนุมัติคำขอแลกรางวัล' : 'ปฏิเสธคำขอแลกรางวัล'}
            </DialogTitle>
          </DialogHeader>
          {selectedRedemption && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p><strong>พนักงาน:</strong> {selectedRedemption.employee.full_name}</p>
                <p><strong>รางวัล:</strong> {selectedRedemption.reward.icon} {selectedRedemption.reward.name}</p>
                <p><strong>แต้มที่ใช้:</strong> {selectedRedemption.point_cost} แต้ม</p>
              </div>
              <div>
                <label className="text-sm font-medium">หมายเหตุ (ไม่บังคับ)</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={actionType === 'reject' ? 'ระบุเหตุผลที่ปฏิเสธ...' : 'หมายเหตุเพิ่มเติม...'}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRedemption(null)}>
              ยกเลิก
            </Button>
            <Button
              variant={actionType === 'approve' ? 'default' : 'destructive'}
              onClick={() => {
                if (selectedRedemption) {
                  updateMutation.mutate({
                    id: selectedRedemption.id,
                    status: actionType === 'approve' ? 'approved' : 'rejected',
                    notes,
                  });
                }
              }}
              disabled={updateMutation.isPending}
            >
              {actionType === 'approve' ? 'ยืนยันอนุมัติ' : 'ยืนยันปฏิเสธ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
