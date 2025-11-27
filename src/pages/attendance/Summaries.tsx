import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Calendar, Download, X, DollarSign, Clock, AlertTriangle, TrendingUp, Globe, Send, Plus, Edit, Trash2, Mail, MessageSquare, User, Settings, HelpCircle, FileUser, Building2, Users, History } from 'lucide-react';
import { format, subDays, startOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import type { DateRange } from 'react-day-picker';

export default function AttendanceSummaries() {
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [checkinType, setCheckinType] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [editingPresetType, setEditingPresetType] = useState<string | null>(null);
  
  // Form state
  const [configName, setConfigName] = useState('');
  const [sourceType, setSourceType] = useState<'all_branches' | 'single_branch'>('all_branches');
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [customLineId, setCustomLineId] = useState('');
  const [sendTime, setSendTime] = useState('21:00');
  const [includeWorkHours, setIncludeWorkHours] = useState(true);

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('*');
      if (error) throw error;
      return data;
    }
  });

  // Fetch employees (for private delivery)
  const { data: employees } = useQuery({
    queryKey: ['employees-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, code, line_user_id')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch delivery configs
  const { data: deliveryConfigs, isLoading: loadingConfigs } = useQuery({
    queryKey: ['summary-delivery-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('summary_delivery_config')
        .select('*, source_branch:branches!source_branch_id(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Fetch attendance logs for remote check-in stats
  const { data: attendanceLogs, isLoading: loadingLogs } = useQuery({
    queryKey: ['attendance-logs-summary', dateRange, selectedBranch, checkinType],
    queryFn: async () => {
      let query = supabase
        .from('attendance_logs')
        .select(`
          id,
          server_time,
          is_remote_checkin,
          event_type,
          employee_id,
          employees (
            full_name,
            code,
            branch_id,
            branches (name)
          )
        `)
        .order('server_time', { ascending: false });

      if (dateRange?.from && dateRange?.to) {
        query = query.gte('server_time', dateRange.from.toISOString())
                     .lte('server_time', dateRange.to.toISOString());
      } else {
        query = query.gte('server_time', subDays(new Date(), 30).toISOString());
      }

      if (selectedBranch !== 'all') {
        query = query.eq('employees.branch_id', selectedBranch);
      }

      if (checkinType === 'onsite') {
        query = query.eq('is_remote_checkin', false);
      } else if (checkinType === 'remote') {
        query = query.eq('is_remote_checkin', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Fetch daily summaries (all_branches scope for live dashboard)
  const { data: dailySummaries, isLoading: loadingDaily } = useQuery({
    queryKey: ['daily-summaries', dateRange],
    queryFn: async () => {
      let query = supabase
        .from('daily_attendance_summaries')
        .select('*')
        .eq('scope', 'all_branches')
        .order('summary_date', { ascending: false });
      
      if (dateRange?.from && dateRange?.to) {
        query = query.gte('summary_date', format(dateRange.from, 'yyyy-MM-dd'))
                     .lte('summary_date', format(dateRange.to, 'yyyy-MM-dd'));
      } else {
        query = query.limit(30);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000 // Auto-refresh every 1 minute
  });

  // Fetch OT summary
  const { data: otLogs, isLoading: loadingOT } = useQuery({
    queryKey: ['ot-summary', dateRange, selectedBranch],
    queryFn: async () => {
      let query = supabase
        .from('attendance_logs')
        .select(`
          id,
          server_time,
          overtime_hours,
          is_remote_checkin,
          employee_id,
          employees (
            id,
            full_name,
            code,
            salary_per_month,
            ot_rate_multiplier,
            hours_per_day,
            branch_id,
            branches (name)
          )
        `)
        .eq('is_overtime', true)
        .order('server_time', { ascending: false });

      if (dateRange?.from && dateRange?.to) {
        query = query.gte('server_time', dateRange.from.toISOString())
                     .lte('server_time', dateRange.to.toISOString());
      } else {
        query = query.gte('server_time', subDays(new Date(), 30).toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Calculate OT pay for each log
      return data.map(log => ({
        ...log,
        ot_pay: calculateOTPay(
          log.employees?.salary_per_month || 0,
          log.employees?.ot_rate_multiplier || 1.5,
          log.employees?.hours_per_day || 8,
          log.overtime_hours || 0
        )
      }));
    }
  });

  // Fetch early leave summary
  const { data: earlyLeaveRequests, isLoading: loadingEarlyLeave } = useQuery({
    queryKey: ['early-leave-summary', dateRange, selectedBranch],
    queryFn: async () => {
      let query = supabase
        .from('early_leave_requests')
        .select(`
          *,
          employees (
            full_name,
            code,
            branch_id,
            branches (name)
          )
        `)
        .order('requested_at', { ascending: false });

      if (dateRange?.from && dateRange?.to) {
        query = query.gte('request_date', format(dateRange.from, 'yyyy-MM-dd'))
                     .lte('request_date', format(dateRange.to, 'yyyy-MM-dd'));
      } else {
        query = query.gte('request_date', format(subDays(new Date(), 30), 'yyyy-MM-dd'));
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Fetch delivery logs
  const { data: deliveryLogs, isLoading: loadingDeliveryLogs } = useQuery({
    queryKey: ['delivery-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('summary_delivery_logs')
        .select('*, config:summary_delivery_config(name)')
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    }
  });

  // Calculate OT statistics
  const otStats = useMemo(() => {
    if (!otLogs) return { totalHours: 0, totalPay: 0, avgHours: 0, uniqueEmployees: 0 };
    
    const totalHours = otLogs.reduce((sum, log) => sum + (log.overtime_hours || 0), 0);
    const totalPay = otLogs.reduce((sum, log) => sum + log.ot_pay, 0);
    const uniqueEmployees = new Set(otLogs.map(log => log.employee_id)).size;
    const avgHours = uniqueEmployees > 0 ? totalHours / uniqueEmployees : 0;

    return { totalHours, totalPay, avgHours, uniqueEmployees };
  }, [otLogs]);

  // Calculate early leave statistics
  const earlyLeaveStats = useMemo(() => {
    if (!earlyLeaveRequests) return { total: 0, approved: 0, rejected: 0, pending: 0 };
    
    return {
      total: earlyLeaveRequests.length,
      approved: earlyLeaveRequests.filter(r => r.status === 'approved').length,
      rejected: earlyLeaveRequests.filter(r => r.status === 'rejected').length,
      pending: earlyLeaveRequests.filter(r => r.status === 'pending').length,
    };
  }, [earlyLeaveRequests]);

  // Calculate remote check-in statistics
  const remoteCheckinStats = useMemo(() => {
    if (!attendanceLogs) return { total: 0, remote: 0, onsite: 0, remotePercentage: 0 };
    
    const total = attendanceLogs.length;
    const remote = attendanceLogs.filter(log => log.is_remote_checkin).length;
    const onsite = total - remote;
    const remotePercentage = total > 0 ? (remote / total) * 100 : 0;

    return { total, remote, onsite, remotePercentage };
  }, [attendanceLogs]);

  // Helper functions
  const calculateOTPay = (salary: number, otRate: number, hoursPerDay: number, otHours: number) => {
    if (!salary || salary === 0) return 0;
    const dailyRate = salary / 30;
    const hourlyRate = dailyRate / hoursPerDay;
    return hourlyRate * otRate * otHours;
  };

  const setQuickFilter = (filter: string) => {
    const today = new Date();
    switch (filter) {
      case 'today':
        setDateRange({ from: today, to: today });
        break;
      case 'week':
        setDateRange({ from: startOfWeek(today, { weekStartsOn: 1 }), to: today });
        break;
      case 'month':
        setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
        break;
    }
  };

  const resetFilters = () => {
    setDateRange(undefined);
    setSelectedBranch('all');
    setCheckinType('all');
  };

  const exportOTToCSV = () => {
    if (!otLogs) return;
    
    const csv = [
      ['Employee', 'Branch', 'Date', 'OT Hours', 'OT Rate', 'OT Pay (THB)', 'Remote Check-in'],
      ...otLogs.map(log => [
        log.employees?.full_name || '-',
        log.employees?.branches?.name || '-',
        format(new Date(log.server_time), 'yyyy-MM-dd'),
        log.overtime_hours?.toFixed(2) || '0',
        (log.employees?.ot_rate_multiplier || 1.5).toFixed(1) + 'x',
        log.ot_pay.toFixed(2),
        log.is_remote_checkin ? 'Yes' : 'No'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ot-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportEarlyLeaveToCSV = () => {
    if (!earlyLeaveRequests) return;
    
    const csv = [
      ['Employee', 'Branch', 'Date', 'Leave Type', 'Reason', 'Status', 'Remote Check-in'],
      ...earlyLeaveRequests.map(req => {
        const associatedLog = attendanceLogs?.find(log => 
          log.employee_id === req.employee_id && 
          format(new Date(log.server_time), 'yyyy-MM-dd') === req.request_date
        );
        
        return [
          req.employees?.full_name || '-',
          req.employees?.branches?.name || '-',
          req.request_date,
          req.leave_type || '-',
          req.leave_reason || '-',
          req.status,
          associatedLog?.is_remote_checkin ? 'Yes' : 'No'
        ];
      })
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `early-leave-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Mutations for delivery configs
  const createConfigMutation = useMutation({
    mutationFn: async (config: any) => {
      const { error } = await supabase.from('summary_delivery_config').insert(config);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summary-delivery-configs'] });
      toast.success('เพิ่มการตั้งค่าสำเร็จ');
      resetForm();
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    }
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from('summary_delivery_config')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summary-delivery-configs'] });
      toast.success('อัพเดทสำเร็จ');
    },
    onError: (error) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    }
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('summary_delivery_config')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summary-delivery-configs'] });
      toast.success('ลบการตั้งค่าสำเร็จ');
    },
    onError: (error) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    }
  });

  const testSendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('attendance-daily-summary');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('ส่งรายงานทดสอบสำเร็จ');
    },
    onError: (error) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    }
  });

  const resetForm = () => {
    setConfigName('');
    setSourceType('all_branches');
    setSourceBranchId('');
    setSelectedLineIds([]);
    setSelectedEmployeeIds([]);
    setCustomLineId('');
    setSendTime('21:00');
    setIncludeWorkHours(true);
    setEditingConfig(null);
    setEditingPresetType(null);
  };

  const handleSaveConfig = () => {
    if (editingConfig?.is_system) {
      // System preset - only editable fields
      const updates: any = { send_time: sendTime + ':00' };
      
      // Management preset can edit groups
      if (editingPresetType === null) {
        const allLineIds = customLineId.trim() 
          ? [...selectedLineIds, customLineId.trim()] 
          : selectedLineIds;
        updates.destination_line_ids = allLineIds;
      }
      
      updateConfigMutation.mutate({ id: editingConfig.id, updates });
      setDialogOpen(false);
      resetForm();
    } else {
      // Custom config - all fields
      const allLineIds = customLineId.trim() 
        ? [...selectedLineIds, customLineId.trim()] 
        : selectedLineIds;

      const config = {
        name: configName,
        source_type: sourceType,
        source_branch_id: sourceType === 'single_branch' ? sourceBranchId : null,
        destination_line_ids: allLineIds,
        destination_employee_ids: selectedEmployeeIds,
        send_time: sendTime + ':00',
        include_work_hours: includeWorkHours,
      };

      if (editingConfig) {
        updateConfigMutation.mutate({ id: editingConfig.id, updates: config });
      } else {
        createConfigMutation.mutate(config);
      }
    }
  };

  const handleEditConfig = (config: any) => {
    setEditingConfig(config);
    setEditingPresetType(config.preset_type);
    setConfigName(config.name);
    setSourceType(config.source_type);
    setSourceBranchId(config.source_branch_id || '');
    setSelectedLineIds(config.destination_line_ids || []);
    setSelectedEmployeeIds(config.destination_employee_ids || []);
    setCustomLineId('');
    setSendTime(config.send_time?.substring(0, 5) || '21:00');
    setIncludeWorkHours(config.include_work_hours);
    setDialogOpen(true);
  };

  const isLoading = loadingDaily || loadingOT || loadingEarlyLeave || loadingLogs || loadingConfigs;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports & Summaries</h1>
        <p className="text-muted-foreground">
          Comprehensive attendance, overtime, and early leave reports
        </p>
      </div>

      {/* Help Card */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900">
              <HelpCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 space-y-3">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                วิธีใช้งาน Reports & Summaries
              </h3>
              <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 p-1 rounded bg-blue-200 dark:bg-blue-800">
                    <FileUser className="h-3 w-3" />
                  </div>
                  <div>
                    <strong>📤 ส่งรายบุคคล:</strong> ส่งสรุปการเข้างานแต่ละคนไปหาพนักงานคนนั้นใน LINE โดยตรง
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 p-1 rounded bg-blue-200 dark:bg-blue-800">
                    <Building2 className="h-3 w-3" />
                  </div>
                  <div>
                    <strong>🏢 ส่งรายสาขา:</strong> ส่งสรุปข้อมูลพนักงานในสาขาไปยังกลุ่ม LINE ของสาขานั้น
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 p-1 rounded bg-blue-200 dark:bg-blue-800">
                    <Users className="h-3 w-3" />
                  </div>
                  <div>
                    <strong>📊 ส่งทุกสาขาไป Management:</strong> ส่งข้อมูลรวมทุกสาขาไปยังกลุ่มผู้บริหารที่คุณเลือก (เลือกได้หลายกลุ่ม)
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-700">
                <p className="text-xs text-blue-900 dark:text-blue-100 font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  💡 ระบบจะส่งอัตโนมัติตามเวลาที่ตั้งไว้ พนักงาน/สาขาใหม่จะถูกรวมอัตโนมัติโดยไม่ต้องตั้งค่าใหม่
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delivery Configuration Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5" />
                📬 ตั้งค่าการส่งรายงาน
              </CardTitle>
              <CardDescription>
                กำหนดว่าจะส่งรายงานไปที่ไหน และเวลาไหน
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => testSendMutation.mutate()}
                variant="outline"
                size="sm"
                disabled={testSendMutation.isPending}
              >
                {testSendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                ส่งทดสอบ
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={resetForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    เพิ่มการส่งใหม่
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingConfig ? 'แก้ไขการส่งรายงาน' : 'เพิ่มการส่งรายงานใหม่'}</DialogTitle>
                    <DialogDescription>
                      {editingConfig?.is_system ? (
                        editingPresetType === 'per_employee' || editingPresetType === 'per_branch' 
                          ? 'แก้ไขเฉพาะเวลาส่ง (ระบบจะส่งอัตโนมัติตามพนักงาน/สาขาปัจจุบัน)'
                          : 'แก้ไขเวลาส่งและเลือกกลุ่มผู้รับ'
                      ) : (
                        'กำหนดว่าจะส่งรายงานจากสาขาไหน ไปที่ไหน และเวลาไหน'
                      )}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    {/* Only show name for custom configs */}
                    {!editingConfig?.is_system && (
                      <div className="space-y-2">
                        <Label htmlFor="config-name">ชื่อการตั้งค่า</Label>
                        <Input
                          id="config-name"
                          value={configName}
                          onChange={(e) => setConfigName(e.target.value)}
                          placeholder="เช่น รายงานทุกสาขา → ฝ่ายบริหาร"
                        />
                      </div>
                    )}

                    {/* Only show source selection for custom configs */}
                    {!editingConfig?.is_system && (
                      <>
                        <div className="space-y-2">
                          <Label>ข้อมูลจาก</Label>
                          <Select value={sourceType} onValueChange={(v: any) => setSourceType(v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all_branches">ทุกสาขา</SelectItem>
                              <SelectItem value="single_branch">เลือกสาขา</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {sourceType === 'single_branch' && (
                          <div className="space-y-2">
                            <Label>เลือกสาขา</Label>
                            <Select value={sourceBranchId} onValueChange={setSourceBranchId}>
                              <SelectTrigger>
                                <SelectValue placeholder="เลือกสาขา" />
                              </SelectTrigger>
                              <SelectContent>
                                {branches?.map((b) => (
                                  <SelectItem key={b.id} value={b.id}>
                                    {b.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </>
                    )}

                    {/* LINE Groups - only for custom configs OR management preset */}
                    {(!editingConfig?.is_system || editingPresetType === null) && (
                      <div className="space-y-3">
                        <Label className="flex items-center gap-2 text-base">
                          <MessageSquare className="h-4 w-4" />
                          ส่งไปกลุ่ม LINE (เลือกได้หลายกลุ่ม)
                        </Label>
                        <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto bg-muted/30">
                          {branches?.filter(b => b.line_group_id).length === 0 ? (
                            <p className="text-sm text-muted-foreground">ไม่มีกลุ่ม LINE ที่เชื่อมต่อ</p>
                          ) : (
                            branches?.filter(b => b.line_group_id).map(branch => (
                              <div key={branch.id} className="flex items-center gap-2">
                                <Checkbox 
                                  id={`line-${branch.id}`}
                                  checked={selectedLineIds.includes(branch.line_group_id!)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedLineIds([...selectedLineIds, branch.line_group_id!]);
                                    } else {
                                      setSelectedLineIds(selectedLineIds.filter(id => id !== branch.line_group_id));
                                    }
                                  }}
                                />
                                <Label htmlFor={`line-${branch.id}`} className="font-normal cursor-pointer flex-1">
                                  {branch.name}
                                </Label>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customLineId" className="text-xs text-muted-foreground">
                            + เพิ่ม Group ID เอง
                          </Label>
                          <Input
                            id="customLineId"
                            value={customLineId}
                            onChange={(e) => setCustomLineId(e.target.value)}
                            placeholder="Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className="text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* Employees - only for custom configs */}
                    {!editingConfig?.is_system && (
                      <div className="space-y-3">
                        <Label className="flex items-center gap-2 text-base">
                          <User className="h-4 w-4" />
                          ส่งตรงหาพนักงาน (เลือกได้หลายคน)
                        </Label>
                        <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto bg-muted/30">
                          {employees?.filter(e => e.line_user_id).length === 0 ? (
                            <p className="text-sm text-muted-foreground">ไม่มีพนักงานที่เชื่อมต่อ LINE</p>
                          ) : (
                            employees?.filter(e => e.line_user_id).map(emp => (
                              <div key={emp.id} className="flex items-center gap-2">
                                <Checkbox 
                                  id={`emp-${emp.id}`}
                                  checked={selectedEmployeeIds.includes(emp.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedEmployeeIds([...selectedEmployeeIds, emp.id]);
                                    } else {
                                      setSelectedEmployeeIds(selectedEmployeeIds.filter(id => id !== emp.id));
                                    }
                                  }}
                                />
                                <Label htmlFor={`emp-${emp.id}`} className="font-normal cursor-pointer flex-1">
                                  {emp.full_name} ({emp.code})
                                </Label>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Send time - always visible */}
                    <div className="space-y-2">
                      <Label htmlFor="send-time">เวลาส่ง</Label>
                      <Input
                        id="send-time"
                        type="time"
                        value={sendTime}
                        onChange={(e) => setSendTime(e.target.value)}
                      />
                    </div>

                    {/* Work hours toggle - only for custom configs */}
                    {!editingConfig?.is_system && (
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="include-hours"
                          checked={includeWorkHours}
                          onCheckedChange={setIncludeWorkHours}
                        />
                        <Label htmlFor="include-hours">รวมชั่วโมงทำงาน</Label>
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      ยกเลิก
                    </Button>
                    <Button
                      onClick={handleSaveConfig}
                      disabled={
                        (!editingConfig?.is_system && !configName) || 
                        createConfigMutation.isPending || 
                        updateConfigMutation.isPending
                      }
                    >
                      {(createConfigMutation.isPending || updateConfigMutation.isPending) && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      บันทึก
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* System Presets Section */}
          {deliveryConfigs?.some((c: any) => c.is_system) && (
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-base">
                <Settings className="h-4 w-4" />
                Presets (ตั้งค่าเริ่มต้น)
              </h3>
              <div className="grid gap-3 md:grid-cols-3">
                {deliveryConfigs?.filter((c: any) => c.is_system).map((preset: any) => {
                  const getPresetInfo = () => {
                    if (preset.preset_type === 'per_employee') {
                      const activeCount = employees?.filter(e => e.line_user_id).length || 0;
                      return `Auto: ${activeCount} พนักงานที่มี LINE`;
                    }
                    if (preset.preset_type === 'per_branch') {
                      const branchCount = branches?.filter(b => b.line_group_id).length || 0;
                      return `Auto: ${branchCount} สาขาที่มี LINE Group`;
                    }
                    const groupCount = preset.destination_line_ids?.length || 0;
                    return groupCount > 0 ? `ส่งไป ${groupCount} กลุ่ม` : 'ยังไม่ได้เลือกกลุ่ม';
                  };

                  return (
                    <Card key={preset.id} className="border-2">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm leading-tight">{preset.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                ⏰ {preset.send_time?.substring(0, 5)}
                              </p>
                              <p className="text-xs text-primary/80 mt-1 font-medium">
                                {getPresetInfo()}
                              </p>
                            </div>
                            <Switch
                              checked={preset.is_enabled}
                              onCheckedChange={(checked) =>
                                updateConfigMutation.mutate({
                                  id: preset.id,
                                  updates: { is_enabled: checked },
                                })
                              }
                            />
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="w-full"
                            onClick={() => handleEditConfig(preset)}
                          >
                            <Edit className="h-3 w-3 mr-1" /> แก้ไข
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Configs Section */}
          {deliveryConfigs && deliveryConfigs.some((c: any) => !c.is_system) && (
            <div>
              <h3 className="font-semibold mb-3 text-base">การตั้งค่าเพิ่มเติม</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead>ข้อมูลจาก</TableHead>
                    <TableHead>ส่งไป</TableHead>
                    <TableHead>เวลา</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryConfigs.filter((c: any) => !c.is_system).map((config: any) => (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">{config.name}</TableCell>
                      <TableCell>
                        {config.source_type === 'all_branches' 
                          ? 'ทุกสาขา' 
                          : config.source_branch?.name || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {(config.destination_line_ids?.length > 0 || config.destination_employee_ids?.length > 0) ? (
                            <>
                              {config.destination_line_ids?.length > 0 && (
                                <div className="text-xs">
                                  📱 {config.destination_line_ids.length} กลุ่ม LINE
                                </div>
                              )}
                              {config.destination_employee_ids?.length > 0 && (
                                <div className="text-xs">
                                  👤 {config.destination_employee_ids.length} พนักงาน
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{config.send_time?.substring(0, 5) || '-'}</TableCell>
                      <TableCell>
                        <Switch
                          checked={config.is_enabled}
                          onCheckedChange={(checked) =>
                            updateConfigMutation.mutate({
                              id: config.id,
                              updates: { is_enabled: checked },
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditConfig(config)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm('ต้องการลบการตั้งค่านี้?')) {
                                deleteConfigMutation.mutate(config.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Empty State */}
          {(!deliveryConfigs || deliveryConfigs.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>ยังไม่มีการตั้งค่าการส่งรายงาน</p>
              <p className="text-sm">คลิก "เพิ่มการส่งใหม่" เพื่อเริ่มต้น</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {/* Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal">
                <Calendar className="mr-2 h-4 w-4" />
                {dateRange?.from && dateRange?.to ? 
                  `${format(dateRange.from, 'MMM dd')} - ${format(dateRange.to, 'MMM dd')}` 
                  : 'Select Date Range'
                }
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* Branch Selector */}
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches?.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Check-in Type Filter */}
          <Select value={checkinType} onValueChange={setCheckinType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Check-in Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Check-ins</SelectItem>
              <SelectItem value="onsite">🏢 On-site Only</SelectItem>
              <SelectItem value="remote">🌐 Remote Only</SelectItem>
            </SelectContent>
          </Select>

          {/* Quick Filters */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setQuickFilter('today')}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickFilter('week')}>
              This Week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickFilter('month')}>
              This Month
            </Button>
          </div>

          {/* Reset */}
          {(dateRange || selectedBranch !== 'all' || checkinType !== 'all') && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="daily">
            <Calendar className="h-4 w-4 mr-2" />
            Daily Attendance
          </TabsTrigger>
          <TabsTrigger value="overtime">
            <Clock className="h-4 w-4 mr-2" />
            OT Summary ({otLogs?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="early-leave">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Early Leave ({earlyLeaveRequests?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Daily Attendance */}
        <TabsContent value="daily" className="space-y-4">
          {/* Remote Check-in Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Check-ins</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {remoteCheckinStats.total}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>🌐 Remote Check-ins</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600 flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  {remoteCheckinStats.remote}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {remoteCheckinStats.remotePercentage.toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>🏢 On-site Check-ins</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {remoteCheckinStats.onsite}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(100 - remoteCheckinStats.remotePercentage).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Remote Ratio</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {remoteCheckinStats.remotePercentage.toFixed(0)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {remoteCheckinStats.remote} / {remoteCheckinStats.total}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Daily Attendance Summaries
                    <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  </CardTitle>
                  <CardDescription>
                    อัพเดททุก 30 นาที (รวมทุกสาขา) • Auto-refresh ทุก 1 นาที
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {dailySummaries?.map((summary: any) => (
                <Card key={summary.id} className="border-l-4 border-l-primary">
                  <CardHeader className="p-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        📊 สรุปรวมทุกสาขา - {format(new Date(summary.summary_date), 'dd MMM yyyy')}
                      </CardTitle>
                      {summary.updated_at && (
                        <Badge variant="outline" className="text-xs">
                          อัพเดท: {format(new Date(summary.updated_at), 'HH:mm')}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-muted-foreground mt-2">
                      <div className="flex items-center gap-1">
                        <span className="text-green-600">✅</span> 
                        Checked In: {summary.checked_in || 0}/{summary.total_employees || 0}
                      </div>
                      <div className="flex items-center gap-1">
                        <span>🏁</span> 
                        Checked Out: {summary.checked_out || 0}/{summary.total_employees || 0}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-amber-500">⏰</span> 
                        Late: {summary.late_count || 0}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-red-500">🚩</span> 
                        Flagged: {summary.flagged_count || 0}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-3 rounded-md max-h-96 overflow-y-auto">
                      {summary.summary_text}
                    </pre>
                  </CardContent>
                </Card>
              ))}
              {!dailySummaries?.length && (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>ยังไม่มีข้อมูลสรุป</p>
                  <p className="text-sm">ระบบจะสร้างสรุปอัตโนมัติทุก 30 นาที</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: OT Summary */}
        <TabsContent value="overtime" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total OT Hours</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  {otStats.totalHours.toFixed(1)} hrs
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total OT Pay</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2 text-green-600">
                  <DollarSign className="h-5 w-5" />
                  ฿{otStats.totalPay.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unique Employees</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  {otStats.uniqueEmployees}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg OT/Employee</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {otStats.avgHours.toFixed(1)} hrs
                </div>
              </CardContent>
            </Card>
          </div>

          {/* OT Table */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>OT Detail Report</CardTitle>
                  <CardDescription>Overtime hours and payments breakdown</CardDescription>
                </div>
                <Button onClick={exportOTToCSV} size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">OT Hours</TableHead>
                      <TableHead className="text-right">OT Rate</TableHead>
                      <TableHead className="text-right">OT Pay (THB)</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otLogs?.map(log => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="font-medium">{log.employees?.full_name}</div>
                          <div className="text-sm text-muted-foreground">{log.employees?.code}</div>
                        </TableCell>
                        <TableCell>{log.employees?.branches?.name || '-'}</TableCell>
                        <TableCell>{format(new Date(log.server_time), 'MMM dd, yyyy')}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">
                            {log.overtime_hours?.toFixed(1) || '0'} hrs
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {(log.employees?.ot_rate_multiplier || 1.5).toFixed(1)}x
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          ฿{log.ot_pay.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          {log.is_remote_checkin && (
                            <Badge variant="outline" className="text-blue-600 border-blue-600">
                              🌐 Remote
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!otLogs?.length && (
                <div className="text-center py-8 text-muted-foreground">
                  No overtime records found for selected period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Early Leave Summary */}
        <TabsContent value="early-leave" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Requests</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {earlyLeaveStats.total}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Approved</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {earlyLeaveStats.approved}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Rejected</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {earlyLeaveStats.rejected}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pending</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {earlyLeaveStats.pending}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Early Leave Table */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Early Leave Detail Report</CardTitle>
                  <CardDescription>Early checkout requests and approvals</CardDescription>
                </div>
                <Button onClick={exportEarlyLeaveToCSV} size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {earlyLeaveRequests?.map(request => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="font-medium">{request.employees?.full_name}</div>
                          <div className="text-sm text-muted-foreground">{request.employees?.code}</div>
                        </TableCell>
                        <TableCell>{request.employees?.branches?.name || '-'}</TableCell>
                        <TableCell>{format(new Date(request.request_date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>
                          {request.leave_type ? (
                            <Badge variant="outline">
                              {request.leave_type === 'sick' && '🤒 Sick'}
                              {request.leave_type === 'personal' && '📝 Personal'}
                              {request.leave_type === 'vacation' && '🏖️ Vacation'}
                              {request.leave_type === 'emergency' && '🚨 Emergency'}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{request.leave_reason}</TableCell>
                        <TableCell>
                          <Badge variant={
                            request.status === 'approved' ? 'default' :
                            request.status === 'rejected' ? 'destructive' : 
                            'secondary'
                          }>
                            {request.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!earlyLeaveRequests?.length && (
                <div className="text-center py-8 text-muted-foreground">
                  No early leave requests found for selected period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delivery History Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            📜 ประวัติการส่งรายงาน
          </CardTitle>
          <CardDescription>
            ประวัติการส่งรายงานอัตโนมัติ 50 ครั้งล่าสุด
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDeliveryLogs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : deliveryLogs && deliveryLogs.length > 0 ? (
            <div className="space-y-2">
              {deliveryLogs.map((log: any) => (
                <div 
                  key={log.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {log.config?.name || 'ไม่ระบุชื่อ'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.sent_at ? format(new Date(log.sent_at), 'dd/MM/yyyy HH:mm') : 'ไม่ระบุเวลา'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <Badge 
                        variant={
                          log.success_count === log.recipients_count ? 'default' :
                          log.success_count > 0 ? 'secondary' : 'destructive'
                        }
                        className="text-xs"
                      >
                        {log.success_count || 0} / {log.recipients_count || 0}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        สำเร็จ / ทั้งหมด
                      </p>
                    </div>
                    {log.failed_count > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        ❌ {log.failed_count} ล้มเหลว
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>ยังไม่มีประวัติการส่งรายงาน</p>
              <p className="text-sm">รายงานจะถูกส่งอัตโนมัติตามเวลาที่ตั้งไว้</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
