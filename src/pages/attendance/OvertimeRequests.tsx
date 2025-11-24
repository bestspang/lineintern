import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Clock, CheckCircle2, XCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function OvertimeRequests() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Bulk selection state
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [isBulkMode, setIsBulkMode] = useState(false);

  // Fetch OT requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ['overtime-requests', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('overtime_requests')
        .select(`
          *,
          employees!inner(
            id,
            code,
            full_name,
            line_user_id
          )
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000
  });

  // Approve/Reject mutation
  const approveMutation = useMutation({
    mutationFn: async ({ requestId, action, notes }: { 
      requestId: string; 
      action: 'approve' | 'reject';
      notes?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('overtime-approval', {
        body: {
          request_id: requestId,
          action,
          decision_method: 'webapp',
          notes
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === 'approve' 
          ? 'อนุมัติคำขอ OT เรียบร้อยแล้ว / OT request approved'
          : 'ปฏิเสธคำขอ OT แล้ว / OT request rejected'
      );
      queryClient.invalidateQueries({ queryKey: ['overtime-requests'] });
      setSelectedRequest(null);
      setActionType(null);
      setNotes("");
    },
    onError: (error: any) => {
      toast.error(error.message || 'เกิดข้อผิดพลาด / Error occurred');
    }
  });

  // Bulk approve/reject mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async ({ requestIds, action, notes }: { 
      requestIds: string[]; 
      action: 'approve' | 'reject';
      notes?: string;
    }) => {
      const results = await Promise.allSettled(
        requestIds.map(requestId =>
          supabase.functions.invoke('overtime-approval', {
            body: {
              request_id: requestId,
              action,
              decision_method: 'webapp',
              notes
            }
          })
        )
      );

      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error(`${failed.length} requests failed to process`);
      }

      return results;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === 'approve'
          ? `อนุมัติ ${variables.requestIds.length} คำขอแล้ว / ${variables.requestIds.length} requests approved`
          : `ปฏิเสธ ${variables.requestIds.length} คำขอแล้ว / ${variables.requestIds.length} requests rejected`
      );
      queryClient.invalidateQueries({ queryKey: ['overtime-requests'] });
      setSelectedRequests(new Set());
      setIsBulkMode(false);
      setSelectedRequest(null);
      setActionType(null);
      setNotes("");
    },
    onError: (error: any) => {
      toast.error(error.message || 'เกิดข้อผิดพลาดในการดำเนินการแบบกลุ่ม / Bulk action error');
    }
  });

  const handleAction = (request: any, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setActionType(action);
  };

  const handleConfirmAction = () => {
    if (!selectedRequest || !actionType) return;
    
    if (isBulkMode && selectedRequests.size > 0) {
      // Bulk action
      bulkApproveMutation.mutate({
        requestIds: Array.from(selectedRequests),
        action: actionType,
        notes: notes.trim() || undefined
      });
    } else {
      // Single action
      approveMutation.mutate({
        requestId: selectedRequest.id,
        action: actionType,
        notes: notes.trim() || undefined
      });
    }
  };

  const handleBulkAction = (action: 'approve' | 'reject') => {
    if (selectedRequests.size === 0) {
      toast.error('กรุณาเลือกคำขออย่างน้อย 1 รายการ / Please select at least 1 request');
      return;
    }
    setActionType(action);
    setSelectedRequest({ id: 'bulk', employees: { full_name: `${selectedRequests.size} requests` } });
  };

  const toggleSelection = (requestId: string) => {
    const newSelection = new Set(selectedRequests);
    if (newSelection.has(requestId)) {
      newSelection.delete(requestId);
    } else {
      newSelection.add(requestId);
    }
    setSelectedRequests(newSelection);
  };

  const toggleSelectAll = () => {
    if (!requests) return;
    const pendingRequests = requests.filter((r: any) => r.status === 'pending');
    
    if (selectedRequests.size === pendingRequests.length) {
      setSelectedRequests(new Set());
    } else {
      setSelectedRequests(new Set(pendingRequests.map((r: any) => r.id)));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-300">
          <Clock className="w-3 h-3 mr-1" />
          รอการอนุมัติ / Pending
        </Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-300">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          อนุมัติแล้ว / Approved
        </Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-300">
          <XCircle className="w-3 h-3 mr-1" />
          ไม่อนุมัติ / Rejected
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/attendance')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">คำขอ OT / Overtime Requests</h1>
          <p className="text-muted-foreground">จัดการคำขออนุมัติทำงานล่วงเวลา / Manage overtime approval requests</p>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">รายการคำขอ / Requests</h2>
            
            {/* Bulk Mode Toggle */}
            <Button
              variant={isBulkMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIsBulkMode(!isBulkMode);
                setSelectedRequests(new Set());
              }}
            >
              {isBulkMode ? '✓ Bulk Mode' : 'Enable Bulk Mode'}
            </Button>

            {/* Bulk Actions */}
            {isBulkMode && selectedRequests.size > 0 && (
              <div className="flex gap-2">
                <Badge variant="secondary">{selectedRequests.size} selected</Badge>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleBulkAction('approve')}
                  disabled={bulkApproveMutation.isPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Approve All
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleBulkAction('reject')}
                  disabled={bulkApproveMutation.isPending}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject All
                </Button>
              </div>
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด / All</SelectItem>
              <SelectItem value="pending">รอการอนุมัติ / Pending</SelectItem>
              <SelectItem value="approved">อนุมัติแล้ว / Approved</SelectItem>
              <SelectItem value="rejected">ไม่อนุมัติ / Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Select All Checkbox (only in bulk mode with pending requests) */}
        {isBulkMode && requests && requests.some((r: any) => r.status === 'pending') && (
          <div className="mb-4 p-3 bg-muted rounded-lg flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedRequests.size === requests.filter((r: any) => r.status === 'pending').length}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium">Select All Pending ({requests.filter((r: any) => r.status === 'pending').length})</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : !requests || requests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>ไม่มีคำขอ OT / No OT requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request: any) => {
              const employee = request.employees;
              const isPending = request.status === 'pending';
              const isSelected = selectedRequests.has(request.id);

              return (
                <Card key={request.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Checkbox for bulk mode */}
                      {isBulkMode && isPending && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(request.id)}
                          className="h-5 w-5 mt-1 rounded border-gray-300"
                        />
                      )}

                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg">
                            {employee.full_name} ({employee.code})
                          </h3>
                          {getStatusBadge(request.status)}
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">วันที่ / Date:</span>
                            <p className="font-medium">{format(new Date(request.request_date), 'dd MMM yyyy')}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">OT (ชั่วโมง / hours):</span>
                            <p className="font-medium">{request.estimated_hours} ชม.</p>
                          </div>
                        </div>

                        <div>
                          <span className="text-muted-foreground text-sm">เหตุผล / Reason:</span>
                          <p className="mt-1">{request.reason}</p>
                        </div>

                        {request.rejection_reason && (
                          <div className="mt-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                            <span className="text-sm font-medium text-red-700 dark:text-red-400">
                              เหตุผลที่ไม่อนุมัติ / Rejection Reason:
                            </span>
                            <p className="text-sm mt-1">{request.rejection_reason}</p>
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground">
                          ขอเมื่อ / Requested: {format(new Date(request.requested_at), 'dd MMM yyyy HH:mm')}
                          {request.approved_at && (
                            <> • ตอบเมื่อ / Responded: {format(new Date(request.approved_at), 'dd MMM yyyy HH:mm')}</>
                          )}
                        </div>
                      </div>
                    </div>

                    {isPending && !isBulkMode && (
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleAction(request, 'approve')}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          อนุมัติ / Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAction(request, 'reject')}
                          disabled={approveMutation.isPending}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          ไม่อนุมัติ / Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      <AlertDialog open={!!selectedRequest && !!actionType} onOpenChange={(open) => {
        if (!open) {
          setSelectedRequest(null);
          setActionType(null);
          setNotes("");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'approve' ? '✅ อนุมัติคำขอ OT' : '❌ ปฏิเสธคำขอ OT'}
              {isBulkMode && selectedRequests.size > 1 && ` (${selectedRequests.size} รายการ)`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-4">
                {selectedRequest && (
                  <>
                    {isBulkMode && selectedRequests.size > 1 ? (
                      <div>
                        <p><strong>จำนวน / Count:</strong> {selectedRequests.size} คำขอ / requests</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          คุณกำลังจะ{actionType === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'}คำขอพร้อมกัน {selectedRequests.size} รายการ
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p><strong>พนักงาน / Employee:</strong> {selectedRequest.employees.full_name}</p>
                        <p><strong>วันที่ / Date:</strong> {format(new Date(selectedRequest.request_date), 'dd MMM yyyy')}</p>
                        <p><strong>OT:</strong> {selectedRequest.estimated_hours} ชั่วโมง / hours</p>
                        <p><strong>เหตุผล / Reason:</strong> {selectedRequest.reason}</p>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="notes">
                        {actionType === 'reject' ? 'เหตุผลที่ไม่อนุมัติ (จำเป็น) / Rejection Reason (Required)' : 'หมายเหตุ (ไม่จำเป็น) / Notes (Optional)'}
                      </Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={actionType === 'reject' ? 'กรุณาระบุเหตุผล...' : 'หมายเหตุเพิ่มเติม...'}
                        className="mt-2"
                        rows={3}
                      />
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก / Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={actionType === 'reject' && !notes.trim()}
              className={actionType === 'approve' ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
            >
              {actionType === 'approve' ? 'ยืนยันอนุมัติ / Confirm Approve' : 'ยืนยันปฏิเสธ / Confirm Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}