import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { BranchReport, TimeRange, TIME_RANGE_OPTIONS } from '../types';
import { subDays, parseISO, isAfter } from 'date-fns';

interface UseBranchReportsRealtimeOptions {
  timeRange: TimeRange;
  onNewReport: (report: BranchReport) => void;
  onUpdateReport: (report: BranchReport) => void;
}

export function useBranchReportsRealtime({ 
  timeRange, 
  onNewReport, 
  onUpdateReport 
}: UseBranchReportsRealtimeOptions) {
  
  const isWithinTimeRange = useCallback((reportDate: string, range: TimeRange): boolean => {
    const daysMap: Record<TimeRange, number> = {
      '1d': 1,
      '3d': 3,
      '7d': 7,
      '14d': 14,
      '30d': 30,
      '90d': 90,
    };
    
    const days = daysMap[range];
    const cutoffDate = subDays(new Date(), days);
    const reportDateParsed = parseISO(reportDate);
    
    return isAfter(reportDateParsed, cutoffDate);
  }, []);

  useEffect(() => {
    console.log('[Realtime] Setting up subscription for branch_daily_reports');
    
    const channel = supabase
      .channel('branch-reports-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'branch_daily_reports'
        },
        (payload) => {
          console.log('[Realtime] New report received:', payload.new);
          const newReport = payload.new as BranchReport;
          
          // Only add if within current time range
          if (isWithinTimeRange(newReport.report_date, timeRange)) {
            onNewReport(newReport);
            toast.success(`📊 รายงานใหม่: ${newReport.branch_name}`, {
              description: `วันที่ ${newReport.report_date} | ยอดขาย: ${newReport.sales?.toLocaleString() || 0} บาท`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'branch_daily_reports'
        },
        (payload) => {
          console.log('[Realtime] Report updated:', payload.new);
          const updatedReport = payload.new as BranchReport;
          
          if (isWithinTimeRange(updatedReport.report_date, timeRange)) {
            onUpdateReport(updatedReport);
            toast.info(`📝 อัพเดทรายงาน: ${updatedReport.branch_name}`, {
              description: `วันที่ ${updatedReport.report_date}`,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      console.log('[Realtime] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [timeRange, onNewReport, onUpdateReport, isWithinTimeRange]);
}
