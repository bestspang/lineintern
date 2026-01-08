import { createContext, useContext, useState, ReactNode, useMemo, useCallback } from 'react';
import type { TimeRange, BranchReport } from '../types';
import { useBranchReports, useUniqueBranches } from '../hooks/useBranchReports';
import { useBranchReportsRealtime } from '../hooks/useBranchReportsRealtime';

interface BranchReportState {
  // Filters
  timeRange: TimeRange;
  selectedBranch: string;
  setTimeRange: (range: TimeRange) => void;
  setSelectedBranch: (branch: string) => void;
  
  // Data
  reports: BranchReport[];
  filteredReports: BranchReport[];
  branches: string[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const BranchReportContext = createContext<BranchReportState | null>(null);

export function BranchReportProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [realtimeReports, setRealtimeReports] = useState<BranchReport[]>([]);

  const { data: fetchedReports = [], isLoading, error, refetch } = useBranchReports(timeRange);
  
  // Combine fetched reports with realtime additions
  const reports = useMemo(() => {
    // Merge realtime reports, avoiding duplicates by id
    const existingIds = new Set(fetchedReports.map(r => r.id));
    const newReports = realtimeReports.filter(r => !existingIds.has(r.id));
    return [...newReports, ...fetchedReports];
  }, [fetchedReports, realtimeReports]);

  const branches = useUniqueBranches(reports);

  // Handle new realtime reports
  const handleNewReport = useCallback((newReport: BranchReport) => {
    setRealtimeReports(prev => {
      // Avoid duplicates
      if (prev.some(r => r.id === newReport.id)) return prev;
      return [newReport, ...prev];
    });
  }, []);

  // Handle updated reports
  const handleUpdateReport = useCallback((updatedReport: BranchReport) => {
    setRealtimeReports(prev => {
      const idx = prev.findIndex(r => r.id === updatedReport.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = updatedReport;
        return updated;
      }
      return prev;
    });
  }, []);

  // Subscribe to realtime updates
  useBranchReportsRealtime({
    timeRange,
    onNewReport: handleNewReport,
    onUpdateReport: handleUpdateReport,
  });

  // Clear realtime reports when refetching
  const handleRefetch = useCallback(() => {
    setRealtimeReports([]);
    refetch();
  }, [refetch]);

  const filteredReports = useMemo(() => {
    if (selectedBranch === 'all') return reports;
    return reports.filter(r => r.branch_name === selectedBranch);
  }, [reports, selectedBranch]);

  const value: BranchReportState = {
    timeRange,
    selectedBranch,
    setTimeRange,
    setSelectedBranch,
    reports,
    filteredReports,
    branches,
    isLoading,
    error: error as Error | null,
    refetch: handleRefetch,
  };

  return (
    <BranchReportContext.Provider value={value}>
      {children}
    </BranchReportContext.Provider>
  );
}

export function useBranchReportContext() {
  const ctx = useContext(BranchReportContext);
  if (!ctx) {
    throw new Error('useBranchReportContext must be used within BranchReportProvider');
  }
  return ctx;
}
