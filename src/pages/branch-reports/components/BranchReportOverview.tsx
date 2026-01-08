import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Users, Target, Store } from 'lucide-react';
import { useBranchReportContext } from '../context/BranchReportContext';

export default function BranchReportOverview() {
  const { filteredReports, branches } = useBranchReportContext();

  const stats = useMemo(() => {
    if (!filteredReports.length) {
      return {
        totalSales: 0,
        avgSales: 0,
        totalTC: 0,
        avgTC: 0,
        targetHitRate: 0,
        branchCount: 0,
      };
    }

    const reportsWithSales = filteredReports.filter(r => r.sales != null);
    const totalSales = reportsWithSales.reduce((sum, r) => sum + (r.sales || 0), 0);
    const avgSales = reportsWithSales.length > 0 ? totalSales / reportsWithSales.length : 0;

    const reportsWithTC = filteredReports.filter(r => r.tc != null);
    const totalTC = reportsWithTC.reduce((sum, r) => sum + (r.tc || 0), 0);
    const avgTC = reportsWithTC.length > 0 ? totalTC / reportsWithTC.length : 0;

    const reportsWithTarget = filteredReports.filter(r => r.diff_target_percent != null);
    const hitTarget = reportsWithTarget.filter(r => (r.diff_target_percent || 0) >= 0);
    const targetHitRate = reportsWithTarget.length > 0 ? (hitTarget.length / reportsWithTarget.length) * 100 : 0;

    return {
      totalSales,
      avgSales,
      totalTC,
      avgTC,
      targetHitRate,
      branchCount: branches.length,
    };
  }, [filteredReports, branches]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            ยอดขายรวม
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">฿{formatNumber(stats.totalSales)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            ยอดขายเฉลี่ย
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">฿{formatNumber(stats.avgSales)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            TC รวม
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatNumber(stats.totalTC)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            TC เฉลี่ย
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{stats.avgTC.toFixed(0)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Target className="h-4 w-4" />
            ถึงเป้า
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${stats.targetHitRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.targetHitRate.toFixed(0)}%
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Store className="h-4 w-4" />
            สาขา
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{stats.branchCount}</p>
        </CardContent>
      </Card>
    </div>
  );
}
