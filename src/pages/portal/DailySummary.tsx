import { useState } from 'react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, UserCheck, UserX, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { formatBangkokISODate, getBangkokNow, getBangkokHoursMinutes } from '@/lib/timezone';
import { isCheckInType, isCheckOutType } from '@/lib/portal-attendance';

export default function DailySummary() {
  const { employee, locale } = usePortal();
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  const { data: branches } = useQuery({
    queryKey: ['portal-branches'],
    queryFn: async () => {
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
      return data || [];
    },
  });

  const { data: summary, isLoading } = useQuery({
    queryKey: ['portal-daily-summary', selectedBranch],
    queryFn: async () => {
      // Use Bangkok timezone for today's date
      const today = formatBangkokISODate(new Date());
      
      // Get employees
      let empQuery = supabase
        .from('employees')
        .select('id, full_name, code, branch:branches!branch_id(name)')
        .eq('is_active', true);
      
      if (selectedBranch !== 'all') {
        empQuery = empQuery.eq('branch_id', selectedBranch);
      }
      
      const { data: employees } = await empQuery;
      
      // Get today's logs using Bangkok timezone boundaries
      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('employee_id, event_type, server_time, is_flagged')
        .gte('server_time', `${today}T00:00:00+07:00`)
        .lt('server_time', `${today}T23:59:59+07:00`);

      const employeeIds = employees?.map(e => e.id) || [];
      const todayLogs = logs?.filter(l => employeeIds.includes(l.employee_id)) || [];
      
      const checkedInIds = new Set(todayLogs.filter(l => isCheckInType(l.event_type)).map(l => l.employee_id));
      const checkedOutIds = new Set(todayLogs.filter(l => isCheckOutType(l.event_type)).map(l => l.employee_id));
      const flaggedCount = todayLogs.filter(l => l.is_flagged).length;

      // Calculate late (check-in after 09:00 in Bangkok time)
      const lateIds = new Set(
        todayLogs
          .filter(l => {
            if (!isCheckInType(l.event_type)) return false;
            // Convert server_time to Bangkok hours
            const bangkokTime = getBangkokHoursMinutes(l.server_time);
            return bangkokTime && bangkokTime.hours >= 9;
          })
          .map(l => l.employee_id)
      );

      return {
        total: employees?.length || 0,
        checkedIn: checkedInIds.size,
        checkedOut: checkedOutIds.size,
        pending: (employees?.length || 0) - checkedInIds.size,
        late: lateIds.size,
        flagged: flaggedCount,
        employees: employees || [],
        checkedInIds: Array.from(checkedInIds),
        checkedOutIds: Array.from(checkedOutIds),
      };
    },
  });

  if (!employee) return null;

  const stats = [
    { 
      label: locale === 'th' ? 'พนักงานทั้งหมด' : 'Total Employees',
      value: summary?.total || 0,
      icon: Users,
      color: 'text-blue-500'
    },
    { 
      label: locale === 'th' ? 'เช็คอินแล้ว' : 'Checked In',
      value: summary?.checkedIn || 0,
      icon: UserCheck,
      color: 'text-green-500'
    },
    { 
      label: locale === 'th' ? 'ยังไม่เช็คอิน' : 'Not Checked In',
      value: summary?.pending || 0,
      icon: UserX,
      color: 'text-orange-500'
    },
    { 
      label: locale === 'th' ? 'มาสาย' : 'Late',
      value: summary?.late || 0,
      icon: Clock,
      color: 'text-yellow-500'
    },
    { 
      label: locale === 'th' ? 'ถูก Flag' : 'Flagged',
      value: summary?.flagged || 0,
      icon: AlertTriangle,
      color: 'text-red-500'
    },
  ];

  const dateLocale = locale === 'th' ? th : enUS;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {locale === 'th' ? '📊 สรุปประจำวัน' : '📊 Daily Summary'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(getBangkokNow(), locale === 'th' ? 'd MMMM yyyy' : 'MMMM d, yyyy', { locale: dateLocale })}
          </p>
        </div>
        <Select value={selectedBranch} onValueChange={setSelectedBranch}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{locale === 'th' ? 'ทุกสาขา' : 'All'}</SelectItem>
            {branches?.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          {locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat, i) => (
              <Card key={i} className={i === 0 ? 'col-span-2' : ''}>
                <CardContent className="p-4 flex items-center gap-3">
                  <stat.icon className={`h-8 w-8 ${stat.color}`} />
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Attendance Rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {locale === 'th' ? 'อัตราการเข้างาน' : 'Attendance Rate'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{locale === 'th' ? 'เช็คอิน' : 'Check-in'}</span>
                  <span className="font-medium">
                    {summary?.total ? Math.round((summary.checkedIn / summary.total) * 100) : 0}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${summary?.total ? (summary.checkedIn / summary.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Not checked in list */}
          {summary && summary.pending > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-500">
                  {locale === 'th' ? `ยังไม่เช็คอิน (${summary.pending})` : `Not Checked In (${summary.pending})`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.employees
                  .filter(e => !summary.checkedInIds.includes(e.id))
                  .slice(0, 10)
                  .map((emp) => (
                    <div key={emp.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <span>{emp.full_name}</span>
                      <span className="text-xs text-muted-foreground">{emp.branch?.name}</span>
                    </div>
                  ))}
                {summary.pending > 10 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    {locale === 'th' ? `และอีก ${summary.pending - 10} คน...` : `and ${summary.pending - 10} more...`}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
