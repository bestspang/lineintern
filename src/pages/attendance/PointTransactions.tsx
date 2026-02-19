import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollText, Search, ArrowUpCircle, ArrowDownCircle, Gift, Clock, Heart, Flame } from 'lucide-react';
import { format } from 'date-fns';
import { PointTransactionSendStreakButton } from '@/components/attendance/PointTransactionSendStreakButton';
import { useStreakWeeklyNotifyMarkers } from '@/hooks/useStreakWeeklyNotifyMarkers';

interface PointTransaction {
  id: string;
  employee_id: string;
  transaction_type: string;
  category: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
  employees: {
    full_name: string;
    code: string;
  };
}

export default function PointTransactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['point-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_transactions')
        .select(`
          *,
          employees!inner (full_name, code, is_active)
        `)
        .eq('employees.is_active', true)
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (error) throw error;
      return data as unknown as PointTransaction[];
    },
  });

  const filteredTransactions = transactions?.filter((t) => {
    const matchesSearch = 
      t.employees?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.employees?.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    const matchesType = typeFilter === 'all' || t.transaction_type === typeFilter;
    return matchesSearch && matchesCategory && matchesType;
  });

  const txIds = transactions?.map((t) => t.id);
  const { data: sentSet } = useStreakWeeklyNotifyMarkers(txIds);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'attendance': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'response': return <ScrollText className="h-4 w-4 text-green-500" />;
      case 'health': return <Heart className="h-4 w-4 text-red-500" />;
      case 'streak': return <Flame className="h-4 w-4 text-orange-500" />;
      case 'redemption': return <Gift className="h-4 w-4 text-purple-500" />;
      default: return <ScrollText className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'earn': return 'text-green-600';
      case 'bonus': return 'text-blue-600';
      case 'spend': return 'text-orange-600';
      case 'deduct': return 'text-red-600';
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-primary" />
          Point Transactions
        </h1>
        <p className="text-muted-foreground">ประวัติการได้รับและใช้แต้มทั้งหมด</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="attendance">Attendance</SelectItem>
                <SelectItem value="response">Response</SelectItem>
                <SelectItem value="health">Health</SelectItem>
                <SelectItem value="streak">Streak</SelectItem>
                <SelectItem value="redemption">Redemption</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="earn">Earned</SelectItem>
                <SelectItem value="bonus">Bonus</SelectItem>
                <SelectItem value="spend">Spent</SelectItem>
                <SelectItem value="deduct">Deducted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions?.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(t.created_at), 'dd/MM/yy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{t.employees?.full_name}</p>
                          <p className="text-xs text-muted-foreground">{t.employees?.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {getCategoryIcon(t.category)}
                          {t.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getTypeColor(t.transaction_type)}>
                          {t.transaction_type === 'earn' || t.transaction_type === 'bonus' ? (
                            <ArrowUpCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <ArrowDownCircle className="h-3 w-3 mr-1" />
                          )}
                          {t.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${getTypeColor(t.transaction_type)}`}>
                        {t.amount > 0 ? '+' : ''}{t.amount}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {t.balance_after?.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {t.description || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <PointTransactionSendStreakButton tx={t} alreadySent={sentSet?.has(t.id)} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredTransactions?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No transactions found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
