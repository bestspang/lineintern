import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, LogIn, LogOut, AlertCircle, Calendar } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { format, parseISO } from 'date-fns';
import { formatBangkokTime, formatBangkokISODate, getBangkokHoursMinutes } from '@/lib/timezone';
import { th, enUS } from 'date-fns/locale';

interface AttendanceLog {
  id: string;
  event_type: string;
  server_time: string;
  is_flagged: boolean;
  flag_reason: string | null;
  is_overtime: boolean;
  source: string | null;
}

interface DailyStats {
  totalDays: number;
  onTime: number;
  late: number;
  avgCheckIn: string;
}

export default function MyWorkHistory() {
  const { employee, locale } = usePortal();
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!employee?.id) return;

      const { data, error } = await portalApi<AttendanceLog[]>({
        endpoint: 'attendance-history',
        employee_id: employee.id,
        params: { days: 30 }
      });

      if (!error && data) {
        setLogs(data);
        
        // Calculate stats
        const checkIns = data.filter(l => l.event_type === 'check_in');
        // Use Bangkok timezone for date grouping
        const uniqueDays = new Set(checkIns.map(l => formatBangkokISODate(l.server_time)));
        const flaggedCount = checkIns.filter(l => l.is_flagged).length;
        
        // Calculate average check-in time using Bangkok timezone
        const checkInHours = checkIns.map(l => {
          const bangkokTime = getBangkokHoursMinutes(l.server_time);
          if (!bangkokTime) return 0;
          return bangkokTime.hours + bangkokTime.minutes / 60;
        });
        const avgHour = checkInHours.length > 0 
          ? checkInHours.reduce((a, b) => a + b, 0) / checkInHours.length 
          : 0;
        const avgHours = Math.floor(avgHour);
        const avgMins = Math.round((avgHour - avgHours) * 60);

        setStats({
          totalDays: uniqueDays.size,
          onTime: checkIns.length - flaggedCount,
          late: flaggedCount,
          avgCheckIn: `${avgHours.toString().padStart(2, '0')}:${avgMins.toString().padStart(2, '0')}`,
        });
      }
      setLoading(false);
    };

    fetchHistory();
  }, [employee?.id]);

  // Group logs by date using Bangkok timezone
  const groupedLogs = logs.reduce((acc, log) => {
    const date = formatBangkokISODate(log.server_time);
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {} as Record<string, AttendanceLog[]>);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const dateLocale = locale === 'th' ? th : enUS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '📋 ประวัติการทำงาน' : '📋 Work History'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? '30 วันล่าสุด' : 'Last 30 days'}
        </p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Calendar className="h-6 w-6 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{stats.totalDays}</p>
              <p className="text-xs text-muted-foreground">
                {locale === 'th' ? 'วันที่เข้างาน' : 'Days Worked'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto text-emerald-500 mb-2" />
              <p className="text-2xl font-bold">{stats.avgCheckIn}</p>
              <p className="text-xs text-muted-foreground">
                {locale === 'th' ? 'เช็คอินเฉลี่ย' : 'Avg Check-in'}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{stats.onTime}</p>
              <p className="text-xs text-emerald-600">
                {locale === 'th' ? 'ตรงเวลา' : 'On Time'}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.late}</p>
              <p className="text-xs text-amber-600">
                {locale === 'th' ? 'มาสาย' : 'Late'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          {locale === 'th' ? 'รายการล่าสุด' : 'Recent Activity'}
        </h2>

        {Object.keys(groupedLogs).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ไม่มีประวัติการเข้างาน' : 'No attendance history'}
              </p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedLogs).slice(0, 10).map(([date, dayLogs]) => (
            <Card key={date}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium">
                    {format(parseISO(date), 'EEE, d MMM', { locale: dateLocale })}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {dayLogs.length} {locale === 'th' ? 'รายการ' : 'entries'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {dayLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 text-sm">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                        log.event_type === 'check_in' 
                          ? 'bg-emerald-100 text-emerald-600' 
                          : 'bg-blue-100 text-blue-600'
                      }`}>
                        {log.event_type === 'check_in' ? (
                          <LogIn className="h-4 w-4" />
                        ) : (
                          <LogOut className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <span className="font-medium">
                          {log.event_type === 'check_in' 
                            ? (locale === 'th' ? 'เช็คอิน' : 'Check In')
                            : (locale === 'th' ? 'เช็คเอาท์' : 'Check Out')}
                        </span>
                        {log.is_overtime && (
                          <Badge variant="secondary" className="ml-2 text-xs bg-orange-100 text-orange-600">
                            OT
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        {formatBangkokTime(log.server_time).slice(0, 5)}
                      </span>
                      {log.is_flagged && (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
