import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Receipt, Search, Download, Calendar, 
  TrendingUp, Building2, Edit2, FileText, BarChart3, AlertTriangle, Settings, Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { ReceiptInlineEdit } from '@/components/receipts/ReceiptInlineEdit';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

interface ReceiptRow {
  id: string;
  vendor: string | null;
  total: number | null;
  receipt_date: string | null;
  category: string | null;
  status: string | null;
  created_at: string | null;
  line_user_id: string;
  warnings: string[] | null;
  confidence: {
    vendor?: number;
    date?: number;
    total?: number;
    category?: number;
  } | null;
  business: { name: string } | null;
}

export default function Receipts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isOwner } = useUserRole();
  const canDelete = isAdmin || isOwner;
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (receiptId: string) => {
      // Delete receipt items first
      await supabase.from('receipt_items').delete().eq('receipt_id', receiptId);
      // Delete receipt files
      await supabase.from('receipt_files').delete().eq('receipt_id', receiptId);
      // Delete the receipt
      const { error } = await supabase.from('receipts').delete().eq('id', receiptId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('ลบใบเสร็จสำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['admin-receipts'] });
      setDeletingId(null);
    },
    onError: (error: Error) => {
      toast.error('เกิดข้อผิดพลาด: ' + error.message);
      setDeletingId(null);
    },
  });

  // Fetch all receipts (admin view)
  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['admin-receipts', search, statusFilter, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('receipts')
        .select(`
          id, vendor, total, receipt_date, category, 
          status, created_at, line_user_id, warnings, confidence,
          business:receipt_businesses(name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (search) {
        query = query.ilike('vendor', `%${search}%`);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ReceiptRow[];
    },
  });

  // Calculate stats
  const stats = {
    total: receipts.length,
    totalAmount: receipts.reduce((sum, r) => sum + (r.total || 0), 0),
    saved: receipts.filter(r => r.status === 'saved').length,
    needsReview: receipts.filter(r => r.status === 'needs_review').length,
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getCategoryBadge = (category: string | null) => {
    const colors: Record<string, string> = {
      food: 'bg-orange-100 text-orange-700',
      transport: 'bg-blue-100 text-blue-700',
      utilities: 'bg-yellow-100 text-yellow-700',
      office: 'bg-purple-100 text-purple-700',
      other: 'bg-gray-100 text-gray-700',
    };
    return colors[category || 'other'] || colors.other;
  };

  const getStatusBadge = (status: string | null, hasWarnings: boolean) => {
    switch (status) {
      case 'saved':
        return <Badge className="bg-emerald-100 text-emerald-700">Saved</Badge>;
      case 'needs_review':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Needs Review
          </Badge>
        );
      case 'processed':
        return hasWarnings 
          ? <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">Processed ⚠️</Badge>
          : <Badge variant="secondary">Processed</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const hasLowConfidence = (confidence: ReceiptRow['confidence']) => {
    if (!confidence) return false;
    return Object.values(confidence).some(v => v !== undefined && v < 0.5);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receipt Management</h1>
          <p className="text-muted-foreground">
            View, edit, and manage all receipts across businesses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/receipts/settings')}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button variant="outline" onClick={() => navigate('/receipts/analytics')}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
          <Button variant="outline" onClick={() => navigate('/receipts/export')}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => navigate('/receipts/businesses')}>
            <Building2 className="h-4 w-4 mr-2" />
            Businesses
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Receipt className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Receipts</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Saved</p>
                <p className="text-2xl font-bold">{stats.saved}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Needs Review</p>
                <p className="text-2xl font-bold">{stats.needsReview}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vendor name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="saved">Saved</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : receipts.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No receipts found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((receipt) => (
                  <TableRow 
                    key={receipt.id}
                    className={hasLowConfidence(receipt.confidence) ? 'bg-yellow-50/50' : ''}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {receipt.vendor || '-'}
                        {hasLowConfidence(receipt.confidence) && (
                          <AlertTriangle className="h-3 w-3 text-yellow-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {receipt.business?.name || '-'}
                    </TableCell>
                    <TableCell>
                      {receipt.total 
                        ? formatCurrency(receipt.total) 
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {receipt.receipt_date 
                        ? format(new Date(receipt.receipt_date), 'dd MMM yyyy')
                        : receipt.created_at
                          ? format(new Date(receipt.created_at), 'dd MMM yyyy')
                          : '-'}
                    </TableCell>
                    <TableCell>
                      {receipt.category && (
                        <Badge className={getCategoryBadge(receipt.category)}>
                          {receipt.category}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(receipt.status, (receipt.warnings?.length || 0) > 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedReceipt(receipt)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        
                        {canDelete && (
                          <AlertDialog open={deletingId === receipt.id} onOpenChange={(open) => !open && setDeletingId(null)}>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeletingId(receipt.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>ยืนยันการลบใบเสร็จ</AlertDialogTitle>
                                <AlertDialogDescription>
                                  คุณต้องการลบใบเสร็จจาก "{receipt.vendor || 'ไม่ระบุ'}" 
                                  จำนวน {receipt.total ? formatCurrency(receipt.total) : '-'} หรือไม่?
                                  <br />
                                  <span className="text-destructive font-medium">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive hover:bg-destructive/90"
                                  onClick={() => deleteMutation.mutate(receipt.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  {deleteMutation.isPending ? 'กำลังลบ...' : 'ลบ'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Inline Edit Dialog */}
      {selectedReceipt && (
        <ReceiptInlineEdit
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  );
}
