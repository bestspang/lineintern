import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Clock, CheckCircle2, AlertTriangle, XCircle, Timer } from 'lucide-react';

export type AttendanceStatus = 'on_time' | 'late' | 'early_leave' | 'absent' | 'ot' | 'pending' | null;

interface AttendanceStatusBadgeProps {
  status: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  compact?: boolean;
  className?: string;
}

const statusConfig: Record<NonNullable<AttendanceStatus>, {
  label: string;
  labelTh: string;
  icon: typeof Clock;
  color: string;
  bgColor: string;
}> = {
  on_time: {
    label: 'On Time',
    labelTh: 'ตรงเวลา',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  late: {
    label: 'Late',
    labelTh: 'มาสาย',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  early_leave: {
    label: 'Early Leave',
    labelTh: 'กลับก่อน',
    icon: AlertTriangle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  absent: {
    label: 'Absent',
    labelTh: 'ขาดงาน',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  ot: {
    label: 'OT',
    labelTh: 'ล่วงเวลา',
    icon: Timer,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  pending: {
    label: 'Pending',
    labelTh: 'รอ',
    icon: Clock,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
};

export function AttendanceStatusBadge({
  status,
  checkIn,
  checkOut,
  compact = false,
  className,
}: AttendanceStatusBadgeProps) {
  if (!status) return null;

  const config = statusConfig[status];
  const Icon = config.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center',
                config.bgColor,
                className
              )}
            >
              <Icon className={cn('w-3 h-3', config.color)} />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p className="font-medium">{config.labelTh}</p>
              {checkIn && <p className="text-xs">เข้า: {checkIn}</p>}
              {checkOut && <p className="text-xs">ออก: {checkOut}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={cn(
              'text-xs gap-1',
              config.bgColor,
              config.color,
              className
            )}
          >
            <Icon className="w-3 h-3" />
            {config.labelTh}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            {checkIn && <p>เข้า: {checkIn}</p>}
            {checkOut && <p>ออก: {checkOut}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AttendanceTimeDisplay({
  checkIn,
  checkOut,
  status,
  className,
}: {
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  className?: string;
}) {
  if (!checkIn && !checkOut) return null;

  const statusColor = status ? statusConfig[status]?.color : 'text-muted-foreground';

  return (
    <div className={cn('text-[10px] leading-tight', className)}>
      {checkIn && (
        <div className={cn('flex items-center gap-0.5', statusColor)}>
          <span className="text-muted-foreground">เข้า</span>
          <span className="font-medium">{checkIn}</span>
        </div>
      )}
      {checkOut && (
        <div className="flex items-center gap-0.5 text-muted-foreground">
          <span>ออก</span>
          <span className="font-medium">{checkOut}</span>
        </div>
      )}
    </div>
  );
}
