import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Clock, Loader2, Calendar, Timer, AlertCircle } from 'lucide-react';
import { format, addMinutes } from 'date-fns';

export default function WorkSummary() {
  const { data: activeSessions, isLoading } = useQuery({
    queryKey: ['active-work-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_sessions')
        .select(`
          *,
          employees (
            id,
            full_name, 
            code, 
            hours_per_day, 
            break_hours,
            auto_checkout_grace_period_minutes
          )
        `)
        .eq('status', 'active')
        .order('actual_start_time', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
            <Timer className="h-4 w-4 sm:h-5 sm:w-5" />
            🕐 สถานะการทำงาน Real-Time
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            ติดตามชั่วโมงทำงานและเวลาที่ควร Check-Out ของพนักงานที่กำลังทำงาน
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {!activeSessions || activeSessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>ไม่มีพนักงานที่กำลังทำงานในขณะนี้</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {activeSessions.map((session) => {
                const employee = session.employees;
                const hoursPerDay = employee.hours_per_day || 8;
                const breakMinutes = (employee.break_hours || 1) * 60;
                
                const now = new Date();
                const startTime = new Date(session.actual_start_time);
                const elapsedMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));
                const netMinutes = Math.max(0, elapsedMinutes - breakMinutes);
                const netHours = (netMinutes / 60).toFixed(1);
                
                const targetMinutes = hoursPerDay * 60;
                const progress = Math.min(100, (netMinutes / targetMinutes) * 100);
                const remainingMinutes = Math.max(0, targetMinutes - netMinutes);
                const remainingHours = (remainingMinutes / 60).toFixed(1);
                
                const expectedEndTime = addMinutes(startTime, targetMinutes + breakMinutes);
                const graceExpiresAt = session.auto_checkout_grace_expires_at 
                  ? new Date(session.auto_checkout_grace_expires_at) 
                  : addMinutes(expectedEndTime, employee.auto_checkout_grace_period_minutes || 60);
                
                const isOvertime = netMinutes > targetMinutes;
                const graceExpiringSoon = graceExpiresAt && (graceExpiresAt.getTime() - now.getTime()) < 15 * 60 * 1000;
                
                return (
                  <Card key={session.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-lg">{employee.full_name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              Shift {session.session_number}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {employee.code}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-primary">{netHours}</p>
                          <p className="text-xs text-muted-foreground">ชั่วโมง</p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">ความคืบหน้า</span>
                            <span className="font-medium">{Math.floor(progress)}%</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div className="bg-muted/50 p-2 rounded">
                            <p className="text-xs text-muted-foreground mb-1">เริ่มงาน</p>
                            <p className="font-medium">{format(startTime, 'HH:mm')}</p>
                          </div>
                          <div className="bg-muted/50 p-2 rounded">
                            <p className="text-xs text-muted-foreground mb-1">เหลืออีก</p>
                            <p className="font-medium text-orange-600">{remainingHours} ชม.</p>
                          </div>
                          <div className="bg-muted/50 p-2 rounded">
                            <p className="text-xs text-muted-foreground mb-1">ควรเลิกงาน</p>
                            <p className="font-medium text-green-600">{format(expectedEndTime, 'HH:mm')}</p>
                          </div>
                          <div className={cn(
                            "p-2 rounded",
                            graceExpiringSoon ? "bg-red-100 dark:bg-red-950/30" : "bg-muted/50"
                          )}>
                            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              Auto Checkout
                              {graceExpiringSoon && <AlertCircle className="h-3 w-3 text-red-600" />}
                            </p>
                            <p className={cn(
                              "font-medium",
                              graceExpiringSoon ? "text-red-600 dark:text-red-400" : ""
                            )}>
                              {format(graceExpiresAt, 'HH:mm')}
                            </p>
                          </div>
                        </div>

                        {isOvertime && (
                          <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-3 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-orange-600" />
                              <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                                ⏰ กำลังทำ Overtime แล้ว
                              </p>
                            </div>
                            <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                              ทำงานเกินเวลาแล้ว {((netMinutes - targetMinutes) / 60).toFixed(1)} ชั่วโมง
                            </p>
                          </div>
                        )}

                        {graceExpiringSoon && !isOvertime && (
                          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <p className="text-sm font-medium text-red-900 dark:text-red-100">
                                ⚠️ ใกล้ถึงเวลา Auto Checkout
                              </p>
                            </div>
                            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                              กรุณา Check-Out ภายใน 15 นาที มิฉะนั้นระบบจะทำให้อัตโนมัติ
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}