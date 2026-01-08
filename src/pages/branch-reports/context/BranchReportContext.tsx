import { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import type { TimeRange, BranchReport } from '../types';
import { useBranchReports, useUniqueBranches } from '../hooks/useBranchReports';

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

  const { data: reports = [], isLoading, error, refetch } = useBranchReports(timeRange);
  const branches = useUniqueBranches(reports);

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
    refetch,
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
