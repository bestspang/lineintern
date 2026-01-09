import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, CalendarDays, Clock, Coffee } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { th } from 'date-fns/locale';

interface ScheduleDay {
  date: Date;
  dayName: string;
  shift?: {
    name: string;
    startTime: string;
    endTime: string;
    isOff: boolean;
  };
}

export default function MySchedule() {
  const navigate = useNavigate();
  const { employee, locale } = usePortal();
  const [loading, setLoading] = useState(true);
  const [weekDays, setWeekDays] = useState<ScheduleDay[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const fetchSchedule = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);

    try {
      // Fetch work schedule
      const { data: scheduleData } = await supabase
        .from('work_schedules')
        .select('*, shift_template:shift_templates(*)')
        .eq('employee_id', employee.id)
        .single();

      // Fetch shift assignments for the week
      const weekEnd = addDays(currentWeekStart, 6);
      const { data: assignments } = await supabase
        .from('shift_assignments')
        .select('*, shift_template:shift_templates(*)')
        .eq('employee_id', employee.id)
        .gte('work_date', format(currentWeekStart, 'yyyy-MM-dd'))
        .lte('work_date', format(weekEnd, 'yyyy-MM-dd'));

      // Build week schedule
      const days: ScheduleDay[] = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(currentWeekStart, i);
        const dayOfWeekNumber = date.getDay(); // 0=Sunday, 1=Monday, etc.
        const assignment = assignments?.find(a => 
          isSameDay(new Date(a.work_date), date)
        );

        let shift = undefined;
        
        if (assignment?.shift_template) {
          const template = assignment.shift_template as any;
          shift = {
            name: template.name || 'กะพิเศษ',
            startTime: assignment.custom_start_time || template.start_time || '',
            endTime: assignment.custom_end_time || template.end_time || '',
            isOff: assignment.is_day_off || false,
          };
        } else if (assignment?.is_day_off) {
          shift = { name: 'วันหยุด', startTime: '', endTime: '', isOff: true };
        } else if (scheduleData) {
          // Use regular schedule - check if this day_of_week is a working day
          const isWorkDay = scheduleData.is_working_day && scheduleData.day_of_week === dayOfWeekNumber;
          
          if (isWorkDay) {
            shift = {
              name: 'กะปกติ',
              startTime: scheduleData.start_time || '',
              endTime: scheduleData.end_time || '',
              isOff: false,
            };
          } else if (scheduleData.day_of_week === dayOfWeekNumber && !scheduleData.is_working_day) {
            shift = { name: 'วันหยุด', startTime: '', endTime: '', isOff: true };
          }
        }

        days.push({
          date,
          dayName: format(date, 'EEEE', { locale: locale === 'th' ? th : undefined }),
          shift,
        });
      }

      setWeekDays(days);
    } catch (err) {
      console.error('Error fetching schedule:', err);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, currentWeekStart, locale]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const today = new Date();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/portal')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">
              {locale === 'th' ? 'ตารางกะของฉัน' : 'My Schedule'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {format(currentWeekStart, 'd MMM', { locale: locale === 'th' ? th : undefined })} - {format(addDays(currentWeekStart, 6), 'd MMM yyyy', { locale: locale === 'th' ? th : undefined })}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Week Navigation */}
        <div className="flex justify-between items-center">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
          >
            {locale === 'th' ? '← สัปดาห์ก่อน' : '← Previous'}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            {locale === 'th' ? 'สัปดาห์นี้' : 'This Week'}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
          >
            {locale === 'th' ? 'สัปดาห์หน้า →' : 'Next →'}
          </Button>
        </div>

        {loading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))
        ) : (
          weekDays.map((day) => {
            const isToday = isSameDay(day.date, today);
            
            return (
              <Card 
                key={day.date.toISOString()} 
                className={`transition-all ${isToday ? 'ring-2 ring-primary' : ''} ${day.shift?.isOff ? 'bg-muted/50' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center ${isToday ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        <span className="text-lg font-bold">{format(day.date, 'd')}</span>
                        <span className="text-xs">{day.dayName.slice(0, 3)}</span>
                      </div>
                      <div>
                        <p className="font-medium">
                          {day.shift?.name || (locale === 'th' ? 'ไม่มีตารางงาน' : 'No schedule')}
                        </p>
                        {day.shift && !day.shift.isOff && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{day.shift.startTime} - {day.shift.endTime}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {day.shift?.isOff && (
                      <Coffee className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
