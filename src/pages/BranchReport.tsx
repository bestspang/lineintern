import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfMonth, endOfMonth, parseISO, addDays, subMonths, getDay } from 'date-fns';
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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, ComposedChart } from 'recharts';
import { TrendingUp, TrendingDown, Calendar as CalendarIcon, Store, Target, Users, Package, RefreshCw, ChevronRight, ChevronLeft, Award, Citrus, IceCream, AlertTriangle, Trophy, Medal } from 'lucide-react';
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

const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export default function BranchReport() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'month'>('90d');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<string>('daily');

  // Calculate date range for all data (3 months back)
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const start = subMonths(now, 3);
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(now, 'yyyy-MM-dd'),
    };
  }, []);

  // Fetch all branch reports
  const { data: allReports, isLoading, refetch } = useQuery({
    queryKey: ['branch-reports-all', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branch_daily_reports')
        .select('*')
        .gte('report_date', startDate)
        .lte('report_date', endDate)
        .order('report_date', { ascending: false });
      
      if (error) throw error;
      return data as BranchReport[];
    },
  });

  // Filter reports based on selection
  const reports = useMemo(() => {
    if (!allReports) return [];
    let filtered = allReports;
    
    if (selectedBranch !== 'all') {
      filtered = filtered.filter(r => r.branch_name === selectedBranch);
    }
    
    return filtered;
  }, [allReports, selectedBranch]);

  // Get unique branches by branch_name
  const branches = useMemo(() => {
    if (!allReports) return [];
    const uniqueBranches = new Map<string, { code: string; name: string }>();
    allReports.forEach(r => {
      if (!uniqueBranches.has(r.branch_name)) {
        uniqueBranches.set(r.branch_name, { code: r.branch_code, name: r.branch_name });
      }
    });
    return Array.from(uniqueBranches.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [allReports]);

  // Get reports for selected date
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const reportsForSelectedDate = useMemo(() => {
    if (!allReports) return [];
    return allReports.filter(r => r.report_date === selectedDateStr);
  }, [allReports, selectedDateStr]);

  // Get all unique dates that have reports
  const reportDates = useMemo(() => {
    if (!allReports) return new Set<string>();
    return new Set(allReports.map(r => r.report_date));
  }, [allReports]);

  // Navigate to previous/next date with reports
  const goToPreviousDate = () => {
    const dates = Array.from(reportDates).sort();
    const currentIdx = dates.indexOf(selectedDateStr);
    if (currentIdx > 0) {
      setSelectedDate(parseISO(dates[currentIdx - 1]));
    } else if (dates.length > 0 && currentIdx === -1) {
      // Find closest previous date
      const prevDates = dates.filter(d => d < selectedDateStr);
      if (prevDates.length > 0) {
        setSelectedDate(parseISO(prevDates[prevDates.length - 1]));
      }
    }
  };

  const goToNextDate = () => {
    const dates = Array.from(reportDates).sort();
    const currentIdx = dates.indexOf(selectedDateStr);
    if (currentIdx >= 0 && currentIdx < dates.length - 1) {
      setSelectedDate(parseISO(dates[currentIdx + 1]));
    } else if (currentIdx === -1) {
      // Find closest next date
      const nextDates = dates.filter(d => d > selectedDateStr);
      if (nextDates.length > 0) {
        setSelectedDate(parseISO(nextDates[0]));
      }
    }
  };

  // Calculate summary stats for selected date
  const dailySummary = useMemo(() => {
    if (!reportsForSelectedDate || reportsForSelectedDate.length === 0) {
      return { totalSales: 0, totalTarget: 0, avgTc: 0, branchCount: 0, achievementPercent: 0 };
    }

    const totalSales = reportsForSelectedDate.reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const totalTarget = reportsForSelectedDate.reduce((sum, r) => sum + Number(r.sales_target || 0), 0);
    const avgTc = Math.round(reportsForSelectedDate.reduce((sum, r) => sum + (r.tc || 0), 0) / reportsForSelectedDate.length);
    const achievementPercent = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0;

    return {
      totalSales,
      totalTarget,
      avgTc,
      branchCount: reportsForSelectedDate.length,
      achievementPercent,
    };
  }, [reportsForSelectedDate]);

  // Day of Week Analysis
  const dayOfWeekData = useMemo(() => {
    if (!allReports || allReports.length === 0) return [];
    
    const byDayOfWeek: { [key: number]: { total: number; count: number } } = {};
    
    allReports.forEach(r => {
      const dayNum = getDay(parseISO(r.report_date));
      if (!byDayOfWeek[dayNum]) {
        byDayOfWeek[dayNum] = { total: 0, count: 0 };
      }
      byDayOfWeek[dayNum].total += Number(r.sales || 0);
      byDayOfWeek[dayNum].count += 1;
    });
    
    return Object.entries(byDayOfWeek)
      .map(([day, data]) => ({
        day: Number(day),
        dayName: DAY_NAMES[Number(day)],
        avgSales: Math.round(data.total / data.count),
        totalSales: data.total,
        count: data.count,
      }))
      .sort((a, b) => a.day - b.day);
  }, [allReports]);

  // Find best and worst days
  const bestDay = useMemo(() => {
    if (dayOfWeekData.length === 0) return null;
    return dayOfWeekData.reduce((best, curr) => curr.avgSales > best.avgSales ? curr : best);
  }, [dayOfWeekData]);

  const worstDay = useMemo(() => {
    if (dayOfWeekData.length === 0) return null;
    return dayOfWeekData.reduce((worst, curr) => curr.avgSales < worst.avgSales ? curr : worst);
  }, [dayOfWeekData]);

  // Branch Performance Scorecard
  const branchScorecard = useMemo(() => {
    if (!allReports || allReports.length === 0) return [];
    
    const byBranch = new Map<string, {
      name: string;
      code: string;
      totalSales: number;
      totalTarget: number;
      reportCount: number;
      aboveTargetCount: number;
      avgTc: number;
      tcCount: number;
      lastReportDate: string;
    }>();
    
    allReports.forEach(r => {
      const key = r.branch_name;
      const existing = byBranch.get(key) || {
        name: r.branch_name,
        code: r.branch_code,
        totalSales: 0,
        totalTarget: 0,
        reportCount: 0,
        aboveTargetCount: 0,
        avgTc: 0,
        tcCount: 0,
        lastReportDate: '',
      };
      
      existing.totalSales += Number(r.sales || 0);
      existing.totalTarget += Number(r.sales_target || 0);
      existing.reportCount += 1;
      if (Number(r.sales) >= Number(r.sales_target)) {
        existing.aboveTargetCount += 1;
      }
      if (r.tc) {
        existing.avgTc += r.tc;
        existing.tcCount += 1;
      }
      if (!existing.lastReportDate || r.report_date > existing.lastReportDate) {
        existing.lastReportDate = r.report_date;
      }
      
      byBranch.set(key, existing);
    });
    
    return Array.from(byBranch.values())
      .map(b => ({
        ...b,
        avgTc: b.tcCount > 0 ? Math.round(b.avgTc / b.tcCount) : 0,
        achievementRate: b.totalTarget > 0 ? Math.round((b.totalSales / b.totalTarget) * 100) : 0,
        targetHitRate: b.reportCount > 0 ? Math.round((b.aboveTargetCount / b.reportCount) * 100) : 0,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [allReports]);

  // Daily trend data
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
          const points = 5 - idx;
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

  // Missing branches for selected date
  const missingBranches = useMemo(() => {
    const reportedBranches = new Set(reportsForSelectedDate.map(r => r.branch_name));
    return branches.filter(b => !reportedBranches.has(b.name));
  }, [reportsForSelectedDate, branches]);

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
            Daily sales reports from all branches ({allReports?.length || 0} รายงาน)
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[220px]">
              <Store className="h-4 w-4 mr-2" />
              <SelectValue placeholder="ทุกสาขา" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสาขา ({branches.length})</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.name} value={b.name}>
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

      {/* Date Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" onClick={goToPreviousDate}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[200px]">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {format(selectedDate, 'EEEE d MMMM yyyy', { locale: th })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  modifiers={{
                    hasReport: Array.from(reportDates).map(d => parseISO(d)),
                  }}
                  modifiersStyles={{
                    hasReport: { backgroundColor: 'hsl(var(--primary) / 0.2)', fontWeight: 'bold' },
                  }}
                />
              </PopoverContent>
            </Popover>
            
            <Button variant="outline" size="icon" onClick={goToNextDate}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="daily">รายวัน</TabsTrigger>
          <TabsTrigger value="dayofweek">วันในสัปดาห์</TabsTrigger>
          <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
          <TabsTrigger value="products">สินค้าขายดี</TabsTrigger>
          <TabsTrigger value="trend">แนวโน้ม</TabsTrigger>
        </TabsList>
        
        {/* Daily View Tab */}
        <TabsContent value="daily" className="space-y-4">
          {/* Daily Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  ยอดขายรวม
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(dailySummary.totalSales)}</div>
                <p className="text-xs text-muted-foreground">
                  เป้า: {formatCurrency(dailySummary.totalTarget)}
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
                  {dailySummary.achievementPercent.toFixed(1)}%
                  {dailySummary.achievementPercent >= 100 ? (
                    <Badge variant="default" className="bg-green-500">บรรลุเป้า!</Badge>
                  ) : dailySummary.achievementPercent > 0 ? (
                    <Badge variant="secondary">
                      {(100 - dailySummary.achievementPercent).toFixed(1)}% ขาด
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(100, dailySummary.achievementPercent)}%` }}
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
                <div className="text-2xl font-bold">{dailySummary.avgTc}</div>
                <p className="text-xs text-muted-foreground">Transaction Count</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  สาขาที่รายงาน
                </CardTitle>
                <Store className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dailySummary.branchCount}/{branches.length}
                </div>
                <p className="text-xs text-muted-foreground">สาขา</p>
              </CardContent>
            </Card>
          </div>

          {/* Missing Branches Alert */}
          {missingBranches.length > 0 && reportsForSelectedDate.length > 0 && (
            <Card className="border-orange-500/50 bg-orange-500/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="h-4 w-4" />
                  สาขาที่ยังไม่ส่งรายงาน ({missingBranches.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {missingBranches.map(b => (
                    <Badge key={b.name} variant="outline" className="text-orange-600 border-orange-500">
                      {b.code} - {b.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Daily Reports Table */}
          <Card>
            <CardHeader>
              <CardTitle>รายงานวันที่ {format(selectedDate, 'd MMMM yyyy', { locale: th })}</CardTitle>
              <CardDescription>
                {reportsForSelectedDate.length > 0 
                  ? `${reportsForSelectedDate.length} รายงาน`
                  : 'ไม่มีรายงานในวันนี้'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reportsForSelectedDate.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                      {reportsForSelectedDate.sort((a, b) => Number(b.sales) - Number(a.sales)).map((report) => (
                        <TableRow key={report.id}>
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
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>ไม่มีรายงานในวันที่เลือก</p>
                  <p className="text-sm mt-2">ลองเลือกวันอื่นที่มีข้อมูล</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Day of Week Analysis Tab */}
        <TabsContent value="dayofweek" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bestDay && (
              <Card className="border-green-500/50 bg-green-500/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-600">
                    <Trophy className="h-4 w-4" />
                    วันที่ขายดีที่สุด
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">วัน{bestDay.dayName}</div>
                  <p className="text-sm text-muted-foreground">
                    เฉลี่ย {formatCurrency(bestDay.avgSales)}/วัน
                  </p>
                </CardContent>
              </Card>
            )}
            
            {worstDay && (
              <Card className="border-orange-500/50 bg-orange-500/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-600">
                    <TrendingDown className="h-4 w-4" />
                    วันที่ขายน้อยที่สุด
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">วัน{worstDay.dayName}</div>
                  <p className="text-sm text-muted-foreground">
                    เฉลี่ย {formatCurrency(worstDay.avgSales)}/วัน
                  </p>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  ส่วนต่าง
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bestDay && worstDay && (
                  <>
                    <div className="text-2xl font-bold">
                      {formatCurrency(bestDay.avgSales - worstDay.avgSales)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      +{((bestDay.avgSales / worstDay.avgSales - 1) * 100).toFixed(0)}% จากวันที่แย่สุด
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>ยอดขายเฉลี่ยแต่ละวันในสัปดาห์</CardTitle>
              <CardDescription>วิเคราะห์ว่าวันไหนขายดีที่สุด</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={dayOfWeekData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dayName" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      formatCurrency(value), 
                      name === 'avgSales' ? 'ยอดขายเฉลี่ย' : name
                    ]}
                  />
                  <Bar 
                    dataKey="avgSales" 
                    name="ยอดขายเฉลี่ย"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branch Scorecard Tab */}
        <TabsContent value="scorecard" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branchScorecard.map((branch, idx) => (
              <Card key={branch.name} className={cn(
                idx === 0 && "border-yellow-500/50 bg-yellow-500/5",
                idx === 1 && "border-gray-400/50 bg-gray-400/5",
                idx === 2 && "border-orange-600/50 bg-orange-600/5"
              )}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {idx === 0 && <Trophy className="h-5 w-5 text-yellow-500" />}
                      {idx === 1 && <Medal className="h-5 w-5 text-gray-400" />}
                      {idx === 2 && <Medal className="h-5 w-5 text-orange-600" />}
                      <CardTitle className="text-lg">{branch.code}</CardTitle>
                    </div>
                    <Badge variant="outline">#{idx + 1}</Badge>
                  </div>
                  <CardDescription>{branch.name}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">ยอดขายรวม</span>
                    <span className="font-bold">{formatCurrency(branch.totalSales)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">% ถึงเป้า</span>
                    <Badge variant={branch.achievementRate >= 100 ? 'default' : 'secondary'}>
                      {branch.achievementRate}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">อัตราทำได้ตามเป้า</span>
                    <span className="text-sm">{branch.targetHitRate}% ({branch.aboveTargetCount}/{branch.reportCount})</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">เฉลี่ย TC</span>
                    <span className="text-sm">{branch.avgTc}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">รายงานล่าสุด</span>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(branch.lastReportDate), 'd MMM', { locale: th })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Trend Tab */}
        <TabsContent value="trend" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>แนวโน้มยอดขายรายวัน</CardTitle>
              <CardDescription>เปรียบเทียบยอดขายจริงกับเป้าหมาย</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
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
        </TabsContent>
      </Tabs>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>รายละเอียดรายงานทั้งหมด</CardTitle>
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
