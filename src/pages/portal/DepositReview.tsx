import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { 
  CheckCircle, XCircle, ArrowLeft, Building2, User, CreditCard, 
  Hash, Calendar, Clock, AlertTriangle, History, Pencil, Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Deposit {
  id: string;
  branch_id: string;
  employee_id: string;
  deposit_date: string;
  amount: number | null;
  account_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  reference_number: string | null;
  status: string;
  slip_photo_url: string | null;
  face_photo_url: string | null;
  extraction_confidence: number | null;
  raw_ocr_result: any;
  created_at: string;
  admin_notes: string | null;
  rejection_reason: string | null;
  employees: { id: string; full_name: string; code: string } | null;
  branches: { id: string; name: string } | null;
}

interface ApprovalLog {
  id: string;
  action: string;
  performed_by_name: string | null;
  old_values: any;
  new_values: any;
  reason: string | null;
  decision_method: string;
  created_at: string;
}

export default function DepositReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    amount: '',
    account_number: '',
    bank_name: '',
    reference_number: ''
  });
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageType, setImageType] = useState<'slip' | 'face'>('slip');

  // Fetch deposit details
  const { data: deposit, isLoading } = useQuery({
    queryKey: ['deposit-review', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_deposits')
        .select(`
          *,
          employees(id, full_name, code),
          branches(id, name)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as Deposit;
    },
    enabled: !!id
  });

  // Fetch approval logs
  const { data: approvalLogs } = useQuery({
    queryKey: ['deposit-approval-logs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_approval_logs')
        .select('*')
        .eq('deposit_id', id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ApprovalLog[];
    },
    enabled: !!id
  });

  // Initialize form when deposit loads
  useEffect(() => {
    if (deposit) {
      setEditForm({
        amount: deposit.amount?.toString() || '',
        account_number: deposit.account_number || '',
        bank_name: deposit.bank_name || '',
        reference_number: deposit.reference_number || ''
      });
      setAdminNotes(deposit.admin_notes || '');
    }
  }, [deposit]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!deposit) throw new Error('No deposit');

      const updates: any = {
        status: 'verified',
        verified_at: new Date().toISOString(),
        admin_notes: adminNotes || null
      };

      // If in edit mode, include the edits
      if (editMode) {
        updates.amount = editForm.amount ? parseFloat(editForm.amount.replace(/,/g, '')) : null;
        updates.account_number = editForm.account_number || null;
        updates.bank_name = editForm.bank_name || null;
        updates.reference_number = editForm.reference_number || null;
      }

      const { error: updateError } = await supabase
        .from('daily_deposits')
        .update(updates)
        .eq('id', deposit.id);

      if (updateError) throw updateError;

      // Log the approval
      const { error: logError } = await supabase
        .from('deposit_approval_logs')
        .insert({
          deposit_id: deposit.id,
          action: 'approved',
          performed_by_name: 'Admin', // TODO: Get actual admin name from session
          old_values: {
            status: deposit.status,
            amount: deposit.amount,
            account_number: deposit.account_number
          },
          new_values: updates,
          decision_method: 'web'
        });

      if (logError) console.error('Failed to log approval:', logError);
    },
    onSuccess: () => {
      toast.success("อนุมัติใบฝากเงินสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ['deposit-review', id] });
      queryClient.invalidateQueries({ queryKey: ['deposit-approval-logs', id] });
    },
    onError: (error) => {
      toast.error("เกิดข้อผิดพลาดในการอนุมัติ");
      console.error(error);
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!deposit || !rejectionReason.trim()) throw new Error('Missing data');

      const { error: updateError } = await supabase
        .from('daily_deposits')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          admin_notes: adminNotes || null
        })
        .eq('id', deposit.id);

      if (updateError) throw updateError;

      // Log the rejection
      const { error: logError } = await supabase
        .from('deposit_approval_logs')
        .insert({
          deposit_id: deposit.id,
          action: 'rejected',
          performed_by_name: 'Admin',
          old_values: { status: deposit.status },
          new_values: { status: 'rejected', rejection_reason: rejectionReason },
          reason: rejectionReason,
          decision_method: 'web'
        });

      if (logError) console.error('Failed to log rejection:', logError);
    },
    onSuccess: () => {
      toast.success("ปฏิเสธใบฝากเงินแล้ว");
      setShowRejectDialog(false);
      queryClient.invalidateQueries({ queryKey: ['deposit-review', id] });
      queryClient.invalidateQueries({ queryKey: ['deposit-approval-logs', id] });
    },
    onError: (error) => {
      toast.error("เกิดข้อผิดพลาดในการปฏิเสธ");
      console.error(error);
    }
  });

  // Save edit mutation
  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!deposit) throw new Error('No deposit');

      const oldValues = {
        amount: deposit.amount,
        account_number: deposit.account_number,
        bank_name: deposit.bank_name,
        reference_number: deposit.reference_number
      };

      const newValues = {
        amount: editForm.amount ? parseFloat(editForm.amount.replace(/,/g, '')) : null,
        account_number: editForm.account_number || null,
        bank_name: editForm.bank_name || null,
        reference_number: editForm.reference_number || null
      };

      const { error: updateError } = await supabase
        .from('daily_deposits')
        .update(newValues)
        .eq('id', deposit.id);

      if (updateError) throw updateError;

      // Log the edit
      const { error: logError } = await supabase
        .from('deposit_approval_logs')
        .insert({
          deposit_id: deposit.id,
          action: 'edited',
          performed_by_name: 'Admin',
          old_values: oldValues,
          new_values: newValues,
          decision_method: 'web'
        });

      if (logError) console.error('Failed to log edit:', logError);
    },
    onSuccess: () => {
      toast.success("บันทึกการแก้ไขสำเร็จ");
      setEditMode(false);
      queryClient.invalidateQueries({ queryKey: ['deposit-review', id] });
      queryClient.invalidateQueries({ queryKey: ['deposit-approval-logs', id] });
    },
    onError: (error) => {
      toast.error("เกิดข้อผิดพลาดในการบันทึก");
      console.error(error);
    }
  });

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "-";
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
  };

  const formatConfidence = (confidence: number | null) => {
    if (confidence === null) return null;
    return Math.round(confidence * 100);
  };

  const viewImage = (type: 'slip' | 'face') => {
    setImageType(type);
    setShowImageDialog(true);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!deposit) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">ไม่พบข้อมูลใบฝากเงิน</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              กลับ
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const confidence = formatConfidence(deposit.extraction_confidence);
  const isLowConfidence = confidence !== null && confidence < 70;

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">ตรวจสอบใบฝากเงิน</h1>
            <p className="text-sm text-muted-foreground">
              {deposit.branches?.name} • {format(new Date(deposit.deposit_date), 'd MMM yyyy', { locale: th })}
            </p>
          </div>
        </div>
        <Badge variant={
          deposit.status === 'verified' ? 'default' :
          deposit.status === 'rejected' ? 'destructive' : 'secondary'
        }>
          {deposit.status === 'verified' ? 'อนุมัติแล้ว' :
           deposit.status === 'rejected' ? 'ถูกปฏิเสธ' : 'รอตรวจสอบ'}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Slip Image */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">รูปใบฝากเงิน</CardTitle>
          </CardHeader>
          <CardContent>
            {deposit.slip_photo_url ? (
              <div 
                className="cursor-pointer rounded-lg overflow-hidden bg-muted"
                onClick={() => viewImage('slip')}
              >
                <img 
                  src={deposit.slip_photo_url} 
                  alt="Deposit slip" 
                  className="w-full h-auto max-h-80 object-contain"
                />
              </div>
            ) : (
              <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                ไม่มีรูปภาพ
              </div>
            )}
            {confidence !== null && (
              <div className={`mt-2 flex items-center gap-2 text-sm ${isLowConfidence ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                {isLowConfidence && <AlertTriangle className="h-4 w-4" />}
                AI Confidence: {confidence}%
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deposit Details */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">ข้อมูลใบฝาก</CardTitle>
              {deposit.status === 'pending' && !editMode && (
                <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  แก้ไข
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Employee info */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">{deposit.employees?.full_name}</div>
                <div className="text-sm text-muted-foreground">{deposit.employees?.code}</div>
              </div>
            </div>

            <Separator />

            {editMode ? (
              // Edit form
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="amount">ยอดฝาก (บาท)</Label>
                  <Input
                    id="amount"
                    type="text"
                    value={editForm.amount}
                    onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="account">เลขบัญชี</Label>
                  <Input
                    id="account"
                    type="text"
                    value={editForm.account_number}
                    onChange={(e) => setEditForm(prev => ({ ...prev, account_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bank">ธนาคาร</Label>
                  <Input
                    id="bank"
                    type="text"
                    value={editForm.bank_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, bank_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ref">เลขอ้างอิง</Label>
                  <Input
                    id="ref"
                    type="text"
                    value={editForm.reference_number}
                    onChange={(e) => setEditForm(prev => ({ ...prev, reference_number: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => saveEditMutation.mutate()}
                    disabled={saveEditMutation.isPending}
                  >
                    บันทึก
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setEditMode(false)}
                  >
                    ยกเลิก
                  </Button>
                </div>
              </div>
            ) : (
              // Display mode
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">ยอดฝาก</div>
                    <div className="font-medium text-lg">{formatCurrency(deposit.amount)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">ธนาคาร</div>
                    <div>{deposit.bank_name || '-'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">เลขบัญชี</div>
                    <div className="font-mono">{deposit.account_number || '-'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">เลขอ้างอิง</div>
                    <div className="font-mono">{deposit.reference_number || '-'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">เวลาส่ง</div>
                    <div>{format(new Date(deposit.created_at), 'HH:mm น.', { locale: th })}</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">หมายเหตุ Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="เพิ่มหมายเหตุ (ถ้ามี)"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            disabled={deposit.status !== 'pending'}
            rows={2}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {deposit.status === 'pending' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                className="flex-1" 
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                อนุมัติ
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1"
                onClick={() => setShowRejectDialog(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                ปฏิเสธ
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval History */}
      {approvalLogs && approvalLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              ประวัติการดำเนินการ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {approvalLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className={`w-2 h-2 mt-2 rounded-full ${
                    log.action === 'approved' ? 'bg-green-500' :
                    log.action === 'rejected' ? 'bg-red-500' : 'bg-blue-500'
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {log.action === 'approved' ? 'อนุมัติ' :
                         log.action === 'rejected' ? 'ปฏิเสธ' : 'แก้ไข'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        โดย {log.performed_by_name || 'ระบบ'}
                      </span>
                    </div>
                    {log.reason && (
                      <p className="text-sm text-muted-foreground mt-1">
                        เหตุผล: {log.reason}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(log.created_at), 'd MMM yyyy HH:mm', { locale: th })}
                      {' • '}
                      {log.decision_method === 'web' ? 'ผ่านเว็บ' : log.decision_method === 'line' ? 'ผ่าน LINE' : log.decision_method}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปฏิเสธใบฝากเงิน</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">เหตุผลการปฏิเสธ *</Label>
              <Textarea
                id="reject-reason"
                placeholder="กรุณาระบุเหตุผล"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              ยกเลิก
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => rejectMutation.mutate()}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
            >
              ยืนยันการปฏิเสธ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Fullscreen Dialog */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {imageType === 'slip' ? 'ใบฝากเงิน' : 'รูปยืนยันตัวตน'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center">
            {deposit && (
              <img 
                src={imageType === 'slip' ? deposit.slip_photo_url! : deposit.face_photo_url!}
                alt={imageType === 'slip' ? 'Deposit slip' : 'Face photo'}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
