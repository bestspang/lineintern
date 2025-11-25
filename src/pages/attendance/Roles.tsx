import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Pencil, Plus, Shield, Trash2 } from 'lucide-react';

interface Role {
  id: string;
  role_key: string;
  display_name_th: string;
  display_name_en: string;
  priority: number;
  is_system: boolean;
}

interface MenuItem {
  id: string;
  menu_key: string;
  display_name_th: string;
  display_name_en: string;
}

export default function Roles() {
  const queryClient = useQueryClient();
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedMenus, setSelectedMenus] = useState<Set<string>>(new Set());

  // Fetch roles
  const { data: roles = [] } = useQuery({
    queryKey: ['employee-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_roles')
        .select('*')
        .order('priority', { ascending: false });
      
      if (error) throw error;
      return data as Role[];
    }
  });

  // Fetch menu items
  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      
      if (error) throw error;
      return data as MenuItem[];
    }
  });

  // Fetch permissions for a role
  const fetchRolePermissions = async (roleId: string) => {
    const { data, error } = await supabase
      .from('role_menu_permissions')
      .select('menu_item_id')
      .eq('role_id', roleId);
    
    if (error) throw error;
    return new Set(data.map(p => p.menu_item_id));
  };

  // Save role mutation
  const saveRoleMutation = useMutation({
    mutationFn: async (roleData: Partial<Role>) => {
      if (roleData.id) {
        const { error } = await supabase
          .from('employee_roles')
          .update({
            role_key: roleData.role_key,
            display_name_th: roleData.display_name_th,
            display_name_en: roleData.display_name_en,
            priority: roleData.priority
          })
          .eq('id', roleData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employee_roles')
          .insert({
            role_key: roleData.role_key!,
            display_name_th: roleData.display_name_th!,
            display_name_en: roleData.display_name_en!,
            priority: roleData.priority || 0
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-roles'] });
      setShowRoleDialog(false);
      setEditingRole(null);
      toast.success('บันทึกสำเร็จ');
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + error.message);
    }
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from('employee_roles')
        .delete()
        .eq('id', roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-roles'] });
      toast.success('ลบสำเร็จ');
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + error.message);
    }
  });

  // Save permissions mutation
  const savePermissionsMutation = useMutation({
    mutationFn: async ({ roleId, menuIds }: { roleId: string; menuIds: Set<string> }) => {
      // Delete existing permissions
      await supabase
        .from('role_menu_permissions')
        .delete()
        .eq('role_id', roleId);
      
      // Insert new permissions
      if (menuIds.size > 0) {
        const permissions = Array.from(menuIds).map(menuId => ({
          role_id: roleId,
          menu_item_id: menuId
        }));
        
        const { error } = await supabase
          .from('role_menu_permissions')
          .insert(permissions);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setShowPermissionsDialog(false);
      setSelectedRole(null);
      setSelectedMenus(new Set());
      toast.success('บันทึกสิทธิ์สำเร็จ');
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + error.message);
    }
  });

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setShowRoleDialog(true);
  };

  const handleEditPermissions = async (role: Role) => {
    setSelectedRole(role);
    const permissions = await fetchRolePermissions(role.id);
    setSelectedMenus(permissions);
    setShowPermissionsDialog(true);
  };

  const handleSaveRole = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    saveRoleMutation.mutate({
      ...editingRole,
      role_key: formData.get('role_key') as string,
      display_name_th: formData.get('display_name_th') as string,
      display_name_en: formData.get('display_name_en') as string,
      priority: parseInt(formData.get('priority') as string)
    });
  };

  const handleToggleMenu = (menuId: string) => {
    const newSet = new Set(selectedMenus);
    if (newSet.has(menuId)) {
      newSet.delete(menuId);
    } else {
      newSet.add(menuId);
    }
    setSelectedMenus(newSet);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">จัดการระดับพนักงาน</h1>
          <p className="text-muted-foreground">กำหนดระดับและสิทธิ์การเข้าถึงเมนู</p>
        </div>
        <Button onClick={() => { setEditingRole(null); setShowRoleDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          เพิ่มระดับใหม่
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>รายการระดับพนักงาน</CardTitle>
          <CardDescription>จัดการระดับและสิทธิ์การเข้าถึงเมนูต่างๆ</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อภาษาไทย</TableHead>
                <TableHead>ชื่อภาษาอังกฤษ</TableHead>
                <TableHead>ลำดับความสำคัญ</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-mono text-sm">{role.role_key}</TableCell>
                  <TableCell>{role.display_name_th}</TableCell>
                  <TableCell>{role.display_name_en}</TableCell>
                  <TableCell>{role.priority}</TableCell>
                  <TableCell>
                    {role.is_system && <Badge variant="secondary">System</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRole(role)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditPermissions(role)}
                      >
                        <Shield className="h-4 w-4" />
                      </Button>
                      {!role.is_system && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRoleMutation.mutate(role.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role Edit Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRole?.id ? 'แก้ไขระดับ' : 'เพิ่มระดับใหม่'}
            </DialogTitle>
            <DialogDescription>
              กำหนดข้อมูลระดับพนักงาน
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveRole}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="role_key">รหัสระดับ</Label>
                <Input
                  id="role_key"
                  name="role_key"
                  defaultValue={editingRole?.role_key}
                  required
                  disabled={editingRole?.is_system}
                />
              </div>
              <div>
                <Label htmlFor="display_name_th">ชื่อภาษาไทย</Label>
                <Input
                  id="display_name_th"
                  name="display_name_th"
                  defaultValue={editingRole?.display_name_th}
                  required
                />
              </div>
              <div>
                <Label htmlFor="display_name_en">ชื่อภาษาอังกฤษ</Label>
                <Input
                  id="display_name_en"
                  name="display_name_en"
                  defaultValue={editingRole?.display_name_en}
                  required
                />
              </div>
              <div>
                <Label htmlFor="priority">ลำดับความสำคัญ</Label>
                <Input
                  id="priority"
                  name="priority"
                  type="number"
                  defaultValue={editingRole?.priority || 0}
                  required
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowRoleDialog(false)}>
                ยกเลิก
              </Button>
              <Button type="submit">บันทึก</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              กำหนดสิทธิ์เมนู: {selectedRole?.display_name_th}
            </DialogTitle>
            <DialogDescription>
              เลือกเมนูที่ระดับนี้สามารถเข้าถึงได้
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {menuItems.map((menu) => (
              <div key={menu.id} className="flex items-center space-x-3 p-2 hover:bg-accent rounded">
                <Checkbox
                  id={menu.id}
                  checked={selectedMenus.has(menu.id)}
                  onCheckedChange={() => handleToggleMenu(menu.id)}
                />
                <label
                  htmlFor={menu.id}
                  className="flex-1 cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{menu.display_name_th}</div>
                    <div className="text-sm text-muted-foreground">{menu.display_name_en}</div>
                  </div>
                  <Badge variant="secondary">{menu.menu_key}</Badge>
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissionsDialog(false)}>
              ยกเลิก
            </Button>
            <Button 
              onClick={() => {
                if (selectedRole) {
                  savePermissionsMutation.mutate({
                    roleId: selectedRole.id,
                    menuIds: selectedMenus
                  });
                }
              }}
            >
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}