import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface AttendanceLogExportProps {
  logs: any[];
  filters: {
    dateFrom?: Date;
    dateTo?: Date;
    employeeId: string;
    branchId: string;
    eventType: string;
    status: string;
  };
}

export default function AttendanceLogExport({ logs, filters }: AttendanceLogExportProps) {
  const exportToCSV = () => {
    if (!logs || logs.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = [
      'Date',
      'Time',
      'Employee',
      'Branch',
      'Event Type',
      'Source',
      'Status',
      'Latitude',
      'Longitude',
      'Flag Reason',
    ];

    const rows = logs.map((log) => [
      format(new Date(log.server_time), 'yyyy-MM-dd'),
      format(new Date(log.server_time), 'HH:mm:ss'),
      log.employee?.full_name || '-',
      log.branch?.name || '-',
      log.event_type,
      log.source,
      log.is_flagged ? 'Flagged' : 'Normal',
      log.latitude || '-',
      log.longitude || '-',
      log.flag_reason || '-',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_logs_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('CSV exported successfully');
  };

  const exportToExcel = () => {
    toast.info('Excel export coming soon');
  };

  const exportToPDF = () => {
    toast.info('PDF export coming soon');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-10">
          <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Export</span>
          <span className="sm:hidden">CSV</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={exportToCSV} className="text-xs sm:text-sm">
          <FileText className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToExcel} className="text-xs sm:text-sm">
          <FileSpreadsheet className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          Export as Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToPDF} className="text-xs sm:text-sm">
          <FileText className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
