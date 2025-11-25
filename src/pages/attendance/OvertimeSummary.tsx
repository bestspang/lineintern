import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, DollarSign, Clock, Download, TrendingUp, Building2, User } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';

export default function OvertimeSummary() {
  const [dateRange, setDateRange] = useState('30');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState('all');

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch employees
  const { data: employees } = useQuery({
    queryKey: ['employees-for-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, branch_id')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch OT logs with calculations
  const { data: otLogs, isLoading } = useQuery({
    queryKey: ['ot-summary', dateRange, selectedBranch, selectedEmployee],
    queryFn: async () => {
      const days = parseInt(dateRange);
      const fromDate = startOfDay(subDays(new Date(), days));
      
      let query = supabase
        .from('attendance_logs')
        .select(`
          *,
          employee:employees(
            id,
            full_name,
            branch_id,
            salary_per_month,
            hours_per_day,
            ot_rate_multiplier
          ),
          branch:branches(id, name),
          overtime_request:overtime_requests(id, reason, status)
        `)
        .eq('event_type', 'check_out')
        .eq('is_overtime', true)
        .gt('overtime_hours', 0)
        .gte('server_time', fromDate.toISOString())
        .order('server_time', { ascending: false });
      
      if (selectedBranch !== 'all') {
        query = query.eq('branch_id', selectedBranch);
      }
      
      if (selectedEmployee !== 'all') {
        query = query.eq('employee_id', selectedEmployee);
      }
      
      const { data, error } = await query;
      if (error) throw error;

      // Calculate OT pay for each log
      return data?.map(log => {
        const employee = log.employee;
        const salary = employee?.salary_per_month || 0;
        const hoursPerDay = employee?.hours_per_day || 8;
        const otRate = employee?.ot_rate_multiplier || 1.5;
        
        // Calculate: (salary / 30 / hours_per_day) * ot_rate * ot_hours
        const hourlyRate = salary / 30 / hoursPerDay;
        const otHourlyRate = hourlyRate * otRate;
        const otPay = otHourlyRate * (log.overtime_hours || 0);
        
        return {
          ...log,
          calculated_ot_pay: otPay,
          hourly_rate: hourlyRate,
          ot_hourly_rate: otHourlyRate
        };
      });
    }
  });

  // Calculate summary statistics
  const totalOTHours = otLogs?.reduce((sum, log) => sum + (log.overtime_hours || 0), 0) || 0;
  const totalOTPay = otLogs?.reduce((sum, log) => sum + (log.calculated_ot_pay || 0), 0) || 0;
  const uniqueEmployees = new Set(otLogs?.map(log => log.employee_id)).size;
  const avgOTHoursPerEmployee = uniqueEmployees > 0 ? totalOTHours / uniqueEmployees : 0;

  // Group by employee for summary table
  const employeeSummary = otLogs?.reduce((acc, log) => {
    const empId = log.employee_id;
    if (!acc[empId]) {
      acc[empId] = {
        employee_id: empId,
        employee_name: log.employee?.full_name || 'Unknown',
        branch_name: log.branch?.name || 'Unknown',
        total_ot_hours: 0,
        total_ot_pay: 0,
        ot_days_count: 0,
        avg_ot_rate: log.ot_hourly_rate || 0
      };
    }
    acc[empId].total_ot_hours += log.overtime_hours || 0;
    acc[empId].total_ot_pay += log.calculated_ot_pay || 0;
    acc[empId].ot_days_count += 1;
    return acc;
  }, {} as Record<string, any>);

  const employeeSummaryArray = Object.values(employeeSummary || {}).sort(
    (a: any, b: any) => b.total_ot_hours - a.total_ot_hours
  );

  // Export to CSV
  const handleExportCSV = () => {
    if (!otLogs || otLogs.length === 0) return;

    const headers = [
      'Date',
      'Employee',
      'Branch',
      'Check-in',
      'Check-out',
      'OT Hours',
      'Hourly Rate (THB)',
      'OT Rate Multiplier',
      'OT Hourly Rate (THB)',
      'OT Pay (THB)',
      'Reason'
    ];

    const rows = otLogs.map(log => [
      format(new Date(log.server_time), 'yyyy-MM-dd'),
      log.employee?.full_name || 'Unknown',
      log.branch?.name || 'Unknown',
      log.device_time ? format(new Date(log.device_time), 'HH:mm') : '-',
      format(new Date(log.server_time), 'HH:mm'),
      log.overtime_hours?.toFixed(2) || '0',
      log.hourly_rate?.toFixed(2) || '0',
      log.employee?.ot_rate_multiplier?.toString() || '1.5',
      log.ot_hourly_rate?.toFixed(2) || '0',
      log.calculated_ot_pay?.toFixed(2) || '0',
      log.overtime_request?.reason || '-'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `overtime_summary_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 px-3 sm:px-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Clock className="h-6 w-6 sm:h-8 sm:w-8" />
              สรุปค่าล่วงเวลา (OT)
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              สรุปชั่วโมงและค่าจ้างล่วงเวลาของพนักงาน
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-wrap gap-2 flex-1">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-full sm:w-[140px] text-sm">
                  <Building2 className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="สาขา" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกสาขา</SelectItem>
                  {branches?.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-full sm:w-[140px] text-sm">
                  <User className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="พนักงาน" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกคน</SelectItem>
                  {employees
                    ?.filter(emp => selectedBranch === 'all' || emp.branch_id === selectedBranch)
                    .map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-full sm:w-[120px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 วัน</SelectItem>
                  <SelectItem value="14">14 วัน</SelectItem>
                  <SelectItem value="30">30 วัน</SelectItem>
                  <SelectItem value="90">90 วัน</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleExportCSV} 
              variant="outline"
              disabled={!otLogs || otLogs.length === 0}
              className="text-sm w-full sm:w-auto"
            >
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">ชั่วโมง OT รวม</CardTitle>
            <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{totalOTHours.toFixed(2)}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">ชั่วโมง</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">ค่า OT รวม</CardTitle>
            <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">
              {totalOTPay.toLocaleString('th-TH', { maximumFractionDigits: 2 })}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">บาท</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">จำนวนพนักงาน</CardTitle>
            <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{uniqueEmployees}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">คน</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">เฉลี่ย OT/คน</CardTitle>
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{avgOTHoursPerEmployee.toFixed(2)}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">ชั่วโมง</p>
          </CardContent>
        </Card>
      </div>

      {/* Employee Summary Table */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">สรุปตามพนักงาน</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            รายการชั่วโมงและค่าจ้าง OT แยกตามพนักงาน
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">พนักงาน</TableHead>
                  <TableHead className="text-xs sm:text-sm hidden md:table-cell">สาขา</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm hidden lg:table-cell">จำนวนวัน</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">ชม. OT</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm hidden sm:table-cell">อัตรา OT/ชม.</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">ค่า OT รวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeSummaryArray.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      ไม่พบข้อมูล OT ในช่วงเวลาที่เลือก
                    </TableCell>
                  </TableRow>
                ) : (
                  employeeSummaryArray.map((summary: any) => (
                    <TableRow key={summary.employee_id}>
                      <TableCell className="font-medium text-xs sm:text-sm">
                        {summary.employee_name}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm hidden md:table-cell">
                        <Badge variant="outline">{summary.branch_name}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs sm:text-sm hidden lg:table-cell">
                        {summary.ot_days_count}
                      </TableCell>
                      <TableCell className="text-right text-xs sm:text-sm font-medium">
                        {summary.total_ot_hours.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs sm:text-sm text-muted-foreground hidden sm:table-cell">
                        {summary.avg_ot_rate.toFixed(2)} ฿
                      </TableCell>
                      <TableCell className="text-right text-xs sm:text-sm font-semibold text-green-600">
                        {summary.total_ot_pay.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ฿
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Logs */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">รายละเอียด OT ทั้งหมด</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            บันทึก OT แต่ละครั้งพร้อมการคำนวณค่าจ้าง
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">วันที่</TableHead>
                  <TableHead className="text-xs sm:text-sm">พนักงาน</TableHead>
                  <TableHead className="text-xs sm:text-sm hidden md:table-cell">สาขา</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm hidden lg:table-cell">เข้า</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm hidden lg:table-cell">ออก</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">ชม. OT</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm hidden sm:table-cell">อัตรา</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">ค่า OT</TableHead>
                  <TableHead className="text-xs sm:text-sm hidden xl:table-cell">เหตุผล</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otLogs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">
                      {format(new Date(log.server_time), 'dd/MM/yy')}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm font-medium">
                      {log.employee?.full_name || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm hidden md:table-cell">
                      <Badge variant="outline">{log.branch?.name || 'Unknown'}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm text-muted-foreground hidden lg:table-cell">
                      {log.device_time ? format(new Date(log.device_time), 'HH:mm') : '-'}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm text-muted-foreground hidden lg:table-cell">
                      {format(new Date(log.server_time), 'HH:mm')}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm font-medium">
                      {log.overtime_hours?.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm text-muted-foreground hidden sm:table-cell">
                      {log.employee?.ot_rate_multiplier || 1.5}x
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm font-semibold text-green-600">
                      {log.calculated_ot_pay?.toFixed(2)} ฿
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm max-w-[200px] truncate hidden xl:table-cell">
                      {log.overtime_request?.reason || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
