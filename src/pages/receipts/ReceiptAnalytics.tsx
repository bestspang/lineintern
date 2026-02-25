import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, TrendingUp, PieChart, BarChart3, Calendar,
  DollarSign, Receipt, Building2, MapPin
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, LineChart, Line, Legend
} from 'recharts';

interface ReceiptData {
  id: string;
  vendor: string | null;
  total: number | null;
  receipt_date: string | null;
  category: string | null;
  created_at: string | null;
  branch_id: string | null;
}

interface Branch {
  id: string;
  name: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  food: '#f97316',
  transport: '#3b82f6',
  utilities: '#eab308',
  office: '#a855f7',
  software: '#06b6d4',
  marketing: '#ec4899',
  other: '#6b7280',
};

const BRANCH_COLORS = [
  '#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899',
  '#06b6d4', '#eab308', '#ef4444', '#14b8a6', '#6366f1',
];

const TIME_RANGE_OPTIONS = [
  { value: '1', label: 'วันนี้' },
  { value: '3', label: '3 วันล่าสุด' },
  { value: '7', label: 'สัปดาห์นี้' },
  { value: '30', label: '1 เดือน' },
  { value: '90', label: '3 เดือน' },
  { value: '180', label: '6 เดือน' },
  { value: '365', label: '1 ปี' },
];

