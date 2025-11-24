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
import { Clock, CheckCircle, XCircle, AlertTriangle, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function EarlyLeaveRequests() {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalNotes, setApprovalNotes] = useState('');

  // Fetch early leave requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["early-leave-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("early_leave_requests")
        .select(`
          *,
          employees (
            full_name,
            code
          )
        `)
        .order('requested_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Approval mutation
  const approvalMutation = useMutation({
    mutationFn: async ({ request_id, action, notes }: { request_id: string; action: 'approve' | 'reject'; notes?: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('early-leave-approval', {
        body: {
          request_id,
          admin_id: session.session.user.id,
          action,
          decision_method: 'webapp',
          notes: notes || undefined
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      const actionText = variables.action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';
      toast.success(`${actionText}คำขอเรียบร้อย`);
      queryClient.invalidateQueries({ queryKey: ["early-leave-requests"] });
      setApprovalDialogOpen(false);
      setApprovalNotes('');
    },
    onError: (error: Error) => {
      toast.error("เกิดข้อผิดพลาด: " + error.message);
    },
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

    approvalMutation.mutate({
      request_id: selectedRequest.id,
      action: approvalAction,
      notes: approvalNotes.trim() || undefined
    });
  };

  const getLeaveTypeEmoji = (type: string) => {
    const emojis: Record<string, string> = {
      sick: '🤒',
      personal: '📝',
      vacation: '🏖️',
      emergency: '🚨',
      other: '❓'
    };
    return emojis[type] || '❓';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50"><Clock className="h-3 w-3 mr-1" />รออนุมัติ</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-50 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />อนุมัติ</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />ไม่อนุมัติ</Badge>;
      case 'timeout':
        return <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />หมดเวลา</Badge>;
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
        <h1 className="text-3xl font-bold">Early Leave Requests</h1>
        <p className="text-muted-foreground">
          Manage employee requests to leave work early
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
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                คำขอที่รออนุมัติ
              </CardTitle>
              <CardDescription>
                คำขอออกงานก่อนเวลาที่รอการพิจารณา
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  ไม่มีคำขอที่รออนุมัติ
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>พนักงาน</TableHead>
                        <TableHead>ประเภท</TableHead>
                        <TableHead>เหตุผล</TableHead>
                        <TableHead>เวลาทำงาน</TableHead>
                        <TableHead>ขาดเวลา</TableHead>
                        <TableHead>วันที่ขอ</TableHead>
                        <TableHead className="text-right">การดำเนินการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {request.employees?.full_name}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {request.employees?.code}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {getLeaveTypeEmoji(request.leave_type)} {request.leave_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {request.leave_reason}
                          </TableCell>
                          <TableCell>
                            {request.actual_work_hours?.toFixed(1)} / {request.required_work_hours?.toFixed(1)} ชม.
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive">
                              -{(request.required_work_hours - request.actual_work_hours).toFixed(1)} ชม.
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(request.requested_at).toLocaleString('th-TH')}
                          </TableCell>
                          <TableCell className="text-right">
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

        <TabsContent value="processed">
          <Card>
            <CardHeader>
              <CardTitle>คำขอที่ดำเนินการแล้ว</CardTitle>
              <CardDescription>
                ประวัติการอนุมัติ/ไม่อนุมัติคำขอออกงานก่อนเวลา
              </CardDescription>
            </CardHeader>
            <CardContent>
              {processedRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  ไม่มีประวัติการดำเนินการ
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>พนักงาน</TableHead>
                        <TableHead>ประเภท</TableHead>
                        <TableHead>เหตุผล</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead>เวลาทำงาน</TableHead>
                        <TableHead>วันที่ดำเนินการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processedRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {request.employees?.full_name}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {request.employees?.code}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {getLeaveTypeEmoji(request.leave_type)} {request.leave_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="truncate">{request.leave_reason}</div>
                            {request.rejection_reason && (
                              <div className="text-sm text-red-600 mt-1">
                                ❌ {request.rejection_reason}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(request.status)}
                          </TableCell>
                          <TableCell>
                            {request.actual_work_hours?.toFixed(1)} / {request.required_work_hours?.toFixed(1)} ชม.
                          </TableCell>
                          <TableCell>
                            {request.approved_at ? new Date(request.approved_at).toLocaleString('th-TH') : '-'}
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
              {approvalAction === 'approve' ? '✅ อนุมัติ' : '❌ ไม่อนุมัติ'}คำขอออกงานก่อนเวลา
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <div className="space-y-2 mt-4">
                  <p><strong>พนักงาน:</strong> {selectedRequest.employees?.full_name}</p>
                  <p><strong>ประเภท:</strong> {getLeaveTypeEmoji(selectedRequest.leave_type)} {selectedRequest.leave_type}</p>
                  <p><strong>เหตุผล:</strong> {selectedRequest.leave_reason}</p>
                  <p><strong>เวลาทำงาน:</strong> {selectedRequest.actual_work_hours?.toFixed(1)} / {selectedRequest.required_work_hours?.toFixed(1)} ชั่วโมง</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {approvalAction === 'approve' ? (
              <div className="rounded-lg bg-green-50 p-4 text-sm">
                <p className="font-medium text-green-900">✅ การอนุมัติจะทำให้:</p>
                <ul className="list-disc list-inside text-green-800 mt-2 space-y-1">
                  <li>พนักงานได้รับการอนุมัติให้ออกงานก่อนเวลา</li>
                  <li>ระบบจะ Check Out ให้อัตโนมัติ</li>
                  <li>พนักงานจะได้รับการแจ้งเตือนทาง LINE</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg bg-red-50 p-4 text-sm">
                  <p className="font-medium text-red-900">❌ การไม่อนุมัติจะทำให้:</p>
                  <ul className="list-disc list-inside text-red-800 mt-2 space-y-1">
                    <li>พนักงานต้องทำงานต่อจนครบเวลา</li>
                    <li>พนักงานจะได้รับการแจ้งเตือนทาง LINE</li>
                  </ul>
                </div>
                <div>
                  <Label htmlFor="notes">เหตุผลในการไม่อนุมัติ *</Label>
                  <Textarea
                    id="notes"
                    placeholder="ระบุเหตุผล..."
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    maxLength={500}
                    rows={3}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {approvalNotes.length}/500 ตัวอักษร
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApprovalDialogOpen(false)}
              disabled={approvalMutation.isPending}
            >
              ยกเลิก
            </Button>
            <Button
              variant={approvalAction === 'approve' ? 'default' : 'destructive'}
              onClick={handleApprovalSubmit}
              disabled={approvalMutation.isPending}
            >
              {approvalMutation.isPending ? 'กำลังดำเนินการ...' : 
               approvalAction === 'approve' ? 'ยืนยันการอนุมัติ' : 'ยืนยันไม่อนุมัติ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
