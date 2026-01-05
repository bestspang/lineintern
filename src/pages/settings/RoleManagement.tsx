import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Shield, Crown, ShieldCheck, User, Settings2, Users, Briefcase, Eye } from 'lucide-react';
import { useAdminRole } from '@/hooks/useAdminRole';

type AppRole = 'admin' | 'owner' | 'executive' | 'manager' | 'field' | 'moderator' | 'user';

interface MenuConfig {
  id: string;
  role: AppRole;
  menu_group: string;
  can_access: boolean;
}

const roleDefinitions: Record<AppRole, { 
  label: string; 
  labelTh: string;
  description: string; 
  color: string; 
  icon: typeof Shield;
  priority: number;
}> = {
  owner: { 
    label: 'Owner', 
    labelTh: 'เจ้าของกิจการ',
    description: 'สิทธิ์เต็มรูปแบบ เข้าถึงได้ทุกเมนู',
    color: 'bg-amber-500', 
    icon: Crown,
    priority: 1,
  },
  admin: { 
    label: 'Admin', 
    labelTh: 'ผู้ดูแลระบบ',
    description: 'จัดการระบบ ผู้ใช้ และการตั้งค่า',
    color: 'bg-red-500', 
    icon: ShieldCheck,
    priority: 2,
  },
  executive: { 
    label: 'Executive', 
    labelTh: 'ผู้บริหาร',
    description: 'ดูรายงาน วิเคราะห์ข้อมูล',
    color: 'bg-purple-500', 
    icon: Briefcase,
    priority: 3,
  },
  manager: { 
    label: 'Manager', 
    labelTh: 'หัวหน้างาน',
    description: 'จัดการทีม อนุมัติคำขอ',
    color: 'bg-blue-500', 
    icon: Users,
    priority: 4,
  },
  moderator: { 
    label: 'Moderator', 
    labelTh: 'ผู้ดูแลเนื้อหา',
    description: 'จัดการเนื้อหา ตอบคำถาม',
    color: 'bg-orange-500', 
    icon: Eye,
    priority: 5,
  },
  field: { 
    label: 'Field', 
    labelTh: 'พนักงานภาคสนาม',
    description: 'เข้าถึงข้อมูลพื้นฐาน',
    color: 'bg-green-500', 
    icon: User,
    priority: 6,
  },
  user: { 
    label: 'User', 
    labelTh: 'ผู้ใช้ทั่วไป',
    description: 'สิทธิ์พื้นฐานสำหรับผู้ใช้ใหม่',
    color: 'bg-gray-500', 
    icon: User,
    priority: 7,
  },
};

const menuGroupLabels: Record<string, { label: string; description: string }> = {
  'Dashboard': { label: 'Dashboard', description: 'หน้าแรก ภาพรวมระบบ' },
  'Attendance': { label: 'Attendance', description: 'ระบบลงเวลา พนักงาน สาขา' },
  'Management': { label: 'Management', description: 'จัดการงาน คำสั่ง การแจ้งเตือน' },
  'AI Features': { label: 'AI Features', description: 'ความจำ บุคลิกภาพ การวิเคราะห์' },
  'Content & Knowledge': { label: 'Content & Knowledge', description: 'FAQ Knowledge Base การฝึกอบรม' },
  'Configuration': { label: 'Configuration', description: 'ตั้งค่าระบบ การเชื่อมต่อ' },
  'Monitoring & Tools': { label: 'Monitoring & Tools', description: 'Logs การตรวจสอบสุขภาพระบบ' },
};

