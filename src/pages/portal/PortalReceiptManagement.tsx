import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ReceiptText, Check, X, Eye, Calendar, User } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { toast } from 'sonner';

interface Receipt {
  id: string;
  amount: number;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  imageUrl?: string;
  employee: {
    name: string;
    branch: string;
  };
}

export default function PortalReceiptManagement() {
  const navigate = useNavigate();
  const { employee, locale, isAdmin } = usePortal();
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [filter, setFilter] = useState('pending');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchReceipts = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);

    try {
      let query = supabase
        .from('receipts')
        .select(`
          id,
          amount,
          description,
          category,
          status,
          created_at,
          image_url,
          employee:employees(name, branch:branches(name))
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      // Non-admin sees only their branch
      if (!isAdmin) {
        query = query.eq('employees.branch_id', employee.branch?.id);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      setReceipts(data?.map((r: any) => ({
        id: r.id,
        amount: r.amount || 0,
        description: r.description || '',
        category: r.category || 'อื่นๆ',
        status: r.status || 'pending',
        createdAt: r.created_at,
        imageUrl: r.image_url,
        employee: {
          name: r.employee?.name || '-',
          branch: r.employee?.branch?.name || '-',
        },
      })) || []);
    } catch (err) {
      console.error('Error fetching receipts:', err);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, employee?.branch?.id, isAdmin, filter]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  const handleAction = async () => {
    if (!selectedReceipt || !actionType) return;
    setProcessing(true);

    try {
      const newStatus = actionType === 'approve' ? 'approved' : 'rejected';
      
      const { error } = await supabase
        .from('receipts')
        .update({
          status: newStatus,
          admin_notes: notes || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: employee?.id,
        })
        .eq('id', selectedReceipt.id);

      if (error) throw error;

      toast.success(actionType === 'approve' ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว');
      setSelectedReceipt(null);
      setActionType(null);
      setNotes('');
      fetchReceipts();
    } catch (err) {
      console.error('Error updating receipt:', err);
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setProcessing(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">อนุมัติ</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">ปฏิเสธ</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">รอตรวจ</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/portal')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">
              {locale === 'th' ? 'จัดการใบเสร็จ' : 'Receipt Management'}
            </h1>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">รอตรวจ</TabsTrigger>
            <TabsTrigger value="approved">อนุมัติ</TabsTrigger>
            <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))
        ) : receipts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <ReceiptText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ไม่มีใบเสร็จ' : 'No receipts'}
              </p>
            </CardContent>
          </Card>
        ) : (
          receipts.map((receipt) => (
            <Card key={receipt.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-lg">{formatAmount(receipt.amount)}</p>
                    <p className="text-sm text-muted-foreground">{receipt.category}</p>
                  </div>
                  {getStatusBadge(receipt.status)}
                </div>
                
                <p className="text-sm mb-3 line-clamp-2">{receipt.description || '-'}</p>
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{receipt.employee.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{format(new Date(receipt.createdAt), 'dd MMM yyyy', { locale: th })}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {receipt.imageUrl && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => window.open(receipt.imageUrl, '_blank')}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      ดูรูป
                    </Button>
                  )}
                  {receipt.status === 'pending' && (
                    <>
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          setSelectedReceipt(receipt);
                          setActionType('approve');
                        }}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        อนุมัติ
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => {
                          setSelectedReceipt(receipt);
                          setActionType('reject');
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        ปฏิเสธ
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={!!actionType} onOpenChange={() => { setActionType(null); setNotes(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'ยืนยันอนุมัติ' : 'ยืนยันปฏิเสธ'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-3">
              ใบเสร็จ: {selectedReceipt && formatAmount(selectedReceipt.amount)}
            </p>
            <Textarea
              placeholder="หมายเหตุ (ไม่บังคับ)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { setActionType(null); setNotes(''); }}>
              ยกเลิก
            </Button>
            <Button 
              onClick={handleAction}
              disabled={processing}
              className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
              variant={actionType === 'reject' ? 'destructive' : 'default'}
            >
              {processing ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
