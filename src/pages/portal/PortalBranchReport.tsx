import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, TrendingUp, TrendingDown, Receipt } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { th } from 'date-fns/locale';

interface BranchReport {
  branchName: string;
  branchCode: string;
  sales: number;
  salesTarget: number;
  diffPercent: number;
  tc: number;
  reportDate: string;
}

export default function PortalBranchReport() {
  const { employee, locale, isAdmin } = usePortal();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<BranchReport[]>([]);
  const [period, setPeriod] = useState('today');

  const fetchReports = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);

    try {
      let startDate: string;
      const today = format(new Date(), 'yyyy-MM-dd');

      switch (period) {
        case 'yesterday':
          startDate = format(subDays(new Date(), 1), 'yyyy-MM-dd');
          break;
        case 'week':
          startDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
          break;
        default:
          startDate = today;
      }

      let query = supabase
        .from('branch_daily_reports')
        .select('*')
        .gte('report_date', startDate)
        .order('report_date', { ascending: false })
        .order('sales', { ascending: false });

      // Non-admin sees only their branch
      if (!isAdmin && employee.branch) {
        // Match by branch name since we may not have exact ID linkage
        query = query.ilike('branch_name', `%${employee.branch.name}%`);
      }

      const { data, error } = await query.limit(20);

      if (error) throw error;

      setReports(data?.map(r => ({
        branchName: r.branch_name,
        branchCode: r.branch_code,
        sales: r.sales || 0,
        salesTarget: r.sales_target || 0,
        diffPercent: r.diff_target_percent || 0,
        tc: r.tc || 0,
        reportDate: r.report_date,
      })) || []);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, employee?.branch, isAdmin, period]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('th-TH', { 
      style: 'decimal', 
      minimumFractionDigits: 0,
      maximumFractionDigits: 0 
    }).format(amount);
  };

  const totalSales = reports.reduce((sum, r) => sum + r.sales, 0);
  const avgDiff = reports.length > 0 
    ? reports.reduce((sum, r) => sum + r.diffPercent, 0) / reports.length 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          {locale === 'th' ? 'รายงานสาขา' : 'Branch Report'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? 'ยอดขายและผลประกอบการ' : 'Sales and performance'}
        </p>
      </div>

      {/* Period Selector */}
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">วันนี้</SelectItem>
          <SelectItem value="yesterday">เมื่อวาน</SelectItem>
          <SelectItem value="week">7 วันล่าสุด</SelectItem>
        </SelectContent>
      </Select>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardContent className="p-4">
                <Receipt className="h-5 w-5 mb-2 opacity-80" />
                <p className="text-xl font-bold">฿{formatAmount(totalSales)}</p>
                <p className="text-xs opacity-90">ยอดขายรวม</p>
              </CardContent>
            </Card>

            <Card className={`bg-gradient-to-br ${avgDiff >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-rose-500 to-rose-600'} text-white`}>
              <CardContent className="p-4">
                {avgDiff >= 0 ? (
                  <TrendingUp className="h-5 w-5 mb-2 opacity-80" />
                ) : (
                  <TrendingDown className="h-5 w-5 mb-2 opacity-80" />
                )}
                <p className="text-xl font-bold">{avgDiff >= 0 ? '+' : ''}{avgDiff.toFixed(1)}%</p>
                <p className="text-xs opacity-90">เทียบเป้า (เฉลี่ย)</p>
              </CardContent>
            </Card>
          </div>

          {/* Branch List */}
          {reports.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  {locale === 'th' ? 'ไม่มีข้อมูลรายงาน' : 'No reports found'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {reports.map((report, i) => (
                <Card key={`${report.branchCode}-${report.reportDate}-${i}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold">{report.branchName}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(report.reportDate), 'dd MMM yyyy', { locale: th })}
                        </p>
                      </div>
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        report.diffPercent >= 0 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {report.diffPercent >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {report.diffPercent >= 0 ? '+' : ''}{report.diffPercent.toFixed(1)}%
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-primary">฿{formatAmount(report.sales)}</p>
                        <p className="text-xs text-muted-foreground">ยอดขาย</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">฿{formatAmount(report.salesTarget)}</p>
                        <p className="text-xs text-muted-foreground">เป้า</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{report.tc}</p>
                        <p className="text-xs text-muted-foreground">TC</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
