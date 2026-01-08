import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfMonth, endOfMonth, parseISO, addDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Calendar as CalendarIcon, Store, Target, Users, Package, RefreshCw, ChevronRight, Award, Citrus, IceCream } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BranchReport {
  id: string;
  report_date: string;
  branch_code: string;
  branch_name: string;
  sales: number;
  sales_target: number;
  diff_target: number;
  diff_target_percent: number;
  tc: number;
  stock_lemon: number;
  cup_size_s: number;
  cup_size_m: number;
  dried_lemon: number;
  chili_salt: number;
  honey_bottle: number;
  snacks: number;
  bottled_water: number;
  lineman_orders: number;
  top_lemonade: string[];
  top_slurpee: string[];
  merchandise_sold: any[];
  created_at: string;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function BranchReport() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'month'>('30d');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end = now;
    
    switch (dateRange) {
      case '7d':
        start = subDays(now, 7);
        break;
      case '30d':
        start = subDays(now, 30);
        break;
      case '90d':
        start = subDays(now, 90);
        break;
      case 'month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      default:
        start = subDays(now, 30);
    }
    
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    };
  }, [dateRange]);

  // Fetch branch reports
  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ['branch-reports', startDate, endDate, selectedBranch],
    queryFn: async () => {
      let query = supabase
        .from('branch_daily_reports')
        .select('*')
        .gte('report_date', startDate)
        .lte('report_date', endDate)
        .order('report_date', { ascending: false });
      
      if (selectedBranch !== 'all') {
        query = query.eq('branch_code', selectedBranch);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as BranchReport[];
    },
  });

  // Get unique branches
  const branches = useMemo(() => {
    if (!reports) return [];
    const uniqueBranches = new Map<string, string>();
    reports.forEach(r => uniqueBranches.set(r.branch_code, r.branch_name));
    return Array.from(uniqueBranches.entries()).map(([code, name]) => ({ code, name }));
  }, [reports]);

  // Calculate summary stats
  const summary = useMemo(() => {
    if (!reports || reports.length === 0) {
      return { totalSales: 0, totalTarget: 0, avgTc: 0, activeBranches: 0, totalBranches: 0, achievementPercent: 0 };
    }

    // Get today's reports
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayReports = reports.filter(r => r.report_date === today);
    
    const totalSales = todayReports.reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const totalTarget = todayReports.reduce((sum, r) => sum + Number(r.sales_target || 0), 0);
    const avgTc = todayReports.length > 0 
      ? Math.round(todayReports.reduce((sum, r) => sum + (r.tc || 0), 0) / todayReports.length)
      : 0;
    const achievementPercent = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0;
    
    const uniqueBranches = new Set(reports.map(r => r.branch_code));
    const activeBranchesToday = new Set(todayReports.map(r => r.branch_code));

    return {
      totalSales,
      totalTarget,
      avgTc,
      activeBranches: activeBranchesToday.size,
      totalBranches: uniqueBranches.size,
      achievementPercent,
    };
  }, [reports]);

  // Prepare chart data - Daily trend
  const dailyTrendData = useMemo(() => {
    if (!reports) return [];
    
    const byDate = new Map<string, { sales: number; target: number; count: number }>();
    reports.forEach(r => {
      const existing = byDate.get(r.report_date) || { sales: 0, target: 0, count: 0 };
      byDate.set(r.report_date, {
        sales: existing.sales + Number(r.sales || 0),
        target: existing.target + Number(r.sales_target || 0),
        count: existing.count + 1,
      });
    });
    
    return Array.from(byDate.entries())
      .map(([date, data]) => ({
        date,
        displayDate: format(parseISO(date), 'd MMM', { locale: th }),
        sales: data.sales,
        target: data.target,
        branches: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [reports]);

  // Branch comparison data
  const branchComparisonData = useMemo(() => {
    if (!reports) return [];
    
    const byBranch = new Map<string, { sales: number; target: number; name: string }>();
    reports.forEach(r => {
      const existing = byBranch.get(r.branch_code) || { sales: 0, target: 0, name: r.branch_name };
      byBranch.set(r.branch_code, {
        sales: existing.sales + Number(r.sales || 0),
        target: existing.target + Number(r.sales_target || 0),
        name: r.branch_name,
      });
    });
    
    return Array.from(byBranch.entries())
      .map(([code, data]) => ({
        code,
        name: data.name,
        sales: data.sales,
        target: data.target,
        achievement: data.target > 0 ? (data.sales / data.target) * 100 : 0,
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [reports]);

  // Cup size distribution
  const cupSizeData = useMemo(() => {
    if (!reports) return [];
    
    const totalS = reports.reduce((sum, r) => sum + (r.cup_size_s || 0), 0);
    const totalM = reports.reduce((sum, r) => sum + (r.cup_size_m || 0), 0);
    
    if (totalS === 0 && totalM === 0) return [];
    
    return [
      { name: 'Size S', value: totalS, fill: 'hsl(var(--primary))' },
      { name: 'Size M', value: totalM, fill: 'hsl(var(--chart-2))' },
    ];
  }, [reports]);

  // Top sellers aggregation
  const topSellers = useMemo(() => {
    if (!reports) return { lemonade: [], slurpee: [] };
    
    const lemonadeCount = new Map<string, number>();
    const slurpeeCount = new Map<string, number>();
    
    reports.forEach(r => {
      const lemonadeList = Array.isArray(r.top_lemonade) ? r.top_lemonade : [];
      const slurpeeList = Array.isArray(r.top_slurpee) ? r.top_slurpee : [];
      
      lemonadeList.forEach((item: string, idx: number) => {
        if (item) {
          const points = 5 - idx; // First place = 5 points, etc.
          lemonadeCount.set(item, (lemonadeCount.get(item) || 0) + points);
        }
      });
      
      slurpeeList.forEach((item: string, idx: number) => {
        if (item) {
          const points = 5 - idx;
          slurpeeCount.set(item, (slurpeeCount.get(item) || 0) + points);
        }
      });
    });
    
    return {
      lemonade: Array.from(lemonadeCount.entries())
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
      slurpee: Array.from(slurpeeCount.entries())
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
    };
  }, [reports]);

  // Forecast calculation (Simple Moving Average + Trend)
  const forecast = useMemo(() => {
    if (!dailyTrendData || dailyTrendData.length < 7) return [];
    
    const recentDays = dailyTrendData.slice(-7);
    const avgSales = recentDays.reduce((sum, d) => sum + d.sales, 0) / recentDays.length;
    
    // Calculate trend using linear regression
    const n = dailyTrendData.length;
    const xMean = (n - 1) / 2;
    const yMean = dailyTrendData.reduce((sum, d) => sum + d.sales, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    dailyTrendData.forEach((d, i) => {
      numerator += (i - xMean) * (d.sales - yMean);
      denominator += (i - xMean) ** 2;
    });
    
    const trend = denominator !== 0 ? numerator / denominator : 0;
    
    // Generate 7-day forecast
    const forecastData = [];
    for (let i = 1; i <= 7; i++) {
      const predictedSales = avgSales + (trend * i);
      const confidence = Math.max(0.6, 0.95 - (i * 0.05));
      const date = addDays(new Date(), i);
      
      forecastData.push({
        date: format(date, 'yyyy-MM-dd'),
        displayDate: format(date, 'd MMM', { locale: th }),
        predicted: Math.max(0, Math.round(predictedSales)),
        lower: Math.max(0, Math.round(predictedSales * (1 - (1 - confidence) / 2))),
        upper: Math.round(predictedSales * (1 + (1 - confidence) / 2)),
        isForecast: true,
      });
    }
    
    return forecastData;
  }, [dailyTrendData]);

  // Combined data for forecast chart
  const forecastChartData = useMemo(() => {
    const historical = dailyTrendData.slice(-14).map(d => ({
      ...d,
      predicted: null,
      lower: null,
      upper: null,
      isForecast: false,
    }));
    
    return [...historical, ...forecast];
  }, [dailyTrendData, forecast]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            Branch Report Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Daily sales reports from all branches
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
            <SelectTrigger className="w-[140px]">
              <CalendarIcon className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 วัน</SelectItem>
              <SelectItem value="30d">30 วัน</SelectItem>
              <SelectItem value="90d">90 วัน</SelectItem>
              <SelectItem value="month">เดือนนี้</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[180px]">
              <Store className="h-4 w-4 mr-2" />
              <SelectValue placeholder="ทุกสาขา" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสาขา</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.code} value={b.code}>
                  {b.code} - {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              ยอดขายวันนี้
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalSales)}</div>
            <p className="text-xs text-muted-foreground">
              เป้า: {formatCurrency(summary.totalTarget)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              % ทำได้ตามเป้า
            </CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {summary.achievementPercent.toFixed(1)}%
              {summary.achievementPercent >= 100 ? (
                <Badge variant="default" className="bg-green-500">บรรลุเป้า!</Badge>
              ) : (
                <Badge variant="secondary">
                  {(100 - summary.achievementPercent).toFixed(1)}% ขาด
                </Badge>
              )}
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, summary.achievementPercent)}%` }}
              />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              เฉลี่ย TC/สาขา
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.avgTc}</div>
            <p className="text-xs text-muted-foreground">Transaction Count</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              สาขาที่รายงานวันนี้
            </CardTitle>
            <Store className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.activeBranches}/{summary.totalBranches}
            </div>
            <p className="text-xs text-muted-foreground">สาขา</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="trend" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trend">แนวโน้มยอดขาย</TabsTrigger>
          <TabsTrigger value="comparison">เปรียบเทียบสาขา</TabsTrigger>
          <TabsTrigger value="forecast">พยากรณ์</TabsTrigger>
          <TabsTrigger value="products">สินค้าขายดี</TabsTrigger>
        </TabsList>
        
        {/* Trend Tab */}
        <TabsContent value="trend" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>ยอดขายรายวัน</CardTitle>
                <CardDescription>เปรียบเทียบยอดขายจริงกับเป้าหมาย</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={dailyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="displayDate" className="text-xs" />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => `วันที่ ${label}`}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="target" 
                      name="เป้าหมาย" 
                      stroke="hsl(var(--muted-foreground))" 
                      fill="hsl(var(--muted))" 
                      strokeDasharray="5 5"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="sales" 
                      name="ยอดขาย" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary) / 0.3)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>สัดส่วนแก้ว</CardTitle>
                <CardDescription>Size S vs Size M</CardDescription>
              </CardHeader>
              <CardContent>
                {cupSizeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={cupSizeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {cupSizeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `${value} แก้ว`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                    ไม่มีข้อมูลแก้ว
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Branch Comparison Tab */}
        <TabsContent value="comparison">
          <Card>
            <CardHeader>
              <CardTitle>เปรียบเทียบสาขา</CardTitle>
              <CardDescription>ยอดขายรวมแยกตามสาขา</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={branchComparisonData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="code" type="category" width={60} />
                  <Tooltip 
                    formatter={(value: number, name: string) => [formatCurrency(value), name === 'sales' ? 'ยอดขาย' : 'เป้าหมาย']}
                  />
                  <Legend />
                  <Bar dataKey="target" name="เป้าหมาย" fill="hsl(var(--muted))" />
                  <Bar dataKey="sales" name="ยอดขาย" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Forecast Tab */}
        <TabsContent value="forecast">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                พยากรณ์ยอดขาย (7 วันข้างหน้า)
              </CardTitle>
              <CardDescription>
                คำนวณจากค่าเฉลี่ยเคลื่อนที่และแนวโน้มข้อมูลย้อนหลัง
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forecast.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">พรุ่งนี้ (คาดการณ์)</p>
                        <p className="text-2xl font-bold text-primary">
                          {formatCurrency(forecast[0]?.predicted || 0)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">รวม 7 วัน (คาดการณ์)</p>
                        <p className="text-2xl font-bold text-primary">
                          {formatCurrency(forecast.reduce((sum, f) => sum + f.predicted, 0))}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">แนวโน้ม</p>
                        <p className="text-2xl font-bold text-primary flex items-center gap-2">
                          {forecast[6]?.predicted > forecast[0]?.predicted ? (
                            <>
                              <TrendingUp className="h-5 w-5 text-green-500" />
                              ขาขึ้น
                            </>
                          ) : (
                            <>
                              <TrendingDown className="h-5 w-5 text-red-500" />
                              ขาลง
                            </>
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={forecastChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="displayDate" className="text-xs" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-xs" />
                      <Tooltip 
                        formatter={(value: number, name: string) => {
                          if (value === null) return ['-', name];
                          return [formatCurrency(value), name];
                        }}
                      />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="sales" 
                        name="ยอดขายจริง" 
                        stroke="hsl(var(--primary))" 
                        fill="hsl(var(--primary) / 0.3)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="upper" 
                        name="ขอบบน" 
                        stroke="hsl(var(--chart-2))" 
                        fill="hsl(var(--chart-2) / 0.1)" 
                        strokeDasharray="3 3"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="predicted" 
                        name="คาดการณ์" 
                        stroke="hsl(var(--chart-3))" 
                        fill="hsl(var(--chart-3) / 0.3)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="lower" 
                        name="ขอบล่าง" 
                        stroke="hsl(var(--chart-4))" 
                        fill="hsl(var(--chart-4) / 0.1)" 
                        strokeDasharray="3 3"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  ต้องมีข้อมูลอย่างน้อย 7 วันเพื่อพยากรณ์
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Products Tab */}
        <TabsContent value="products">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Citrus className="h-5 w-5 text-yellow-500" />
                  น้ำเลม่อนขายดี
                </CardTitle>
                <CardDescription>รวมคะแนนจากการติดอันดับ</CardDescription>
              </CardHeader>
              <CardContent>
                {topSellers.lemonade.length > 0 ? (
                  <div className="space-y-3">
                    {topSellers.lemonade.map((item, idx) => (
                      <div key={item.name} className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                          idx === 0 ? "bg-yellow-500 text-white" :
                          idx === 1 ? "bg-gray-400 text-white" :
                          idx === 2 ? "bg-orange-600 text-white" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{item.name}</p>
                        </div>
                        <Badge variant="secondary">{item.score} pts</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    ไม่มีข้อมูล
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IceCream className="h-5 w-5 text-blue-500" />
                  น้ำสเลอปี้ขายดี
                </CardTitle>
                <CardDescription>รวมคะแนนจากการติดอันดับ</CardDescription>
              </CardHeader>
              <CardContent>
                {topSellers.slurpee.length > 0 ? (
                  <div className="space-y-3">
                    {topSellers.slurpee.map((item, idx) => (
                      <div key={item.name} className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                          idx === 0 ? "bg-yellow-500 text-white" :
                          idx === 1 ? "bg-gray-400 text-white" :
                          idx === 2 ? "bg-orange-600 text-white" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{item.name}</p>
                        </div>
                        <Badge variant="secondary">{item.score} pts</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    ไม่มีข้อมูล
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>รายละเอียดรายงาน</CardTitle>
          <CardDescription>
            ข้อมูลทั้งหมด {reports?.length || 0} รายการ
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead>สาขา</TableHead>
                  <TableHead className="text-right">ยอดขาย</TableHead>
                  <TableHead className="text-right">เป้า</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">TC</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">S/M</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports && reports.length > 0 ? (
                  reports.slice(0, 50).map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        {format(parseISO(report.report_date), 'd MMM yy', { locale: th })}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{report.branch_code}</div>
                        <div className="text-xs text-muted-foreground">{report.branch_name}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(report.sales))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(Number(report.sales_target))}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={report.diff_target_percent >= 0 ? 'default' : 'destructive'}>
                          {report.diff_target_percent >= 0 ? '+' : ''}{report.diff_target_percent?.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{report.tc}</TableCell>
                      <TableCell className="text-right">{report.stock_lemon}</TableCell>
                      <TableCell className="text-right">
                        {report.cup_size_s}/{report.cup_size_m}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      ยังไม่มีข้อมูลรายงาน กรุณา Backfill ข้อมูลจากกลุ่ม LINE
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
