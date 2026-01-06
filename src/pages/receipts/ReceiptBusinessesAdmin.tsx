import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Building2, Search, Users, Receipt, TrendingUp, ArrowLeft
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface BusinessRow {
  id: string;
  name: string;
  line_user_id: string;
  tax_id: string | null;
  is_default: boolean;
  created_at: string;
  receipt_count?: number;
}

export default function ReceiptBusinessesAdmin() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  // Fetch all businesses
  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['admin-businesses', search],
    queryFn: async () => {
      let query = supabase
        .from('receipt_businesses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (search) {
        query = query.or(`name.ilike.%${search}%,tax_id.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get receipt counts for each business
      const businessIds = data.map(b => b.id);
      const { data: counts, error: countError } = await supabase
        .from('receipts')
        .select('business_id')
        .in('business_id', businessIds);
      
      if (countError) console.error(countError);

      const countMap: Record<string, number> = {};
      counts?.forEach(r => {
        if (r.business_id) {
          countMap[r.business_id] = (countMap[r.business_id] || 0) + 1;
        }
      });

      return data.map(b => ({
        ...b,
        receipt_count: countMap[b.id] || 0,
      })) as BusinessRow[];
    },
  });

  // Stats
  const stats = {
    total: businesses.length,
    uniqueUsers: new Set(businesses.map(b => b.line_user_id)).size,
    totalReceipts: businesses.reduce((sum, b) => sum + (b.receipt_count || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/receipts')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Management</h1>
          <p className="text-muted-foreground">
            View all registered businesses across users
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Businesses</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Users</p>
                <p className="text-2xl font-bold">{stats.uniqueUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Receipt className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Receipts</p>
                <p className="text-2xl font-bold">{stats.totalReceipts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search business name or tax ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
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
          ) : businesses.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No businesses found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business Name</TableHead>
                  <TableHead>Tax ID</TableHead>
                  <TableHead>LINE User ID</TableHead>
                  <TableHead>Receipts</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businesses.map((business) => (
                  <TableRow key={business.id}>
                    <TableCell className="font-medium">
                      {business.name}
                    </TableCell>
                    <TableCell>
                      {business.tax_id || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {business.line_user_id.substring(0, 16)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {business.receipt_count} receipts
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {business.is_default && (
                        <Badge className="bg-amber-100 text-amber-700">
                          Default
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(business.created_at), 'dd MMM yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
