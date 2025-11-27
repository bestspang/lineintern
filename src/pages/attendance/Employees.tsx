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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Plus, Edit, Link as LinkIcon, Check, ChevronsUpDown, Eye, Clock, History, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AttendanceEmployees() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  
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
          branch:branches(name),
          employee_role:employee_roles(id, display_name_th, display_name_en, role_key)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
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
    mutationFn: async (data: typeof formData) => {
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
                        {employeeRoles?.map((role) => (
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
                                    !formData.line_user_id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                (None - Not linked)
                              </CommandItem>
                              {lineUsers?.map((user) => (
                                <CommandItem
                                  key={user.id}
                                  value={user.display_name || user.line_user_id}
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
                            : "Select LINE group..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search LINE groups..." />
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
                                    !formData.announcement_group_line_id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                (None)
                              </CommandItem>
                              {lineGroups?.map((group) => (
                                <CommandItem
                                  key={group.id}
                                  value={group.display_name || group.line_group_id}
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
                      <span className="text-xs sm:text-sm">{employee.full_name}</span>
                      <span className="text-xs text-muted-foreground sm:hidden">
                        {employee.employee_role?.display_name_th || employee.role || 'No role'}
                      </span>
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
                    <Badge variant={employee.is_active ? 'default' : 'secondary'} className="text-xs">
                      {employee.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <div className="flex justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => handleEdit(employee)}
                        title="Edit"
                      >
                        <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => navigate(`/attendance/employees/${employee.id}/history`)}
                        title="View History"
                      >
                        <History className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => navigate(`/attendance/employees/${employee.id}/settings`)}
                        title="Time & OT Settings"
                      >
                        <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => navigate(`/attendance/employees/${employee.id}`)}
                        title="View Detail"
                      >
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
