import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Bell, CheckCircle, XCircle, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

export default function AttendanceReminderLogs() {
  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Fetch reminder logs with filters
  const { data: reminders, isLoading } = useQuery({
    queryKey: ['attendance-reminders', dateRange, selectedEmployee, selectedType, selectedStatus],
    queryFn: async () => {
      let query = supabase
        .from('attendance_reminders')
        .select('*, employee:employees(full_name, code)')
        .gte('reminder_date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('reminder_date', format(dateRange.to, 'yyyy-MM-dd'))
        .order('scheduled_time', { ascending: false });

      if (selectedEmployee !== 'all') {
        query = query.eq('employee_id', selectedEmployee);
      }

      if (selectedType !== 'all') {
        query = query.eq('reminder_type', selectedType);
      }

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch employees for filter
  const { data: employees } = useQuery({
    queryKey: ['employees-for-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, code')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  // Calculate statistics
  const stats = {
    total: reminders?.length || 0,
    checkIn: reminders?.filter(r => r.reminder_type === 'check_in').length || 0,
    checkOut: reminders?.filter(r => r.reminder_type === 'check_out').length || 0,
    sent: reminders?.filter(r => r.status === 'sent').length || 0,
    failed: reminders?.filter(r => r.status === 'failed').length || 0,
    pending: reminders?.filter(r => r.status === 'pending').length || 0,
  };

  const successRate = stats.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(1) : '0';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Reminders</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Check-In</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-blue-600">{stats.checkIn}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Check-Out</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-purple-600">{stats.checkOut}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-green-600">{successRate}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Table */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                Reminder Logs
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                View attendance reminder history and delivery status
              </CardDescription>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Date Range Picker */}
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3 space-y-2">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDateRange({ from: subDays(new Date(), 7), to: new Date() });
                          setDatePickerOpen(false);
                        }}
                      >
                        Last 7 days
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDateRange({ from: subDays(new Date(), 30), to: new Date() });
                          setDatePickerOpen(false);
                        }}
                      >
                        Last 30 days
                      </Button>
                    </div>
                    <Calendar
                      mode="range"
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          setDateRange({ from: range.from, to: range.to });
                          setDatePickerOpen(false);
                        }
                      }}
                      numberOfMonths={1}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              {/* Employee Filter */}
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees?.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Type Filter */}
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="check_in">Check-In</SelectItem>
                  <SelectItem value="check_out">Check-Out</SelectItem>
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px] text-xs sm:text-sm">Date</TableHead>
                  <TableHead className="min-w-[120px] text-xs sm:text-sm">Employee</TableHead>
                  <TableHead className="text-xs sm:text-sm">Type</TableHead>
                  <TableHead className="text-xs sm:text-sm">Notification</TableHead>
                  <TableHead className="hidden sm:table-cell text-xs sm:text-sm">Scheduled</TableHead>
                  <TableHead className="hidden md:table-cell text-xs sm:text-sm">Sent At</TableHead>
                  <TableHead className="text-xs sm:text-sm">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reminders?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No reminders found for the selected filters
                    </TableCell>
                  </TableRow>
                ) : (
                  reminders?.map((reminder) => (
                    <TableRow key={reminder.id}>
                      <TableCell className="text-xs sm:text-sm">
                        {format(new Date(reminder.reminder_date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{reminder.employee?.full_name}</span>
                          <span className="text-xs text-muted-foreground">{reminder.employee?.code}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={reminder.reminder_type === 'check_in' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {reminder.reminder_type === 'check_in' ? 'Check-In' : 'Check-Out'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {reminder.notification_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">
                        {format(new Date(reminder.scheduled_time), 'HH:mm:ss')}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        {reminder.sent_at ? format(new Date(reminder.sent_at), 'HH:mm:ss') : '-'}
                      </TableCell>
                      <TableCell>
                        {reminder.status === 'sent' && (
                          <Badge className="bg-green-500 text-white text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Sent
                          </Badge>
                        )}
                        {reminder.status === 'failed' && (
                          <Badge variant="destructive" className="text-xs">
                            <XCircle className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                        {reminder.status === 'pending' && (
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}