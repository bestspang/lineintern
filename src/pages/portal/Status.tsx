import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, LogIn, LogOut, Calendar, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { formatBangkokTime, formatBangkokISODate } from '@/lib/timezone';
import { th, enUS } from 'date-fns/locale';

interface TodayLog {
  id: string;
  event_type: string;
  server_time: string;
  is_flagged: boolean;
  flag_reason: string | null;
  is_overtime: boolean;
}

interface WorkSession {
  id: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  net_work_minutes: number | null;
  status: string | null;
}

export default function Status() {
  const { employee, locale } = usePortal();
  const [logs, setLogs] = useState<TodayLog[]>([]);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTodayStatus = async () => {
      if (!employee?.id) return;

      const bangkokToday = formatBangkokISODate(new Date());
      const startOfDay = `${bangkokToday}T00:00:00+07:00`;
      const endOfDay = `${bangkokToday}T23:59:59+07:00`;

      // Fetch today's logs
      const [logsResult, sessionResult] = await Promise.all([
        supabase
          .from('attendance_logs')
          .select('id, event_type, server_time, is_flagged, flag_reason, is_overtime')
          .eq('employee_id', employee.id)
          .gte('server_time', startOfDay)
          .lte('server_time', endOfDay)
          .order('server_time', { ascending: true }),
        supabase
          .from('work_sessions')
          .select('id, actual_start_time, actual_end_time, net_work_minutes, status')
          .eq('employee_id', employee.id)
          .eq('work_date', bangkokToday)
          .maybeSingle()
      ]);

      if (logsResult.data) setLogs(logsResult.data);
      if (sessionResult.data) setSession(sessionResult.data);
      
      setLoading(false);
    };

    fetchTodayStatus();
  }, [employee?.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const dateLocale = locale === 'th' ? th : enUS;
  const checkIn = logs.find(l => l.event_type === 'check_in');
  const checkOut = logs.find(l => l.event_type === 'check_out');
  const isWorking = checkIn && !checkOut;
  const isCompleted = checkIn && checkOut;

  const getStatusColor = () => {
    if (isCompleted) return 'bg-emerald-500';
    if (isWorking) return 'bg-blue-500';
    return 'bg-muted';
  };

  const getStatusText = () => {
    if (isCompleted) return locale === 'th' ? 'เสร็จสิ้นแล้ว' : 'Completed';
    if (isWorking) return locale === 'th' ? 'กำลังทำงาน' : 'Working';
    return locale === 'th' ? 'ยังไม่เช็คอิน' : 'Not checked in';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '📊 สถานะวันนี้' : '📊 Today\'s Status'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {format(new Date(), 'EEEE, d MMMM yyyy', { locale: dateLocale })}
        </p>
      </div>

      {/* Current Status Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {locale === 'th' ? 'สถานะการทำงาน' : 'Work Status'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-3 w-3 rounded-full ${getStatusColor()}`} />
            <span className="text-lg font-semibold">{getStatusText()}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                checkIn ? 'bg-emerald-100 text-emerald-600' : 'bg-muted text-muted-foreground'
              }`}>
                <LogIn className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {locale === 'th' ? 'เช็คอิน' : 'Check In'}
                </p>
                <p className="font-semibold">
                  {checkIn ? formatBangkokTime(checkIn.server_time).slice(0, 5) : '--:--'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                checkOut ? 'bg-blue-100 text-blue-600' : 'bg-muted text-muted-foreground'
              }`}>
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {locale === 'th' ? 'เช็คเอาท์' : 'Check Out'}
                </p>
                <p className="font-semibold">
                  {checkOut ? formatBangkokTime(checkOut.server_time).slice(0, 5) : '--:--'}
                </p>
              </div>
            </div>
          </div>

          {/* Work hours if available */}
          {session?.net_work_minutes !== null && session?.net_work_minutes !== undefined && (
            <div className="mt-4 p-3 rounded-lg bg-primary/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span>{locale === 'th' ? 'ชั่วโมงทำงาน' : 'Work Hours'}</span>
              </div>
              <span className="font-bold text-lg">{(session.net_work_minutes / 60).toFixed(1)} {locale === 'th' ? 'ชม.' : 'hrs'}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {locale === 'th' ? 'กิจกรรมวันนี้' : 'Today\'s Activity'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <XCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>{locale === 'th' ? 'ยังไม่มีกิจกรรมวันนี้' : 'No activity today'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg border">
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
                    <p className="font-medium">
                      {log.event_type === 'check_in' 
                        ? (locale === 'th' ? 'เช็คอิน' : 'Check In')
                        : (locale === 'th' ? 'เช็คเอาท์' : 'Check Out')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatBangkokTime(log.server_time).slice(0, 5)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.is_overtime && (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-600">OT</Badge>
                    )}
                    {log.is_flagged ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
