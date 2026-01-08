import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import type { BranchReport, TimeRange } from '../types';
import { TIME_RANGE_OPTIONS } from '../types';

// Lazy import supabase to avoid initialization issues
const getSupabase = async () => {
  const { supabase } = await import('@/integrations/supabase/client');
  return supabase;
};

export function useBranchReports(timeRange: TimeRange) {
  const days = TIME_RANGE_OPTIONS.find(t => t.value === timeRange)?.days || 30;
  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['branch-reports', startDate, endDate],
    queryFn: async (): Promise<BranchReport[]> => {
      try {
        const supabase = await getSupabase();
        
        if (!supabase || typeof supabase.from !== 'function') {
          console.warn('Supabase client not ready');
          return [];
        }

        const { data, error } = await supabase
          .from('branch_daily_reports')
          .select('*')
          .gte('report_date', startDate)
          .lte('report_date', endDate)
          .order('report_date', { ascending: false });

        if (error) {
          console.error('Branch reports query error:', error);
          throw error;
        }

        return (data || []) as BranchReport[];
      } catch (error) {
        console.error('Failed to fetch branch reports:', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export function useUniqueBranches(reports: BranchReport[] | undefined) {
  if (!reports) return [];
  const branches = [...new Set(reports.map(r => r.branch_name))];
  return branches.sort();
}
