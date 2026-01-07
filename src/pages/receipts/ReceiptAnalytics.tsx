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
  DollarSign, Receipt, Building2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
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
  business_id: string | null;
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

export default function ReceiptAnalytics() {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState('6');

  // Fetch receipts for analytics
  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['receipt-analytics', timeRange],
    queryFn: async () => {
      const startDate = format(
        startOfMonth(subMonths(new Date(), parseInt(timeRange) - 1)),
        'yyyy-MM-dd'
      );
      
      const { data, error } = await supabase
        .from('receipts')
        .select('id, vendor, total, receipt_date, category, created_at, business_id')
        .gte('receipt_date', startDate)
        .eq('status', 'saved')
        .order('receipt_date', { ascending: true });

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
        monthlyComparison: [],
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

    // Monthly trend
    const monthlyMap: Record<string, { amount: number; count: number }> = {};
    receipts.forEach((r) => {
      if (!r.receipt_date) return;
      const month = format(new Date(r.receipt_date), 'yyyy-MM');
      if (!monthlyMap[month]) {
        monthlyMap[month] = { amount: 0, count: 0 };
      }
      monthlyMap[month].amount += r.total || 0;
      monthlyMap[month].count++;
    });

    const monthlyTrend = Object.entries(monthlyMap)
      .map(([month, data]) => ({
        month: format(new Date(month + '-01'), 'MMM yyyy'),
        amount: data.amount,
        count: data.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

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

    const monthlyComparison = [
      { name: 'Last Month', amount: lastMonthTotal },
      { name: 'This Month', amount: currentMonthTotal },
    ];

    return {
      totalAmount,
      totalCount,
      avgPerReceipt,
      categoryBreakdown,
      monthlyTrend,
      topVendors,
      monthlyComparison,
    };
  }, [receipts]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

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
      <div className="flex items-center justify-between">
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
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
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
                <PieChart className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold">{analytics.categoryBreakdown.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Monthly Spending Trend
            </CardTitle>
            <CardDescription>Total spending per month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
            </div>
          </CardContent>
        </Card>
      </div>

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
                {analytics.monthlyComparison.map((item, index) => (
                  <div 
                    key={item.name} 
                    className={`text-center p-6 rounded-lg ${
                      index === 0 ? 'bg-muted' : 'bg-primary/10'
                    }`}
                  >
                    <p className="text-sm text-muted-foreground mb-2">{item.name}</p>
                    <p className={`text-3xl font-bold ${
                      index === 1 ? 'text-primary' : ''
                    }`}>
                      {formatCurrency(item.amount)}
                    </p>
                  </div>
                ))}
              </div>
              {analytics.monthlyComparison[1]?.amount > 0 && analytics.monthlyComparison[0]?.amount > 0 && (
                <div className="text-center mt-6">
                  {(() => {
                    const change = ((analytics.monthlyComparison[1].amount - analytics.monthlyComparison[0].amount) / analytics.monthlyComparison[0].amount) * 100;
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
                {analytics.categoryBreakdown.map((cat) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
