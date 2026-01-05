import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { UserPlus, Shield, Trash2, Edit2, Search, Users, Crown, ShieldCheck, User, Briefcase, Eye, Mail, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useAdminRole } from '@/hooks/useAdminRole';

type AppRole = 'admin' | 'owner' | 'executive' | 'manager' | 'field' | 'moderator' | 'user';

interface UserWithRole {
  user_id: string;
  email: string | null;
  user_created_at: string;
  role_id: string | null;
  role: AppRole | null;
  granted_at: string | null;
}

const roleConfig: Record<AppRole, { label: string; labelTh: string; color: string; bgColor: string; icon: typeof Shield }> = {
  owner: { label: 'Owner', labelTh: 'เจ้าของ', color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-900/30', icon: Crown },
  admin: { label: 'Admin', labelTh: 'แอดมิน', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30', icon: ShieldCheck },
  executive: { label: 'Executive', labelTh: 'ผู้บริหาร', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30', icon: Briefcase },
  manager: { label: 'Manager', labelTh: 'หัวหน้า', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30', icon: Users },
  moderator: { label: 'Moderator', labelTh: 'ผู้ดูแล', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30', icon: Eye },
  field: { label: 'Field', labelTh: 'ภาคสนาม', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30', icon: User },
  user: { label: 'User', labelTh: 'ผู้ใช้', color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-800', icon: User },
};

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('admin');
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  // Fetch all users with roles using RPC function
  const { data: usersWithRoles, isLoading } = useQuery({
    queryKey: ['webapp-users-with-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_webapp_users');
      if (error) throw error;
      return data as UserWithRole[];
    },
  });

  // Add user role mutation
  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // First check if user already has a role
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        throw new Error('ผู้ใช้นี้มี Role อยู่แล้ว กรุณาแก้ไข Role แทน');
      }

      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('เพิ่ม role สำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['webapp-users-with-roles'] });
      setIsAddDialogOpen(false);
      setNewUserEmail('');
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
    user.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleAddByUserId = () => {
    if (!newUserEmail.trim()) {
      toast.error('กรุณาใส่ User ID');
      return;
    }
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(newUserEmail.trim())) {
      toast.error('รูปแบบ User ID ไม่ถูกต้อง (ต้องเป็น UUID)');
      return;
    }
    addRoleMutation.mutate({ userId: newUserEmail.trim(), role: selectedRole });
  };

  const handleEditRole = () => {
    if (!selectedUser || !selectedUser.role_id) return;
    updateRoleMutation.mutate({ id: selectedUser.role_id, role: selectedRole });
  };

  const handleDelete = (user: UserWithRole) => {
    if (user.user_id === currentUser?.id) {
      toast.error('ไม่สามารถลบ role ของตัวเองได้');
      return;
    }
    if (!user.role || !user.role_id) return;
    if (confirm(`ต้องการลบ role "${roleConfig[user.role].label}" หรือไม่?`)) {
      deleteRoleMutation.mutate(user.role_id);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
                กำหนด Role สำหรับผู้ใช้งานระบบ Admin Dashboard
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
                  <DialogDescription>
                    ใส่ User ID ของผู้ใช้ที่ต้องการเพิ่ม Role
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>User ID</Label>
                    <Input
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      UUID ของ user ที่ได้จากการสมัครสมาชิก
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
                              <config.icon className={`h-4 w-4 ${config.color}`} />
                              <span>{config.label}</span>
                              <span className="text-muted-foreground">({config.labelTh})</span>
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
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหา User ID, Email หรือ Role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary" className="hidden sm:flex">
              {filteredUsers?.length || 0} ผู้ใช้
            </Badge>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredUsers && filteredUsers.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ผู้ใช้</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden sm:table-cell">วันที่เพิ่ม</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const hasRole = user.role !== null;
                    const config = hasRole ? (roleConfig[user.role as AppRole] || roleConfig.user) : null;
                    const isCurrentUser = user.user_id === currentUser?.id;
                    const IconComponent = config?.icon || User;
                    
                    return (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <div className="space-y-1">
                            {user.email && (
                              <div className="flex items-center gap-1.5 text-sm font-medium">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                {user.email}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {user.user_id.slice(0, 8)}...{user.user_id.slice(-4)}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => handleCopyId(user.user_id)}
                              >
                                {copiedId === user.user_id ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                              {isCurrentUser && (
                                <Badge variant="outline" className="text-xs">คุณ</Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasRole && config ? (
                            <Badge className={`${config.bgColor} ${config.color} border-0`}>
                              <IconComponent className="h-3 w-3 mr-1" />
                              {config.label}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              ยังไม่กำหนด Role
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {user.granted_at ? format(new Date(user.granted_at), 'd MMM yyyy', { locale: th }) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {hasRole ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setSelectedRole(user.role as AppRole);
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
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setNewUserEmail(user.user_id);
                                  setSelectedRole('field');
                                  setIsAddDialogOpen(true);
                                }}
                              >
                                <UserPlus className="h-4 w-4 mr-1" />
                                กำหนด Role
                              </Button>
                            )}
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
              <p className="text-sm mt-1">กดปุ่ม "เพิ่มผู้ใช้" เพื่อเพิ่มผู้ใช้ใหม่</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไข Role</DialogTitle>
            <DialogDescription>
              เปลี่ยน Role สำหรับผู้ใช้นี้
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User ID</Label>
              <div className="flex items-center gap-2">
                <Input value={selectedUser?.user_id || ''} disabled className="font-mono text-sm" />
                {selectedUser && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyId(selectedUser.user_id)}
                  >
                    {copiedId === selectedUser.user_id ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
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
                        <config.icon className={`h-4 w-4 ${config.color}`} />
                        <span>{config.label}</span>
                        <span className="text-muted-foreground">({config.labelTh})</span>
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
