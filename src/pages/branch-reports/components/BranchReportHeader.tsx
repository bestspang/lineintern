import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Upload } from 'lucide-react';
import { useState } from 'react';
import { useBranchReportContext } from '../context/BranchReportContext';
import { TIME_RANGE_OPTIONS } from '../types';
import BranchReportImport from './BranchReportImport';

export default function BranchReportHeader() {
  const { timeRange, setTimeRange, selectedBranch, setSelectedBranch, branches, isLoading, refetch } = useBranchReportContext();
  const [showImport, setShowImport] = useState(false);

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">รายงานสาขา</h1>
          <p className="text-muted-foreground">วิเคราะห์ยอดขายและประสิทธิภาพสาขา</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range */}
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Branch Filter */}
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="เลือกสาขา" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสาขา</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch} value={branch}>
                  {branch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Import Button */}
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" />
            นำเข้า
          </Button>

          {/* Refresh Button */}
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <BranchReportImport open={showImport} onOpenChange={setShowImport} />
    </>
  );
}
