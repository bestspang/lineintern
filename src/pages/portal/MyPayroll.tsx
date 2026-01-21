import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Wallet, Clock, AlertCircle, Calendar, TrendingUp, Banknote } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { format, startOfMonth, getDay, eachDayOfInterval } from 'date-fns';
import { th } from 'date-fns/locale';

interface WorkSchedule {
  day_of_week: number;
  is_working_day: boolean;
  start_time: string | null;
  end_time: string | null;
}

interface PayrollData {
  workDays: number;
  expectedWorkDays: number;
  totalMinutes: number;
  otMinutes: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  baseSalary: number;
  hourlyRate: number;
  payType: string;
  estimatedEarnings: number;
  leaveDeduction: number;
}

interface PayrollApiResponse {
  settings: any;
  sessions: any[];
  overtime: any[];
  leaves: any[];
  checkInLogs: any[];
  workSchedules: WorkSchedule[];
  gracePeriodMinutes: number;
}

export default function MyPayroll() {
  const { employee, locale } = usePortal();
  const [loading, setLoading] = useState(true);
  const [payroll, setPayroll] = useState<PayrollData | null>(null);

  const fetchPayroll = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);

    try {
      const { data, error } = await portalApi<PayrollApiResponse>({
        endpoint: 'payroll',
        employee_id: employee.id
      });

      if (error || !data) {
        console.error('Error fetching payroll:', error);
        setLoading(false);
        return;
      }

      const today = new Date();
      const monthStart = startOfMonth(today);
      const daysInRange = eachDayOfInterval({ start: monthStart, end: today });
      
      // Build work schedule map (default Mon-Fri if no schedules)
      const workScheduleMap = new Map<number, { isWorkingDay: boolean; startTime: string }>();
      const defaultWorkDays = [1, 2, 3, 4, 5]; // Mon-Fri
      
      if (data.workSchedules && data.workSchedules.length > 0) {
        data.workSchedules.forEach(ws => {
          workScheduleMap.set(ws.day_of_week, {
            isWorkingDay: ws.is_working_day,
            startTime: ws.start_time || '09:00'
          });
        });
      } else {
        // Default schedule
        defaultWorkDays.forEach(day => {
          workScheduleMap.set(day, { isWorkingDay: true, startTime: '09:00' });
        });
      }

      // Calculate expected work days using actual schedule
      let expectedWorkDays = 0;
      daysInRange.forEach(d => {
        const dayOfWeek = getDay(d); // 0=Sun, 1=Mon, ...
        const schedule = workScheduleMap.get(dayOfWeek);
        if (schedule?.isWorkingDay) {
          expectedWorkDays++;
        }
      });

      // Calculate totals
      const totalMinutes = data.sessions?.reduce((sum, s) => sum + (s.billable_minutes || 0), 0) || 0;
      const otMinutes = (data.overtime?.reduce((sum, o) => sum + (o.estimated_hours || 0), 0) || 0) * 60;
      const workDays = data.sessions?.length || 0;
      
      // Separate paid and unpaid leave
      const paidLeaves = data.leaves?.filter(l => l.leave_type !== 'unpaid') || [];
      const unpaidLeaves = data.leaves?.filter(l => l.leave_type === 'unpaid') || [];
      const paidLeaveDays = paidLeaves.length;
      const unpaidLeaveDays = unpaidLeaves.length;
      const leaveDays = paidLeaveDays + unpaidLeaveDays;

      // Late detection using work schedule + grace period
      const gracePeriodMinutes = data.gracePeriodMinutes || 15;
      let lateDays = 0;
      
      data.checkInLogs?.forEach(log => {
        const checkInDate = new Date(log.server_time);
        const dayOfWeek = getDay(checkInDate);
        const schedule = workScheduleMap.get(dayOfWeek);
        
        if (!schedule?.isWorkingDay) return;
        
        const [startHour, startMinute] = (schedule.startTime || '09:00').split(':').map(Number);
        const expectedMinutes = startHour * 60 + startMinute;
        const actualMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
        
        // Only count as late if exceeds grace period
        if (actualMinutes > expectedMinutes + gracePeriodMinutes) {
          lateDays++;
        }
      });

      const absentDays = Math.max(0, expectedWorkDays - workDays - leaveDays);

      // Calculate estimated earnings
      const baseSalary = data.settings?.salary_per_month || 0;
      const hoursPerDay = data.settings?.hours_per_day || 8;
      const hourlyRate = data.settings?.hourly_rate || (baseSalary / 30 / hoursPerDay);
      const payType = data.settings?.pay_type || 'monthly';
      const otRateMultiplier = data.settings?.ot_rate_multiplier || 1.5;

      let estimatedEarnings = 0;
      const dailyRate = expectedWorkDays > 0 ? baseSalary / expectedWorkDays : 0;
      
      if (payType === 'monthly') {
        // Base: daily rate × (work days + paid leave days)
        estimatedEarnings = dailyRate * (workDays + paidLeaveDays);
      } else {
        estimatedEarnings = (totalMinutes / 60) * hourlyRate;
      }

      // Add OT pay
      estimatedEarnings += (otMinutes / 60) * hourlyRate * otRateMultiplier;

      // Calculate unpaid leave deduction
      const leaveDeduction = dailyRate * unpaidLeaveDays;

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
        paidLeaveDays,
        unpaidLeaveDays,
        baseSalary,
        hourlyRate,
        payType,
        estimatedEarnings: Math.max(0, estimatedEarnings - leaveDeduction),
        leaveDeduction,
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
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">{payroll.leaveDays}</span>
                    {payroll.unpaidLeaveDays > 0 && (
                      <Badge variant="destructive" className="text-xs px-1 py-0">
                        {payroll.unpaidLeaveDays} {locale === 'th' ? 'ไม่รับค่า' : 'unpaid'}
                      </Badge>
                    )}
                  </div>
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
              {payroll.leaveDeduction > 0 && (
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-muted-foreground">
                    {locale === 'th' ? '💸 หักลาไม่รับค่าจ้าง' : '💸 Unpaid Leave Deduction'}
                  </span>
                  <span className="font-medium text-rose-600">-{formatCurrency(payroll.leaveDeduction)}</span>
                </div>
              )}
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