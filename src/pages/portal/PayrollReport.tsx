import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, FileText, Users, DollarSign, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { th } from 'date-fns/locale';

interface PayrollSummary {
  totalEmployees: number;
  totalWorkDays: number;
  totalOTHours: number;
  totalAbsent: number;
  totalLate: number;
}

export default function PayrollReport() {
  const navigate = useNavigate();
  const { employee, locale, isAdmin } = usePortal();
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [summary, setSummary] = useState<PayrollSummary>({
    totalEmployees: 0,
    totalWorkDays: 0,
    totalOTHours: 0,
    totalAbsent: 0,
    totalLate: 0,
  });

  // Generate last 6 months options
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: format(date, 'yyyy-MM'),
      label: format(date, locale === 'th' ? 'MMMM yyyy' : 'MMMM yyyy', { locale: locale === 'th' ? th : undefined }),
    };
  });

  const fetchSummary = useCallback(async () => {
    if (!employee?.id) return;

    setLoading(true);
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');

    try {
      // Base employee query
      let employeeQuery = supabase
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      if (!isAdmin && employee.branch_id) {
        employeeQuery = employeeQuery.eq('branch_id', employee.branch_id);
      }

      const { count: employeeCount } = await employeeQuery;

      // Get work sessions for the period
      let sessionsQuery = supabase
        .from('work_sessions')
        .select('id, employee:employees!inner(branch_id)')
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      if (!isAdmin && employee.branch_id) {
        sessionsQuery = sessionsQuery.eq('employee.branch_id', employee.branch_id);
      }

      const { data: sessions } = await sessionsQuery;

      // Calculate totals (simplified for mobile view)
      const totalWorkDays = sessions?.length || 0;
      const totalOTHours = 0; // Would need overtime_requests query
      const totalLate = 0; // Would need attendance_logs query

      // Get absence count (scheduled but no check-in)
      // Simplified: just count employees * working days - actual work days
      const workingDays = 22; // Approximate
      const expectedWorkDays = (employeeCount || 0) * workingDays;
      const totalAbsent = Math.max(0, expectedWorkDays - totalWorkDays);

      setSummary({
        totalEmployees: employeeCount || 0,
        totalWorkDays,
        totalOTHours: Math.round(totalOTHours * 10) / 10,
        totalAbsent,
        totalLate,
      });
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, employee?.branch_id, isAdmin, selectedMonth]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const statCards = [
    {
      icon: Users,
      label: locale === 'th' ? 'พนักงานทั้งหมด' : 'Total Employees',
      value: summary.totalEmployees,
      color: 'from-blue-500 to-blue-600',
    },
    {
      icon: DollarSign,
      label: locale === 'th' ? 'วันทำงานรวม' : 'Total Work Days',
      value: summary.totalWorkDays,
      color: 'from-green-500 to-green-600',
    },
    {
      icon: Clock,
      label: locale === 'th' ? 'ชั่วโมง OT รวม' : 'Total OT Hours',
      value: `${summary.totalOTHours} ${locale === 'th' ? 'ชม.' : 'hrs'}`,
      color: 'from-orange-500 to-orange-600',
    },
    {
      icon: FileText,
      label: locale === 'th' ? 'มาสาย' : 'Late',
      value: `${summary.totalLate} ${locale === 'th' ? 'ครั้ง' : 'times'}`,
      color: 'from-red-500 to-red-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {locale === 'th' ? '📊 รายงาน Payroll' : '📊 Payroll Report'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === 'th' ? 'สรุปข้อมูลการทำงาน' : 'Work summary report'}
          </p>
        </div>
      </div>

      {/* Month Selector */}
      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Note */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            {locale === 'th' 
              ? '💡 รายงานนี้เป็นสรุปเบื้องต้น สำหรับรายละเอียดเต็มโปรดดูในระบบ Admin'
              : '💡 This is a preliminary summary. For full details, please check the Admin dashboard.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
