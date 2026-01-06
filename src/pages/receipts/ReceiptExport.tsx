import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, Download, FileSpreadsheet, Calendar, Building2, Filter
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function ReceiptExport() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [businessFilter, setBusinessFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);

  // Fetch businesses for filter
  const { data: businesses = [] } = useQuery({
    queryKey: ['all-businesses-for-export'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_businesses')
        .select('id, name, line_user_id')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Preview count
  const { data: previewData } = useQuery({
    queryKey: ['export-preview', dateFrom, dateTo, businessFilter, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('receipts')
        .select('id, total', { count: 'exact' })
        .gte('receipt_date', dateFrom)
        .lte('receipt_date', dateTo)
        .eq('status', 'saved');

      if (businessFilter !== 'all') {
        query = query.eq('business_id', businessFilter);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      const { count, data, error } = await query;
      if (error) throw error;

      const totalAmount = data?.reduce((sum, r) => sum + (r.total || 0), 0) || 0;
      return { count: count || 0, totalAmount };
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let query = supabase
        .from('receipts')
        .select(`
          id, vendor, total, receipt_date, 
          category, description, created_at,
          business:receipt_businesses(name, tax_id)
        `)
        .gte('receipt_date', dateFrom)
        .lte('receipt_date', dateTo)
        .eq('status', 'saved')
        .order('receipt_date', { ascending: true });

      if (businessFilter !== 'all') {
        query = query.eq('business_id', businessFilter);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error('No data to export');
        return;
      }

      // Create CSV
      const headers = [
        'Receipt Date',
        'Vendor Name',
        'Amount',
        'Category',
        'Business Name',
        'Business Tax ID',
        'Notes',
        'Created At',
      ];

      const rows = data.map(r => [
        r.receipt_date || '',
        r.vendor || '',
        r.total?.toString() || '0',
        r.category || '',
        r.business?.name || '',
        r.business?.tax_id || '',
        r.description || '',
        r.created_at ? format(new Date(r.created_at), 'yyyy-MM-dd HH:mm:ss') : '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      // Download
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipts_${dateFrom}_to_${dateTo}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${data.length} receipts`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export');
    } finally {
      setIsExporting(false);
    }
  };

  const setQuickRange = (months: number) => {
    const now = new Date();
    const from = startOfMonth(subMonths(now, months - 1));
    const to = endOfMonth(now);
    setDateFrom(format(from, 'yyyy-MM-dd'));
    setDateTo(format(to, 'yyyy-MM-dd'));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/receipts')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Export Receipts</h1>
          <p className="text-muted-foreground">
            Download receipt data as CSV for accounting
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Export Filters
            </CardTitle>
            <CardDescription>
              Select the date range and filters for your export
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quick Date Range */}
            <div className="space-y-2">
              <Label>Quick Select</Label>
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setQuickRange(1)}
                >
                  This Month
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setQuickRange(3)}
                >
                  Last 3 Months
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setQuickRange(6)}
                >
                  Last 6 Months
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setQuickRange(12)}
                >
                  This Year
                </Button>
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  From Date
                </Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  To Date
                </Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {/* Business Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Business
              </Label>
              <Select value={businessFilter} onValueChange={setBusinessFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All businesses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Businesses</SelectItem>
                  {businesses.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="food">Food</SelectItem>
                  <SelectItem value="transport">Transport</SelectItem>
                  <SelectItem value="utilities">Utilities</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Preview & Export */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Export Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-4">
              <p className="text-4xl font-bold">{previewData?.count || 0}</p>
              <p className="text-sm text-muted-foreground">receipts to export</p>
            </div>
            
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-2xl font-bold text-emerald-600">
                {formatCurrency(previewData?.totalAmount || 0)}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Export includes:</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary">Receipt Date</Badge>
                <Badge variant="secondary">Vendor</Badge>
                <Badge variant="secondary">Amount</Badge>
                <Badge variant="secondary">Category</Badge>
                <Badge variant="secondary">Business</Badge>
              </div>
            </div>

            <Button 
              className="w-full" 
              size="lg"
              onClick={handleExport}
              disabled={isExporting || !previewData?.count}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Download CSV'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
