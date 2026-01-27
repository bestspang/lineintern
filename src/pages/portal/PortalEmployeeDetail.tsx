import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Wallet, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, subDays } from 'date-fns';
import { th } from 'date-fns/locale';

interface EmployeeData {
  id: string;
  name: string;
  role: string;
  branch: string;
  joinDate?: string;
  isActive: boolean;
}

interface AttendanceStats {
  workDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
}

export default function PortalEmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { locale } = usePortal();
  const [loading, setLoading] = useState(true);
  const [emp, setEmp] = useState<EmployeeData | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    try {
      // Fetch employee
      const { data: empData } = await supabase
        .from('employees')
        .select('*, branch:branches!employees_branch_id_fkey(name)')
        .eq('id', id)
        .maybeSingle();

      if (empData) {
        setEmp({
          id: empData.id,
          name: empData.full_name || 'ไม่ระบุ',
          role: empData.role || 'พนักงาน',
          branch: (empData.branch as any)?.name || '-',
          joinDate: empData.created_at,
          isActive: empData.is_active ?? true,
        });
      }

      // Fetch attendance stats (last 30 days)
      const thirtyDaysAgo = subDays(new Date(), 30);
      const monthStart = startOfMonth(new Date());

      const { data: sessions } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('employee_id', id)
        .gte('work_date', format(monthStart, 'yyyy-MM-dd'));

      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', id)
        .eq('status', 'approved')
        .gte('start_date', format(monthStart, 'yyyy-MM-dd'));

      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', id)
        .gte('server_time', thirtyDaysAgo.toISOString())
        .order('server_time', { ascending: false })
        .limit(10);

      setStats({
        workDays: sessions?.length || 0,
        lateDays: 0,
        absentDays: 0,
        leaveDays: leaves?.length || 0,
      });

      setRecentLogs(logs || []);
    } catch (err) {
      console.error('Error fetching employee:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!emp) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {locale === 'th' ? 'กลับ' : 'Back'}
        </Button>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              {locale === 'th' ? 'ไม่พบข้อมูลพนักงาน' : 'Employee not found'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        {locale === 'th' ? 'กลับ' : 'Back'}
      </Button>

      {/* Profile Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-xl">
                {emp.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{emp.name}</h2>
              <p className="text-sm text-muted-foreground">{emp.branch}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary">{emp.role}</Badge>
                <Badge variant={emp.isActive ? 'default' : 'destructive'}>
                  {emp.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="attendance" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="attendance">
            {locale === 'th' ? 'การเข้างาน' : 'Attendance'}
          </TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="info">
            {locale === 'th' ? 'ข้อมูล' : 'Info'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4 mt-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle className="h-6 w-6 mx-auto text-green-600 mb-2" />
                <p className="text-2xl font-bold">{stats?.workDays || 0}</p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'th' ? 'วันทำงาน' : 'Work Days'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <AlertCircle className="h-6 w-6 mx-auto text-orange-600 mb-2" />
                <p className="text-2xl font-bold">{stats?.lateDays || 0}</p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'th' ? 'สาย' : 'Late'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <XCircle className="h-6 w-6 mx-auto text-rose-600 mb-2" />
                <p className="text-2xl font-bold">{stats?.absentDays || 0}</p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'th' ? 'ขาด' : 'Absent'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Calendar className="h-6 w-6 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold">{stats?.leaveDays || 0}</p>
                <p className="text-xs text-muted-foreground">
                  {locale === 'th' ? 'ลา' : 'Leave'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Logs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {locale === 'th' ? 'ประวัติล่าสุด' : 'Recent Activity'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}
                </p>
              ) : (
                recentLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex justify-between items-center text-sm py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{log.event_type === 'check_in' ? 'เข้างาน' : 'ออกงาน'}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {format(new Date(log.server_time), 'dd MMM HH:mm', { 
                        locale: locale === 'th' ? th : undefined 
                      })}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <Wallet className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">
                  {locale === 'th' ? 'สรุป Payroll เดือนนี้' : 'This Month Payroll'}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground text-center py-8">
                {locale === 'th' ? 'ดูข้อมูล Payroll ในหน้า Admin Dashboard' : 'View payroll in Admin Dashboard'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">
                  {locale === 'th' ? 'สาขา' : 'Branch'}
                </span>
                <span className="font-medium">{emp.branch}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">
                  {locale === 'th' ? 'ตำแหน่ง' : 'Role'}
                </span>
                <span className="font-medium">{emp.role}</span>
              </div>
              {emp.joinDate && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">
                    {locale === 'th' ? 'เริ่มงาน' : 'Join Date'}
                  </span>
                  <span className="font-medium">
                    {format(new Date(emp.joinDate), 'dd MMM yyyy', {
                      locale: locale === 'th' ? th : undefined
                    })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
