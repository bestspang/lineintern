import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Wallet, Clock, AlertCircle, Calendar, TrendingUp, Banknote } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, isWeekend } from 'date-fns';
import { th } from 'date-fns/locale';

interface PayrollData {
  workDays: number;
  expectedWorkDays: number;
  totalMinutes: number;
  otMinutes: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  baseSalary: number;
  hourlyRate: number;
  payType: string;
  estimatedEarnings: number;
}

export default function MyPayroll() {
  const { employee, locale } = usePortal();
  const [loading, setLoading] = useState(true);
  const [payroll, setPayroll] = useState<PayrollData | null>(null);

  const fetchPayroll = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);

    try {
      const today = new Date();
      const monthStart = startOfMonth(today);

      // Fetch payroll settings
      const { data: settings } = await supabase
        .from('employee_payroll_settings')
        .select('*')
        .eq('employee_id', employee.id)
        .single();

      // Fetch work sessions
      const { data: sessions } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('employee_id', employee.id)
        .gte('work_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('work_date', format(today, 'yyyy-MM-dd'));

      // Fetch attendance logs for late count
      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('event_type', 'check_in')
        .gte('server_time', monthStart.toISOString())
        .lte('server_time', today.toISOString());

      // Fetch approved OT
      const { data: otRequests } = await supabase
        .from('overtime_requests')
        .select('estimated_hours, status')
        .eq('employee_id', employee.id)
        .eq('status', 'approved')
        .gte('request_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('request_date', format(today, 'yyyy-MM-dd'));

      // Fetch leaves
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('status', 'approved')
        .gte('start_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('start_date', format(today, 'yyyy-MM-dd'));

      // Calculate expected work days (excluding weekends)
      let expectedWorkDays = 0;
      for (let d = new Date(monthStart); d <= today; d.setDate(d.getDate() + 1)) {
        if (!isWeekend(d)) expectedWorkDays++;
      }

      // Calculate totals
      const totalMinutes = sessions?.reduce((sum, s) => sum + (s.billable_minutes || 0), 0) || 0;
      const otMinutes = (otRequests?.reduce((sum, o) => sum + (o.estimated_hours || 0), 0) || 0) * 60;
      const workDays = sessions?.length || 0;
      const leaveDays = leaves?.length || 0;

      // Late detection (simplified)
      const lateDays = logs?.filter(l => {
        const checkInHour = new Date(l.server_time).getHours();
        return checkInHour >= 9;
      }).length || 0;

      const absentDays = Math.max(0, expectedWorkDays - workDays - leaveDays);

      // Calculate estimated earnings
      const baseSalary = settings?.salary_per_month || 0;
      const hourlyRate = settings?.hourly_rate || (baseSalary / 30 / 8);
      const payType = settings?.pay_type || 'monthly';

      let estimatedEarnings = 0;
      if (payType === 'monthly') {
        estimatedEarnings = (baseSalary / 30) * workDays;
      } else {
        estimatedEarnings = (totalMinutes / 60) * hourlyRate;
      }

      // Add OT pay (1.5x)
      estimatedEarnings += (otMinutes / 60) * hourlyRate * 1.5;

      // Deduct late penalty (simplified)
      estimatedEarnings -= lateDays * (hourlyRate * 0.5);

      setPayroll({
        workDays,
        expectedWorkDays,
        totalMinutes,
        otMinutes,
        lateDays,
        absentDays,
        leaveDays,
        baseSalary,
        hourlyRate,
        payType,
        estimatedEarnings: Math.max(0, estimatedEarnings),
      });
    } catch (err) {
      console.error('Error fetching payroll:', err);
    } finally {
      setLoading(false);
    }
  }, [employee?.id]);

  useEffect(() => {
    fetchPayroll();
  }, [fetchPayroll]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
  };

  const formatHours = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}ชม. ${mins}น.`;
  };

  const progress = payroll ? (payroll.workDays / payroll.expectedWorkDays) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '💰 Payroll ของฉัน' : '💰 My Payroll'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {format(new Date(), 'MMMM yyyy', { locale: locale === 'th' ? th : undefined })}
        </p>
      </div>

      {loading ? (
        <>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </>
      ) : payroll ? (
        <>
          {/* Estimated Earnings Card */}
          <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm opacity-90">
                    {locale === 'th' ? 'รายได้ประมาณการ' : 'Estimated Earnings'}
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    {formatCurrency(payroll.estimatedEarnings)}
                  </p>
                </div>
                <Wallet className="h-12 w-12 opacity-80" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="opacity-90">
                    {locale === 'th' ? 'ความคืบหน้า' : 'Progress'}
                  </span>
                  <span>{payroll.workDays} / {payroll.expectedWorkDays} {locale === 'th' ? 'วัน' : 'days'}</span>
                </div>
                <Progress value={progress} className="h-2 bg-white/30" />
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {locale === 'th' ? 'ชั่วโมงทำงาน' : 'Work Hours'}
                  </p>
                  <p className="font-semibold">{formatHours(payroll.totalMinutes)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">OT</p>
                  <p className="font-semibold">{formatHours(payroll.otMinutes)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {locale === 'th' ? 'มาสาย' : 'Late'}
                  </p>
                  <p className="font-semibold">{payroll.lateDays} {locale === 'th' ? 'วัน' : 'days'}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30">
                  <Calendar className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {locale === 'th' ? 'ลางาน' : 'Leave'}
                  </p>
                  <p className="font-semibold">{payroll.leaveDays} {locale === 'th' ? 'วัน' : 'days'}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="h-5 w-5" />
                {locale === 'th' ? 'รายละเอียด' : 'Details'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {locale === 'th' ? 'ประเภทจ่าย' : 'Pay Type'}
                </span>
                <span className="font-medium">
                  {payroll.payType === 'monthly' ? (locale === 'th' ? 'รายเดือน' : 'Monthly') : (locale === 'th' ? 'รายชั่วโมง' : 'Hourly')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {locale === 'th' ? 'เงินเดือนฐาน' : 'Base Salary'}
                </span>
                <span className="font-medium">{formatCurrency(payroll.baseSalary)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {locale === 'th' ? 'อัตรา/ชม.' : 'Hourly Rate'}
                </span>
                <span className="font-medium">{formatCurrency(payroll.hourlyRate)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {locale === 'th' ? 'วันขาด' : 'Absent'}
                </span>
                <span className="font-medium text-rose-600">{payroll.absentDays} {locale === 'th' ? 'วัน' : 'days'}</span>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground px-4">
            {locale === 'th' 
              ? '* ตัวเลขนี้เป็นประมาณการ ยอดจริงอาจแตกต่างกัน'
              : '* This is an estimate. Actual amount may vary.'}
          </p>
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              {locale === 'th' ? 'ไม่พบข้อมูล Payroll' : 'No payroll data found'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
