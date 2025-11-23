import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Plus, Edit, Link as LinkIcon, Check, ChevronsUpDown, Eye, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AttendanceEmployees() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const [sampleCheckInTime, setSampleCheckInTime] = useState('09:00');
  const [formData, setFormData] = useState({
    code: '',
    full_name: '',
    role: 'office',
    branch_id: '',
    line_user_id: '',
    announcement_group_line_id: '',
    working_time_type: 'time_based',
    shift_start_time: '',
    shift_end_time: '',
    hours_per_day: null,
    break_hours: 1.00,
    reminder_preferences: {
      check_in_reminder_enabled: true,
      check_out_reminder_enabled: true,
      notification_type: 'private',
      grace_period_minutes: 15,
      check_out_reminder_after_minutes: 15,
    },
    is_active: true
  });

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*, branch:branches(name)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    }
  });

  const { data: lineUsers } = useQuery({
    queryKey: ['line-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, display_name, line_user_id')
        .order('display_name');
      if (error) throw error;
      return data;
    }
  });

  const { data: lineGroups } = useQuery({
    queryKey: ['line-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('id, display_name, line_group_id')
        .eq('status', 'active')
        .order('display_name');
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update(data)
          .eq('id', editingEmployee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employees')
          .insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDialogOpen(false);
      resetForm();
      toast({
        title: 'Success',
        description: `Employee ${editingEmployee ? 'updated' : 'created'} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const resetForm = () => {
    setFormData({
      code: '',
      full_name: '',
      role: 'office',
      branch_id: '',
      line_user_id: '',
      announcement_group_line_id: '',
      working_time_type: 'time_based',
      shift_start_time: '',
      shift_end_time: '',
      hours_per_day: null,
      break_hours: 1.00,
      reminder_preferences: {
        check_in_reminder_enabled: true,
        check_out_reminder_enabled: true,
        notification_type: 'private',
        grace_period_minutes: 15,
        check_out_reminder_after_minutes: 15,
      },
      is_active: true
    });
    setSampleCheckInTime('09:00');
    setEditingEmployee(null);
  };

  const handleEdit = (employee: any) => {
    setEditingEmployee(employee);
    setFormData({
      code: employee.code,
      full_name: employee.full_name,
      role: employee.role || 'office',
      branch_id: employee.branch_id || '',
      line_user_id: employee.line_user_id || '',
      announcement_group_line_id: employee.announcement_group_line_id || '',
      working_time_type: employee.working_time_type || 'time_based',
      shift_start_time: employee.shift_start_time || '',
      shift_end_time: employee.shift_end_time || '',
      hours_per_day: employee.hours_per_day || null,
      break_hours: employee.break_hours || 1.00,
      reminder_preferences: employee.reminder_preferences || {
        check_in_reminder_enabled: true,
        check_out_reminder_enabled: true,
        notification_type: 'private',
        grace_period_minutes: 15,
        check_out_reminder_after_minutes: 15,
      },
      is_active: employee.is_active
    });
    setDialogOpen(true);
  };

  const validateForm = () => {
    if (!formData.code) return "Employee code is required";
    if (!formData.full_name) return "Full name is required";
    
    const duplicateCode = employees?.some(
      emp => emp.code === formData.code && emp.id !== editingEmployee?.id
    );
    if (duplicateCode) return "Employee code already exists";
    
    if (formData.working_time_type === 'time_based') {
      if (!formData.shift_start_time || !formData.shift_end_time) {
        return "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดกะ";
      }
    } else if (formData.working_time_type === 'hours_based') {
      if (!formData.hours_per_day || formData.hours_per_day <= 0) {
        return "กรุณาระบุจำนวนชั่วโมงทำงานต่อวัน";
      }
    }
    
    return null;
  };

  const handleSave = () => {
    const error = validateForm();
    if (error) {
      toast({
        title: 'Validation Error',
        description: error,
        variant: 'destructive',
      });
      return;
    }
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                Employees
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Manage employee records and LINE account linking
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingEmployee ? 'Edit' : 'Add'} Employee</DialogTitle>
                  <DialogDescription>
                    {editingEmployee ? 'Update' : 'Create a new'} employee record
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="code">Employee Code *</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="EMP001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <Label htmlFor="role">Role</Label>
                    <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="office">Office</SelectItem>
                        <SelectItem value="field">Field</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="executive">Executive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="branch_id">Branch</Label>
                    <Select value={formData.branch_id} onValueChange={(value) => setFormData({ ...formData, branch_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches?.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="line_user_id">LINE User</Label>
                    <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={userSearchOpen}
                          className="w-full justify-between"
                        >
                          {formData.line_user_id
                            ? lineUsers?.find((user) => user.line_user_id === formData.line_user_id)?.display_name
                            : "Select LINE user..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search LINE users..." />
                          <CommandList>
                            <CommandEmpty>No user found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value=""
                                onSelect={() => {
                                  setFormData({ ...formData, line_user_id: '' });
                                  setUserSearchOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.line_user_id === "" ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                None (Link later)
                              </CommandItem>
                              {lineUsers
                                ?.filter(user => {
                                  const isLinkedToOther = employees?.some(
                                    emp => emp.line_user_id === user.line_user_id && 
                                           emp.id !== editingEmployee?.id
                                  );
                                  return !isLinkedToOther;
                                })
                                .map((user) => (
                                  <CommandItem
                                    key={user.id}
                                    value={user.display_name}
                                    onSelect={() => {
                                      setFormData({ ...formData, line_user_id: user.line_user_id });
                                      setUserSearchOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.line_user_id === user.line_user_id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span>{user.display_name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {user.line_user_id.substring(0, 15)}...
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground mt-1">
                      Search and select a LINE user to link
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="announcement_group_line_id">Announcement Group</Label>
                    <Popover open={groupSearchOpen} onOpenChange={setGroupSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={groupSearchOpen}
                          className="w-full justify-between"
                        >
                          {formData.announcement_group_line_id
                            ? lineGroups?.find((group) => group.line_group_id === formData.announcement_group_line_id)?.display_name
                            : "Select announcement group..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search groups..." />
                          <CommandList>
                            <CommandEmpty>No group found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value=""
                                onSelect={() => {
                                  setFormData({ ...formData, announcement_group_line_id: '' });
                                  setGroupSearchOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.announcement_group_line_id === "" ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                No announcement group
                              </CommandItem>
                              {lineGroups?.map((group) => (
                                <CommandItem
                                  key={group.id}
                                  value={group.display_name}
                                  onSelect={() => {
                                    setFormData({ ...formData, announcement_group_line_id: group.line_group_id });
                                    setGroupSearchOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.announcement_group_line_id === group.line_group_id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {group.display_name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground mt-1">
                      Attendance notifications will be posted here
                    </p>
                  </div>

                  {/* Work Schedule Section */}
                  <div className="space-y-4 border-t pt-4">
                    <h4 className="font-medium text-sm">Work Schedule & Reminders</h4>
                    
                    <div className="space-y-2">
                      <Label>รูปแบบการคำนวณเวลาทำงาน</Label>
                      <Select 
                        value={formData.working_time_type}
                        onValueChange={(value) => {
                          setFormData(prev => ({
                            ...prev, 
                            working_time_type: value,
                            shift_start_time: value === 'hours_based' ? '' : prev.shift_start_time,
                            shift_end_time: value === 'hours_based' ? '' : prev.shift_end_time,
                            hours_per_day: value === 'time_based' ? null : prev.hours_per_day
                          }))
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="time_based">กำหนดช่วงเวลา (เช่น 09:00-18:00)</SelectItem>
                          <SelectItem value="hours_based">กำหนดจำนวนชั่วโมง (เช่น 8 ชั่วโมง/วัน)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.working_time_type === 'time_based' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="shift_start_time">Shift Start Time</Label>
                          <Input
                            id="shift_start_time"
                            type="time"
                            value={formData.shift_start_time}
                            onChange={(e) => setFormData({ ...formData, shift_start_time: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="shift_end_time">Shift End Time</Label>
                          <Input
                            id="shift_end_time"
                            type="time"
                            value={formData.shift_end_time}
                            onChange={(e) => setFormData({ ...formData, shift_end_time: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    {formData.working_time_type === 'hours_based' && (
                      <div className="space-y-2">
                        <Label htmlFor="hours_per_day">จำนวนชั่วโมงต่อวัน</Label>
                        <Input 
                          id="hours_per_day"
                          type="number" 
                          step="0.5"
                          min="1"
                          max="24"
                          value={formData.hours_per_day || ''}
                          onChange={(e) => setFormData(prev => ({
                            ...prev, 
                            hours_per_day: e.target.value ? parseFloat(e.target.value) : null
                          }))}
                          placeholder="เช่น 8 หรือ 8.5"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="break_hours">ชั่วโมงพัก (ชั่วโมง)</Label>
                      <Input 
                        id="break_hours"
                        type="number" 
                        step="0.5"
                        min="0"
                        max="4"
                        value={formData.break_hours || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev, 
                          break_hours: e.target.value ? parseFloat(e.target.value) : 0
                        }))}
                        placeholder="เช่น 1 หรือ 1.5"
                      />
                      <p className="text-xs text-muted-foreground">
                        ระบุเวลาพักกลางวัน/พักรับประทานอาหาร
                      </p>
                    </div>

                    {/* Hours-Based Preview Calculation */}
                    {formData.working_time_type === 'hours_based' && formData.hours_per_day && (
                      <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                        <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <AlertDescription className="space-y-3">
                          <div className="font-medium text-sm text-blue-900 dark:text-blue-100">
                            📊 ตัวอย่างการคำนวณเวลา Check-Out
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label htmlFor="sample_check_in" className="text-xs min-w-24">
                                ตัวอย่าง Check-In:
                              </Label>
                              <Input
                                id="sample_check_in"
                                type="time"
                                value={sampleCheckInTime}
                                onChange={(e) => setSampleCheckInTime(e.target.value)}
                                className="h-8 w-32 text-sm"
                              />
                            </div>

                            {(() => {
                              const [hour, minute] = sampleCheckInTime.split(':').map(Number);
                              const checkInDate = new Date();
                              checkInDate.setHours(hour, minute, 0, 0);
                              
                              const hoursPerDay = formData.hours_per_day || 0;
                              const breakHours = formData.break_hours || 0;
                              const totalMinutes = (hoursPerDay + breakHours) * 60;
                              
                              const checkOutDate = new Date(checkInDate.getTime() + totalMinutes * 60000);
                              const checkOutTime = checkOutDate.toTimeString().substring(0, 5);
                              
                              return (
                                <div className="space-y-1 text-xs bg-white dark:bg-gray-900/50 p-3 rounded-md border border-blue-100 dark:border-blue-900">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">เวลาทำงาน:</span>
                                    <span className="font-semibold text-blue-700 dark:text-blue-300">
                                      {hoursPerDay} ชม.
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">เวลาพัก:</span>
                                    <span className="font-semibold text-blue-700 dark:text-blue-300">
                                      {breakHours} ชม.
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">เวลารวม:</span>
                                    <span className="font-semibold text-blue-700 dark:text-blue-300">
                                      {hoursPerDay + breakHours} ชม.
                                    </span>
                                  </div>
                                  <div className="border-t border-blue-100 dark:border-blue-900 mt-2 pt-2"></div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">คาดว่าจะ Check-Out:</span>
                                    <span className="font-bold text-base text-green-600 dark:text-green-400">
                                      {checkOutTime} น.
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          <p className="text-xs text-muted-foreground italic">
                            💡 ระบบจะคำนวณเวลา Check-Out อัตโนมัติจากเวลาที่พนักงาน Check-In จริง
                          </p>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Reminder Preferences */}
                    <div className="space-y-3 border-t pt-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="check_in_reminder">Check-In Reminder</Label>
                        <Switch
                          id="check_in_reminder"
                          checked={formData.reminder_preferences.check_in_reminder_enabled}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            reminder_preferences: {
                              ...formData.reminder_preferences,
                              check_in_reminder_enabled: checked
                            }
                          })}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="check_out_reminder">Check-Out Reminder</Label>
                        <Switch
                          id="check_out_reminder"
                          checked={formData.reminder_preferences.check_out_reminder_enabled}
                          onCheckedChange={(checked) => setFormData({
                            ...formData,
                            reminder_preferences: {
                              ...formData.reminder_preferences,
                              check_out_reminder_enabled: checked
                            }
                          })}
                        />
                      </div>

                      <div>
                        <Label htmlFor="notification_type">Notification Type</Label>
                        <Select 
                          value={formData.reminder_preferences.notification_type}
                          onValueChange={(value) => setFormData({
                            ...formData,
                            reminder_preferences: {
                              ...formData.reminder_preferences,
                              notification_type: value
                            }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="private">Private (DM)</SelectItem>
                            <SelectItem value="group">Group Only</SelectItem>
                            <SelectItem value="both">Both</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          Where to send reminder notifications
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="grace_period">Grace Period (minutes)</Label>
                        <Input
                          id="grace_period"
                          type="number"
                          min="0"
                          max="60"
                          value={formData.reminder_preferences.grace_period_minutes}
                          onChange={(e) => setFormData({
                            ...formData,
                            reminder_preferences: {
                              ...formData.reminder_preferences,
                              grace_period_minutes: parseInt(e.target.value) || 0
                            }
                          })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Minutes after shift start before sending reminder
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="checkout_reminder_delay">Check-Out Reminder Delay (minutes)</Label>
                        <Input
                          id="checkout_reminder_delay"
                          type="number"
                          min="0"
                          max="120"
                          value={formData.reminder_preferences.check_out_reminder_after_minutes}
                          onChange={(e) => setFormData({
                            ...formData,
                            reminder_preferences: {
                              ...formData.reminder_preferences,
                              check_out_reminder_after_minutes: parseInt(e.target.value) || 0
                            }
                          })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Minutes after shift end before sending reminder
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 border-t pt-4">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label htmlFor="is_active">Active Employee</Label>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={!formData.code || !formData.full_name || saveMutation.isPending}>
                      {saveMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[80px] text-xs sm:text-sm py-2">Code</TableHead>
                  <TableHead className="min-w-[120px] text-xs sm:text-sm py-2">Name</TableHead>
                  <TableHead className="hidden sm:table-cell text-xs sm:text-sm py-2">Role</TableHead>
                  <TableHead className="hidden md:table-cell text-xs sm:text-sm py-2">Branch</TableHead>
                  <TableHead className="hidden lg:table-cell text-xs sm:text-sm py-2">Shift</TableHead>
                  <TableHead className="hidden xl:table-cell text-xs sm:text-sm py-2">LINE</TableHead>
                <TableHead className="text-xs sm:text-sm py-2">Status</TableHead>
                <TableHead className="text-right text-xs sm:text-sm py-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees?.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium font-mono text-xs sm:text-sm py-2">{employee.code}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{employee.full_name}</span>
                      <span className="text-[10px] sm:hidden text-muted-foreground capitalize">{employee.role}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell capitalize text-sm py-2">{employee.role}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm py-2">{employee.branch?.name || '-'}</TableCell>
                  <TableCell className="hidden lg:table-cell py-2">
                    {employee.working_time_type === 'hours_based' ? (
                      <div className="text-sm">
                        <div className="font-medium">
                          {employee.hours_per_day} ชม./วัน
                        </div>
                        {employee.break_hours && (
                          <div className="text-xs text-muted-foreground">
                            พัก: {employee.break_hours} ชม.
                          </div>
                        )}
                      </div>
                    ) : employee.shift_start_time && employee.shift_end_time ? (
                      <div className="text-sm">
                        <div className="font-medium">
                          {employee.shift_start_time.substring(0, 5)} - {employee.shift_end_time.substring(0, 5)}
                        </div>
                        {employee.break_hours && (
                          <div className="text-xs text-muted-foreground">
                            พัก: {employee.break_hours} ชม.
                          </div>
                        )}
                        {employee.reminder_preferences && 
                         typeof employee.reminder_preferences === 'object' && 
                         'check_in_reminder_enabled' in employee.reminder_preferences &&
                         employee.reminder_preferences.check_in_reminder_enabled && (
                          <Badge variant="outline" className="text-xs mt-1">
                            🔔 Reminders
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Not set</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell py-2">
                    {employee.line_user_id ? (
                      <Badge variant="default" className="flex items-center gap-1 w-fit h-4 sm:h-5 text-[10px] sm:text-xs">
                        <LinkIcon className="h-2 w-2 sm:h-3 sm:w-3" />
                        Linked
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="h-4 sm:h-5 text-[10px] sm:text-xs">Not Linked</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant={employee.is_active ? 'default' : 'secondary'} className="h-4 sm:h-5 text-[10px] sm:text-xs">
                      {employee.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 sm:h-8 sm:w-8"
                        onClick={() => handleEdit(employee)}
                      >
                        <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 sm:h-8 sm:w-8"
                        onClick={() => navigate(`/attendance/employees/${employee.id}`)}
                      >
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
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
