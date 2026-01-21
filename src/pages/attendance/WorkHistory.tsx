import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, CheckCircle, XCircle, Clock, TrendingUp, Calendar as CalendarIcon, Search, ArrowLeft, Edit2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
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

interface AttendanceAdjustment {
  id: string;
  adjustment_date: string;
  override_status: string | null;
  override_work_hours: number | null;
  override_check_in: string | null;
  override_check_out: string | null;
  reason: string;
  leave_type: string | null;
}

interface DayStats {
  date: Date;
  checkIns: AttendanceLog[];
  checkOuts: AttendanceLog[];
  totalHours: number;
  isLate: boolean;
  hasOT: boolean;
  adjustment?: AttendanceAdjustment;
}

// ============================================
// List Mode Component - Show employee selection
// ============================================
function WorkHistoryList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const { data: employees, isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees-for-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, code, branch:branches!branch_id(id, name)')
        .eq('is_active', true)
        .order('full_name');
      
      if (error) throw error;
      return data;
    }
  });

  const { data: branches } = useQuery({
    queryKey: ['branches-for-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
      
      if (error) throw error;
      return data;
    }
  });

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    
    return employees.filter(emp => {
      const matchesSearch = search === '' || 
        emp.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        emp.code?.toLowerCase().includes(search.toLowerCase());
      
      const matchesBranch = branchFilter === 'all' || emp.branch?.id === branchFilter;
      
      return matchesSearch && matchesBranch;
    });
  }, [employees, search, branchFilter]);

  if (loadingEmployees) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ประวัติการทำงาน</h1>
        <p className="text-muted-foreground">เลือกพนักงานเพื่อดูประวัติการทำงาน</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาชื่อ, รหัส, ชื่อเล่น..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="เลือกสาขา" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสาขา</SelectItem>
            {branches?.map(branch => (
              <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Employee Table */}
      <Card>
        <CardHeader>
          <CardTitle>รายชื่อพนักงาน</CardTitle>
          <CardDescription>พบ {filteredEmployees.length} คน</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead>สาขา</TableHead>
                <TableHead className="text-right">การดำเนินการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map(emp => (
                <TableRow 
                  key={emp.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/attendance/work-history/${emp.id}`)}
                >
                  <TableCell className="font-mono">{emp.code || '-'}</TableCell>
                  <TableCell className="font-medium">{emp.full_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{emp.branch?.name || 'ไม่ระบุ'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <CalendarIcon className="h-4 w-4 mr-1" />
                      ดูประวัติ
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredEmployees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    ไม่พบพนักงาน
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Detail Mode Component - Show attendance history
// ============================================
function WorkHistoryDetail({ employeeId }: { employeeId: string }) {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  const { data: employee } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*, branch:branches!branch_id(name)')
        .eq('id', employeeId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['attendance-logs', employeeId, selectedMonth],
    queryFn: async () => {
      const start = startOfMonth(selectedMonth);
      const end = endOfMonth(selectedMonth);

      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('server_time', start.toISOString())
        .lte('server_time', end.toISOString())
        .order('server_time', { ascending: true });
      
      if (error) throw error;
      return data as AttendanceLog[];
    },
    enabled: !!employeeId
  });

  // Query attendance adjustments
  const { data: adjustments } = useQuery({
    queryKey: ['attendance-adjustments', employeeId, selectedMonth],
    queryFn: async () => {
      const start = startOfMonth(selectedMonth);
      const end = endOfMonth(selectedMonth);

      const { data, error } = await supabase
        .from('attendance_adjustments')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('adjustment_date', format(start, 'yyyy-MM-dd'))
        .lte('adjustment_date', format(end, 'yyyy-MM-dd'));
      
      if (error) throw error;
      return data as AttendanceAdjustment[];
    },
    enabled: !!employeeId
  });

  // Process logs into daily stats
  const dailyStats: Map<string, DayStats> = useMemo(() => {
    const stats = new Map<string, DayStats>();
    
    // First, process logs
    if (logs) {
      logs.forEach(log => {
        const date = parseISO(log.server_time);
        const dateKey = format(date, 'yyyy-MM-dd');
        
        if (!stats.has(dateKey)) {
          stats.set(dateKey, {
            date,
            checkIns: [],
            checkOuts: [],
            totalHours: 0,
            isLate: false,
            hasOT: false
          });
        }

        const dayStats = stats.get(dateKey)!;
        if (log.event_type === 'check_in') {
          dayStats.checkIns.push(log);
          if (log.is_flagged) dayStats.isLate = true;
        } else if (log.event_type === 'check_out') {
          dayStats.checkOuts.push(log);
          if (log.is_overtime) dayStats.hasOT = true;
        }
      });

      // Calculate total hours for each day
      stats.forEach((dayStats) => {
        let totalMinutes = 0;
        for (let i = 0; i < Math.min(dayStats.checkIns.length, dayStats.checkOuts.length); i++) {
          const checkIn = parseISO(dayStats.checkIns[i].server_time);
          const checkOut = parseISO(dayStats.checkOuts[i].server_time);
          totalMinutes += (checkOut.getTime() - checkIn.getTime()) / (1000 * 60);
        }
        dayStats.totalHours = totalMinutes / 60;
      });
    }

    // Then, merge adjustments
    if (adjustments) {
      adjustments.forEach(adj => {
        const dateKey = adj.adjustment_date;
        const existingStats = stats.get(dateKey);
        
        if (existingStats) {
          existingStats.adjustment = adj;
          if (adj.override_work_hours !== null) {
            existingStats.totalHours = adj.override_work_hours;
          }
        } else {
          stats.set(dateKey, {
            date: parseISO(dateKey),
            checkIns: [],
            checkOuts: [],
            totalHours: adj.override_work_hours || 0,
            isLate: false,
            hasOT: false,
            adjustment: adj
          });
        }
      });
    }

    return stats;
  }, [logs, adjustments]);

  // Calculate summary stats
  const totalWorkDays = dailyStats.size;
  const totalLate = Array.from(dailyStats.values()).filter(s => s.isLate).length;
  const totalOTDays = Array.from(dailyStats.values()).filter(s => s.hasOT).length;
  const totalHours = Array.from(dailyStats.values()).reduce((sum, s) => sum + s.totalHours, 0);
  const totalAdjusted = Array.from(dailyStats.values()).filter(s => s.adjustment).length;

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
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/attendance/work-history')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">ประวัติการทำงาน</h1>
            <p className="text-muted-foreground">
              {employee?.full_name} ({employee?.code}) - {employee?.branch?.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={viewMode} onValueChange={(v: 'calendar' | 'list') => setViewMode(v)}>
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
      <div className="grid gap-4 md:grid-cols-5">
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-purple-500" />
              แก้ไขแล้ว
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{totalAdjusted}</div>
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
                    return stats !== undefined && (stats.checkIns.length > 0 || stats.adjustment !== undefined);
                  },
                  late: (date) => {
                    const dateKey = format(date, 'yyyy-MM-dd');
                    const stats = dailyStats.get(dateKey);
                    return stats?.isLate || false;
                  },
                  ot: (date) => {
                    const dateKey = format(date, 'yyyy-MM-dd');
                    const stats = dailyStats.get(dateKey);
                    return stats?.hasOT || false;
                  },
                  adjusted: (date) => {
                    const dateKey = format(date, 'yyyy-MM-dd');
                    const stats = dailyStats.get(dateKey);
                    return stats?.adjustment !== undefined;
                  }
                }}
                modifiersClassNames={{
                  worked: 'bg-green-100 dark:bg-green-900/30',
                  late: 'bg-red-100 dark:bg-red-900/30',
                  ot: 'bg-blue-100 dark:bg-blue-900/30',
                  adjusted: 'ring-2 ring-purple-400'
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
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-4 h-4 border-2 border-purple-400 rounded" />
                  <span>มีการแก้ไขข้อมูล</span>
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
                  
                  if (!stats || (stats.checkIns.length === 0 && !stats.adjustment)) {
                    return <p className="text-muted-foreground">ไม่มีบันทึกการทำงานในวันนี้</p>;
                  }

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {stats.isLate ? (
                          <Badge variant="destructive">สาย</Badge>
                        ) : stats.checkIns.length > 0 ? (
                          <Badge variant="default">ตรงเวลา</Badge>
                        ) : null}
                        {stats.hasOT && <Badge variant="secondary">โอที</Badge>}
                        {stats.adjustment && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="border-purple-400 text-purple-600">
                                  <Edit2 className="h-3 w-3 mr-1" />
                                  แก้ไขแล้ว
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">สถานะ: {stats.adjustment.override_status || '-'}</p>
                                <p className="text-sm text-muted-foreground">{stats.adjustment.reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      {stats.adjustment && (
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                          <div className="text-sm font-medium text-purple-700 dark:text-purple-300">
                            ข้อมูลที่แก้ไข
                          </div>
                          <div className="text-sm mt-1 space-y-1">
                            {stats.adjustment.override_status && (
                              <p>สถานะ: <span className="font-medium">{stats.adjustment.override_status}</span></p>
                            )}
                            {stats.adjustment.override_check_in && (
                              <p>เวลาเข้า: <span className="font-mono">{stats.adjustment.override_check_in}</span></p>
                            )}
                            {stats.adjustment.override_check_out && (
                              <p>เวลาออก: <span className="font-mono">{stats.adjustment.override_check_out}</span></p>
                            )}
                            {stats.adjustment.leave_type && (
                              <p>ประเภทลา: <span className="font-medium">{stats.adjustment.leave_type}</span></p>
                            )}
                            <p className="text-muted-foreground">เหตุผล: {stats.adjustment.reason}</p>
                          </div>
                        </div>
                      )}

                      {stats.checkIns.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">เช็คอิน</h4>
                          {stats.checkIns.map((log, idx) => (
                            <div key={log.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                              <span>ครั้งที่ {idx + 1}</span>
                              <span className="font-mono">{format(parseISO(log.server_time), 'HH:mm:ss')}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {stats.checkOuts.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">เช็คเอาต์</h4>
                          {stats.checkOuts.map((log, idx) => (
                            <div key={log.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                              <span>ครั้งที่ {idx + 1}</span>
                              <span className="font-mono">{format(parseISO(log.server_time), 'HH:mm:ss')}</span>
                            </div>
                          ))}
                        </div>
                      )}

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
                          {stats.adjustment && ' • มีการแก้ไข'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={stats.isLate ? 'destructive' : 'default'}>
                        {stats.totalHours.toFixed(1)} ชม.
                      </Badge>
                      {stats.hasOT && <Badge variant="secondary">OT</Badge>}
                      {stats.adjustment && (
                        <Badge variant="outline" className="border-purple-400">
                          <Edit2 className="h-3 w-3" />
                        </Badge>
                      )}
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

// ============================================
// Main Component - Route handler
// ============================================
export default function WorkHistory() {
  const { id } = useParams();
  
  // If no ID provided, show employee list
  if (!id) {
    return <WorkHistoryList />;
  }
  
  // If ID provided, show detail view
  return <WorkHistoryDetail employeeId={id} />;
}
