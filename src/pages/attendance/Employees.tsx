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
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2, Users, Plus, Edit, Link as LinkIcon, Check, ChevronsUpDown, Eye, History, Settings, Download, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AttendanceEmployees() {
  const { toast } = useToast();
  const { canAssignEmployeeRole, canManageEmployee } = useUserRole();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedImportUsers, setSelectedImportUsers] = useState<string[]>([]);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  
  // Simplified form - only basic employee info
  const [formData, setFormData] = useState({
    code: '',
    full_name: '',
    role_id: null as string | null,
    branch_id: '',
    line_user_id: '',
    announcement_group_line_id: '',
    is_active: true
  });

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(`
          *, 
          branch:branches!branch_id(name),
          employee_role:employee_roles(id, display_name_th, display_name_en, role_key, priority)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  // Get current user's employee ID to detect "self"
  const { data: currentUserEmployee } = useQuery({
    queryKey: ['current-user-employee'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      // Try to find employee linked via users table (LINE account)
      const { data: lineUser } = await supabase
        .from('users')
        .select('line_user_id')
        .eq('id', user.id)
        .maybeSingle();
      
      if (lineUser?.line_user_id) {
        const { data: employee } = await supabase
          .from('employees')
          .select('id')
          .eq('line_user_id', lineUser.line_user_id)
          .maybeSingle();
        return employee;
      }
      
      return null;
    }
  });

  const { data: employeeRoles } = useQuery({
    queryKey: ['employee-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_roles')
        .select('*')
        .order('priority', { ascending: false });
      
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
        .eq('is_deleted', false)
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
        .select('id, display_name, line_user_id, avatar_url')
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

  // Get LINE users that can be imported (have display_name but not linked to employee)
  const unlinkedLineUsers = lineUsers?.filter(user => {
    // Must have display name (avatar is optional)
    if (!user.display_name) return false;
    // Must not be already linked to an employee
    const isLinked = employees?.some(emp => emp.line_user_id === user.line_user_id);
    return !isLinked;
  }) || [];

  // Get next employee code
  const getNextEmployeeCode = (offset = 0): string => {
    if (!employees || employees.length === 0) return String(1 + offset).padStart(3, '0');
    
    const maxCode = employees.reduce((max, emp) => {
      const num = parseInt(emp.code, 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    
    return String(maxCode + 1 + offset).padStart(3, '0');
  };

  // Get default employee role ID (พนักงาน)
  const defaultEmployeeRoleId = employeeRoles?.find(r => r.role_key === 'employee')?.id;

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Auto-determine status based on required fields
      const isComplete = data.full_name && data.role_id && data.branch_id;
      
      // Convert empty strings to null for UUID fields to prevent Postgres errors
      const cleanedData = {
        ...data,
        branch_id: data.branch_id || null,
        role_id: data.role_id || null,
        status: isComplete ? 'active' : 'new'
      };
      
      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update(cleanedData)
          .eq('id', editingEmployee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employees')
          .insert(cleanedData);
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

  // Bulk import mutation
  const bulkImportMutation = useMutation({
    mutationFn: async (lineUserIds: string[]) => {
      const employeesToCreate = lineUserIds.map((lineUserId, index) => {
        const user = lineUsers?.find(u => u.line_user_id === lineUserId);
        return {
          code: getNextEmployeeCode(index),
          full_name: user?.display_name || lineUserId,
          line_user_id: lineUserId,
          role_id: defaultEmployeeRoleId,
          status: 'new',
          is_active: true
        };
      });
      
      const { error } = await supabase
        .from('employees')
        .insert(employeesToCreate);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setImportDialogOpen(false);
      setSelectedImportUsers([]);
      toast({
        title: 'สำเร็จ',
        description: `Import พนักงานเรียบร้อย`,
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
      role_id: null,
      branch_id: '',
      line_user_id: '',
      announcement_group_line_id: '',
      is_active: true
    });
    setEditingEmployee(null);
  };

  const handleEdit = (employee: any) => {
    setEditingEmployee(employee);
    setFormData({
      code: employee.code,
      full_name: employee.full_name,
      role_id: employee.role_id || null,
      branch_id: employee.branch_id || '',
      line_user_id: employee.line_user_id || '',
      announcement_group_line_id: employee.announcement_group_line_id || '',
      is_active: employee.is_active
    });
    setDialogOpen(true);
  };

  const validateForm = () => {
    if (!formData.code) return "Employee code is required";
    if (!formData.full_name) return "Full name is required";
    if (!formData.role_id) return "Role is required";
    
    const duplicateCode = employees?.some(
      emp => emp.code === formData.code && emp.id !== editingEmployee?.id
    );
    if (duplicateCode) return "Employee code already exists";
    
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
            <div className="flex gap-2 w-full sm:w-auto">
              {/* Import from LINE Dialog */}
              <Dialog open={importDialogOpen} onOpenChange={(open) => {
                setImportDialogOpen(open);
                if (!open) setSelectedImportUsers([]);
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={unlinkedLineUsers.length === 0} className="flex-1 sm:flex-none">
                    <Download className="h-4 w-4 mr-2" />
                    Import LINE ({unlinkedLineUsers.length})
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Import จาก LINE</DialogTitle>
                    <DialogDescription>
                      เลือก LINE users ที่ต้องการ import เป็นพนักงาน รหัสจะรันต่อจาก {getNextEmployeeCode()} โดยอัตโนมัติ
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {unlinkedLineUsers.map((user, index) => {
                      const isSelected = selectedImportUsers.includes(user.line_user_id);
                      const selectedIndex = selectedImportUsers.indexOf(user.line_user_id);
                      const willGetCode = isSelected ? getNextEmployeeCode(selectedIndex) : null;
                      
                      return (
                        <div
                          key={user.id}
                          className={cn(
                            "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                            isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          )}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedImportUsers(selectedImportUsers.filter(id => id !== user.line_user_id));
                            } else {
                              setSelectedImportUsers([...selectedImportUsers, user.line_user_id]);
                            }
                          }}
                        >
                          <Checkbox checked={isSelected} />
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback>{user.display_name?.[0] || '?'}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{user.display_name}</div>
                            {willGetCode && (
                              <div className="text-xs text-muted-foreground">
                                รหัส: {willGetCode}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {unlinkedLineUsers.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        ไม่มี LINE users ที่พร้อม import
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      onClick={() => bulkImportMutation.mutate(selectedImportUsers)}
                      disabled={selectedImportUsers.length === 0 || bulkImportMutation.isPending}
                      className="flex-1"
                    >
                      {bulkImportMutation.isPending ? 'กำลัง Import...' : `Import ${selectedImportUsers.length} คน`}
                    </Button>
                    <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                      ยกเลิก
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Add Employee Dialog */}
              <Dialog open={dialogOpen} onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="flex-1 sm:flex-none">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Employee
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingEmployee ? 'Edit' : 'Add'} Employee</DialogTitle>
                  <DialogDescription>
                    {editingEmployee ? 'Update basic' : 'Create a new'} employee information. 
                    {editingEmployee && ' For time settings, use the Settings button.'}
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
                    <Label htmlFor="role_id">Role *</Label>
                    <Select 
                      value={formData.role_id || ''} 
                      onValueChange={(value) => setFormData({ ...formData, role_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {employeeRoles
                          ?.filter(role => canAssignEmployeeRole(role.priority))
                          .map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.display_name_th} ({role.display_name_en})
                          </SelectItem>
                        ))}
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
                    <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen} modal={true}>
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
                      <PopoverContent className="w-[400px] p-0 z-[100]" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput 
                            placeholder="Search LINE users..." 
                            value={userSearchTerm}
                            onValueChange={setUserSearchTerm}
                          />
                          <CommandList className="max-h-[200px] overflow-y-auto overscroll-contain">
                            <CommandEmpty>No user found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="none"
                                onSelect={() => {
                                  setFormData({ ...formData, line_user_id: '' });
                                  setUserSearchOpen(false);
                                  setUserSearchTerm('');
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    !formData.line_user_id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                (None - Not linked)
                              </CommandItem>
                              {lineUsers
                                ?.filter(user => 
                                  !userSearchTerm || 
                                  user.display_name?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                                  user.line_user_id.toLowerCase().includes(userSearchTerm.toLowerCase())
                                )
                                .map((user) => (
                                <CommandItem
                                  key={user.id}
                                  value={user.line_user_id}
                                  onSelect={() => {
                                    const updates: Partial<typeof formData> = { line_user_id: user.line_user_id };
                                    
                                    // Auto-fill name if empty
                                    if (!formData.full_name && user.display_name) {
                                      updates.full_name = user.display_name;
                                    }
                                    
                                    // Auto-fill code if empty
                                    if (!formData.code) {
                                      updates.code = getNextEmployeeCode();
                                    }
                                    
                                    setFormData({ ...formData, ...updates });
                                    setUserSearchOpen(false);
                                    setUserSearchTerm('');
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.line_user_id === user.line_user_id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <Avatar className="h-6 w-6 mr-2">
                                    <AvatarImage src={user.avatar_url || undefined} />
                                    <AvatarFallback>{user.display_name?.[0] || '?'}</AvatarFallback>
                                  </Avatar>
                                  {user.display_name || 'Unknown'}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground mt-1">
                      Link to LINE account for notifications
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="announcement_group">Announcement Group</Label>
                    <Popover open={groupSearchOpen} onOpenChange={setGroupSearchOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={groupSearchOpen}
                          className="w-full justify-between"
                        >
                          {formData.announcement_group_line_id
                            ? lineGroups?.find((group) => group.line_group_id === formData.announcement_group_line_id)?.display_name
                            : "Select LINE group..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0 z-[100]" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput 
                            placeholder="Search LINE groups..." 
                            value={groupSearchTerm}
                            onValueChange={setGroupSearchTerm}
                          />
                          <CommandList className="max-h-[200px] overflow-y-auto overscroll-contain">
                            <CommandEmpty>No group found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="none"
                                onSelect={() => {
                                  setFormData({ ...formData, announcement_group_line_id: '' });
                                  setGroupSearchOpen(false);
                                  setGroupSearchTerm('');
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    !formData.announcement_group_line_id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                (None)
                              </CommandItem>
                              {lineGroups
                                ?.filter(group => 
                                  !groupSearchTerm || 
                                  group.display_name?.toLowerCase().includes(groupSearchTerm.toLowerCase()) ||
                                  group.line_group_id.toLowerCase().includes(groupSearchTerm.toLowerCase())
                                )
                                .map((group) => (
                                <CommandItem
                                  key={group.id}
                                  value={group.line_group_id}
                                  onSelect={() => {
                                    setFormData({ ...formData, announcement_group_line_id: group.line_group_id });
                                    setGroupSearchOpen(false);
                                    setGroupSearchTerm('');
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
              {employees?.map((employee) => {
                // Check permissions for this employee
                const isSelf = currentUserEmployee?.id === employee.id;
                const employeePriority = employee.employee_role?.priority ?? 0;
                const { canEdit, canView } = canManageEmployee(employeePriority, isSelf);
                
                return (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium font-mono text-xs sm:text-sm py-2">{employee.code}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs sm:text-sm">{employee.full_name}</span>
                      <span className="text-xs text-muted-foreground sm:hidden">
                        {employee.employee_role?.display_name_th || employee.role || 'No role'}
                      </span>
                      {/* Special status badges */}
                      <div className="flex flex-wrap gap-1">
                        {employee.skip_attendance_tracking && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
                            👔 ไม่ track
                          </Badge>
                        )}
                        {employee.exclude_from_points && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/50 dark:text-slate-300 dark:border-slate-700">
                            🎯 ไม่รับ point
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell py-2">
                    <span className="text-xs sm:text-sm">
                      {employee.employee_role?.display_name_th || employee.role || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs sm:text-sm py-2">
                    {employee.branch?.name || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs py-2">
                    {employee.working_time_type === 'hours_based' ? (
                      <span className="text-blue-600 dark:text-blue-400">
                        {employee.hours_per_day}h ({employee.allowed_work_start_time?.substring(0, 5)}-{employee.allowed_work_end_time?.substring(0, 5)})
                      </span>
                    ) : employee.shift_start_time ? (
                      <>
                        {employee.shift_start_time.substring(0, 5)} - {employee.shift_end_time?.substring(0, 5)}
                      </>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell py-2">
                    {employee.line_user_id ? (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <LinkIcon className="h-3 w-3" />
                        Linked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Not linked</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge 
                      variant={
                        employee.status === 'new' ? 'secondary' : 
                        employee.status === 'active' || employee.is_active ? 'default' : 'outline'
                      }
                      className={cn(
                        "text-xs",
                        employee.status === 'new' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200"
                      )}
                    >
                      {employee.status === 'new' ? 'New' : employee.status === 'active' || employee.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <div className="flex justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        disabled={!canEdit}
                        className={cn(
                          "h-7 w-7 sm:h-8 sm:w-8",
                          !canEdit && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={() => canEdit && handleEdit(employee)}
                        title={canEdit ? "Edit" : isSelf ? "ไม่สามารถแก้ไขตัวเองได้" : "ไม่มีสิทธิ์แก้ไข"}
                      >
                        <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        disabled={!canView}
                        className={cn(
                          "h-7 w-7 sm:h-8 sm:w-8",
                          !canView && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={() => canView && navigate(`/attendance/employees/${employee.id}/history`)}
                        title={canView ? "View History" : "ไม่มีสิทธิ์ดู"}
                      >
                        <History className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        disabled={!canEdit}
                        className={cn(
                          "h-7 w-7 sm:h-8 sm:w-8",
                          !canEdit && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={() => canEdit && navigate(`/attendance/employees/${employee.id}/settings`)}
                        title={canEdit ? "Time & OT Settings" : isSelf ? "ไม่สามารถแก้ไขตัวเองได้" : "ไม่มีสิทธิ์แก้ไข"}
                      >
                        <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        disabled={!canView}
                        className={cn(
                          "h-7 w-7 sm:h-8 sm:w-8",
                          !canView && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={() => canView && navigate(`/attendance/employees/${employee.id}`)}
                        title={canView ? "View Detail" : "ไม่มีสิทธิ์ดู"}
                      >
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {(!employees || employees.length === 0) && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No employees found. Click "Add Employee" to create one.
            </div>
          )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
