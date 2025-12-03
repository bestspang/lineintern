import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Calendar, Loader2, Edit, RefreshCw, TrendingUp, TrendingDown, CalendarPlus, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_year: number;
  vacation_days_total: number;
  vacation_days_used: number;
  sick_days_total: number;
  sick_days_used: number;
  personal_days_total: number;
  personal_days_used: number;
  employees: {
    code: string;
    full_name: string;
  };
}

export default function LeaveBalance() {
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingBalance, setEditingBalance] = useState<LeaveBalance | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const { data: balances, isLoading } = useQuery({
    queryKey: ['leave-balances', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_balances')
        .select(`
          *,
          employees (
            code,
            full_name
          )
        `)
        .eq('leave_year', selectedYear)
        .order('employees(full_name)');
      
      if (error) throw error;
      return data as LeaveBalance[];
    }
  });

  const updateBalanceMutation = useMutation({
    mutationFn: async (values: Partial<LeaveBalance>) => {
      const { error } = await supabase
        .from('leave_balances')
        .update({
          vacation_days_total: values.vacation_days_total,
          vacation_days_used: values.vacation_days_used,
          sick_days_total: values.sick_days_total,
          sick_days_used: values.sick_days_used,
          personal_days_total: values.personal_days_total,
          personal_days_used: values.personal_days_used,
          updated_at: new Date().toISOString()
        })
        .eq('id', values.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setShowEditDialog(false);
      setEditingBalance(null);
      toast.success('บันทึกข้อมูลสำเร็จ');
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + error.message);
    }
  });

  const createNewYearBalancesMutation = useMutation({
    mutationFn: async (year: number) => {
      // Get all employees
      const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('id')
        .eq('is_active', true);

      if (empError) throw empError;

      // Create balances for new year
      const balances = employees.map(emp => ({
        employee_id: emp.id,
        leave_year: year,
        vacation_days_total: 10,
        sick_days_total: 30,
        personal_days_total: 3
      }));

      const { error } = await supabase
        .from('leave_balances')
        .insert(balances);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success('สร้างข้อมูลวันลาสำหรับปีใหม่สำเร็จ');
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + error.message);
    }
  });

  const handleEdit = (balance: LeaveBalance) => {
    setEditingBalance(balance);
    setShowEditDialog(true);
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingBalance) return;

    const formData = new FormData(e.currentTarget);
    updateBalanceMutation.mutate({
      id: editingBalance.id,
      vacation_days_total: parseFloat(formData.get('vacation_total') as string),
      vacation_days_used: parseFloat(formData.get('vacation_used') as string),
      sick_days_total: parseFloat(formData.get('sick_total') as string),
      sick_days_used: parseFloat(formData.get('sick_used') as string),
      personal_days_total: parseFloat(formData.get('personal_total') as string),
      personal_days_used: parseFloat(formData.get('personal_used') as string)
    });
  };

  const getProgressVariant = (used: number, total: number) => {
    const percentage = (used / total) * 100;
    if (percentage >= 90) return 'destructive';
    if (percentage >= 70) return 'warning';
    return 'default';
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">สรุปวันลาพนักงาน</h1>
          <p className="text-muted-foreground">ติดตามและจัดการวันลาของพนักงาน</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => createNewYearBalancesMutation.mutate(selectedYear)}
            disabled={createNewYearBalancesMutation.isPending}
          >
            {createNewYearBalancesMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CalendarPlus className="h-4 w-4 mr-2" />
            )}
            สร้างข้อมูลปี {selectedYear}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">วันลาพักร้อน</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {balances?.reduce((sum, b) => sum + (b.vacation_days_total - b.vacation_days_used), 0) || 0}
            </div>
            <p className="text-xs text-muted-foreground">วันคงเหลือทั้งหมด</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">วันลาป่วย</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {balances?.reduce((sum, b) => sum + (b.sick_days_total - b.sick_days_used), 0) || 0}
            </div>
            <p className="text-xs text-muted-foreground">วันคงเหลือทั้งหมด</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">วันลากิจ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {balances?.reduce((sum, b) => sum + (b.personal_days_total - b.personal_days_used), 0) || 0}
            </div>
            <p className="text-xs text-muted-foreground">วันคงเหลือทั้งหมด</p>
          </CardContent>
        </Card>
      </div>

      {/* Employee Balances Table */}
      <Card>
        <CardHeader>
          <CardTitle>รายละเอียดวันลาแต่ละคน</CardTitle>
          <CardDescription>ข้อมูลวันลาของพนักงานทั้งหมดประจำปี {selectedYear}</CardDescription>
        </CardHeader>
        <CardContent>
          {(!balances || balances.length === 0) ? (
            <div className="text-center py-12 space-y-4">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold">ไม่พบข้อมูลวันลาประจำปี {selectedYear}</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  กรุณากดปุ่มด้านล่างเพื่อสร้างข้อมูลวันลาสำหรับพนักงานทั้งหมด
                </p>
              </div>
              <Button
                onClick={() => createNewYearBalancesMutation.mutate(selectedYear)}
                disabled={createNewYearBalancesMutation.isPending}
              >
                {createNewYearBalancesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CalendarPlus className="h-4 w-4 mr-2" />
                )}
                สร้างข้อมูลวันลาปี {selectedYear}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อพนักงาน</TableHead>
                  <TableHead>ลาพักร้อน</TableHead>
                  <TableHead>ลาป่วย</TableHead>
                  <TableHead>ลากิจ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((balance) => (
                  <TableRow key={balance.id}>
                    <TableCell className="font-mono">{balance.employees.code}</TableCell>
                    <TableCell className="font-medium">{balance.employees.full_name}</TableCell>
                    <TableCell>
                      <div className="space-y-2 min-w-[150px]">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {balance.vacation_days_used} / {balance.vacation_days_total} วัน
                          </span>
                          <Badge variant={balance.vacation_days_used >= balance.vacation_days_total ? 'destructive' : 'secondary'} className="text-xs">
                            คงเหลือ {balance.vacation_days_total - balance.vacation_days_used}
                          </Badge>
                        </div>
                        <Progress 
                          value={(balance.vacation_days_used / balance.vacation_days_total) * 100} 
                          className="h-2"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2 min-w-[150px]">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {balance.sick_days_used} / {balance.sick_days_total} วัน
                          </span>
                          <Badge variant={balance.sick_days_used >= balance.sick_days_total ? 'destructive' : 'secondary'} className="text-xs">
                            คงเหลือ {balance.sick_days_total - balance.sick_days_used}
                          </Badge>
                        </div>
                        <Progress 
                          value={(balance.sick_days_used / balance.sick_days_total) * 100} 
                          className="h-2"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2 min-w-[150px]">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {balance.personal_days_used} / {balance.personal_days_total} วัน
                          </span>
                          <Badge variant={balance.personal_days_used >= balance.personal_days_total ? 'destructive' : 'secondary'} className="text-xs">
                            คงเหลือ {balance.personal_days_total - balance.personal_days_used}
                          </Badge>
                        </div>
                        <Progress 
                          value={(balance.personal_days_used / balance.personal_days_total) * 100} 
                          className="h-2"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(balance)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลวันลา</DialogTitle>
            <DialogDescription>
              {editingBalance?.employees.full_name} ({editingBalance?.employees.code})
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vacation_total">วันลาพักร้อนทั้งหมด</Label>
                  <Input
                    id="vacation_total"
                    name="vacation_total"
                    type="number"
                    step="0.5"
                    defaultValue={editingBalance?.vacation_days_total}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="vacation_used">วันที่ใช้ไปแล้ว</Label>
                  <Input
                    id="vacation_used"
                    name="vacation_used"
                    type="number"
                    step="0.5"
                    defaultValue={editingBalance?.vacation_days_used}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sick_total">วันลาป่วยทั้งหมด</Label>
                  <Input
                    id="sick_total"
                    name="sick_total"
                    type="number"
                    step="0.5"
                    defaultValue={editingBalance?.sick_days_total}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="sick_used">วันที่ใช้ไปแล้ว</Label>
                  <Input
                    id="sick_used"
                    name="sick_used"
                    type="number"
                    step="0.5"
                    defaultValue={editingBalance?.sick_days_used}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="personal_total">วันลากิจทั้งหมด</Label>
                  <Input
                    id="personal_total"
                    name="personal_total"
                    type="number"
                    step="0.5"
                    defaultValue={editingBalance?.personal_days_total}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="personal_used">วันที่ใช้ไปแล้ว</Label>
                  <Input
                    id="personal_used"
                    name="personal_used"
                    type="number"
                    step="0.5"
                    defaultValue={editingBalance?.personal_days_used}
                    required
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={updateBalanceMutation.isPending}>
                {updateBalanceMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                บันทึก
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}