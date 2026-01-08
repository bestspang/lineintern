import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { useBranchReportContext } from '../context/BranchReportContext';
import { COLORS, DAY_NAMES } from '../types';

export default function BranchReportCharts() {
  const { filteredReports } = useBranchReportContext();

  // Daily sales trend
  const dailyTrend = useMemo(() => {
    const grouped = new Map<string, { sales: number; count: number }>();
    
    filteredReports.forEach(r => {
      if (r.sales == null) return;
      const existing = grouped.get(r.report_date) || { sales: 0, count: 0 };
      grouped.set(r.report_date, {
        sales: existing.sales + r.sales,
        count: existing.count + 1,
      });
    });

    return Array.from(grouped.entries())
      .map(([date, data]) => ({
        date,
        dateLabel: format(parseISO(date), 'd MMM', { locale: th }),
        sales: data.sales,
        avgSales: data.sales / data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredReports]);

  // Branch comparison
  const branchComparison = useMemo(() => {
    const grouped = new Map<string, { sales: number; count: number }>();
    
    filteredReports.forEach(r => {
      if (r.sales == null) return;
      const existing = grouped.get(r.branch_name) || { sales: 0, count: 0 };
      grouped.set(r.branch_name, {
        sales: existing.sales + r.sales,
        count: existing.count + 1,
      });
    });

    return Array.from(grouped.entries())
      .map(([branch, data]) => ({
        branch,
        sales: data.sales,
        avgSales: data.sales / data.count,
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);
  }, [filteredReports]);

  // Day of week analysis
  const dayOfWeekData = useMemo(() => {
    const days = [0, 1, 2, 3, 4, 5, 6].map(day => ({
      day,
      name: DAY_NAMES[day],
      sales: 0,
      count: 0,
    }));

    filteredReports.forEach(r => {
      if (r.sales == null) return;
      const dayIndex = parseISO(r.report_date).getDay();
      days[dayIndex].sales += r.sales;
      days[dayIndex].count += 1;
    });

    return days.map(d => ({
      ...d,
      avgSales: d.count > 0 ? d.sales / d.count : 0,
    }));
  }, [filteredReports]);

  // Cup size distribution
  const cupSizeData = useMemo(() => {
    let sizeS = 0;
    let sizeM = 0;
    
    filteredReports.forEach(r => {
      sizeS += r.cup_size_s || 0;
      sizeM += r.cup_size_m || 0;
    });

    const total = sizeS + sizeM;
    if (total === 0) return [];

    return [
      { name: 'Size S', value: sizeS, percent: (sizeS / total * 100).toFixed(1) },
      { name: 'Size M', value: sizeM, percent: (sizeM / total * 100).toFixed(1) },
    ];
  }, [filteredReports]);

  if (filteredReports.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
          ไม่มีข้อมูลสำหรับแสดงกราฟ
        </CardContent>
      </Card>
    );
  }

  const chartConfig = {
    sales: { label: 'ยอดขาย', color: 'hsl(var(--chart-1))' },
    avgSales: { label: 'ยอดขายเฉลี่ย', color: 'hsl(var(--chart-2))' },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Sales Trend */}
      <Card>
        <CardHeader>
          <CardTitle>แนวโน้มยอดขายรายวัน</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend}>
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="hsl(var(--chart-1))" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Branch Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>ยอดขายตามสาขา (Top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchComparison} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="branch" tick={{ fontSize: 10 }} width={80} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="sales" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Day of Week */}
      <Card>
        <CardHeader>
          <CardTitle>ยอดขายเฉลี่ยตามวัน</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayOfWeekData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avgSales" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Cup Size Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>สัดส่วนขนาดแก้ว</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={cupSizeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name}: ${percent}%`}
                >
                  {cupSizeData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
