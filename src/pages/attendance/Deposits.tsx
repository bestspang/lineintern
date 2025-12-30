import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { th } from "date-fns/locale";
import { CalendarIcon, Search, Eye, CheckCircle, XCircle, Download, Image, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Deposit {
  id: string;
  branch_id: string;
  employee_id: string;
  deposit_date: string;
  amount: number | null;
  account_number: string | null;
  bank_name: string | null;
  reference_number: string | null;
  status: string;
  slip_photo_url: string | null;
  face_photo_url: string | null;
  created_at: string;
  employees: { full_name: string; code: string } | null;
  branches: { name: string } | null;
}

export default function Deposits() {
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageType, setImageType] = useState<'slip' | 'face'>('slip');
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });

  // Fetch deposits
  const { data: deposits, isLoading, refetch } = useQuery({
    queryKey: ['deposits', dateRange, branchFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('daily_deposits')
        .select(`
          *,
          employees(full_name, code),
          branches(name)
        `)
        .gte('deposit_date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('deposit_date', format(dateRange.to, 'yyyy-MM-dd'))
        .order('deposit_date', { ascending: false });

      if (branchFilter !== 'all') {
        query = query.eq('branch_id', branchFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Deposit[];
    }
  });

  // Fetch branches for filter
  const { data: branches } = useQuery({
    queryKey: ['branches-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
      return data || [];
    }
  });

  // Verify deposit
  const handleVerify = async (id: string) => {
    try {
      const { error } = await supabase
        .from('daily_deposits')
        .update({ 
          status: 'verified',
          verified_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      toast.success("ตรวจสอบสำเร็จ");
      refetch();
    } catch (error) {
      toast.error("เกิดข้อผิดพลาด");
    }
  };

  // Reject deposit
  const handleReject = async (id: string) => {
    const reason = prompt("กรุณาระบุเหตุผลการปฏิเสธ:");
    if (!reason) return;

    try {
      const { error } = await supabase
        .from('daily_deposits')
        .update({ 
          status: 'rejected',
          rejection_reason: reason
        })
        .eq('id', id);

      if (error) throw error;
      toast.success("ปฏิเสธสำเร็จ");
      refetch();
    } catch (error) {
      toast.error("เกิดข้อผิดพลาด");
    }
  };

  // View image
  const viewImage = (deposit: Deposit, type: 'slip' | 'face') => {
    setSelectedDeposit(deposit);
    setImageType(type);
    setShowImageDialog(true);
  };

  // Format currency
  const formatCurrency = (amount: number | null) => {
    if (!amount) return "-";
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
  };

  // Filter deposits by search
  const filteredDeposits = deposits?.filter(d => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      d.employees?.full_name?.toLowerCase().includes(searchLower) ||
      d.employees?.code?.toLowerCase().includes(searchLower) ||
      d.branches?.name?.toLowerCase().includes(searchLower) ||
      d.reference_number?.toLowerCase().includes(searchLower)
    );
  });

  // Calculate totals
  const totalAmount = filteredDeposits?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;
  const verifiedCount = filteredDeposits?.filter(d => d.status === 'verified').length || 0;
  const pendingCount = filteredDeposits?.filter(d => d.status === 'pending').length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">รายการฝากเงินประจำวัน</h1>
          <p className="text-muted-foreground">ตรวจสอบและจัดการใบฝากเงินจากทุกสาขา</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{filteredDeposits?.length || 0}</div>
              <p className="text-sm text-muted-foreground">รายการทั้งหมด</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{formatCurrency(totalAmount)}</div>
              <p className="text-sm text-muted-foreground">ยอดรวม</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{verifiedCount}</div>
              <p className="text-sm text-muted-foreground">ตรวจสอบแล้ว</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
              <p className="text-sm text-muted-foreground">รอตรวจสอบ</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="ค้นหาพนักงาน, สาขา, เลขอ้างอิง..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="min-w-[200px]">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.from, 'd MMM', { locale: th })} - {format(dateRange.to, 'd MMM yyyy', { locale: th })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setDateRange({ from: range.from, to: range.to });
                      }
                    }}
                    locale={th}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-[180px]">
                  <Building2 className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="ทุกสาขา" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกสาขา</SelectItem>
                  {branches?.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="สถานะ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="pending">รอตรวจสอบ</SelectItem>
                  <SelectItem value="verified">ตรวจสอบแล้ว</SelectItem>
                  <SelectItem value="rejected">ถูกปฏิเสธ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>สาขา</TableHead>
                    <TableHead>พนักงาน</TableHead>
                    <TableHead className="text-right">ยอดฝาก</TableHead>
                    <TableHead>เลขบัญชี</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>รูปภาพ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeposits?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        ไม่พบข้อมูล
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDeposits?.map(deposit => (
                      <TableRow key={deposit.id}>
                        <TableCell>
                          {format(new Date(deposit.deposit_date), 'd MMM yyyy', { locale: th })}
                        </TableCell>
                        <TableCell>{deposit.branches?.name || '-'}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{deposit.employees?.full_name}</div>
                            <div className="text-xs text-muted-foreground">{deposit.employees?.code}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(deposit.amount)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {deposit.account_number || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {deposit.reference_number || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {deposit.slip_photo_url && (
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => viewImage(deposit, 'slip')}
                              >
                                <Image className="h-4 w-4" />
                              </Button>
                            )}
                            {deposit.face_photo_url && (
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => viewImage(deposit, 'face')}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            deposit.status === 'verified' ? 'default' :
                            deposit.status === 'rejected' ? 'destructive' : 'secondary'
                          }>
                            {deposit.status === 'verified' ? 'ตรวจสอบแล้ว' :
                             deposit.status === 'rejected' ? 'ถูกปฏิเสธ' : 'รอตรวจสอบ'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {deposit.status === 'pending' && (
                            <div className="flex justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="text-green-600 hover:text-green-700"
                                onClick={() => handleVerify(deposit.id)}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleReject(deposit.id)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
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

        {/* Image Dialog */}
        <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {imageType === 'slip' ? 'ใบฝากเงิน' : 'รูปยืนยันตัวตน'}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center">
              {selectedDeposit && (
                <img 
                  src={imageType === 'slip' ? selectedDeposit.slip_photo_url! : selectedDeposit.face_photo_url!}
                  alt={imageType === 'slip' ? 'Deposit slip' : 'Face photo'}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}