export default function ReceiptAnalytics() {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState('30');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  // Fetch branches
  const { data: branches = [] } = useQuery({
    queryKey: ['branches-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return data as Branch[];
    },
  });

  // Fetch receipts for analytics
  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['receipt-analytics', timeRange, selectedBranch],
    queryFn: async () => {
      const startDate = format(
        subDays(new Date(), parseInt(timeRange)),
        'yyyy-MM-dd'
      );
      
      let query = supabase
        .from('receipts')
        .select('id, vendor, total, receipt_date, category, created_at, branch_id')
        .gte('receipt_date', startDate)
        .eq('approval_status', 'approved')
        .order('receipt_date', { ascending: true });

      if (selectedBranch !== 'all') {
        query = query.eq('branch_id', selectedBranch);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ReceiptData[];
    },
  });

  // Calculate analytics
  const analytics = useMemo(() => {
    if (!receipts.length) {
      return {
        totalAmount: 0,
        totalCount: 0,
        avgPerReceipt: 0,
        categoryBreakdown: [],
        monthlyTrend: [],
        topVendors: [],
        monthlyComparison: { current: 0, previous: 0 },
        branchBreakdown: [],
        branchTrend: [],
        activeBranches: 0,
        branchRank: null as { rank: number; total: number } | null,
      };
    }

    const totalAmount = receipts.reduce((sum, r) => sum + (r.total || 0), 0);
    const totalCount = receipts.length;
    const avgPerReceipt = totalAmount / totalCount;

    // Category breakdown
    const categoryMap: Record<string, { count: number; amount: number }> = {};
    receipts.forEach((r) => {
      const cat = r.category || 'other';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { count: 0, amount: 0 };
      }
      categoryMap[cat].count++;
      categoryMap[cat].amount += r.total || 0;
    });

    const categoryBreakdown = Object.entries(categoryMap)
      .map(([name, data]) => ({
        name,
        value: data.amount,
        count: data.count,
        percentage: (data.amount / totalAmount) * 100,
      }))
      .sort((a, b) => b.value - a.value);

    // Monthly/Daily trend based on time range
    const trendMap: Record<string, { amount: number; count: number }> = {};
    const useDaily = parseInt(timeRange) <= 30;
    
    receipts.forEach((r) => {
      if (!r.receipt_date) return;
      const key = useDaily 
        ? format(new Date(r.receipt_date), 'dd MMM')
        : format(new Date(r.receipt_date), 'MMM yyyy');
      if (!trendMap[key]) {
        trendMap[key] = { amount: 0, count: 0 };
      }
      trendMap[key].amount += r.total || 0;
      trendMap[key].count++;
    });

    const monthlyTrend = Object.entries(trendMap)
      .map(([period, data]) => ({
        month: period,
        amount: data.amount,
        count: data.count,
      }));

    // Top vendors
    const vendorMap: Record<string, { count: number; amount: number }> = {};
    receipts.forEach((r) => {
      const vendor = r.vendor || 'Unknown';
      if (!vendorMap[vendor]) {
        vendorMap[vendor] = { count: 0, amount: 0 };
      }
      vendorMap[vendor].count++;
      vendorMap[vendor].amount += r.total || 0;
    });

    const topVendors = Object.entries(vendorMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Monthly comparison (current vs previous)
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    let currentMonthTotal = 0;
    let lastMonthTotal = 0;

    receipts.forEach((r) => {
      if (!r.receipt_date) return;
      const date = new Date(r.receipt_date);
      if (date >= currentMonthStart) {
        currentMonthTotal += r.total || 0;
      } else if (date >= lastMonthStart && date <= lastMonthEnd) {
        lastMonthTotal += r.total || 0;
      }
    });

    // Branch breakdown
    const branchMap: Record<string, { count: number; amount: number; name: string }> = {};
    receipts.forEach((r) => {
      const branchId = r.branch_id || 'unknown';
      const branchName = branches.find(b => b.id === branchId)?.name || 'ไม่ระบุสาขา';
      if (!branchMap[branchId]) {
        branchMap[branchId] = { count: 0, amount: 0, name: branchName };
      }
      branchMap[branchId].count++;
      branchMap[branchId].amount += r.total || 0;
    });

    const branchBreakdown = Object.entries(branchMap)
      .map(([id, data]) => ({
        id,
        name: data.name,
        count: data.count,
        amount: data.amount,
        percentage: (data.amount / totalAmount) * 100,
        avgPerReceipt: data.amount / data.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Branch trend for line chart (only when viewing all branches)
    const branchTrendMap: Record<string, Record<string, number>> = {};
    if (selectedBranch === 'all') {
      receipts.forEach((r) => {
        if (!r.receipt_date || !r.branch_id) return;
        const branchName = branches.find(b => b.id === r.branch_id)?.name || 'ไม่ระบุ';
        const period = useDaily
          ? format(new Date(r.receipt_date), 'dd MMM')
          : format(new Date(r.receipt_date), 'MMM');
        
        if (!branchTrendMap[period]) {
          branchTrendMap[period] = {};
        }
        if (!branchTrendMap[period][branchName]) {
          branchTrendMap[period][branchName] = 0;
        }
        branchTrendMap[period][branchName] += r.total || 0;
      });
    }

    const branchTrend = Object.entries(branchTrendMap).map(([period, branches]) => ({
      period,
      ...branches,
    }));

    // Calculate branch rank if a specific branch is selected
    let branchRank: { rank: number; total: number } | null = null;
    if (selectedBranch !== 'all') {
      const allBranchAmounts = branchBreakdown.map(b => b.amount);
      const currentBranchAmount = branchBreakdown.find(b => b.id === selectedBranch)?.amount || 0;
      const rank = allBranchAmounts.filter(a => a > currentBranchAmount).length + 1;
      branchRank = { rank, total: branchBreakdown.length };
    }

    return {
      totalAmount,
      totalCount,
      avgPerReceipt,
      categoryBreakdown,
      monthlyTrend,
      topVendors,
      monthlyComparison: { current: currentMonthTotal, previous: lastMonthTotal },
      branchBreakdown,
      branchTrend,
      activeBranches: branchBreakdown.length,
      branchRank,
    };
  }, [receipts, branches, selectedBranch, timeRange]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Get unique branch names for legend
  const branchNamesForTrend = useMemo(() => {
    const names = new Set<string>();
    analytics.branchTrend.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key !== 'period') names.add(key);
      });
    });
    return Array.from(names);
  }, [analytics.branchTrend]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/receipts')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Receipt Analytics</h1>
            <p className="text-muted-foreground">
              Spending trends and category breakdowns
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Selector */}
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[180px]">
              <MapPin className="h-4 w-4 mr-2" />
              <SelectValue placeholder="เลือกสาขา" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสาขา</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Time Range Selector */}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="ระยะเวลา" />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spending</p>
                <p className="text-2xl font-bold">{formatCurrency(analytics.totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Receipt className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Receipts</p>
                <p className="text-2xl font-bold">{analytics.totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg per Receipt</p>
                <p className="text-2xl font-bold">{formatCurrency(analytics.avgPerReceipt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {selectedBranch === 'all' ? 'Active Branches' : 'Branch Rank'}
                </p>
                <p className="text-2xl font-bold">
                  {selectedBranch === 'all' 
                    ? analytics.activeBranches
                    : analytics.branchRank 
                      ? `#${analytics.branchRank.rank} of ${analytics.branchRank.total}`
                      : '-'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Comparison Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">เดือนนี้ vs เดือนก่อน</p>
              <p className="text-2xl font-bold">{formatCurrency(analytics.monthlyComparison.current)}</p>
            </div>
            <div className="flex items-center gap-2">
              {analytics.monthlyComparison.previous > 0 ? (() => {
                const change = ((analytics.monthlyComparison.current - analytics.monthlyComparison.previous) / analytics.monthlyComparison.previous) * 100;
                const isUp = change >= 0;
                return (
                  <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${isUp ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    <TrendingUp className={`h-4 w-4 ${!isUp ? 'rotate-180' : ''}`} />
                    {isUp ? '+' : ''}{change.toFixed(1)}%
                  </div>
                );
              })() : (
                <span className="text-xs text-muted-foreground">ไม่มีข้อมูลเดือนก่อน</span>
              )}
              <span className="text-sm text-muted-foreground">
                เดือนก่อน: {formatCurrency(analytics.monthlyComparison.previous)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly/Daily Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {parseInt(timeRange) <= 30 ? 'Daily Spending Trend' : 'Monthly Spending Trend'}
            </CardTitle>
            <CardDescription>
              {parseInt(timeRange) <= 30 ? 'Total spending per day' : 'Total spending per month'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {analytics.monthlyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => `${parseInt(timeRange) <= 30 ? 'Day' : 'Month'}: ${label}`}
                    />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Category Breakdown
            </CardTitle>
            <CardDescription>Spending by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {analytics.categoryBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={analytics.categoryBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                      labelLine={false}
                    >
                      {analytics.categoryBreakdown.map((entry) => (
                        <Cell 
                          key={entry.name} 
                          fill={CATEGORY_COLORS[entry.name] || CATEGORY_COLORS.other} 
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                  </RechartsPie>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branch Comparison - Only show when viewing all branches */}
      {selectedBranch === 'all' && analytics.branchBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Branch Spending Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Branch Spending Comparison
              </CardTitle>
              <CardDescription>Total spending by branch</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.branchBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" fontSize={12} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      fontSize={12} 
                      width={120}
                      tickFormatter={(v) => v.length > 15 ? v.slice(0, 15) + '...' : v}
                    />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                      {analytics.branchBreakdown.map((_, index) => (
                        <Cell key={index} fill={BRANCH_COLORS[index % BRANCH_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Branch Spending Trend */}
          {analytics.branchTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Branch Spending Trend
                </CardTitle>
                <CardDescription>Spending trend by branch over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.branchTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" fontSize={12} />
                      <YAxis fontSize={12} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      {branchNamesForTrend.map((name, index) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={BRANCH_COLORS[index % BRANCH_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Vendors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Top Vendors
            </CardTitle>
            <CardDescription>Most frequent vendors by spending</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {analytics.topVendors.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.topVendors} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" fontSize={12} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      fontSize={12} 
                      width={120}
                      tickFormatter={(v) => v.length > 15 ? v.slice(0, 15) + '...' : v}
                    />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Monthly Comparison
            </CardTitle>
            <CardDescription>This month vs last month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 flex flex-col justify-center">
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center p-6 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground mb-2">Last Month</p>
                  <p className="text-3xl font-bold">
                    {formatCurrency(analytics.monthlyComparison.previous)}
                  </p>
                </div>
                <div className="text-center p-6 rounded-lg bg-primary/10">
                  <p className="text-sm text-muted-foreground mb-2">This Month</p>
                  <p className="text-3xl font-bold text-primary">
                    {formatCurrency(analytics.monthlyComparison.current)}
                  </p>
                </div>
              </div>
              {analytics.monthlyComparison.current > 0 && analytics.monthlyComparison.previous > 0 && (
                <div className="text-center mt-6">
                  {(() => {
                    const change = ((analytics.monthlyComparison.current - analytics.monthlyComparison.previous) / analytics.monthlyComparison.previous) * 100;
                    const isIncrease = change > 0;
                    return (
                      <p className={`text-lg font-medium ${isIncrease ? 'text-red-500' : 'text-green-500'}`}>
                        {isIncrease ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% from last month
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branch Details Table - Only show when viewing all branches */}
      {selectedBranch === 'all' && analytics.branchBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branch Details</CardTitle>
            <CardDescription>Detailed breakdown by branch</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">สาขา</th>
                    <th className="text-right py-3 px-4">จำนวน</th>
                    <th className="text-right py-3 px-4">ยอดรวม</th>
                    <th className="text-right py-3 px-4">เปอร์เซ็นต์</th>
                    <th className="text-right py-3 px-4">เฉลี่ย/ใบ</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.branchBreakdown.map((branch, index) => (
                    <tr key={branch.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: BRANCH_COLORS[index % BRANCH_COLORS.length] }}
                          />
                          <span>{branch.name}</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4">{branch.count}</td>
                      <td className="text-right py-3 px-4 font-medium">{formatCurrency(branch.amount)}</td>
                      <td className="text-right py-3 px-4">{branch.percentage.toFixed(1)}%</td>
                      <td className="text-right py-3 px-4">{formatCurrency(branch.avgPerReceipt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Details Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category Details</CardTitle>
          <CardDescription>Detailed breakdown by category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Category</th>
                  <th className="text-right py-3 px-4">Count</th>
                  <th className="text-right py-3 px-4">Total Amount</th>
                  <th className="text-right py-3 px-4">Percentage</th>
                  <th className="text-right py-3 px-4">Avg per Receipt</th>
                </tr>
              </thead>
              <tbody>
                {analytics.categoryBreakdown.length > 0 ? (
                  analytics.categoryBreakdown.map((cat) => (
                    <tr key={cat.name} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CATEGORY_COLORS[cat.name] || CATEGORY_COLORS.other }}
                          />
                          <span className="capitalize">{cat.name}</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4">{cat.count}</td>
                      <td className="text-right py-3 px-4 font-medium">{formatCurrency(cat.value)}</td>
                      <td className="text-right py-3 px-4">{cat.percentage.toFixed(1)}%</td>
                      <td className="text-right py-3 px-4">{formatCurrency(cat.value / cat.count)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
