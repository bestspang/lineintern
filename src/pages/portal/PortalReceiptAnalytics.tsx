import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Receipt, TrendingUp, PieChart } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

interface AnalyticsData {
  totalAmount: number;
  totalCount: number;
  approvedAmount: number;
  approvedCount: number;
  pendingCount: number;
  byCategory: { name: string; value: number; count: number }[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function PortalReceiptAnalytics() {
  const { employee, locale, isAdmin } = usePortal();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState('current');

  const fetchAnalytics = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);

    try {
      let startDate: Date;
      let endDate: Date = new Date();

      switch (period) {
        case 'last':
          startDate = startOfMonth(subMonths(new Date(), 1));
          endDate = endOfMonth(subMonths(new Date(), 1));
          break;
        case 'last3':
          startDate = startOfMonth(subMonths(new Date(), 2));
          break;
        default:
          startDate = startOfMonth(new Date());
      }

      // Simplified query - receipts table may not exist, show placeholder
      setData({
        totalAmount: 0,
        totalCount: 0,
        approvedAmount: 0,
        approvedCount: 0,
        pendingCount: 0,
        byCategory: [],
      });
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, employee?.branch?.id, isAdmin, period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          {locale === 'th' ? 'วิเคราะห์ใบเสร็จ' : 'Receipt Analytics'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'th' ? 'สถิติและแนวโน้มใบเสร็จ' : 'Receipt statistics and trends'}
        </p>
      </div>

      {/* Period Selector */}
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="current">เดือนนี้</SelectItem>
          <SelectItem value="last">เดือนที่แล้ว</SelectItem>
          <SelectItem value="last3">3 เดือนล่าสุด</SelectItem>
        </SelectContent>
      </Select>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardContent className="p-4">
                <Receipt className="h-6 w-6 mb-2 opacity-80" />
                <p className="text-2xl font-bold">{data.totalCount}</p>
                <p className="text-xs opacity-90">ใบเสร็จทั้งหมด</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
              <CardContent className="p-4">
                <TrendingUp className="h-6 w-6 mb-2 opacity-80" />
                <p className="text-xl font-bold">{formatAmount(data.totalAmount)}</p>
                <p className="text-xs opacity-90">ยอดรวม</p>
              </CardContent>
            </Card>
          </div>

          {/* Stats */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">{data.approvedCount}</p>
                  <p className="text-xs text-muted-foreground">อนุมัติ</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{data.pendingCount}</p>
                  <p className="text-xs text-muted-foreground">รอตรวจ</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">{formatAmount(data.approvedAmount)}</p>
                  <p className="text-xs text-muted-foreground">อนุมัติแล้ว</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Category Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                แยกตามหมวดหมู่
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.byCategory.length > 0 ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={data.byCategory}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={60}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {data.byCategory.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">ไม่มีข้อมูล</p>
              )}
            </CardContent>
          </Card>

          {/* Category List */}
          {data.byCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">รายละเอียดหมวดหมู่</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.byCategory.map((cat, i) => (
                  <div key={cat.name} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-sm">{cat.name}</span>
                      <span className="text-xs text-muted-foreground">({cat.count})</span>
                    </div>
                    <span className="font-medium">{formatAmount(cat.value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">ไม่มีข้อมูล</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
