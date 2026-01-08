import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { Search, TrendingUp, TrendingDown } from 'lucide-react';
import { useBranchReportContext } from '../context/BranchReportContext';

export default function BranchReportTable() {
  const { filteredReports } = useBranchReportContext();
  const [search, setSearch] = useState('');

  const displayReports = useMemo(() => {
    if (!search.trim()) return filteredReports;
    const q = search.toLowerCase();
    return filteredReports.filter(r =>
      r.branch_name.toLowerCase().includes(q) ||
      r.branch_code.toLowerCase().includes(q)
    );
  }, [filteredReports, search]);

  const formatCurrency = (value: number | null) => {
    if (value == null) return '-';
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number | null) => {
    if (value == null) return '-';
    return new Intl.NumberFormat('th-TH').format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value == null) return '-';
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value.toFixed(1)}%`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>รายงานทั้งหมด ({displayReports.length} รายการ)</CardTitle>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาสาขา..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>สาขา</TableHead>
                <TableHead className="text-right">ยอดขาย</TableHead>
                <TableHead className="text-right">เป้า</TableHead>
                <TableHead className="text-right">% เป้า</TableHead>
                <TableHead className="text-right">TC</TableHead>
                <TableHead className="text-right">S/M</TableHead>
                <TableHead className="text-right">Lineman</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayReports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    ไม่พบข้อมูล
                  </TableCell>
                </TableRow>
              ) : (
                displayReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">
                      {format(parseISO(report.report_date), 'd MMM yy', { locale: th })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{report.branch_name}</span>
                        <span className="text-xs text-muted-foreground">{report.branch_code}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(report.sales)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(report.sales_target)}
                    </TableCell>
                    <TableCell className="text-right">
                      {report.diff_target_percent != null ? (
                        <Badge
                          variant={report.diff_target_percent >= 0 ? 'default' : 'destructive'}
                          className="gap-1"
                        >
                          {report.diff_target_percent >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {formatPercent(report.diff_target_percent)}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(report.tc)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {report.cup_size_s != null || report.cup_size_m != null
                        ? `${report.cup_size_s || 0}/${report.cup_size_m || 0}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(report.lineman_orders)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
