import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { 
  Calendar, 
  Tag, 
  Building2, 
  CreditCard, 
  User, 
  FileText,
  Edit2,
  Trash2,
  X,
  ZoomIn,
  Loader2,
  MapPin,
  Receipt,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ReceiptDetailViewProps {
  receiptId: string;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}

export function ReceiptDetailView({ receiptId, open, onClose, onEdit }: ReceiptDetailViewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showImageZoom, setShowImageZoom] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const { role } = useUserRole();
  const { user } = useAuth();
  const canDelete = role === 'admin' || role === 'owner';
  const canApprove = role === 'admin' || role === 'owner';
  const queryClient = useQueryClient();

  // Fetch receipt details
  const { data: receipt, isLoading: receiptLoading } = useQuery({
    queryKey: ['receipt-detail', receiptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select(`
          *,
          receipt_businesses(name)
        `)
        .eq('id', receiptId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!receiptId,
  });

  // Fetch receipt files
  const { data: files } = useQuery({
    queryKey: ['receipt-files', receiptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_files')
        .select('*')
        .eq('receipt_id', receiptId);
      if (error) throw error;
      return data;
    },
    enabled: open && !!receiptId,
  });

  // Fetch receipt items
  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['receipt-items', receiptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_items')
        .select('*')
        .eq('receipt_id', receiptId)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: open && !!receiptId,
  });

  // Fetch signed URL for image
  useEffect(() => {
    const fetchImageUrl = async () => {
      if (files && files.length > 0 && files[0].storage_path) {
        const { data } = await supabase.storage
          .from('receipt-files')
          .createSignedUrl(files[0].storage_path, 3600);
        if (data?.signedUrl) {
          setImageUrl(data.signedUrl);
        }
      }
    };
    fetchImageUrl();
  }, [files]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('receipt_items').delete().eq('receipt_id', receiptId);
      await supabase.from('receipt_files').delete().eq('receipt_id', receiptId);
      const { error } = await supabase.from('receipts').delete().eq('id', receiptId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('ลบใบเสร็จสำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['admin-receipts'] });
      onClose();
    },
    onError: (error: Error) => {
      toast.error('เกิดข้อผิดพลาดในการลบ: ' + error.message);
    },
  });

  // Approval mutation
  const approvalMutation = useMutation({
    mutationFn: async ({ approved, reason }: { approved: boolean; reason?: string }) => {
      const { error } = await supabase
        .from('receipts')
        .update({
          approval_status: approved ? 'approved' : 'rejected',
          approved_at: new Date().toISOString(),
          approved_by: user?.email || user?.id,
          rejection_reason: reason || null,
        })
        .eq('id', receiptId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.approved ? 'อนุมัติใบเสร็จสำเร็จ' : 'ปฏิเสธใบเสร็จสำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['receipt-detail', receiptId] });
      queryClient.invalidateQueries({ queryKey: ['admin-receipts'] });
      setShowRejectDialog(false);
      setRejectionReason('');
      onClose();
    },
    onError: (error: Error) => {
      toast.error('เกิดข้อผิดพลาด: ' + error.message);
    },
  });

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(amount);
  };

  const getCategoryLabel = (category: string | null) => {
    const categories: Record<string, string> = {
      food: 'อาหารและเครื่องดื่ม',
      transport: 'ค่าเดินทาง',
      office: 'อุปกรณ์สำนักงาน',
      utilities: 'ค่าสาธารณูปโภค',
      entertainment: 'บันเทิง',
      other: 'อื่นๆ',
    };
    return categories[category || ''] || category || 'ไม่ระบุ';
  };

  const isLoading = receiptLoading || itemsLoading;

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
          <SheetHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                รายละเอียดใบเสร็จ
              </SheetTitle>
            </div>
          </SheetHeader>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : receipt ? (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 pb-6">
                {/* Receipt Image */}
                {imageUrl && (
                  <div 
                    className="relative rounded-lg overflow-hidden bg-muted cursor-pointer group"
                    onClick={() => setShowImageZoom(true)}
                  >
                    <img 
                      src={imageUrl} 
                      alt="Receipt" 
                      className="w-full h-48 object-contain"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="h-8 w-8 text-white" />
                    </div>
                  </div>
                )}

                {/* Vendor Info */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    ร้านค้า/บริษัท
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    <p className="font-medium">{receipt.vendor || 'ไม่ระบุชื่อร้าน'}</p>
                    {(receipt as any).vendor_address && (
                      <p className="text-sm text-muted-foreground flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        {(receipt as any).vendor_address}
                      </p>
                    )}
                    {(receipt as any).vendor_branch && (
                      <p className="text-sm text-muted-foreground">
                        สาขา: {(receipt as any).vendor_branch}
                      </p>
                    )}
                    {(receipt as any).vendor_tax_id && (
                      <p className="text-sm text-muted-foreground">
                        TAX ID: {(receipt as any).vendor_tax_id}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Receipt Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      เลขที่ใบเสร็จ
                    </p>
                    <p className="font-medium text-sm">{receipt.receipt_number || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      วันที่
                    </p>
                    <p className="font-medium text-sm">
                      {receipt.receipt_date 
                        ? format(new Date(receipt.receipt_date), 'd MMM yyyy', { locale: th })
                        : '-'
                      }
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      หมวดหมู่
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      {getCategoryLabel(receipt.category)}
                    </Badge>
                  </div>
                  {receipt.receipt_businesses?.name && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">ธุรกิจ</p>
                      <p className="font-medium text-sm">{receipt.receipt_businesses.name}</p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Items Table */}
                {items && items.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      รายการสินค้า ({items.length} รายการ)
                    </h3>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">สินค้า</TableHead>
                            <TableHead className="text-xs text-right">จำนวน</TableHead>
                            <TableHead className="text-xs text-right">ราคา</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-sm py-2">
                                {item.name || '-'}
                              </TableCell>
                              <TableCell className="text-sm text-right py-2">
                                {item.quantity || 1}
                                {item.unit && ` ${item.unit}`}
                              </TableCell>
                              <TableCell className="text-sm text-right py-2">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  {receipt.subtotal && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ยอดรวมก่อน VAT</span>
                      <span>{formatCurrency(receipt.subtotal)}</span>
                    </div>
                  )}
                  {receipt.vat && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">VAT 7%</span>
                      <span>{formatCurrency(receipt.vat)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-medium">
                    <span>ยอดรวมทั้งสิ้น</span>
                    <span className="text-lg">{formatCurrency(receipt.total)}</span>
                  </div>
                </div>

                {/* Payment Info */}
                {(receipt.payment_method || receipt.card_number_masked || receipt.payer_name) && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        ข้อมูลการชำระเงิน
                      </h3>
                      <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                        {receipt.payment_method && (
                          <p className="text-sm">
                            วิธีชำระ: {receipt.payment_method}
                          </p>
                        )}
                        {receipt.card_number_masked && (
                          <p className="text-sm">
                            บัตร: {receipt.card_number_masked}
                          </p>
                        )}
                        {receipt.payer_name && (
                          <p className="text-sm flex items-center gap-1">
                            <User className="h-3 w-3" />
                            ผู้จ่าย: {receipt.payer_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Approval Status */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">สถานะการอนุมัติ</span>
                    <Badge variant={
                      receipt.approval_status === 'approved' ? 'default' :
                      receipt.approval_status === 'rejected' ? 'destructive' : 'secondary'
                    }>
                      {receipt.approval_status === 'approved' ? 'อนุมัติแล้ว' :
                       receipt.approval_status === 'rejected' ? 'ปฏิเสธ' : 'รอตรวจสอบ'}
                    </Badge>
                  </div>

                  {/* Rejection reason if exists */}
                  {receipt.rejection_reason && (
                    <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/20">
                      <p className="text-sm text-destructive font-medium">เหตุผลที่ปฏิเสธ:</p>
                      <p className="text-sm text-destructive/80">{receipt.rejection_reason}</p>
                    </div>
                  )}

                  {/* Approval Buttons - show only when pending and has permission */}
                  {canApprove && (!receipt.approval_status || receipt.approval_status === 'pending') && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-green-500 text-green-600 hover:bg-green-50"
                        onClick={() => approvalMutation.mutate({ approved: true })}
                        disabled={approvalMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {approvalMutation.isPending ? 'กำลังดำเนินการ...' : 'Approve'}
                      </Button>
                      
                      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-red-500 text-red-600 hover:bg-red-50"
                            disabled={approvalMutation.isPending}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Deny
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>ปฏิเสธใบเสร็จ</AlertDialogTitle>
                            <AlertDialogDescription>
                              กรุณาระบุเหตุผลในการปฏิเสธใบเสร็จนี้
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <Textarea
                            placeholder="เหตุผลในการปฏิเสธ..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                          />
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setRejectionReason('')}>
                              ยกเลิก
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive hover:bg-destructive/90"
                              onClick={() => {
                                approvalMutation.mutate({ approved: false, reason: rejectionReason });
                                setShowRejectDialog(false);
                                setRejectionReason('');
                              }}
                            >
                              ยืนยันปฏิเสธ
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  {canDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="flex-1">
                          <Trash2 className="h-4 w-4 mr-1" />
                          ลบ
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>ยืนยันการลบใบเสร็จ</AlertDialogTitle>
                          <AlertDialogDescription>
                            คุณต้องการลบใบเสร็จจาก "{receipt.vendor || 'ไม่ระบุ'}" 
                            จำนวน {formatCurrency(receipt.total)} หรือไม่?
                            <br />
                            <span className="text-destructive font-medium">
                              การดำเนินการนี้ไม่สามารถย้อนกลับได้
                            </span>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={() => deleteMutation.mutate()}
                            disabled={deleteMutation.isPending}
                          >
                            {deleteMutation.isPending ? 'กำลังลบ...' : 'ลบ'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => {
                      onClose();
                      onEdit();
                    }}
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    แก้ไข
                  </Button>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              ไม่พบข้อมูลใบเสร็จ
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Image Zoom Dialog */}
      {showImageZoom && imageUrl && (
        <div 
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowImageZoom(false)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setShowImageZoom(false)}
          >
            <X className="h-6 w-6" />
          </Button>
          <img 
            src={imageUrl} 
            alt="Receipt" 
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
