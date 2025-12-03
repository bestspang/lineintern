import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CalendarDays, CheckCircle, XCircle, Clock, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { th } from "date-fns/locale";

export default function FlexibleDayOffRequests() {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalNotes, setApprovalNotes] = useState('');
  
  // Bulk selection state
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [isBulkMode, setIsBulkMode] = useState(false);

  // Fetch flexible day-off requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["flexible-day-off-requests-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flexible_day_off_requests")
        .select(`
          *,
          employees (
            full_name,
            code,
            branch:branches(name)
          )
        `)
        .order('requested_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  // Approval mutation
  const approvalMutation = useMutation({
    mutationFn: async ({ request_id, action, notes }: { request_id: string; action: 'approve' | 'reject'; notes?: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const updateData: any = {
        status: action === 'approve' ? 'approved' : 'rejected',
        approved_at: action === 'approve' ? new Date().toISOString() : null,
        approved_by_admin_id: session.session.user.id,
        rejection_reason: action === 'reject' ? notes : null,
      };

      const { error } = await supabase
        .from('flexible_day_off_requests')
        .update(updateData)
        .eq('id', request_id);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: (_, variables) => {
      const actionText = variables.action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';
      toast.success(`${actionText}คำขอเรียบร้อย`);
      queryClient.invalidateQueries({ queryKey: ["flexible-day-off-requests-admin"] });
      setApprovalDialogOpen(false);
      setApprovalNotes('');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Bulk approve/reject mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async ({ requestIds, action, notes }: { 
      requestIds: string[]; 
      action: 'approve' | 'reject';
      notes?: string;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const updateData: any = {
        status: action === 'approve' ? 'approved' : 'rejected',
        approved_at: action === 'approve' ? new Date().toISOString() : null,
        approved_by_admin_id: session.session.user.id,
        rejection_reason: action === 'reject' ? notes : null,
      };

      const { error } = await supabase
        .from('flexible_day_off_requests')
        .update(updateData)
        .in('id', requestIds);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: (_, variables) => {
      const actionText = variables.action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';
      toast.success(`${actionText} ${variables.requestIds.length} คำขอเรียบร้อยแล้ว`);
      queryClient.invalidateQueries({ queryKey: ["flexible-day-off-requests-admin"] });
      setSelectedRequests(new Set());
      setIsBulkMode(false);
      setApprovalDialogOpen(false);
      setApprovalNotes('');
      setSelectedRequest(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'เกิดข้อผิดพลาดในการดำเนินการแบบกลุ่ม');
    }
  });

  const handleApprovalClick = (request: any, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setApprovalAction(action);
    setApprovalDialogOpen(true);
  };

  const handleApprovalSubmit = () => {
    if (!selectedRequest) return;
    
    if (approvalAction === 'reject' && !approvalNotes.trim()) {
      toast.error('กรุณาระบุเหตุผลในการไม่อนุมัติ');
      return;
    }

    if (isBulkMode && selectedRequests.size > 0) {
      bulkApproveMutation.mutate({
        requestIds: Array.from(selectedRequests),
        action: approvalAction,
        notes: approvalNotes.trim() || undefined
      });
    } else {
      approvalMutation.mutate({
        request_id: selectedRequest.id,
        action: approvalAction,
        notes: approvalNotes.trim() || undefined
      });
    }
  };

  const handleBulkAction = (action: 'approve' | 'reject') => {
    if (selectedRequests.size === 0) {
      toast.error('กรุณาเลือกคำขออย่างน้อย 1 รายการ');
      return;
    }
    setApprovalAction(action);
    setSelectedRequest({ id: 'bulk', employees: { full_name: `${selectedRequests.size} requests` } });
    setApprovalDialogOpen(true);
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
    const pendingIds = pendingRequests.map(r => r.id);
    
    if (selectedRequests.size === pendingIds.length) {
      setSelectedRequests(new Set());
    } else {
      setSelectedRequests(new Set(pendingIds));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50"><Clock className="h-3 w-3 mr-1" />รออนุมัติ</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-50 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />อนุมัติ</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />ไม่อนุมัติ</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingRequests = requests?.filter(r => r.status === 'pending') || [];
  const processedRequests = requests?.filter(r => r.status !== 'pending') || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CalendarDays className="h-8 w-8" />
          Flexible Day-Off Requests
        </h1>
        <p className="text-muted-foreground">
          จัดการคำขอวันหยุดยืดหยุ่นของพนักงาน
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            รออนุมัติ ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="processed">
            ดำเนินการแล้ว ({processedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    คำขอที่รออนุมัติ
                  </CardTitle>
                  <CardDescription>
                    คำขอวันหยุดยืดหยุ่นที่รอการพิจารณา
                  </CardDescription>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant={isBulkMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setIsBulkMode(!isBulkMode);
                      setSelectedRequests(new Set());
                    }}
                  >
                    {isBulkMode ? '✓ Bulk Mode' : 'Bulk Mode'}
                  </Button>

                  {isBulkMode && selectedRequests.size > 0 && (
                    <>
                      <Badge variant="secondary">{selectedRequests.size} selected</Badge>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleBulkAction('approve')}
                        disabled={bulkApproveMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        อนุมัติทั้งหมด
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleBulkAction('reject')}
                        disabled={bulkApproveMutation.isPending}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        ไม่อนุมัติทั้งหมด
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isBulkMode && pendingRequests.length > 0 && (
                <div className="mb-4 p-3 bg-muted rounded-lg flex items-center gap-2">
                  <Checkbox
                    checked={selectedRequests.size === pendingRequests.length}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm font-medium">
                    เลือกทั้งหมด ({pendingRequests.length})
                  </span>
                </div>
              )}

              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  ไม่มีคำขอที่รออนุมัติ
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isBulkMode && <TableHead className="w-12"></TableHead>}
                        <TableHead>พนักงาน</TableHead>
                        <TableHead>สาขา</TableHead>
                        <TableHead>วันที่ขอหยุด</TableHead>
                        <TableHead>เหตุผล</TableHead>
                        <TableHead>วันที่ส่งคำขอ</TableHead>
                        <TableHead className="text-right">การดำเนินการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((request) => {
                        const isSelected = selectedRequests.has(request.id);
                        
                        return (
                          <TableRow key={request.id}>
                            {isBulkMode && (
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelection(request.id)}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <div>
                                <div className="font-medium flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {request.employees?.full_name}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {request.employees?.code}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {request.employees?.branch?.name || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {format(new Date(request.day_off_date), 'd MMM yyyy', { locale: th })}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {request.reason || '-'}
                            </TableCell>
                            <TableCell>
                              {format(new Date(request.requested_at), 'd MMM yyyy HH:mm', { locale: th })}
                            </TableCell>
                            <TableCell className="text-right">
                              {!isBulkMode && (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleApprovalClick(request, 'approve')}
                                    disabled={approvalMutation.isPending}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    อนุมัติ
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleApprovalClick(request, 'reject')}
                                    disabled={approvalMutation.isPending}
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    ไม่อนุมัติ
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processed">
          <Card>
            <CardHeader>
              <CardTitle>คำขอที่ดำเนินการแล้ว</CardTitle>
              <CardDescription>
                ประวัติคำขอวันหยุดยืดหยุ่นทั้งหมด
              </CardDescription>
            </CardHeader>
            <CardContent>
              {processedRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  ไม่มีประวัติคำขอ
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>พนักงาน</TableHead>
                        <TableHead>สาขา</TableHead>
                        <TableHead>วันที่หยุด</TableHead>
                        <TableHead>เหตุผล</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead>วันที่ดำเนินการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processedRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{request.employees?.full_name}</div>
                              <div className="text-sm text-muted-foreground">{request.employees?.code}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {request.employees?.branch?.name || '-'}
                          </TableCell>
                          <TableCell>
                            {format(new Date(request.day_off_date), 'd MMM yyyy', { locale: th })}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {request.reason || '-'}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(request.status)}
                            {request.rejection_reason && (
                              <p className="text-xs text-muted-foreground mt-1">
                                เหตุผล: {request.rejection_reason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            {request.approved_at 
                              ? format(new Date(request.approved_at), 'd MMM yyyy HH:mm', { locale: th })
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve' ? 'อนุมัติคำขอ' : 'ไม่อนุมัติคำขอ'}
            </DialogTitle>
            <DialogDescription>
              {isBulkMode 
                ? `กำลังดำเนินการกับ ${selectedRequests.size} คำขอ`
                : `คำขอของ ${selectedRequest?.employees?.full_name}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {approvalAction === 'reject' && (
              <div className="space-y-2">
                <Label htmlFor="notes">เหตุผลในการไม่อนุมัติ *</Label>
                <Textarea
                  id="notes"
                  placeholder="ระบุเหตุผล..."
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            
            {approvalAction === 'approve' && (
              <div className="space-y-2">
                <Label htmlFor="notes">หมายเหตุ (ไม่บังคับ)</Label>
                <Textarea
                  id="notes"
                  placeholder="หมายเหตุเพิ่มเติม..."
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              variant={approvalAction === 'approve' ? 'default' : 'destructive'}
              onClick={handleApprovalSubmit}
              disabled={approvalMutation.isPending || bulkApproveMutation.isPending}
            >
              {approvalAction === 'approve' ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  อนุมัติ
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-1" />
                  ไม่อนุมัติ
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}