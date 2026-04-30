import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, TrendingUp, User } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getBangkokHoursMinutes } from '@/lib/timezone';
import { format, startOfWeek, subWeeks } from 'date-fns';

interface Props {
  checkInLogs: any[];
  employees: any[];
  branches: any[];
  gracePeriodMinutes: number;
  selectedBranch: string;
  dateRange: string;
}

const DAY_NAMES_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

export default function PatternInsightsContent({ checkInLogs, employees, branches, gracePeriodMinutes, selectedBranch, dateRange }: Props) {
  // Top late employees
  const topLateEmployees = useMemo(() => {
    const lateMap = new Map<string, { name: string; branchName: string; lateCount: number; totalCount: number }>();

    checkInLogs.forEach(log => {
      if (!log.employee?.shift_start_time || log.employee?.working_time_type !== 'time_based') return;
      const empId = log.employee_id;
      const checkInBangkok = getBangkokHoursMinutes(log.server_time);
      if (!checkInBangkok) return;

      const [h, m] = log.employee.shift_start_time.split(':');
      const shiftMin = parseInt(h) * 60 + parseInt(m);
      const checkInMin = checkInBangkok.hours * 60 + checkInBangkok.minutes;
      const isLate = checkInMin > shiftMin + gracePeriodMinutes;

      const existing = lateMap.get(empId) || {
        name: log.employee?.full_name || 'Unknown',
        branchName: log.branch?.name || '-',
        lateCount: 0,
        totalCount: 0,
      };
      existing.totalCount++;
      if (isLate) existing.lateCount++;
      lateMap.set(empId, existing);
    });

    return Array.from(lateMap.values())
      .filter(e => e.lateCount > 0)
      .sort((a, b) => b.lateCount - a.lateCount)
      .slice(0, 5)
      .map(e => ({ ...e, latePercent: Math.round((e.lateCount / e.totalCount) * 100) }));
  }, [checkInLogs, gracePeriodMinutes]);

  // Late by day of week
  const lateByDayOfWeek = useMemo(() => {
    const dayMap = new Array(7).fill(0).map((_, i) => ({ day: DAY_NAMES_TH[i], dayIndex: i, lateCount: 0 }));

    checkInLogs.forEach(log => {
      if (!log.employee?.shift_start_time || log.employee?.working_time_type !== 'time_based') return;
      const checkInBangkok = getBangkokHoursMinutes(log.server_time);
      if (!checkInBangkok) return;

      const [h, m] = log.employee.shift_start_time.split(':');
      const shiftMin = parseInt(h) * 60 + parseInt(m);
      const checkInMin = checkInBangkok.hours * 60 + checkInBangkok.minutes;

      if (checkInMin > shiftMin + gracePeriodMinutes) {
        const dow = new Date(log.server_time).getDay();
        dayMap[dow].lateCount++;
      }
    });

    // Return Mon-Sun order (1-6,0)
    return [...dayMap.slice(1), dayMap[0]].filter(d => d.dayIndex !== 0 && d.dayIndex !== 6);
  }, [checkInLogs, gracePeriodMinutes]);

  // Weekly on-time trend (last 4 weeks)
  const weeklyTrend = useMemo(() => {
    const weeks: { label: string; onTimePercent: number; total: number }[] = [];
    const now = new Date();

    for (let w = 3; w >= 0; w--) {
      const weekStart = startOfWeek(subWeeks(now, w), { weekStartsOn: 1 });
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const label = format(weekStart, 'dd/MM');

      let onTime = 0;
      let total = 0;

      checkInLogs.forEach(log => {
        const logDate = new Date(log.server_time);
        if (logDate < weekStart || logDate > weekEnd) return;
        if (!log.employee?.shift_start_time || log.employee?.working_time_type !== 'time_based') return;

        const checkInBangkok = getBangkokHoursMinutes(log.server_time);
        if (!checkInBangkok) return;

        const [h, m] = log.employee.shift_start_time.split(':');
        const shiftMin = parseInt(h) * 60 + parseInt(m);
        const checkInMin = checkInBangkok.hours * 60 + checkInBangkok.minutes;

        total++;
        if (checkInMin <= shiftMin + gracePeriodMinutes) onTime++;
      });

      weeks.push({ label, onTimePercent: total > 0 ? Math.round((onTime / total) * 100) : 0, total });
    }

    return weeks;
  }, [checkInLogs, gracePeriodMinutes]);

  // Risk alerts: employees with > 30% late rate
  const riskAlerts = useMemo(() => {
    const lateMap = new Map<string, { name: string; branch: string; lateCount: number; totalCount: number }>();

    checkInLogs.forEach(log => {
      if (!log.employee?.shift_start_time || log.employee?.working_time_type !== 'time_based') return;
      const empId = log.employee_id;
      const checkInBangkok = getBangkokHoursMinutes(log.server_time);
      if (!checkInBangkok) return;

      const [h, m] = log.employee.shift_start_time.split(':');
      const shiftMin = parseInt(h) * 60 + parseInt(m);
      const checkInMin = checkInBangkok.hours * 60 + checkInBangkok.minutes;
      const isLate = checkInMin > shiftMin + gracePeriodMinutes;

      const existing = lateMap.get(empId) || {
        name: log.employee?.full_name || 'Unknown',
        branch: log.branch?.name || '-',
        lateCount: 0,
        totalCount: 0,
      };
      existing.totalCount++;
      if (isLate) existing.lateCount++;
      lateMap.set(empId, existing);
    });

    return Array.from(lateMap.values())
      .filter(e => e.totalCount >= 3 && (e.lateCount / e.totalCount) > 0.3)
      .sort((a, b) => (b.lateCount / b.totalCount) - (a.lateCount / a.totalCount))
      .slice(0, 5);
  }, [checkInLogs, gracePeriodMinutes]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Late Employees */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">🕐 พนักงานที่มาสายบ่อย</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Top 5 ใน {dateRange} วันที่ผ่านมา</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {topLateEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">ไม่มีข้อมูลการมาสาย 🎉</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead className="text-right">สาย</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topLateEmployees.map((emp, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">{emp.name}</div>
                            <div className="text-[10px] text-muted-foreground">{emp.branchName}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{emp.lateCount}/{emp.totalCount}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={
                          emp.latePercent > 50 
                            ? 'bg-destructive/10 text-destructive border-destructive/30'
                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800'
                        }>
                          {emp.latePercent}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Late by Day of Week */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">📅 วันที่มาสายบ่อย</CardTitle>
            <CardDescription className="text-xs sm:text-sm">จำนวนการมาสายแยกตามวัน</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={lateByDayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" style={{ fontSize: '11px' }} />
                <YAxis style={{ fontSize: '11px' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                />
                <Bar dataKey="lateCount" fill="hsl(var(--chart-3))" name="จำนวนสาย" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Weekly On-Time Trend */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            📈 เทรนด์การมาตรงเวลารายสัปดาห์
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">% พนักงานที่มาตรงเวลา 4 สัปดาห์ล่าสุด</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" style={{ fontSize: '11px' }} />
              <YAxis domain={[0, 100]} style={{ fontSize: '11px' }} unit="%" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
                formatter={(value: number) => [`${value}%`, 'ตรงเวลา']}
              />
              <Line type="monotone" dataKey="onTimePercent" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 5 }} name="% ตรงเวลา" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Risk Alerts */}
      {riskAlerts.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              ⚠️ แจ้งเตือนพนักงานเสี่ยง
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">พนักงานที่มาสาย &gt; 30% ของการเข้างาน (อย่างน้อย 3 ครั้ง)</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {riskAlerts.map((emp, idx) => {
                const pct = Math.round((emp.lateCount / emp.totalCount) * 100);
                return (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{emp.name}</p>
                      <p className="text-[10px] text-muted-foreground">{emp.branch}</p>
                      <p className="text-xs text-destructive">สาย {emp.lateCount}/{emp.totalCount} ครั้ง ({pct}%)</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
