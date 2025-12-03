import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  CalendarCheck, AlertCircle, Clock, CheckCircle, XCircle, 
  Loader2, CalendarDays, Info, Trash2
} from 'lucide-react';
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
import { format, addDays, startOfWeek, isBefore, isAfter, isSameDay } from 'date-fns';
import { th } from 'date-fns/locale';

interface Employee {
  id: string;
  code: string;
  full_name: string;
  flexible_day_off_enabled: boolean;
  flexible_days_per_week: number;
  flexible_advance_days_required: number;
  flexible_auto_approve: boolean;
  branch: { name: string } | null;
}

export default function FlexibleDayOff() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState('');

  // Validate token and get employee
  useEffect(() => {
    const validateToken = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setError('Token is required');
        setLoading(false);
        return;
      }

      try {
        const { data, error: validateError } = await supabase.functions.invoke(
          'employee-menu-validate',
          { body: { token } }
        );

        if (validateError || !data.success) {
          setError(data?.error || 'Invalid or expired token');
          setLoading(false);
          return;
        }

        // Fetch employee with flexible settings
        const { data: empData, error: empError } = await supabase
          .from('employees')
          .select(`
            id, code, full_name,
            flexible_day_off_enabled,
            flexible_days_per_week,
            flexible_advance_days_required,
            flexible_auto_approve,
            branch:branches(name)
          `)
          .eq('id', data.employee.id)
          .single();

        if (empError || !empData) {
          setError('Failed to load employee data');
          setLoading(false);
          return;
        }

        if (!empData.flexible_day_off_enabled) {
          setError('ระบบวันหยุดยืดหยุ่นยังไม่เปิดใช้งานสำหรับคุณ');
          setLoading(false);
          return;
        }

        setEmployee(empData as Employee);
        setLoading(false);
      } catch (err) {
        console.error('Error validating token:', err);
        setError('Failed to load menu');
        setLoading(false);
      }
    };

    validateToken();
  }, [searchParams]);

  // Fetch existing requests for this week
  const { data: existingRequests, isLoading: requestsLoading } = useQuery({
    queryKey: ['flexible-day-off-requests', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);
      
      const { data } = await supabase
        .from('flexible_day_off_requests')
        .select('*')
        .eq('employee_id', employee.id)
        .gte('day_off_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('day_off_date', format(weekEnd, 'yyyy-MM-dd'))
        .in('status', ['pending', 'approved']);
      
      return data || [];
    },
    enabled: !!employee?.id,
  });

  // Fetch all requests for history
  const { data: allRequests } = useQuery({
    queryKey: ['flexible-day-off-history', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      
      const { data } = await supabase
        .from('flexible_day_off_requests')
        .select('*')
        .eq('employee_id', employee.id)
        .order('day_off_date', { ascending: false })
        .limit(20);
      
      return data || [];
    },
    enabled: !!employee?.id,
  });

  // Fetch holidays
  const { data: holidays } = useQuery({
    queryKey: ['holidays-flexible'],
    queryFn: async () => {
      const { data } = await supabase
        .from('holidays')
        .select('date, name')
        .gte('date', format(new Date(), 'yyyy-MM-dd'));
      return new Set(data?.map(h => h.date) || []);
    },
  });

  // Cancel request mutation
  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      if (!employee) throw new Error('Employee not found');

      const { data, error } = await supabase.functions.invoke(
        'cancel-dayoff',
        {
          body: {
            request_id: requestId,
            employee_id: employee.id,
            source: 'webapp'
          }
        }
      );

      if (error) throw new Error(error.message || 'Failed to cancel request');
      if (!data.success) throw new Error(data.error || 'Failed to cancel request');
      
      return data;
    },
    onSuccess: () => {
      toast.success('ยกเลิกคำขอวันหยุดเรียบร้อยแล้ว');
      queryClient.invalidateQueries({ queryKey: ['flexible-day-off-requests'] });
      queryClient.invalidateQueries({ queryKey: ['flexible-day-off-history'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'เกิดข้อผิดพลาดในการยกเลิก');
    },
  });

  // Submit request mutation
  const submitMutation = useMutation({
    mutationFn: async (date: Date) => {
      if (!employee) throw new Error('Employee not found');

      const dayOffDate = format(date, 'yyyy-MM-dd');

      // Call edge function for request with LINE notification
      const { data, error } = await supabase.functions.invoke(
        'flexible-day-off-request',
        {
          body: {
            employee_id: employee.id,
            day_off_date: dayOffDate,
            reason: reason.trim() || null,
          }
        }
      );

      if (error) throw new Error(error.message || 'Failed to submit request');
      if (!data.success) throw new Error(data.error || 'Failed to submit request');
      
      return { 
        data: data, 
        autoApproved: data.auto_approved 
      };
    },
    onSuccess: (result) => {
      if (result.autoApproved) {
        toast.success('อนุมัติวันหยุดอัตโนมัติเรียบร้อยแล้ว');
      } else {
        toast.success('ส่งคำขอวันหยุดเรียบร้อยแล้ว รอการอนุมัติจาก Admin');
      }
      queryClient.invalidateQueries({ queryKey: ['flexible-day-off-requests'] });
      queryClient.invalidateQueries({ queryKey: ['flexible-day-off-history'] });
      setSelectedDate(undefined);
      setReason('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'เกิดข้อผิดพลาดในการส่งคำขอ');
    },
  });

  // Calculate remaining quota for this week
  const usedDaysThisWeek = existingRequests?.length || 0;
  const remainingQuota = (employee?.flexible_days_per_week || 0) - usedDaysThisWeek;

  // Validation functions
  const isDateDisabled = (date: Date) => {
    // Can't select past dates
    if (isBefore(date, new Date()) && !isSameDay(date, new Date())) return true;
    
    // Must be at least X days in advance
    const minDate = addDays(new Date(), employee?.flexible_advance_days_required || 1);
    if (isBefore(date, minDate)) return true;
    
    // Can't select holidays
    const dateStr = format(date, 'yyyy-MM-dd');
    if (holidays?.has(dateStr)) return true;
    
    // Can't select dates already requested
    if (existingRequests?.some(r => r.day_off_date === dateStr)) return true;
    
    return false;
  };

  const canSubmit = selectedDate && remainingQuota > 0 && !isDateDisabled(selectedDate);

  const handleSubmit = () => {
    if (!selectedDate || !canSubmit) return;
    submitMutation.mutate(selectedDate);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700"><Clock className="h-3 w-3 mr-1" />รออนุมัติ</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-50 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />อนุมัติแล้ว</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />ไม่อนุมัติ</Badge>;
      case 'cancelled':
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />ยกเลิกแล้ว</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>เกิดข้อผิดพลาด</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <p className="mt-4 text-sm text-muted-foreground text-center">
              กรุณาขอลิงก์เมนูใหม่จาก LINE
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4 pb-8">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Employee Info */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <CalendarCheck className="h-5 w-5" />
                  ขอวันหยุดยืดหยุ่น
                </CardTitle>
                <CardDescription className="mt-1">
                  {employee?.full_name} ({employee?.code})
                </CardDescription>
              </div>
              <Badge variant="secondary">
                เหลือ {remainingQuota} วัน/สัปดาห์
              </Badge>
            </div>
          </CardHeader>
          {employee?.branch && (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                📍 {employee.branch.name}
              </p>
            </CardContent>
          )}
        </Card>

        {/* Settings Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <ul className="list-disc list-inside space-y-1">
              <li>สามารถเลือกหยุดได้ {employee?.flexible_days_per_week} วัน/สัปดาห์</li>
              <li>ต้องแจ้งล่วงหน้าอย่างน้อย {employee?.flexible_advance_days_required} วัน</li>
              <li>{employee?.flexible_auto_approve ? '✅ อนุมัติอัตโนมัติ' : '⏳ ต้องรอ Admin อนุมัติ'}</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Calendar Picker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              เลือกวันที่ต้องการหยุด
            </CardTitle>
            <CardDescription>
              วันที่ทำเครื่องหมายสีเทาไม่สามารถเลือกได้
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : remainingQuota <= 0 ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  คุณใช้โควต้าวันหยุดครบแล้วในสัปดาห์นี้
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={isDateDisabled}
                  locale={th}
                  className="rounded-md border mx-auto"
                />

                {selectedDate && (
                  <div className="space-y-3 pt-4 border-t">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <p className="font-medium">
                        วันที่เลือก: {format(selectedDate, 'd MMMM yyyy', { locale: th })}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reason">เหตุผล (ไม่บังคับ)</Label>
                      <Textarea
                        id="reason"
                        placeholder="ระบุเหตุผลในการขอวันหยุด..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <Button
                      className="w-full"
                      onClick={handleSubmit}
                      disabled={!canSubmit || submitMutation.isPending}
                    >
                      {submitMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          กำลังส่งคำขอ...
                        </>
                      ) : employee?.flexible_auto_approve ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          ยืนยันวันหยุด (อนุมัติอัตโนมัติ)
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4 mr-2" />
                          ส่งคำขอวันหยุด
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Request History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              ประวัติคำขอ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allRequests && allRequests.length > 0 ? (
              <div className="space-y-2">
                {allRequests.map((request: any) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {format(new Date(request.day_off_date), 'd MMMM yyyy', { locale: th })}
                      </p>
                      {request.reason && (
                        <p className="text-sm text-muted-foreground">{request.reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(request.status)}
                      {request.status === 'pending' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={cancelMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>ยกเลิกคำขอวันหยุด?</AlertDialogTitle>
                              <AlertDialogDescription>
                                คุณต้องการยกเลิกคำขอวันหยุดวันที่{' '}
                                {format(new Date(request.day_off_date), 'd MMMM yyyy', { locale: th })}{' '}
                                ใช่หรือไม่?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>ไม่ใช่</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => cancelMutation.mutate(request.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {cancelMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'ยกเลิก'
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">
                ยังไม่มีประวัติคำขอ
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pt-4">
          ⏰ ลิงก์นี้จะหมดอายุหลังจากใช้งาน
        </p>
      </div>
    </div>
  );
}