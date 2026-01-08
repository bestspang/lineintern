import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, parseISO, addDays, subMonths, getDay, differenceInDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth } from 'date-fns';
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
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, ComposedChart, ReferenceLine 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Calendar as CalendarIcon, Store, Target, Users, Package, 
  RefreshCw, ChevronRight, ChevronLeft, Award, Citrus, IceCream, AlertTriangle, 
  Trophy, Medal, ArrowUpRight, ArrowDownRight, Zap, BarChart3, PieChartIcon,
  Lightbulb, Clock, Activity
} from 'lucide-react';
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

type TimeRange = '1d' | '3d' | '7d' | '30d' | '90d' | '365d';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; days: number }[] = [
  { value: '1d', label: '1 วัน', days: 1 },
  { value: '3d', label: '3 วัน', days: 3 },
  { value: '7d', label: 'สัปดาห์', days: 7 },
  { value: '30d', label: 'เดือน', days: 30 },
  { value: '90d', label: '3 เดือน', days: 90 },
  { value: '365d', label: 'ปี', days: 365 },
];

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// Simple Linear Regression for Forecasting
function linearRegression(data: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = data.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  
  const sumX = data.reduce((sum, p) => sum + p.x, 0);
  const sumY = data.reduce((sum, p) => sum + p.y, 0);
  const sumXY = data.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = data.reduce((sum, p) => sum + p.x * p.x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
  const intercept = (sumY - slope * sumX) / n || 0;
  
  return { slope, intercept };
}

export default function BranchReport() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Calculate date range based on selected time range (fetch all data, filter later)
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const start = subMonths(now, 12); // Always fetch 12 months for all analytics
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(now, 'yyyy-MM-dd'),
    };
  }, []);

  // Get days for current time range
  const timeRangeDays = TIME_RANGE_OPTIONS.find(t => t.value === timeRange)?.days || 30;

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

  // Filter reports based on time range and branch
  const filteredReports = useMemo(() => {
    if (!allReports) return [];
    const cutoffDate = format(subDays(new Date(), timeRangeDays), 'yyyy-MM-dd');
    let filtered = allReports.filter(r => r.report_date >= cutoffDate);
    
    if (selectedBranch !== 'all') {
      filtered = filtered.filter(r => r.branch_name === selectedBranch);
    }
    
    return filtered;
  }, [allReports, timeRangeDays, selectedBranch]);

  // Get unique branches
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

  // Reports for selected date (for daily view)
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const reportsForSelectedDate = useMemo(() => {
    if (!allReports) return [];
    return allReports.filter(r => r.report_date === selectedDateStr);
  }, [allReports, selectedDateStr]);

  // All dates with reports
  const reportDates = useMemo(() => {
    if (!allReports) return new Set<string>();
    return new Set(allReports.map(r => r.report_date));
  }, [allReports]);

  // Navigate dates
  const goToPreviousDate = () => {
    const dates = Array.from(reportDates).sort();
    const currentIdx = dates.indexOf(selectedDateStr);
    if (currentIdx > 0) {
      setSelectedDate(parseISO(dates[currentIdx - 1]));
    } else if (dates.length > 0 && currentIdx === -1) {
      const prevDates = dates.filter(d => d < selectedDateStr);
      if (prevDates.length > 0) setSelectedDate(parseISO(prevDates[prevDates.length - 1]));
    }
  };

  const goToNextDate = () => {
    const dates = Array.from(reportDates).sort();
    const currentIdx = dates.indexOf(selectedDateStr);
    if (currentIdx >= 0 && currentIdx < dates.length - 1) {
      setSelectedDate(parseISO(dates[currentIdx + 1]));
    } else if (currentIdx === -1) {
      const nextDates = dates.filter(d => d > selectedDateStr);
      if (nextDates.length > 0) setSelectedDate(parseISO(nextDates[0]));
    }
  };

  // ============ OVERVIEW STATS ============
  const overviewStats = useMemo(() => {
    if (!filteredReports || filteredReports.length === 0) {
      return {
        totalSales: 0, totalTarget: 0, avgDailySales: 0, avgTc: 0,
        branchCoverage: '0/0', achievementRate: 0, reportCount: 0,
        trend: 0, trendDirection: 'neutral' as const
      };
    }

    const totalSales = filteredReports.reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const totalTarget = filteredReports.reduce((sum, r) => sum + Number(r.sales_target || 0), 0);
    const uniqueDates = new Set(filteredReports.map(r => r.report_date)).size;
    const avgDailySales = uniqueDates > 0 ? totalSales / uniqueDates : 0;
    const avgTc = Math.round(filteredReports.reduce((sum, r) => sum + (r.tc || 0), 0) / filteredReports.length);
    const uniqueBranches = new Set(filteredReports.map(r => r.branch_name)).size;
    const achievementRate = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0;

    // Calculate trend (compare first half vs second half)
    const sortedByDate = [...filteredReports].sort((a, b) => a.report_date.localeCompare(b.report_date));
    const midpoint = Math.floor(sortedByDate.length / 2);
    const firstHalfSales = sortedByDate.slice(0, midpoint).reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const secondHalfSales = sortedByDate.slice(midpoint).reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const trend = firstHalfSales > 0 ? ((secondHalfSales - firstHalfSales) / firstHalfSales) * 100 : 0;

    return {
      totalSales,
      totalTarget,
      avgDailySales,
      avgTc,
      branchCoverage: `${uniqueBranches}/${branches.length}`,
      achievementRate,
      reportCount: filteredReports.length,
      trend,
      trendDirection: trend > 5 ? 'up' : trend < -5 ? 'down' : 'neutral' as const
    };
  }, [filteredReports, branches.length]);

  // ============ DAILY SUMMARY ============
  const dailySummary = useMemo(() => {
    if (!reportsForSelectedDate || reportsForSelectedDate.length === 0) {
      return { totalSales: 0, totalTarget: 0, avgTc: 0, branchCount: 0, achievementPercent: 0 };
    }

    const totalSales = reportsForSelectedDate.reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const totalTarget = reportsForSelectedDate.reduce((sum, r) => sum + Number(r.sales_target || 0), 0);
    const avgTc = Math.round(reportsForSelectedDate.reduce((sum, r) => sum + (r.tc || 0), 0) / reportsForSelectedDate.length);
    const achievementPercent = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0;

    return { totalSales, totalTarget, avgTc, branchCount: reportsForSelectedDate.length, achievementPercent };
  }, [reportsForSelectedDate]);

  // ============ DAILY TREND DATA ============
  const dailyTrendData = useMemo(() => {
    if (!filteredReports) return [];
    
    const byDate = new Map<string, { sales: number; target: number; count: number }>();
    filteredReports.forEach(r => {
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
  }, [filteredReports]);

  // ============ FORECAST DATA ============
  const forecastData = useMemo(() => {
    if (dailyTrendData.length < 3) return [];
    
    // Prepare data for regression
    const regressionData = dailyTrendData.map((d, i) => ({ x: i, y: d.sales }));
    const { slope, intercept } = linearRegression(regressionData);
    
    // Generate forecast for next 7 days
    const lastDate = parseISO(dailyTrendData[dailyTrendData.length - 1].date);
    const forecastDays = 7;
    const forecast: { date: string; displayDate: string; forecast: number; forecastLow: number; forecastHigh: number }[] = [];
    
    // Calculate standard deviation for confidence interval
    const predictions = regressionData.map(d => slope * d.x + intercept);
    const residuals = regressionData.map((d, i) => d.y - predictions[i]);
    const stdDev = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length) || 0;
    
    for (let i = 1; i <= forecastDays; i++) {
      const futureDate = addDays(lastDate, i);
      const x = dailyTrendData.length + i - 1;
      const predicted = Math.max(0, slope * x + intercept);
      
      forecast.push({
        date: format(futureDate, 'yyyy-MM-dd'),
        displayDate: format(futureDate, 'd MMM', { locale: th }),
        forecast: Math.round(predicted),
        forecastLow: Math.round(Math.max(0, predicted - 1.96 * stdDev)),
        forecastHigh: Math.round(predicted + 1.96 * stdDev),
      });
    }
    
    return forecast;
  }, [dailyTrendData]);

  // Combined chart data (actual + forecast)
  const combinedTrendData = useMemo(() => {
    const actual = dailyTrendData.map(d => ({
      ...d,
      forecast: undefined as number | undefined,
      forecastLow: undefined as number | undefined,
      forecastHigh: undefined as number | undefined,
    }));
    
    const forecast = forecastData.map(d => ({
      date: d.date,
      displayDate: d.displayDate,
      sales: undefined as number | undefined,
      target: undefined as number | undefined,
      branches: undefined as number | undefined,
      forecast: d.forecast,
      forecastLow: d.forecastLow,
      forecastHigh: d.forecastHigh,
    }));
    
    return [...actual, ...forecast];
  }, [dailyTrendData, forecastData]);

  // ============ DAY OF WEEK ANALYSIS ============
  const dayOfWeekData = useMemo(() => {
    if (!filteredReports || filteredReports.length === 0) return [];
    
    const byDayOfWeek: { [key: number]: { total: number; count: number } } = {};
    
    filteredReports.forEach(r => {
      const dayNum = getDay(parseISO(r.report_date));
      if (!byDayOfWeek[dayNum]) byDayOfWeek[dayNum] = { total: 0, count: 0 };
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
  }, [filteredReports]);

  const bestDay = useMemo(() => {
    if (dayOfWeekData.length === 0) return null;
    return dayOfWeekData.reduce((best, curr) => curr.avgSales > best.avgSales ? curr : best);
  }, [dayOfWeekData]);

  const worstDay = useMemo(() => {
    if (dayOfWeekData.length === 0) return null;
    return dayOfWeekData.reduce((worst, curr) => curr.avgSales < worst.avgSales ? curr : worst);
  }, [dayOfWeekData]);

  // ============ COMPARISON DATA (WoW, MoM) ============
  const comparisonData = useMemo(() => {
    if (!allReports || allReports.length === 0) return { wow: null, mom: null };
    
    const now = new Date();
    
    // Week over Week
    const thisWeekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const thisWeekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const lastWeekStart = format(startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const lastWeekEnd = format(endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    
    const thisWeekSales = allReports.filter(r => r.report_date >= thisWeekStart && r.report_date <= thisWeekEnd)
      .reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const lastWeekSales = allReports.filter(r => r.report_date >= lastWeekStart && r.report_date <= lastWeekEnd)
      .reduce((sum, r) => sum + Number(r.sales || 0), 0);
    
    const wowChange = lastWeekSales > 0 ? ((thisWeekSales - lastWeekSales) / lastWeekSales) * 100 : 0;
    
    // Month over Month
    const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
    const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
    const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
    
    const thisMonthSales = allReports.filter(r => r.report_date >= thisMonthStart && r.report_date <= thisMonthEnd)
      .reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const lastMonthSales = allReports.filter(r => r.report_date >= lastMonthStart && r.report_date <= lastMonthEnd)
      .reduce((sum, r) => sum + Number(r.sales || 0), 0);
    
    const momChange = lastMonthSales > 0 ? ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100 : 0;
    
    return {
      wow: { current: thisWeekSales, previous: lastWeekSales, change: wowChange },
      mom: { current: thisMonthSales, previous: lastMonthSales, change: momChange },
    };
  }, [allReports]);

  // ============ BRANCH COMPARISON ============
  const branchComparisonData = useMemo(() => {
    if (!filteredReports || filteredReports.length === 0) return [];
    
    const byBranch = new Map<string, { sales: number; target: number; code: string }>();
    filteredReports.forEach(r => {
      const existing = byBranch.get(r.branch_name) || { sales: 0, target: 0, code: r.branch_code };
      byBranch.set(r.branch_name, {
        code: r.branch_code,
        sales: existing.sales + Number(r.sales || 0),
        target: existing.target + Number(r.sales_target || 0),
      });
    });
    
    return Array.from(byBranch.entries())
      .map(([name, data]) => ({
        name: data.code,
        fullName: name,
        sales: data.sales,
        target: data.target,
        achievement: data.target > 0 ? Math.round((data.sales / data.target) * 100) : 0,
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [filteredReports]);

  // ============ BRANCH SCORECARD ============
  const branchScorecard = useMemo(() => {
    if (!filteredReports || filteredReports.length === 0) return [];
    
    const byBranch = new Map<string, {
      name: string; code: string; totalSales: number; totalTarget: number;
      reportCount: number; aboveTargetCount: number; avgTc: number; tcCount: number;
      lastReportDate: string;
    }>();
    
    filteredReports.forEach(r => {
      const key = r.branch_name;
      const existing = byBranch.get(key) || {
        name: r.branch_name, code: r.branch_code, totalSales: 0, totalTarget: 0,
        reportCount: 0, aboveTargetCount: 0, avgTc: 0, tcCount: 0, lastReportDate: '',
      };
      
      existing.totalSales += Number(r.sales || 0);
      existing.totalTarget += Number(r.sales_target || 0);
      existing.reportCount += 1;
      if (Number(r.sales) >= Number(r.sales_target)) existing.aboveTargetCount += 1;
      if (r.tc) { existing.avgTc += r.tc; existing.tcCount += 1; }
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
  }, [filteredReports]);

  // ============ CUP SIZE & TOP SELLERS ============
  const cupSizeData = useMemo(() => {
    if (!filteredReports) return [];
    const totalS = filteredReports.reduce((sum, r) => sum + (r.cup_size_s || 0), 0);
    const totalM = filteredReports.reduce((sum, r) => sum + (r.cup_size_m || 0), 0);
    if (totalS === 0 && totalM === 0) return [];
    return [
      { name: 'Size S', value: totalS, fill: 'hsl(var(--primary))' },
      { name: 'Size M', value: totalM, fill: 'hsl(var(--chart-2))' },
    ];
  }, [filteredReports]);

  const topSellers = useMemo(() => {
    if (!filteredReports) return { lemonade: [], slurpee: [] };
    
    const lemonadeCount = new Map<string, number>();
    const slurpeeCount = new Map<string, number>();
    
    filteredReports.forEach(r => {
      const lemonadeList = Array.isArray(r.top_lemonade) ? r.top_lemonade : [];
      const slurpeeList = Array.isArray(r.top_slurpee) ? r.top_slurpee : [];
      
      lemonadeList.forEach((item: string, idx: number) => {
        if (item) lemonadeCount.set(item, (lemonadeCount.get(item) || 0) + (5 - idx));
      });
      slurpeeList.forEach((item: string, idx: number) => {
        if (item) slurpeeCount.set(item, (slurpeeCount.get(item) || 0) + (5 - idx));
      });
    });
    
    return {
      lemonade: Array.from(lemonadeCount.entries()).map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score).slice(0, 5),
      slurpee: Array.from(slurpeeCount.entries()).map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score).slice(0, 5),
    };
  }, [filteredReports]);

  // ============ INSIGHTS ============
  const insights = useMemo(() => {
    const items: { icon: typeof Lightbulb; text: string; type: 'success' | 'warning' | 'info' }[] = [];
    
    if (bestDay && worstDay) {
      const diff = bestDay.avgSales > 0 ? ((bestDay.avgSales - worstDay.avgSales) / worstDay.avgSales * 100).toFixed(0) : 0;
      items.push({
        icon: Lightbulb,
        text: `วัน${bestDay.dayName}ขายดีกว่าวัน${worstDay.dayName} ${diff}%`,
        type: 'info'
      });
    }
    
    if (overviewStats.trend > 10) {
      items.push({
        icon: TrendingUp,
        text: `ยอดขายมีแนวโน้มเพิ่มขึ้น ${overviewStats.trend.toFixed(0)}%`,
        type: 'success'
      });
    } else if (overviewStats.trend < -10) {
      items.push({
        icon: TrendingDown,
        text: `ยอดขายมีแนวโน้มลดลง ${Math.abs(overviewStats.trend).toFixed(0)}%`,
        type: 'warning'
      });
    }
    
    if (branchScorecard.length > 0) {
      const topBranch = branchScorecard[0];
      items.push({
        icon: Trophy,
        text: `${topBranch.code} (${topBranch.name}) ยอดขายสูงสุด`,
        type: 'success'
      });
    }
    
    if (overviewStats.achievementRate >= 100) {
      items.push({
        icon: Target,
        text: `บรรลุเป้าหมายรวม ${overviewStats.achievementRate.toFixed(0)}%!`,
        type: 'success'
      });
    } else if (overviewStats.achievementRate > 0) {
      items.push({
        icon: Target,
        text: `ขาดอีก ${(100 - overviewStats.achievementRate).toFixed(0)}% เพื่อบรรลุเป้า`,
        type: 'warning'
      });
    }
    
    return items.slice(0, 4);
  }, [bestDay, worstDay, overviewStats, branchScorecard]);

  // Missing branches
  const missingBranches = useMemo(() => {
    const reportedBranches = new Set(reportsForSelectedDate.map(r => r.branch_name));
    return branches.filter(b => !reportedBranches.has(b.name));
  }, [reportsForSelectedDate, branches]);

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header with Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BarChart3 className="h-7 w-7 text-primary" />
            </div>
            Branch Report Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            วิเคราะห์ยอดขายรายวัน • {allReports?.length || 0} รายงาน
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Time Range Selector */}
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[140px]">
              <Clock className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Branch Filter */}
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[200px]">
              <Store className="h-4 w-4 mr-2" />
              <SelectValue placeholder="ทุกสาขา" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสาขา ({branches.length})</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.name} value={b.name}>{b.code} - {b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              ยอดขายรวม
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overviewStats.totalSales)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {TIME_RANGE_OPTIONS.find(t => t.value === timeRange)?.label}
            </p>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-chart-2/5 to-transparent" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              % บรรลุเป้า
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {overviewStats.achievementRate.toFixed(1)}%
              {overviewStats.achievementRate >= 100 && <Badge className="bg-green-500">✓</Badge>}
            </div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, overviewStats.achievementRate)}%` }} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              เฉลี่ย/วัน
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overviewStats.avgDailySales)}</div>
            <p className="text-xs text-muted-foreground mt-1">{overviewStats.reportCount} รายงาน</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              เฉลี่ย TC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewStats.avgTc}</div>
            <p className="text-xs text-muted-foreground mt-1">ต่อสาขา</p>
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
            <div className="text-2xl font-bold">{overviewStats.branchCoverage}</div>
            <p className="text-xs text-muted-foreground mt-1">ที่รายงาน</p>
          </CardContent>
        </Card>
        
        <Card className={cn(
          "relative overflow-hidden",
          overviewStats.trendDirection === 'up' && "border-green-500/30",
          overviewStats.trendDirection === 'down' && "border-red-500/30"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {overviewStats.trendDirection === 'up' ? <ArrowUpRight className="h-4 w-4 text-green-500" /> : 
               overviewStats.trendDirection === 'down' ? <ArrowDownRight className="h-4 w-4 text-red-500" /> :
               <Activity className="h-4 w-4" />}
              แนวโน้ม
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              overviewStats.trend > 0 ? "text-green-600" : overviewStats.trend < 0 ? "text-red-600" : ""
            )}>
              {overviewStats.trend > 0 ? '+' : ''}{overviewStats.trend.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">เทียบช่วงก่อน</p>
          </CardContent>
        </Card>
      </div>

      {/* Insights Cards */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {insights.map((insight, idx) => (
            <Card key={idx} className={cn(
              "border-l-4",
              insight.type === 'success' && "border-l-green-500 bg-green-500/5",
              insight.type === 'warning' && "border-l-orange-500 bg-orange-500/5",
              insight.type === 'info' && "border-l-blue-500 bg-blue-500/5"
            )}>
              <CardContent className="py-3 flex items-center gap-3">
                <insight.icon className={cn(
                  "h-5 w-5 shrink-0",
                  insight.type === 'success' && "text-green-600",
                  insight.type === 'warning' && "text-orange-600",
                  insight.type === 'info' && "text-blue-600"
                )} />
                <span className="text-sm font-medium">{insight.text}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4 hidden sm:inline" />
            ภาพรวม
          </TabsTrigger>
          <TabsTrigger value="daily" className="gap-2">
            <CalendarIcon className="h-4 w-4 hidden sm:inline" />
            รายวัน
          </TabsTrigger>
          <TabsTrigger value="comparison" className="gap-2">
            <Activity className="h-4 w-4 hidden sm:inline" />
            เปรียบเทียบ
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2">
            <Zap className="h-4 w-4 hidden sm:inline" />
            วิเคราะห์
          </TabsTrigger>
          <TabsTrigger value="branches" className="gap-2">
            <Store className="h-4 w-4 hidden sm:inline" />
            สาขา
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2">
            <Package className="h-4 w-4 hidden sm:inline" />
            สินค้า
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4">
          {/* Trend + Forecast Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                แนวโน้มยอดขาย + พยากรณ์
              </CardTitle>
              <CardDescription>ยอดขายจริง เป้าหมาย และพยากรณ์ 7 วันข้างหน้า</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={combinedTrendData}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="displayDate" className="text-xs" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      value ? formatCurrency(value) : '-',
                      name === 'sales' ? 'ยอดขาย' : name === 'target' ? 'เป้าหมาย' : name === 'forecast' ? 'พยากรณ์' : name
                    ]}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="target" name="เป้าหมาย" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted))" strokeDasharray="5 5" />
                  <Area type="monotone" dataKey="sales" name="ยอดขาย" stroke="hsl(var(--primary))" fill="url(#salesGradient)" strokeWidth={2} />
                  <Area type="monotone" dataKey="forecast" name="พยากรณ์" stroke="hsl(var(--chart-4))" fill="url(#forecastGradient)" strokeDasharray="8 4" strokeWidth={2} />
                  {dailyTrendData.length > 0 && forecastData.length > 0 && (
                    <ReferenceLine x={dailyTrendData[dailyTrendData.length - 1].displayDate} stroke="hsl(var(--chart-4))" strokeDasharray="3 3" label={{ value: 'วันนี้', position: 'top' }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Branch Performance Chart */}
          <Card>
            <CardHeader>
              <CardTitle>ยอดขายแต่ละสาขา</CardTitle>
              <CardDescription>เปรียบเทียบยอดขายจริงกับเป้าหมาย</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={branchComparisonData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={60} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="sales" name="ยอดขาย" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="target" name="เป้าหมาย" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DAILY TAB */}
        <TabsContent value="daily" className="space-y-4">
          {/* Date Navigation */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-4">
                <Button variant="outline" size="icon" onClick={goToPreviousDate}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="min-w-[220px]">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {format(selectedDate, 'EEEE d MMMM yyyy', { locale: th })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      modifiers={{ hasReport: Array.from(reportDates).map(d => parseISO(d)) }}
                      modifiersStyles={{ hasReport: { backgroundColor: 'hsl(var(--primary) / 0.2)', fontWeight: 'bold' } }}
                    />
                  </PopoverContent>
                </Popover>
                
                <Button variant="outline" size="icon" onClick={goToNextDate}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Daily Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">ยอดขายรวม</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(dailySummary.totalSales)}</div>
                <p className="text-xs text-muted-foreground">เป้า: {formatCurrency(dailySummary.totalTarget)}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">% บรรลุเป้า</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {dailySummary.achievementPercent.toFixed(1)}%
                  {dailySummary.achievementPercent >= 100 && <Badge className="bg-green-500">✓</Badge>}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">เฉลี่ย TC</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dailySummary.avgTc}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">สาขาที่รายงาน</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dailySummary.branchCount}/{branches.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Missing Branches Alert */}
          {missingBranches.length > 0 && reportsForSelectedDate.length > 0 && (
            <Card className="border-orange-500/50 bg-orange-500/5">
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
              <CardDescription>{reportsForSelectedDate.length > 0 ? `${reportsForSelectedDate.length} รายงาน` : 'ไม่มีรายงานในวันนี้'}</CardDescription>
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
                          <TableCell className="text-right font-medium">{formatCurrency(Number(report.sales))}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatCurrency(Number(report.sales_target))}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={report.diff_target_percent >= 0 ? 'default' : 'destructive'}>
                              {report.diff_target_percent >= 0 ? '+' : ''}{report.diff_target_percent?.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{report.tc}</TableCell>
                          <TableCell className="text-right">{report.stock_lemon}</TableCell>
                          <TableCell className="text-right">{report.cup_size_s}/{report.cup_size_m}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>ไม่มีรายงานในวันที่เลือก</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPARISON TAB */}
        <TabsContent value="comparison" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Week over Week */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  สัปดาห์นี้ vs สัปดาห์ที่แล้ว
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">สัปดาห์นี้</p>
                    <p className="text-2xl font-bold">{formatCurrency(comparisonData.wow?.current || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">สัปดาห์ที่แล้ว</p>
                    <p className="text-xl text-muted-foreground">{formatCurrency(comparisonData.wow?.previous || 0)}</p>
                  </div>
                </div>
                <div className={cn(
                  "flex items-center gap-2 text-lg font-semibold",
                  (comparisonData.wow?.change || 0) >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {(comparisonData.wow?.change || 0) >= 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                  {(comparisonData.wow?.change || 0) >= 0 ? '+' : ''}{(comparisonData.wow?.change || 0).toFixed(1)}%
                </div>
              </CardContent>
            </Card>

            {/* Month over Month */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  เดือนนี้ vs เดือนที่แล้ว
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">เดือนนี้</p>
                    <p className="text-2xl font-bold">{formatCurrency(comparisonData.mom?.current || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">เดือนที่แล้ว</p>
                    <p className="text-xl text-muted-foreground">{formatCurrency(comparisonData.mom?.previous || 0)}</p>
                  </div>
                </div>
                <div className={cn(
                  "flex items-center gap-2 text-lg font-semibold",
                  (comparisonData.mom?.change || 0) >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {(comparisonData.mom?.change || 0) >= 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                  {(comparisonData.mom?.change || 0) >= 0 ? '+' : ''}{(comparisonData.mom?.change || 0).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Branch Achievement Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>เปรียบเทียบ % บรรลุเป้าแต่ละสาขา</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={branchComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 150]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(value: number) => `${value}%`} />
                  <ReferenceLine y={100} stroke="hsl(var(--chart-2))" strokeDasharray="5 5" label={{ value: '100%', position: 'right' }} />
                  <Bar dataKey="achievement" name="% บรรลุเป้า" radius={[4, 4, 0, 0]}>
                    {branchComparisonData.map((entry, index) => (
                      <Cell key={index} fill={entry.achievement >= 100 ? 'hsl(var(--primary))' : 'hsl(var(--chart-3))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ANALYSIS TAB */}
        <TabsContent value="analysis" className="space-y-4">
          {/* Best/Worst Day Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bestDay && (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-600">
                    <Trophy className="h-4 w-4" />
                    วันที่ขายดีที่สุด
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">วัน{bestDay.dayName}</div>
                  <p className="text-sm text-muted-foreground">เฉลี่ย {formatCurrency(bestDay.avgSales)}/วัน</p>
                </CardContent>
              </Card>
            )}
            
            {worstDay && (
              <Card className="border-orange-500/30 bg-orange-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-600">
                    <TrendingDown className="h-4 w-4" />
                    วันที่ขายน้อยที่สุด
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">วัน{worstDay.dayName}</div>
                  <p className="text-sm text-muted-foreground">เฉลี่ย {formatCurrency(worstDay.avgSales)}/วัน</p>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">ส่วนต่าง</CardTitle>
              </CardHeader>
              <CardContent>
                {bestDay && worstDay && (
                  <>
                    <div className="text-2xl font-bold">{formatCurrency(bestDay.avgSales - worstDay.avgSales)}</div>
                    <p className="text-sm text-muted-foreground">+{((bestDay.avgSales / worstDay.avgSales - 1) * 100).toFixed(0)}%</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Day of Week Chart */}
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
                  <Tooltip formatter={(value: number) => [formatCurrency(value), 'ยอดขายเฉลี่ย']} />
                  <Bar dataKey="avgSales" name="ยอดขายเฉลี่ย" radius={[4, 4, 0, 0]}>
                    {dayOfWeekData.map((entry, index) => (
                      <Cell key={index} fill={entry === bestDay ? 'hsl(var(--primary))' : entry === worstDay ? 'hsl(var(--chart-3))' : 'hsl(var(--chart-5))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BRANCHES TAB */}
        <TabsContent value="branches" className="space-y-4">
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
                    <Badge variant={branch.achievementRate >= 100 ? 'default' : 'secondary'}>{branch.achievementRate}%</Badge>
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
                    <span className="text-xs text-muted-foreground">{format(parseISO(branch.lastReportDate), 'd MMM', { locale: th })}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* PRODUCTS TAB */}
        <TabsContent value="products" className="space-y-4">
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
                          )}>{idx + 1}</div>
                          <div className="flex-1"><p className="font-medium">{item.name}</p></div>
                          <Badge variant="secondary">{item.score} pts</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">ไม่มีข้อมูล</div>
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
                          )}>{idx + 1}</div>
                          <div className="flex-1"><p className="font-medium">{item.name}</p></div>
                          <Badge variant="secondary">{item.score} pts</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">ไม่มีข้อมูล</div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5" />
                  สัดส่วนแก้ว
                </CardTitle>
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
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground">ไม่มีข้อมูลแก้ว</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detailed Table at Bottom */}
      <Card>
        <CardHeader>
          <CardTitle>รายละเอียดรายงานทั้งหมด</CardTitle>
          <CardDescription>ข้อมูลทั้งหมด {filteredReports?.length || 0} รายการ ({TIME_RANGE_OPTIONS.find(t => t.value === timeRange)?.label})</CardDescription>
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
                {filteredReports && filteredReports.length > 0 ? (
                  filteredReports.slice(0, 100).map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>{format(parseISO(report.report_date), 'd MMM yy', { locale: th })}</TableCell>
                      <TableCell>
                        <div className="font-medium">{report.branch_code}</div>
                        <div className="text-xs text-muted-foreground">{report.branch_name}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(report.sales))}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(Number(report.sales_target))}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={report.diff_target_percent >= 0 ? 'default' : 'destructive'}>
                          {report.diff_target_percent >= 0 ? '+' : ''}{report.diff_target_percent?.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{report.tc}</TableCell>
                      <TableCell className="text-right">{report.stock_lemon}</TableCell>
                      <TableCell className="text-right">{report.cup_size_s}/{report.cup_size_m}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      ยังไม่มีข้อมูลรายงาน
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
