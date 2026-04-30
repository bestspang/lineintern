import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Receipt, TrendingUp, Calendar, ChevronRight, 
  Building2, Plus, Filter
} from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { format } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ReceiptSummary {
  thisMonth: number;
  thisMonthCount: number;
  lastMonth: number;
  ytd: number;
}

interface ReceiptItem {
  id: string;
  vendor: string | null;
  total: number | null;
  receipt_date: string | null;
  category: string | null;
  created_at: string | null;
  status: string | null;
  business_id: string | null;
}

interface Business {
  id: string;
  name: string;
  is_default: boolean | null;
}

export default function MyReceipts() {
  const { employee, locale } = usePortal();
  const navigate = useNavigate();
  const [selectedBusiness, setSelectedBusiness] = useState<string>('all');
  const dateLocale = locale === 'th' ? th : enUS;

  // Fetch businesses via portal API (bypasses RLS)
  const { data: businesses = [] } = useQuery({
    queryKey: ['my-businesses', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data, error } = await portalApi<Business[]>({
        endpoint: 'my-businesses',
        employee_id: employee.id
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
  });

  // Fetch receipts via portal API (bypasses RLS)
  const { data: receipts = [], isLoading: receiptsLoading } = useQuery({
    queryKey: ['my-receipts', employee?.id, selectedBusiness],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data, error } = await portalApi<ReceiptItem[]>({
        endpoint: 'my-receipts-list',
        employee_id: employee.id,
        params: { businessId: selectedBusiness, limit: 50 }
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
  });

  // Calculate summary
  const summary: ReceiptSummary = {
    thisMonth: 0,
    thisMonthCount: 0,
    lastMonth: 0,
    ytd: 0,
  };

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const ytdStart = new Date(now.getFullYear(), 0, 1);

  receipts.forEach((r) => {
    if (!r.receipt_date) return;
    const receiptDate = new Date(r.receipt_date);
    const amount = r.total || 0;

    if (receiptDate >= thisMonthStart) {
      summary.thisMonth += amount;
      summary.thisMonthCount++;
    }
    if (receiptDate >= lastMonthStart && receiptDate <= lastMonthEnd) {
      summary.lastMonth += amount;
    }
    if (receiptDate >= ytdStart) {
      summary.ytd += amount;
    }
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getCategoryColor = (category: string | null) => {
    const colors: Record<string, string> = {
      food: 'bg-orange-100 text-orange-700',
      transport: 'bg-blue-100 text-blue-700',
      utilities: 'bg-yellow-100 text-yellow-700',
      office: 'bg-purple-100 text-purple-700',
      other: 'bg-gray-100 text-gray-700',
    };
    return colors[category || 'other'] || colors.other;
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {locale === 'th' ? 'ใบเสร็จของฉัน' : 'My Receipts'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === 'th' ? 'จัดการและติดตามค่าใช้จ่าย' : 'Manage and track expenses'}
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/portal/receipt-businesses')}>
          <Building2 className="h-4 w-4 mr-1" />
          {locale === 'th' ? 'ธุรกิจ' : 'Business'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 opacity-80" />
              <span className="text-xs opacity-80">
                {locale === 'th' ? 'เดือนนี้' : 'This Month'}
              </span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(summary.thisMonth)}</p>
            <p className="text-xs opacity-80">
              {summary.thisMonthCount} {locale === 'th' ? 'รายการ' : 'items'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 opacity-80" />
              <span className="text-xs opacity-80">
                {locale === 'th' ? 'ปีนี้' : 'YTD'}
              </span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(summary.ytd)}</p>
            <p className="text-xs opacity-80">
              {locale === 'th' ? 'รวมทั้งปี' : 'Year total'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={selectedBusiness} onValueChange={setSelectedBusiness}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={locale === 'th' ? 'เลือกธุรกิจ' : 'Select business'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {locale === 'th' ? 'ทั้งหมด' : 'All Businesses'}
            </SelectItem>
            {businesses.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name} {b.is_default && '⭐'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Receipt List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {locale === 'th' ? 'รายการล่าสุด' : 'Recent Receipts'}
        </h3>

        {receiptsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ยังไม่มีใบเสร็จ' : 'No receipts yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {locale === 'th' 
                  ? 'ส่งรูปใบเสร็จผ่าน LINE เพื่อเริ่มต้น' 
                  : 'Send receipt photos via LINE to get started'}
              </p>
            </CardContent>
          </Card>
        ) : (
          receipts.map((receipt) => (
            <Card
              key={receipt.id}
              className="cursor-pointer hover:shadow-md transition-all"
              onClick={() => navigate(`/portal/receipts/${receipt.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {receipt.vendor || (locale === 'th' ? 'ไม่ระบุร้าน' : 'Unknown vendor')}
                      </p>
                      {receipt.category && (
                        <Badge variant="secondary" className={getCategoryColor(receipt.category)}>
                          {receipt.category}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {receipt.receipt_date
                        ? format(new Date(receipt.receipt_date), 'd MMM yyyy', { locale: dateLocale })
                        : receipt.created_at 
                          ? format(new Date(receipt.created_at), 'd MMM yyyy', { locale: dateLocale })
                          : '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-lg">
                      {formatCurrency(receipt.total || 0)}
                    </p>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-20 right-4">
        <Button 
          size="lg" 
          className="rounded-full h-14 w-14 shadow-lg"
          onClick={() => navigate('/portal/receipt-new')}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
