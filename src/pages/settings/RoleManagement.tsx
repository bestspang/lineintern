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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Shield, Crown, ShieldCheck, User, Settings2, Users, Briefcase, Eye, ChevronDown, ChevronRight, CheckSquare, Square } from 'lucide-react';
import { useAdminRole } from '@/hooks/useAdminRole';

type AppRole = 'admin' | 'owner' | 'executive' | 'manager' | 'field' | 'moderator' | 'user';

interface MenuConfig {
  id: string;
  role: AppRole;
  menu_group: string;
  can_access: boolean;
}

interface PageConfig {
  id: string;
  role: AppRole;
  menu_group: string;
  page_path: string;
  page_name: string;
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
  const [pendingMenuChanges, setPendingMenuChanges] = useState<Record<string, boolean>>({});
  const [pendingPageChanges, setPendingPageChanges] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
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

  // Fetch page configs
  const { data: pageConfigs, isLoading: pageConfigsLoading } = useQuery({
    queryKey: ['webapp-page-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webapp_page_config')
        .select('*')
        .order('role')
        .order('menu_group')
        .order('page_name');

      if (error) throw error;
      return data as PageConfig[];
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
    mutationFn: async (updates: { 
      role: AppRole; 
      menuConfigs: Record<string, boolean>;
      pageConfigs: Record<string, boolean>;
    }) => {
      const { role, menuConfigs: menuChanges, pageConfigs: pageChanges } = updates;
      
      // Update menu configs
      for (const [menuGroup, canAccess] of Object.entries(menuChanges)) {
        const { error } = await supabase
          .from('webapp_menu_config')
          .update({ can_access: canAccess })
          .eq('role', role)
          .eq('menu_group', menuGroup);

        if (error) throw error;
      }

      // Update page configs
      for (const [pagePath, canAccess] of Object.entries(pageChanges)) {
        const { error } = await supabase
          .from('webapp_page_config')
          .update({ can_access: canAccess })
          .eq('role', role)
          .eq('page_path', pagePath);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('บันทึกสิทธิ์เรียบร้อย');
      queryClient.invalidateQueries({ queryKey: ['webapp-menu-config'] });
      queryClient.invalidateQueries({ queryKey: ['webapp-page-config'] });
      setIsDialogOpen(false);
      setPendingMenuChanges({});
      setPendingPageChanges({});
    },
    onError: (error: any) => {
      toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
    },
  });

  const handleOpenPermissions = (role: AppRole) => {
    setSelectedRole(role);
    setPendingMenuChanges({});
    setPendingPageChanges({});
    setExpandedGroups({});
    setIsDialogOpen(true);
  };

  const handleToggleMenuPermission = (menuGroup: string, currentValue: boolean) => {
    setPendingMenuChanges(prev => ({
      ...prev,
      [menuGroup]: prev[menuGroup] !== undefined ? !prev[menuGroup] : !currentValue,
    }));
  };

  const handleTogglePagePermission = (pagePath: string, currentValue: boolean) => {
    setPendingPageChanges(prev => ({
      ...prev,
      [pagePath]: prev[pagePath] !== undefined ? !prev[pagePath] : !currentValue,
    }));
  };

  const handleToggleAllPagesInGroup = (menuGroup: string, enable: boolean) => {
    if (!selectedRole) return;
    const pages = getPageConfigs(selectedRole, menuGroup);
    const newChanges: Record<string, boolean> = {};
    pages.forEach(page => {
      newChanges[page.page_path] = enable;
    });
    setPendingPageChanges(prev => ({ ...prev, ...newChanges }));
  };

  const handleSavePermissions = () => {
    if (!selectedRole) {
      setIsDialogOpen(false);
      return;
    }
    
    const hasChanges = Object.keys(pendingMenuChanges).length > 0 || Object.keys(pendingPageChanges).length > 0;
    if (!hasChanges) {
      setIsDialogOpen(false);
      return;
    }
    
    updateConfigMutation.mutate({ 
      role: selectedRole, 
      menuConfigs: pendingMenuChanges,
      pageConfigs: pendingPageChanges,
    });
  };

  const getRoleMenuConfigs = (role: AppRole) => {
    return menuConfigs?.filter(c => c.role === role) || [];
  };

  const getPageConfigs = (role: AppRole, menuGroup: string) => {
    return pageConfigs?.filter(c => c.role === role && c.menu_group === menuGroup) || [];
  };

  const getEffectiveMenuValue = (menuGroup: string, currentValue: boolean) => {
    return pendingMenuChanges[menuGroup] !== undefined ? pendingMenuChanges[menuGroup] : currentValue;
  };

  const getEffectivePageValue = (pagePath: string, currentValue: boolean) => {
    return pendingPageChanges[pagePath] !== undefined ? pendingPageChanges[pagePath] : currentValue;
  };

  const toggleGroupExpanded = (menuGroup: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [menuGroup]: !prev[menuGroup],
    }));
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
            กำหนดสิทธิ์การเข้าถึงเมนูและหน้าย่อยสำหรับแต่ละ Role
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || pageConfigsLoading ? (
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
                    const roleConfigs = getRoleMenuConfigs(role);
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
        <DialogContent className="max-w-2xl max-h-[90vh]">
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
          
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-2">
              {selectedRole && Object.entries(menuGroupLabels).map(([menuGroup, labelConfig]) => {
                const menuConfig = getRoleMenuConfigs(selectedRole).find(c => c.menu_group === menuGroup);
                const isMenuChecked = menuConfig ? getEffectiveMenuValue(menuGroup, menuConfig.can_access) : false;
                const hasMenuConfig = !!menuConfig;
                const pages = getPageConfigs(selectedRole, menuGroup);
                const isExpanded = expandedGroups[menuGroup];
                const enabledPagesCount = pages.filter(p => getEffectivePageValue(p.page_path, p.can_access)).length;

                return (
                  <Collapsible 
                    key={menuGroup} 
                    open={isExpanded}
                    onOpenChange={() => toggleGroupExpanded(menuGroup)}
                  >
                    <div 
                      className={`rounded-lg border ${
                        !hasMenuConfig ? 'opacity-50' : ''
                      } ${isMenuChecked ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}`}
                    >
                      {/* Menu Group Header */}
                      <div className="flex items-center gap-3 p-3">
                        <Checkbox
                          id={menuGroup}
                          checked={isMenuChecked}
                          disabled={!hasMenuConfig}
                          onCheckedChange={() => {
                            if (menuConfig) {
                              handleToggleMenuPermission(menuGroup, menuConfig.can_access);
                            }
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <label htmlFor={menuGroup} className="font-medium cursor-pointer">
                            {labelConfig.label}
                          </label>
                          <div className="text-sm text-muted-foreground">{labelConfig.description}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {pages.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {enabledPagesCount}/{pages.length} หน้า
                            </Badge>
                          )}
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>

                      {/* Page-level Permissions */}
                      <CollapsibleContent>
                        {pages.length > 0 && (
                          <div className="border-t px-3 pb-3 pt-2">
                            {/* Quick Actions */}
                            <div className="flex gap-2 mb-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => handleToggleAllPagesInGroup(menuGroup, true)}
                              >
                                <CheckSquare className="h-3 w-3 mr-1" />
                                เปิดทั้งหมด
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => handleToggleAllPagesInGroup(menuGroup, false)}
                              >
                                <Square className="h-3 w-3 mr-1" />
                                ปิดทั้งหมด
                              </Button>
                            </div>
                            
                            {/* Page List */}
                            <div className="grid grid-cols-2 gap-2">
                              {pages.map(page => {
                                const isPageChecked = getEffectivePageValue(page.page_path, page.can_access);
                                return (
                                  <div 
                                    key={page.page_path}
                                    className={`flex items-center gap-2 p-2 rounded text-sm ${
                                      isPageChecked ? 'bg-primary/10' : 'bg-muted/50'
                                    }`}
                                  >
                                    <Checkbox
                                      id={page.page_path}
                                      checked={isPageChecked}
                                      onCheckedChange={() => handleTogglePagePermission(page.page_path, page.can_access)}
                                      className="h-4 w-4"
                                    />
                                    <label 
                                      htmlFor={page.page_path} 
                                      className="cursor-pointer truncate flex-1"
                                      title={page.page_path}
                                    >
                                      {page.page_name}
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
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
              disabled={updateConfigMutation.isPending}
            >
              {updateConfigMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
