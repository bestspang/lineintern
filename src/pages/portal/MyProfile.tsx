import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { User, Building2, Clock, Calendar, Mail, Phone } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';

interface WorkSchedule {
  day_of_week: number;
  is_working_day: boolean;
  start_time: string | null;
  end_time: string | null;
  expected_hours: number | null;
}

interface EmployeeDetails {
  shift_start_time: string | null;
  shift_end_time: string | null;
  hours_per_day: number | null;
  working_time_type: string | null;
  flexible_day_off_enabled: boolean | null;
}

export default function MyProfile() {
  const { employee, locale } = usePortal();
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [details, setDetails] = useState<EmployeeDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!employee?.id) return;

      // Fetch work schedules
      const { data: scheduleData } = await supabase
        .from('work_schedules')
        .select('day_of_week, is_working_day, start_time, end_time, expected_hours')
        .eq('employee_id', employee.id)
        .order('day_of_week');

      if (scheduleData) {
        setSchedules(scheduleData);
      }

      // Fetch employee details
      const { data: empData } = await supabase
        .from('employees')
        .select('shift_start_time, shift_end_time, hours_per_day, working_time_type, flexible_day_off_enabled')
        .eq('id', employee.id)
        .single();

      if (empData) {
        setDetails(empData);
      }

      setLoading(false);
    };

    fetchData();
  }, [employee?.id]);

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
