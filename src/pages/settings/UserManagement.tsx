import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { UserPlus, Shield, Trash2, Edit2, Search, Users, Crown, ShieldCheck, User } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useAdminRole } from '@/hooks/useAdminRole';

type AppRole = 'admin' | 'owner' | 'executive' | 'manager' | 'field' | 'moderator' | 'user';

interface UserWithRole {
  id: string;
  user_id: string;
  role: AppRole;
  granted_at: string;
  email?: string;
}

const roleConfig: Record<AppRole, { label: string; color: string; icon: typeof Shield }> = {
  owner: { label: 'Owner', color: 'bg-amber-500', icon: Crown },
  admin: { label: 'Admin', color: 'bg-red-500', icon: ShieldCheck },
  executive: { label: 'Executive', color: 'bg-purple-500', icon: Shield },
  manager: { label: 'Manager', color: 'bg-blue-500', icon: Shield },
  field: { label: 'Field', color: 'bg-green-500', icon: User },
  moderator: { label: 'Moderator', color: 'bg-orange-500', icon: Shield },
  user: { label: 'User', color: 'bg-gray-500', icon: User },
};

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [emailSearch, setEmailSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('admin');
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin } = useAdminRole();

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  // Fetch all users with roles
  const { data: usersWithRoles, isLoading } = useQuery({
    queryKey: ['webapp-users-with-roles'],
    queryFn: async () => {
      // Get all user_roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (rolesError) throw rolesError;

      // Get user emails from auth admin API via edge function would be ideal
      // For now, we'll show user_id and role
      return roles as UserWithRole[];
    },
  });

  // Search for user by email
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['search-auth-users', emailSearch],
    queryFn: async () => {
      if (!emailSearch || emailSearch.length < 3) return [];
      
      // This would ideally call an edge function that uses admin API
      // For now, we just check if user already has a role
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .limit(10);
      
      return data || [];
    },
    enabled: emailSearch.length >= 3,
  });

  // Add user role mutation
  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('เพิ่ม role สำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['webapp-users-with-roles'] });
      setIsAddDialogOpen(false);
      setEmailSearch('');
    },
    onError: (error: any) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    },
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('อัพเดท role สำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['webapp-users-with-roles'] });
      setIsEditDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    },
  });

  // Delete user role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('ลบ role สำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['webapp-users-with-roles'] });
    },
    onError: (error: any) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    },
  });

  const filteredUsers = usersWithRoles?.filter(user => 
    user.user_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddByUserId = () => {
    if (!emailSearch.trim()) {
      toast.error('กรุณาใส่ User ID');
      return;
    }
    addRoleMutation.mutate({ userId: emailSearch.trim(), role: selectedRole });
  };

  const handleEditRole = () => {
    if (!selectedUser) return;
    updateRoleMutation.mutate({ id: selectedUser.id, role: selectedRole });
  };

  const handleDelete = (user: UserWithRole) => {
    if (user.user_id === currentUser?.id) {
      toast.error('ไม่สามารถลบ role ของตัวเองได้');
      return;
    }
    if (confirm(`ต้องการลบ role "${user.role}" หรือไม่?`)) {
      deleteRoleMutation.mutate(user.id);
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                จัดการผู้ใช้งาน Dashboard
              </CardTitle>
              <CardDescription>
                จัดการ roles สำหรับผู้ใช้งานระบบ Admin Dashboard
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  เพิ่มผู้ใช้
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>เพิ่ม Role ให้ผู้ใช้</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>User ID (จาก auth.users)</Label>
                    <Input
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={emailSearch}
                      onChange={(e) => setEmailSearch(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      ใส่ UUID ของ user จาก auth.users table
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(roleConfig).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <config.icon className="h-4 w-4" />
                              {config.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    ยกเลิก
                  </Button>
                  <Button onClick={handleAddByUserId} disabled={addRoleMutation.isPending}>
                    {addRoleMutation.isPending ? 'กำลังเพิ่ม...' : 'เพิ่ม Role'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหา User ID หรือ Role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredUsers && filteredUsers.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>วันที่เพิ่ม</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const config = roleConfig[user.role] || roleConfig.user;
                    const isCurrentUser = user.user_id === currentUser?.id;
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-2">
                            {user.user_id.slice(0, 8)}...
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-xs">คุณ</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${config.color} text-white`}>
                            <config.icon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(user.granted_at), 'd MMM yyyy', { locale: th })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setSelectedRole(user.role);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(user)}
                              disabled={isCurrentUser || deleteRoleMutation.isPending}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>ยังไม่มีผู้ใช้งานในระบบ</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไข Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User ID</Label>
              <Input value={selectedUser?.user_id || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={handleEditRole} disabled={updateRoleMutation.isPending}>
              {updateRoleMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
