import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Calendar, Briefcase, HeartPulse, User } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { formatBangkokISODate, getBangkokNow } from '@/lib/timezone';

interface LeaveBalance {
  vacation_days_total: number;
  vacation_days_used: number;
  sick_days_total: number;
  sick_days_used: number;
  personal_days_total: number;
  personal_days_used: number;
  leave_year: number;
}

export default function MyLeaveBalance() {
  const { employee, locale } = usePortal();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);

  // Get current year in Bangkok timezone
  const bangkokNow = getBangkokNow();
  const currentYear = bangkokNow.getFullYear();

  useEffect(() => {
    const fetchBalance = async () => {
      if (!employee?.id) return;

      // First try to get current year's balance
      let { data, error } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('leave_year', currentYear)
        .maybeSingle();

      // If no data for current year, get the latest available year
      if (!error && !data) {
        const latestResult = await supabase
          .from('leave_balances')
          .select('*')
          .eq('employee_id', employee.id)
          .order('leave_year', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (!latestResult.error && latestResult.data) {
          data = latestResult.data;
        }
      }

      if (!error && data) {
        setBalance(data);
      }
      setLoading(false);
    };

    fetchBalance();
  }, [employee?.id, currentYear]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const leaveTypes = [
    {
      icon: Calendar,
      label: locale === 'th' ? 'ลาพักร้อน' : 'Vacation',
      total: balance?.vacation_days_total || 0,
      used: balance?.vacation_days_used || 0,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      icon: HeartPulse,
      label: locale === 'th' ? 'ลาป่วย' : 'Sick Leave',
      total: balance?.sick_days_total || 0,
      used: balance?.sick_days_used || 0,
      color: 'from-rose-500 to-rose-600',
      bgColor: 'bg-rose-50',
      textColor: 'text-rose-600',
    },
    {
      icon: User,
      label: locale === 'th' ? 'ลากิจ' : 'Personal',
      total: balance?.personal_days_total || 0,
      used: balance?.personal_days_used || 0,
      color: 'from-violet-500 to-violet-600',
      bgColor: 'bg-violet-50',
      textColor: 'text-violet-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {locale === 'th' ? '📅 วันลาคงเหลือ' : '📅 Leave Balance'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? `ปี ${balance?.leave_year || currentYear}` : `Year ${balance?.leave_year || currentYear}`}
        </p>
      </div>

      {/* Leave Balance Cards */}
      <div className="space-y-4">
        {leaveTypes.map((type) => {
          const Icon = type.icon;
          const remaining = type.total - type.used;
          const percentage = type.total > 0 ? (type.used / type.total) * 100 : 0;

          return (
            <Card key={type.label} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${type.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{type.label}</h3>
                      <Badge variant="secondary" className={type.bgColor + ' ' + type.textColor}>
                        {locale === 'th' ? `เหลือ ${remaining} วัน` : `${remaining} days left`}
                      </Badge>
                    </div>
                    <Progress value={percentage} className="h-2 mb-2" />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>
                        {locale === 'th' ? `ใช้ไป ${type.used} วัน` : `Used ${type.used} days`}
                      </span>
                      <span>
                        {locale === 'th' ? `ทั้งหมด ${type.total} วัน` : `Total ${type.total} days`}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {locale === 'th' ? 'วันลาคงเหลือรวม' : 'Total Remaining'}
              </p>
              <p className="text-3xl font-bold text-primary">
                {leaveTypes.reduce((sum, t) => sum + (t.total - t.used), 0)}
                <span className="text-lg font-normal text-muted-foreground ml-1">
                  {locale === 'th' ? 'วัน' : 'days'}
                </span>
              </p>
            </div>
            <Briefcase className="h-12 w-12 text-primary/30" />
          </div>
        </CardContent>
      </Card>

      {!balance && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              {locale === 'th' 
                ? 'ยังไม่มีข้อมูลวันลาสำหรับปีนี้' 
                : 'No leave balance data for this year'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
