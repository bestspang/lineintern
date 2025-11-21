import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Plus, Edit, Link as LinkIcon } from 'lucide-react';

export default function AttendanceEmployees() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    full_name: '',
    role: 'office',
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
      is_active: true
    });
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
      is_active: employee.is_active
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
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
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Employees
              </CardTitle>
              <CardDescription>
                Manage employee records and LINE account linking
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
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
                    <Label htmlFor="line_user_id">LINE User ID</Label>
                    <Input
                      id="line_user_id"
                      value={formData.line_user_id}
                      onChange={(e) => setFormData({ ...formData, line_user_id: e.target.value })}
                      placeholder="U1234567890abcdef"
                    />
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>LINE Linked</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees?.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.code}</TableCell>
                  <TableCell>{employee.full_name}</TableCell>
                  <TableCell className="capitalize">{employee.role}</TableCell>
                  <TableCell>{employee.branch?.name || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={employee.line_user_id ? 'default' : 'secondary'}>
                      {employee.line_user_id ? 'Linked' : 'Not Linked'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.is_active ? 'default' : 'secondary'}>
                      {employee.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(employee)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
