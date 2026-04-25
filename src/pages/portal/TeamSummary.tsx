import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, CheckCircle, Clock, XCircle, LogIn, LogOut } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { format } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { formatBangkokTime, getBangkokNow } from '@/lib/timezone';
import { isCheckInType, isCheckOutType } from '@/lib/portal-attendance';

interface EmployeeData {
  id: string;
  full_name: string;
  nickname: string | null;
}

interface AttendanceLog {
  employee_id: string;
  event_type: string;
  server_time: string;
}

interface EmployeeStatus {
  id: string;
  full_name: string;
  status: 'checked_in' | 'checked_out' | 'not_checked_in';
  check_in_time: string | null;
  check_out_time: string | null;
}

interface TeamStats {
  total: number;
  checkedIn: number;
  checkedOut: number;
  notCheckedIn: number;
}

export default function TeamSummary() {
  const { employee, locale, isAdmin } = usePortal();
  const [employees, setEmployees] = useState<EmployeeStatus[]>([]);
  const [stats, setStats] = useState<TeamStats>({ total: 0, checkedIn: 0, checkedOut: 0, notCheckedIn: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeamStatus = async () => {
      if (!employee?.id) return;

      const { data, error } = await portalApi<{
        employees: EmployeeData[];
        attendance: AttendanceLog[];
      }>({
        endpoint: 'team-summary',
        employee_id: employee.id
      });

      if (error || !data) {
        setLoading(false);
        return;
      }

      const { employees: employeeList, attendance: logs } = data;

      // Build employee status map
      const statusMap: Record<string, { checkIn: string | null; checkOut: string | null }> = {};
      logs?.forEach((log) => {
        if (!statusMap[log.employee_id]) {
          statusMap[log.employee_id] = { checkIn: null, checkOut: null };
        }
        if (isCheckInType(log.event_type)) {
          statusMap[log.employee_id].checkIn = log.server_time;
        } else if (isCheckOutType(log.event_type)) {
          statusMap[log.employee_id].checkOut = log.server_time;
        }
      });

      // Map employees with their status
      const employeesWithStatus: EmployeeStatus[] = employeeList.map((emp) => {
        const attendance = statusMap[emp.id];
        let status: EmployeeStatus['status'] = 'not_checked_in';
        
        if (attendance?.checkOut) {
          status = 'checked_out';
        } else if (attendance?.checkIn) {
          status = 'checked_in';
        }

        return {
          id: emp.id,
          full_name: emp.full_name,
          status,
          check_in_time: attendance?.checkIn || null,
          check_out_time: attendance?.checkOut || null,
        };
      });

      setEmployees(employeesWithStatus);

      // Calculate stats
      setStats({
        total: employeesWithStatus.length,
        checkedIn: employeesWithStatus.filter((e) => e.status === 'checked_in').length,
        checkedOut: employeesWithStatus.filter((e) => e.status === 'checked_out').length,
        notCheckedIn: employeesWithStatus.filter((e) => e.status === 'not_checked_in').length,
      });

      setLoading(false);
    };

    fetchTeamStatus();
  }, [employee?.id]);

  const dateLocale = locale === 'th' ? th : enUS;

  const getStatusBadge = (status: EmployeeStatus['status']) => {
    switch (status) {
      case 'checked_in':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <LogIn className="h-3 w-3 mr-1" />
            {locale === 'th' ? 'เข้างาน' : 'In'}
          </Badge>
        );
      case 'checked_out':
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
            <LogOut className="h-3 w-3 mr-1" />
            {locale === 'th' ? 'ออกแล้ว' : 'Out'}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">
            <Clock className="h-3 w-3 mr-1" />
            {locale === 'th' ? 'ยังไม่เข้า' : 'Pending'}
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '👥 สรุปทีม' : '👥 Team Summary'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {format(getBangkokNow(), 'EEEE, d MMMM yyyy', { locale: dateLocale })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-2xl font-bold text-emerald-600">{stats.checkedIn}</p>
            <p className="text-xs text-emerald-600">
              {locale === 'th' ? 'เข้างาน' : 'Working'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 text-center">
            <LogOut className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-2xl font-bold text-blue-600">{stats.checkedOut}</p>
            <p className="text-xs text-blue-600">
              {locale === 'th' ? 'กลับแล้ว' : 'Left'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-3 text-center">
            <Clock className="h-5 w-5 mx-auto text-gray-500 mb-1" />
            <p className="text-2xl font-bold text-gray-600">{stats.notCheckedIn}</p>
            <p className="text-xs text-gray-600">
              {locale === 'th' ? 'รอเข้า' : 'Pending'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {locale === 'th' ? 'ภาพรวม' : 'Overview'}
            </span>
            <span className="text-sm text-muted-foreground">
              {stats.checkedIn + stats.checkedOut}/{stats.total}
            </span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-emerald-500"
              style={{ width: `${stats.total > 0 ? (stats.checkedIn / stats.total) * 100 : 0}%` }}
            />
            <div 
              className="h-full bg-blue-500"
              style={{ width: `${stats.total > 0 ? (stats.checkedOut / stats.total) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Employee List */}
      <div className="space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          {locale === 'th' ? 'รายชื่อพนักงาน' : 'Employee List'}
        </h2>

        {employees.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ไม่พบข้อมูลพนักงาน' : 'No employees found'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {employees.map((emp) => (
              <Card key={emp.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                        emp.status === 'checked_in' ? 'bg-emerald-500' :
                        emp.status === 'checked_out' ? 'bg-blue-500' : 'bg-gray-400'
                      }`}>
                        {emp.full_name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{emp.full_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(emp.status)}
                      {emp.check_in_time && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatBangkokTime(emp.check_in_time).slice(0, 5)}
                          {emp.check_out_time && ` - ${formatBangkokTime(emp.check_out_time).slice(0, 5)}`}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
