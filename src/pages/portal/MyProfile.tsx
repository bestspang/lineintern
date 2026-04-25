import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { User, Building2, Clock, Calendar, Link2, Link2Off, Loader2, CheckCircle2 } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WorkSchedule {
  day_of_week: number;
  is_working_day: boolean;
  start_time: string | null;
  end_time: string | null;
  expected_hours: number | null;
}

interface ProfileData {
  employee: any;
  schedules: WorkSchedule[];
}

interface GoogleConnection {
  connected: boolean;
  hasDriveFolder: boolean;
  hasSpreadsheet: boolean;
  connectedAt?: string;
}

export default function MyProfile() {
  const { employee, locale } = usePortal();
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [employeeDetails, setEmployeeDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!employee?.id) return;

      // Use portalApi for profile data
      const { data, error } = await portalApi<ProfileData>({
        endpoint: 'profile-full',
        employee_id: employee.id
      });

      if (!error && data) {
        setSchedules(data.schedules || []);
        setEmployeeDetails(data.employee);
        
        // Check Google connection if we have LINE user ID
        if (data.employee?.line_user_id) {
          checkGoogleConnection(data.employee.line_user_id);
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [employee?.id]);

  const checkGoogleConnection = async (lineUserId: string) => {
    try {
      // Google OAuth check still needs direct supabase.functions.invoke
      const { data, error } = await supabase.functions.invoke('google-oauth', {
        body: { action: 'check_connection', lineUserId }
      });
      
      if (!error && data) {
        setGoogleConnection(data);
      }
    } catch (err) {
      console.error('Failed to check Google connection:', err);
    }
  };

  const handleConnectGoogle = useCallback(async () => {
    if (!employee?.line_user_id) {
      toast.error(locale === 'th' ? 'ไม่พบ LINE User ID' : 'LINE User ID not found');
      return;
    }

    setGoogleLoading(true);
    try {
      const redirectUri = `${window.location.origin}/portal/my-profile`;
      
      // Google OAuth needs direct supabase.functions.invoke
      const { data, error } = await supabase.functions.invoke('google-oauth', {
        body: { 
          action: 'get_auth_url', 
          lineUserId: employee.line_user_id,
          employeeId: employee.id,
          redirectUri 
        }
      });

      if (error || !data?.authUrl) {
        throw new Error(data?.error || 'Failed to get auth URL');
      }

      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect Google');
      setGoogleLoading(false);
    }
  }, [employee, locale]);

  const handleDisconnectGoogle = useCallback(async () => {
    if (!employee?.line_user_id) return;

    setGoogleLoading(true);
    try {
      const { error } = await supabase.functions.invoke('google-oauth', {
        body: { action: 'disconnect', lineUserId: employee.line_user_id }
      });

      if (error) throw error;

      setGoogleConnection({ connected: false, hasDriveFolder: false, hasSpreadsheet: false });
      toast.success(locale === 'th' ? 'ยกเลิกการเชื่อมต่อ Google แล้ว' : 'Google disconnected');
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect');
    } finally {
      setGoogleLoading(false);
    }
  }, [employee, locale]);

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      const handleCallback = async () => {
        setGoogleLoading(true);
        try {
          const stateData = JSON.parse(atob(state));
          const { data, error } = await supabase.functions.invoke('google-oauth', {
            body: {
              action: 'exchange_code',
              code,
              lineUserId: stateData.lineUserId,
              employeeId: stateData.employeeId,
              redirectUri: stateData.redirectUri
            }
          });

          if (error || !data?.success) {
            throw new Error(data?.error || 'Failed to connect');
          }

          toast.success(locale === 'th' ? 'เชื่อมต่อ Google สำเร็จ!' : 'Google connected successfully!');
          setGoogleConnection({ connected: true, hasDriveFolder: false, hasSpreadsheet: false });
          
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err: any) {
          toast.error(err.message || 'Failed to complete connection');
        } finally {
          setGoogleLoading(false);
        }
      };

      handleCallback();
    }
  }, [locale]);

  const dayNames = locale === 'th' 
    ? ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const formatTime = (time: string | null) => {
    if (!time) return '-';
    return time.substring(0, 5);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const details = employeeDetails || employee;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '👤 ข้อมูลของฉัน' : '👤 My Profile'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? 'ข้อมูลพนักงานและตารางงาน' : 'Employee information and schedule'}
        </p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground text-2xl font-bold">
              {employee?.full_name?.charAt(0) || 'U'}
            </div>
            <div>
              <h2 className="text-xl font-bold">{employee?.full_name}</h2>
              <p className="text-muted-foreground">{employee?.code}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{locale === 'th' ? 'ตำแหน่ง' : 'Position'}</p>
                <p className="font-medium">
                  {locale === 'th' 
                    ? employee?.role?.display_name_th 
                    : employee?.role?.display_name_en || '-'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{locale === 'th' ? 'สาขา' : 'Branch'}</p>
                <p className="font-medium">{employee?.branch?.name || '-'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{locale === 'th' ? 'เวลางานมาตรฐาน' : 'Standard Hours'}</p>
                <p className="font-medium">
                  {formatTime(details?.shift_start_time)} - {formatTime(details?.shift_end_time)}
                  {details?.hours_per_day && (
                    <span className="text-muted-foreground ml-2">
                      ({details.hours_per_day} {locale === 'th' ? 'ชม./วัน' : 'hrs/day'})
                    </span>
                  )}
                </p>
              </div>
            </div>

            {details?.flexible_day_off_enabled && (
              <Badge className="bg-primary/10 text-primary">
                {locale === 'th' ? '✨ วันหยุดยืดหยุ่น' : '✨ Flexible Day-Off'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Work Schedule */}
      {!details?.flexible_day_off_enabled && schedules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {locale === 'th' ? 'ตารางงานประจำสัปดาห์' : 'Weekly Schedule'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <div 
                  key={schedule.day_of_week} 
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    schedule.is_working_day ? 'bg-muted/50' : 'bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${!schedule.is_working_day && 'text-red-500'}`}>
                      {dayNames[schedule.day_of_week]}
                    </span>
                    {!schedule.is_working_day && (
                      <Badge variant="outline" className="text-red-500 border-red-200">
                        {locale === 'th' ? 'หยุด' : 'Off'}
                      </Badge>
                    )}
                  </div>
                  {schedule.is_working_day && (
                    <span className="text-sm text-muted-foreground">
                      {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flexible Day-Off Info */}
      {details?.flexible_day_off_enabled && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-primary">
                  {locale === 'th' ? 'ใช้ระบบวันหยุดยืดหยุ่น' : 'Flexible Day-Off Enabled'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {locale === 'th' 
                    ? 'คุณต้องทำงานทุกวัน (จ-อา) ยกเว้นวันหยุดนักขัตฤกษ์ และวันที่ขอหยุดล่วงหน้า'
                    : 'You work every day (Mon-Sun) except public holidays and approved flexible days off'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
