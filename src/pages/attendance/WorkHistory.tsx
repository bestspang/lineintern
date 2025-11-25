import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle, XCircle, Clock, TrendingUp, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isSameDay } from 'date-fns';
import { th } from 'date-fns/locale';

interface AttendanceLog {
  id: string;
  event_type: string;
  server_time: string;
  is_flagged: boolean;
  flag_reason: string | null;
  overtime_hours: number;
  is_overtime: boolean;
}

interface DayStats {
  date: Date;
  checkIns: AttendanceLog[];
  checkOuts: AttendanceLog[];
  totalHours: number;
  isLate: boolean;
  hasOT: boolean;
}

export default function WorkHistory() {
  const { id } = useParams();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  const { data: employee } = useQuery({
    queryKey: ['employee', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*, branch:branches(name)')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['attendance-logs', id, selectedMonth],
    queryFn: async () => {
      const start = startOfMonth(selectedMonth);
      const end = endOfMonth(selectedMonth);

      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', id)
        .gte('server_time', start.toISOString())
        .lte('server_time', end.toISOString())
        .order('server_time', { ascending: true });
      
      if (error) throw error;
      return data as AttendanceLog[];
    },
    enabled: !!id
  });

  // Process logs into daily stats
  const dailyStats: Map<string, DayStats> = new Map();
  if (logs) {
    logs.forEach(log => {
      const date = parseISO(log.server_time);
      const dateKey = format(date, 'yyyy-MM-dd');
      
      if (!dailyStats.has(dateKey)) {
        dailyStats.set(dateKey, {
          date,
          checkIns: [],
          checkOuts: [],
          totalHours: 0,
          isLate: false,
          hasOT: false
        });
      }

      const stats = dailyStats.get(dateKey)!;
      if (log.event_type === 'check_in') {
        stats.checkIns.push(log);
        if (log.is_flagged) stats.isLate = true;
      } else if (log.event_type === 'check_out') {
        stats.checkOuts.push(log);
        if (log.is_overtime) stats.hasOT = true;
      }
    });

    // Calculate total hours for each day
    dailyStats.forEach((stats, dateKey) => {
      let totalMinutes = 0;
      for (let i = 0; i < Math.min(stats.checkIns.length, stats.checkOuts.length); i++) {
        const checkIn = parseISO(stats.checkIns[i].server_time);
        const checkOut = parseISO(stats.checkOuts[i].server_time);
        totalMinutes += (checkOut.getTime() - checkIn.getTime()) / (1000 * 60);
      }
      stats.totalHours = totalMinutes / 60;
    });
  }

  // Calculate summary stats
  const totalWorkDays = dailyStats.size;
  const totalLate = Array.from(dailyStats.values()).filter(s => s.isLate).length;
  const totalOTDays = Array.from(dailyStats.values()).filter(s => s.hasOT).length;
  const totalHours = Array.from(dailyStats.values()).reduce((sum, s) => sum + s.totalHours, 0);

  const getDayClassName = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const stats = dailyStats.get(dateKey);
    
    if (!stats || stats.checkIns.length === 0) return '';
    
    if (stats.isLate) return 'bg-red-100 dark:bg-red-900/30';
    if (stats.hasOT) return 'bg-blue-100 dark:bg-blue-900/30';
    return 'bg-green-100 dark:bg-green-900/30';
  };

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
          <h1 className="text-3xl font-bold">ประวัติการทำงาน</h1>
          <p className="text-muted-foreground">
            {employee?.full_name} ({employee?.code}) - {employee?.branch?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calendar">ปฏิทิน</SelectItem>
              <SelectItem value="list">รายการ</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              วันที่มาทำงาน
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWorkDays}</div>
            <p className="text-xs text-muted-foreground">วัน</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              ชั่วโมงรวม
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">ชั่วโมง</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              สาย/ขาด
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totalLate}</div>
            <p className="text-xs text-muted-foreground">ครั้ง</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              โอที
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalOTDays}</div>
            <p className="text-xs text-muted-foreground">วัน</p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar or List View */}
      {viewMode === 'calendar' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>ปฏิทินการทำงาน</CardTitle>
              <CardDescription>
                คลิกวันที่เพื่อดูรายละเอียด
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                month={selectedMonth}
                onMonthChange={setSelectedMonth}
                locale={th}
                className="rounded-md border"
                modifiers={{
                  worked: (date) => {
                    const dateKey = format(date, 'yyyy-MM-dd');
                    const stats = dailyStats.get(dateKey);
                    return stats !== undefined && stats.checkIns.length > 0;
                  },
                  late: (date) => {
                    const dateKey = format(date, 'yyyy-MM-dd');
                    const stats = dailyStats.get(dateKey);
                    return stats?.isLate || false;
                  }
                }}
                modifiersClassNames={{
                  worked: 'bg-green-100 dark:bg-green-900/30',
                  late: 'bg-red-100 dark:bg-red-900/30'
                }}
              />
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-4 h-4 bg-green-100 dark:bg-green-900/30 rounded" />
                  <span>มาทำงานตรงเวลา</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-4 h-4 bg-red-100 dark:bg-red-900/30 rounded" />
                  <span>สาย/มีปัญหา</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-4 h-4 bg-blue-100 dark:bg-blue-900/30 rounded" />
                  <span>ทำโอที</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Day Details */}
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedDate ? format(selectedDate, 'd MMMM yyyy', { locale: th }) : 'เลือกวันที่'}
              </CardTitle>
              <CardDescription>รายละเอียดการทำงาน</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedDate ? (
                (() => {
                  const dateKey = format(selectedDate, 'yyyy-MM-dd');
                  const stats = dailyStats.get(dateKey);
                  
                  if (!stats || stats.checkIns.length === 0) {
                    return <p className="text-muted-foreground">ไม่มีบันทึกการทำงานในวันนี้</p>;
                  }

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        {stats.isLate ? (
                          <Badge variant="destructive">สาย</Badge>
                        ) : (
                          <Badge variant="default">ตรงเวลา</Badge>
                        )}
                        {stats.hasOT && <Badge variant="secondary">โอที</Badge>}
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">เช็คอิน</h4>
                        {stats.checkIns.map((log, idx) => (
                          <div key={log.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                            <span>ครั้งที่ {idx + 1}</span>
                            <span className="font-mono">{format(parseISO(log.server_time), 'HH:mm:ss')}</span>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">เช็คเอาต์</h4>
                        {stats.checkOuts.map((log, idx) => (
                          <div key={log.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                            <span>ครั้งที่ {idx + 1}</span>
                            <span className="font-mono">{format(parseISO(log.server_time), 'HH:mm:ss')}</span>
                          </div>
                        ))}
                      </div>

                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">รวมชั่วโมงทำงาน</span>
                          <span className="text-lg font-bold">{stats.totalHours.toFixed(2)} ชม.</span>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-muted-foreground">เลือกวันที่จากปฏิทินเพื่อดูรายละเอียด</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>รายการเข้างาน</CardTitle>
            <CardDescription>รายการเรียงตามวันที่</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from(dailyStats.entries())
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([dateKey, stats]) => (
                  <div key={dateKey} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{format(stats.date, 'd')}</div>
                        <div className="text-xs text-muted-foreground">{format(stats.date, 'MMM', { locale: th })}</div>
                      </div>
                      <div>
                        <div className="font-medium">{format(stats.date, 'EEEE', { locale: th })}</div>
                        <div className="text-sm text-muted-foreground">
                          {stats.checkIns.length} เช็คอิน, {stats.checkOuts.length} เช็คเอาต์
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={stats.isLate ? 'destructive' : 'default'}>
                        {stats.totalHours.toFixed(1)} ชม.
                      </Badge>
                      {stats.hasOT && <Badge variant="secondary">OT</Badge>}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}