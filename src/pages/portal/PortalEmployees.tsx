import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, Search, ChevronRight, Building2 } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';

interface EmployeeItem {
  id: string;
  name: string;
  role: string;
  branch: string;
  branchId: string;
  isActive: boolean;
}

export default function PortalEmployees() {
  const navigate = useNavigate();
  const { employee, locale, isAdmin } = usePortal();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [search, setSearch] = useState('');

  const fetchEmployees = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);

    try {
      let query = supabase
        .from('employees')
        .select(`
          id,
          name,
          is_active,
          role:employee_roles(role_name),
          branch:branches(id, name)
        `)
        .eq('is_active', true)
        .order('name');

      // Non-admin sees only their branch
      if (!isAdmin) {
        query = query.eq('branch_id', employee.branch?.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      setEmployees(data?.map((e: any) => ({
        id: e.id,
        name: e.name,
        role: e.role?.role_name || 'พนักงาน',
        branch: e.branch?.name || '-',
        branchId: e.branch?.id,
        isActive: e.is_active,
      })) || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, employee?.branch?.id, isAdmin]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.branch.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          {locale === 'th' ? 'พนักงาน' : 'Employees'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? 'รายชื่อพนักงานในระบบ' : 'Employee directory'}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={locale === 'th' ? 'ค้นหาพนักงาน...' : 'Search employees...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        <Card className="flex-1">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{employees.length}</p>
            <p className="text-xs text-muted-foreground">
              {locale === 'th' ? 'ทั้งหมด' : 'Total'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Employee List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))
        ) : filteredEmployees.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ไม่พบพนักงาน' : 'No employees found'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredEmployees.map((emp) => (
            <Card 
              key={emp.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/portal/employees/${emp.id}`)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {emp.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{emp.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      <span className="truncate">{emp.branch}</span>
                    </div>
                  </div>

                  <Badge variant="secondary" className="text-xs">
                    {emp.role}
                  </Badge>

                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
