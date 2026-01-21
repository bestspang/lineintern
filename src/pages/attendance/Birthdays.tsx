import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Cake, Gift, AlertTriangle, ChevronLeft, ChevronRight, Settings, Calendar as CalendarIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { format, parseISO, isSameDay, addDays, differenceInDays, startOfDay } from "date-fns";
import { th } from "date-fns/locale";
import { useLocale } from "@/contexts/LocaleContext";

interface Employee {
  id: string;
  full_name: string;
  code: string | null;
  birth_date: string | null;
  branches: { name: string } | null;
}

interface UpcomingBirthday extends Employee {
  daysUntil: number;
  nextBirthday: Date;
}

const MONTH_NAMES_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AttendanceBirthdays() {
  const { locale, t } = useLocale();
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  // Fetch all employees with birthdays
  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees-birthdays'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, code, birth_date, branch_id')
        .eq('status', 'active')
        .order('full_name');
      
      if (error) throw error;
      
      // Fetch branch names separately
      const branchIds = [...new Set((data || []).map(e => e.branch_id).filter(Boolean))];
      const { data: branchData } = await supabase
        .from('branches')
        .select('id, name')
        .in('id', branchIds);
      
      const branchMap = new Map((branchData || []).map(b => [b.id, b.name]));
      
      return (data || []).map(emp => ({
        id: emp.id,
        full_name: emp.full_name,
        code: emp.code,
        birth_date: emp.birth_date,
        branches: emp.branch_id ? { name: branchMap.get(emp.branch_id) || '-' } : null
      })) as Employee[];
    },
  });

  // Calculate upcoming birthdays (next 7 days)
  const upcomingBirthdays = useMemo(() => {
    if (!employees) return [];
    
    const today = startOfDay(new Date());
    const upcoming: UpcomingBirthday[] = [];

    employees.forEach((emp) => {
      if (!emp.birth_date) return;
      
      try {
        const [_, month, day] = emp.birth_date.split('-').map(Number);
        let nextBirthday = new Date(today.getFullYear(), month - 1, day);
        
        // If birthday already passed this year, look at next year
        if (nextBirthday < today) {
          nextBirthday = new Date(today.getFullYear() + 1, month - 1, day);
        }
        
        const daysUntil = differenceInDays(nextBirthday, today);
        
        if (daysUntil >= 0 && daysUntil <= 7) {
          upcoming.push({ ...emp, daysUntil, nextBirthday });
        }
      } catch {
        // Skip invalid dates
      }
    });

    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  }, [employees]);

  // Get birthdays for selected month (for chart)
  const monthlyStats = useMemo(() => {
    if (!employees) return [];
    
    const stats = Array.from({ length: 12 }, (_, i) => ({
      month: locale === 'th' ? MONTH_NAMES_TH[i] : MONTH_NAMES_EN[i],
      count: 0,
      monthIndex: i,
    }));

    employees.forEach((emp) => {
      if (!emp.birth_date) return;
      try {
        const month = parseInt(emp.birth_date.split('-')[1]) - 1;
        if (month >= 0 && month < 12) {
          stats[month].count++;
        }
      } catch {
        // Skip invalid dates
      }
    });

    return stats;
  }, [employees, locale]);

  // Get employees with birthdays on selected date
  const birthdaysOnDate = useMemo(() => {
    if (!employees || !selectedDate) return [];
    
    const targetMonth = selectedDate.getMonth() + 1;
    const targetDay = selectedDate.getDate();

    return employees.filter((emp) => {
      if (!emp.birth_date) return false;
      try {
        const [_, month, day] = emp.birth_date.split('-').map(Number);
        return month === targetMonth && day === targetDay;
      } catch {
        return false;
      }
    });
  }, [employees, selectedDate]);

  // Employees missing birthday data
  const missingBirthdays = useMemo(() => {
    if (!employees) return [];
    return employees.filter((emp) => !emp.birth_date);
  }, [employees]);

  // Get birthdays in current calendar month for highlighting
  const birthdaysInMonth = useMemo(() => {
    if (!employees) return new Set<number>();
    
    const days = new Set<number>();
    const currentMonth = selectedMonth.getMonth() + 1;

    employees.forEach((emp) => {
      if (!emp.birth_date) return;
      try {
        const [_, month, day] = emp.birth_date.split('-').map(Number);
        if (month === currentMonth) {
          days.add(day);
        }
      } catch {
        // Skip invalid dates
      }
    });

    return days;
  }, [employees, selectedMonth]);

  // Today's birthdays
  const todayBirthdays = upcomingBirthdays.filter(b => b.daysUntil === 0);

  // Count for this month
  const thisMonthCount = monthlyStats[new Date().getMonth()]?.count || 0;

  const currentMonthIndex = new Date().getMonth();

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px] md:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-pink-100">
          <Cake className="h-6 w-6 text-pink-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {locale === 'th' ? 'วันเกิดพนักงาน' : 'Employee Birthdays'}
          </h1>
          <p className="text-muted-foreground">
            {locale === 'th' 
              ? 'ปฏิทินและการแจ้งเตือนวันเกิดพนักงาน' 
              : 'Birthday calendar and employee birthday reminders'}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-pink-500" />
              <span className="text-sm text-muted-foreground">
                {locale === 'th' ? 'วันนี้' : 'Today'}
              </span>
            </div>
            <p className="text-2xl font-bold mt-1">{todayBirthdays.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">
                {locale === 'th' ? '7 วันข้างหน้า' : 'Next 7 days'}
              </span>
            </div>
            <p className="text-2xl font-bold mt-1">{upcomingBirthdays.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Cake className="h-5 w-5 text-purple-500" />
              <span className="text-sm text-muted-foreground">
                {locale === 'th' ? 'เดือนนี้' : 'This month'}
              </span>
            </div>
            <p className="text-2xl font-bold mt-1">{thisMonthCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span className="text-sm text-muted-foreground">
                {locale === 'th' ? 'ไม่มีข้อมูล' : 'Missing data'}
              </span>
            </div>
            <p className="text-2xl font-bold mt-1">{missingBirthdays.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {locale === 'th' ? 'ปฏิทินวันเกิด' : 'Birthday Calendar'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
              className="rounded-md border"
              modifiers={{
                birthday: (date) => birthdaysInMonth.has(date.getDate()) && date.getMonth() === selectedMonth.getMonth()
              }}
              modifiersStyles={{
                birthday: { 
                  backgroundColor: 'hsl(var(--primary) / 0.15)',
                  color: 'hsl(var(--primary))',
                  fontWeight: 'bold',
                  borderRadius: '50%'
                }
              }}
            />
            
            {/* Selected Date Info */}
            {selectedDate && birthdaysOnDate.length > 0 && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">
                  🎂 {format(selectedDate, 'd MMMM', { locale: th })}
                </p>
                <div className="space-y-1">
                  {birthdaysOnDate.map((emp) => (
                    <div key={emp.id} className="flex items-center justify-between text-sm">
                      <span>{emp.full_name}</span>
                      <Link to={`/attendance/employees/${emp.id}/settings`}>
                        <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                          {emp.code || 'N/A'}
                        </Badge>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Birthdays */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Gift className="h-5 w-5" />
              {locale === 'th' ? 'วันเกิดที่จะมาถึง' : 'Upcoming Birthdays'}
            </CardTitle>
            <CardDescription>
              {locale === 'th' ? '7 วันข้างหน้า' : 'Next 7 days'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingBirthdays.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Cake className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>{locale === 'th' ? 'ไม่มีวันเกิดใน 7 วันข้างหน้า' : 'No birthdays in the next 7 days'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingBirthdays.map((emp) => (
                  <div
                    key={emp.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      emp.daysUntil === 0 ? 'bg-pink-50 border-pink-200' : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${emp.daysUntil === 0 ? 'bg-pink-200' : 'bg-muted'}`}>
                        <Cake className={`h-5 w-5 ${emp.daysUntil === 0 ? 'text-pink-600' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-medium">{emp.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {emp.branches?.name || '-'} • {format(emp.nextBirthday, 'd MMM', { locale: th })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {emp.daysUntil === 0 ? (
                        <Badge className="bg-pink-500 hover:bg-pink-600">
                          🎉 {locale === 'th' ? 'วันนี้!' : 'Today!'}
                        </Badge>
                      ) : emp.daysUntil === 1 ? (
                        <Badge variant="secondary">
                          {locale === 'th' ? 'พรุ่งนี้' : 'Tomorrow'}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          {emp.daysUntil} {locale === 'th' ? 'วัน' : 'days'}
                        </Badge>
                      )}
                      <Link to={`/attendance/employees/${emp.id}/settings`}>
                        <Button variant="ghost" size="sm">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Statistics Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {locale === 'th' ? 'สถิติวันเกิดรายเดือน' : 'Monthly Birthday Statistics'}
          </CardTitle>
          <CardDescription>
            {locale === 'th' ? 'จำนวนพนักงานที่เกิดในแต่ละเดือน' : 'Number of employees born each month'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value) => [value, locale === 'th' ? 'คน' : 'employees']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {monthlyStats.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`}
                      fill={index === currentMonthIndex ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Missing Birthdays */}
      {missingBirthdays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {locale === 'th' 
                ? `พนักงานที่ยังไม่มีข้อมูลวันเกิด (${missingBirthdays.length} คน)` 
                : `Employees Missing Birthday Data (${missingBirthdays.length})`}
            </CardTitle>
            <CardDescription>
              {locale === 'th' 
                ? 'เพิ่มวันเกิดเพื่อให้ระบบ Birthday Reminder ทำงานได้' 
                : 'Add birthdays to enable the Birthday Reminder system'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{locale === 'th' ? 'รหัส' : 'Code'}</TableHead>
                    <TableHead>{locale === 'th' ? 'ชื่อ' : 'Name'}</TableHead>
                    <TableHead>{locale === 'th' ? 'สาขา' : 'Branch'}</TableHead>
                    <TableHead className="text-right">{locale === 'th' ? 'จัดการ' : 'Action'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missingBirthdays.slice(0, 10).map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-mono">{emp.code || '-'}</TableCell>
                      <TableCell>{emp.full_name}</TableCell>
                      <TableCell>{emp.branches?.name || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Link to={`/attendance/employees/${emp.id}/settings`}>
                          <Button variant="outline" size="sm">
                            <Settings className="h-4 w-4 mr-1" />
                            {locale === 'th' ? 'เพิ่มวันเกิด' : 'Add Birthday'}
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {missingBirthdays.length > 10 && (
              <p className="text-sm text-muted-foreground mt-2 text-center">
                {locale === 'th' 
                  ? `และอีก ${missingBirthdays.length - 10} คน...` 
                  : `And ${missingBirthdays.length - 10} more...`}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