export default function RoleManagement() {
  const [selectedRole, setSelectedRole] = useState<AppRole | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();
  const { isAdmin } = useAdminRole();

  // Fetch menu configs
  const { data: menuConfigs, isLoading } = useQuery({
    queryKey: ['webapp-menu-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webapp_menu_config')
        .select('*')
        .order('role')
        .order('menu_group');

      if (error) throw error;
      return data as MenuConfig[];
    },
  });

  // Count users per role
  const { data: roleCounts } = useQuery({
    queryKey: ['webapp-role-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role');

      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach((item) => {
        counts[item.role] = (counts[item.role] || 0) + 1;
      });
      return counts;
    },
  });

  // Update menu config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (updates: { role: AppRole; configs: Record<string, boolean> }) => {
      const { role, configs } = updates;
      
      for (const [menuGroup, canAccess] of Object.entries(configs)) {
        const { error } = await supabase
          .from('webapp_menu_config')
          .update({ can_access: canAccess })
          .eq('role', role)
          .eq('menu_group', menuGroup);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('บันทึกสิทธิ์เรียบร้อย');
      queryClient.invalidateQueries({ queryKey: ['webapp-menu-config'] });
      setIsDialogOpen(false);
      setPendingChanges({});
    },
    onError: (error: any) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    },
  });

  const handleOpenPermissions = (role: AppRole) => {
    setSelectedRole(role);
    setPendingChanges({});
    setIsDialogOpen(true);
  };

  const handleTogglePermission = (menuGroup: string, currentValue: boolean) => {
    setPendingChanges(prev => ({
      ...prev,
      [menuGroup]: prev[menuGroup] !== undefined ? !prev[menuGroup] : !currentValue,
    }));
  };

  const handleSavePermissions = () => {
    if (!selectedRole || Object.keys(pendingChanges).length === 0) {
      setIsDialogOpen(false);
      return;
    }
    updateConfigMutation.mutate({ role: selectedRole, configs: pendingChanges });
  };

  const getRoleConfigs = (role: AppRole) => {
    return menuConfigs?.filter(c => c.role === role) || [];
  };

  const getEffectiveValue = (menuGroup: string, currentValue: boolean) => {
    return pendingChanges[menuGroup] !== undefined ? pendingChanges[menuGroup] : currentValue;
  };

  const sortedRoles = Object.entries(roleDefinitions)
    .sort(([, a], [, b]) => a.priority - b.priority);

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
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            จัดการ Roles
          </CardTitle>
          <CardDescription>
            กำหนดสิทธิ์การเข้าถึงเมนูสำหรับแต่ละ Role
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Role</TableHead>
                    <TableHead>คำอธิบาย</TableHead>
                    <TableHead className="text-center w-[100px]">ผู้ใช้</TableHead>
                    <TableHead className="text-center w-[120px]">สิทธิ์เมนู</TableHead>
                    <TableHead className="text-right w-[100px]">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRoles.map(([key, config]) => {
                    const role = key as AppRole;
                    const roleConfigs = getRoleConfigs(role);
                    const accessCount = roleConfigs.filter(c => c.can_access).length;
                    const totalCount = roleConfigs.length;
                    const userCount = roleCounts?.[role] || 0;

                    return (
                      <TableRow key={role}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${config.color}`}>
                              <config.icon className="h-4 w-4 text-white" />
                            </div>
                            <div>
                              <div className="font-medium">{config.label}</div>
                              <div className="text-sm text-muted-foreground">{config.labelTh}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {config.description}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">
                            {userCount} คน
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {totalCount > 0 ? (
                            <Badge variant={accessCount === totalCount ? 'default' : 'outline'}>
                              {accessCount}/{totalCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenPermissions(role)}
                          >
                            <Settings2 className="h-4 w-4 mr-1" />
                            สิทธิ์
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRole && (
                <>
                  <div className={`p-1.5 rounded ${roleDefinitions[selectedRole].color}`}>
                    {(() => {
                      const IconComponent = roleDefinitions[selectedRole].icon;
                      return <IconComponent className="h-4 w-4 text-white" />;
                    })()}
                  </div>
                  กำหนดสิทธิ์: {roleDefinitions[selectedRole].label}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-3">
              {selectedRole && Object.entries(menuGroupLabels).map(([menuGroup, labelConfig]) => {
                const config = getRoleConfigs(selectedRole).find(c => c.menu_group === menuGroup);
                const isChecked = config ? getEffectiveValue(menuGroup, config.can_access) : false;
                const hasConfig = !!config;

                return (
                  <div 
                    key={menuGroup} 
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      !hasConfig ? 'opacity-50' : ''
                    } ${isChecked ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}`}
                  >
                    <Checkbox
                      id={menuGroup}
                      checked={isChecked}
                      disabled={!hasConfig}
                      onCheckedChange={() => {
                        if (config) {
                          handleTogglePermission(menuGroup, config.can_access);
                        }
                      }}
                      className="mt-0.5"
                    />
                    <label htmlFor={menuGroup} className="flex-1 cursor-pointer">
                      <div className="font-medium">{labelConfig.label}</div>
                      <div className="text-sm text-muted-foreground">{labelConfig.description}</div>
                    </label>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button 
              onClick={handleSavePermissions} 
              disabled={updateConfigMutation.isPending || Object.keys(pendingChanges).length === 0}
            >
              {updateConfigMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
