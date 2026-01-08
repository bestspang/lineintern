import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts';
import { useBranchReportContext } from '../context/BranchReportContext';
import { format, parseISO, subDays, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { th } from 'date-fns/locale';
import { COLORS } from '../types';
import { TrendingUp, TrendingDown, Minus, Package, Target, Truck } from 'lucide-react';

export default function BranchReportAdvancedCharts() {
  const { filteredReports, selectedBranch } = useBranchReportContext();

  // Stock Lemon Trend
  const stockLemonTrend = useMemo(() => {
    const byDate = new Map<string, { total: number; count: number }>();
    
    filteredReports.forEach(r => {
      if (r.stock_lemon !== null) {
        const existing = byDate.get(r.report_date) || { total: 0, count: 0 };
        existing.total += r.stock_lemon;
        existing.count += 1;
        byDate.set(r.report_date, existing);
      }
    });
    
    return Array.from(byDate.entries())
      .map(([date, data]) => ({
        date,
        dateLabel: format(parseISO(date), 'd MMM', { locale: th }),
        avgStock: Math.round(data.total / data.count),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredReports]);

  // Target Achievement Rate by Branch
  const targetAchievement = useMemo(() => {
    const byBranch = new Map<string, { achieved: number; total: number; totalSales: number; totalTarget: number }>();
    
    filteredReports.forEach(r => {
      if (r.sales !== null && r.sales_target !== null && r.sales_target > 0) {
        const existing = byBranch.get(r.branch_name) || { achieved: 0, total: 0, totalSales: 0, totalTarget: 0 };
        existing.total += 1;
        existing.totalSales += r.sales;
        existing.totalTarget += r.sales_target;
        if (r.sales >= r.sales_target) {
          existing.achieved += 1;
        }
        byBranch.set(r.branch_name, existing);
      }
    });
    
    return Array.from(byBranch.entries())
      .map(([name, data]) => ({
        branch: name.length > 12 ? name.substring(0, 12) + '...' : name,
        fullName: name,
        rate: Math.round((data.achieved / data.total) * 100),
        achieved: data.achieved,
        total: data.total,
        avgSales: Math.round(data.totalSales / data.total),
        avgTarget: Math.round(data.totalTarget / data.total),
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8);
  }, [filteredReports]);

  // Lineman Orders Trend
  const linemanTrend = useMemo(() => {
    const byDate = new Map<string, number>();
    
    filteredReports.forEach(r => {
      if (r.lineman_orders !== null) {
        const existing = byDate.get(r.report_date) || 0;
        byDate.set(r.report_date, existing + r.lineman_orders);
      }
    });
    
    return Array.from(byDate.entries())
      .map(([date, orders]) => ({
        date,
        dateLabel: format(parseISO(date), 'd MMM', { locale: th }),
        orders,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredReports]);

  // Week-over-Week Comparison
  const weekComparison = useMemo(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const lastWeekStart = subDays(thisWeekStart, 7);
    const lastWeekEnd = subDays(thisWeekEnd, 7);
    
    let thisWeekSales = 0;
    let thisWeekCount = 0;
    let lastWeekSales = 0;
    let lastWeekCount = 0;
    
    filteredReports.forEach(r => {
      if (r.sales === null) return;
      const reportDate = parseISO(r.report_date);
      
      if (isWithinInterval(reportDate, { start: thisWeekStart, end: thisWeekEnd })) {
        thisWeekSales += r.sales;
        thisWeekCount += 1;
      } else if (isWithinInterval(reportDate, { start: lastWeekStart, end: lastWeekEnd })) {
        lastWeekSales += r.sales;
        lastWeekCount += 1;
      }
    });
    
    const change = lastWeekSales > 0 
      ? ((thisWeekSales - lastWeekSales) / lastWeekSales) * 100 
      : 0;
    
    return {
      thisWeek: thisWeekSales,
      lastWeek: lastWeekSales,
      change: Math.round(change * 10) / 10,
      thisWeekAvg: thisWeekCount > 0 ? Math.round(thisWeekSales / thisWeekCount) : 0,
      lastWeekAvg: lastWeekCount > 0 ? Math.round(lastWeekSales / lastWeekCount) : 0,
    };
  }, [filteredReports]);

  if (filteredReports.length === 0) {
    return null;
  }

  const chartConfig = {
    stock: { label: 'สต็อกมะนาว', color: COLORS[0] },
    rate: { label: 'อัตราบรรลุเป้า', color: COLORS[1] },
    orders: { label: 'Lineman Orders', color: COLORS[2] },
  };

  const getTrendIcon = (change: number) => {
    if (change > 2) return <TrendingUp className="h-5 w-5 text-green-500" />;
    if (change < -2) return <TrendingDown className="h-5 w-5 text-red-500" />;
    return <Minus className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      {/* Week Comparison Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            เปรียบเทียบสัปดาห์
          </CardTitle>
          <CardDescription>ยอดขายสัปดาห์นี้ vs สัปดาห์ที่แล้ว</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">สัปดาห์ที่แล้ว</p>
              <p className="text-2xl font-bold">{weekComparison.lastWeek.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">เฉลี่ย {weekComparison.lastWeekAvg.toLocaleString()}/วัน</p>
            </div>
            <div className="text-center p-4 flex flex-col items-center justify-center">
              {getTrendIcon(weekComparison.change)}
              <p className={`text-lg font-bold ${
                weekComparison.change > 0 ? 'text-green-500' : 
                weekComparison.change < 0 ? 'text-red-500' : 'text-muted-foreground'
              }`}>
                {weekComparison.change > 0 ? '+' : ''}{weekComparison.change}%
              </p>
            </div>
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <p className="text-sm text-muted-foreground">สัปดาห์นี้</p>
              <p className="text-2xl font-bold">{weekComparison.thisWeek.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">เฉลี่ย {weekComparison.thisWeekAvg.toLocaleString()}/วัน</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Stock Lemon Trend */}
        {stockLemonTrend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                แนวโน้มสต็อกมะนาว
              </CardTitle>
              <CardDescription>เฉลี่ยต่อวัน</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stockLemonTrend}>
                    <defs>
                      <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area 
                      type="monotone" 
                      dataKey="avgStock" 
                      stroke={COLORS[0]} 
                      fill="url(#stockGradient)"
                      name="สต็อกเฉลี่ย"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Target Achievement */}
        {targetAchievement.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                อัตราบรรลุเป้าแต่ละสาขา
              </CardTitle>
              <CardDescription>% ที่ถึงเป้ายอดขาย</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={targetAchievement} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="branch" tick={{ fontSize: 10 }} width={80} />
                    <ChartTooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-background border rounded-lg p-2 shadow-lg">
                              <p className="font-medium">{data.fullName}</p>
                              <p className="text-sm">บรรลุเป้า: {data.achieved}/{data.total} วัน ({data.rate}%)</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar 
                      dataKey="rate" 
                      fill={COLORS[1]} 
                      radius={[0, 4, 4, 0]}
                      name="อัตราบรรลุเป้า"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Lineman Orders Trend */}
        {linemanTrend.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                แนวโน้ม Lineman Orders
              </CardTitle>
              <CardDescription>จำนวน orders ต่อวัน</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={linemanTrend}>
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line 
                      type="monotone" 
                      dataKey="orders" 
                      stroke={COLORS[2]} 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Lineman Orders"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
