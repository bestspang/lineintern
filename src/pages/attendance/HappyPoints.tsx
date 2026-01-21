import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Flame, Star, Search, Coins } from 'lucide-react';

interface HappyPointsData {
  id: string;
  employee_id: string;
  point_balance: number;
  total_earned: number;
  total_spent: number;
  current_punctuality_streak: number;
  longest_punctuality_streak: number;
  daily_response_score: number;
  monthly_health_bonus: number;
  employees: {
    full_name: string;
    code: string;
    branch: { name: string } | null;
  };
}

export default function HappyPoints() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data: happyPoints, isLoading } = useQuery({
    queryKey: ['happy-points'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('happy_points')
        .select(`
          *,
          employees!inner (
            full_name,
            code,
            exclude_from_points,
            branch:branches!branch_id(name)
          )
        `)
        .order('point_balance', { ascending: false });
      
      if (error) throw error;
      
      // Filter out employees who are excluded from points
      const filteredData = (data || []).filter(
        (p: any) => !p.employees?.exclude_from_points
      );
      return filteredData as unknown as HappyPointsData[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['happy-points-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('happy_points')
        .select(`
          point_balance, 
          total_earned, 
          total_spent, 
          current_punctuality_streak,
          employees!inner(exclude_from_points)
        `);
      
      if (error) throw error;
      
      // Filter out excluded employees for stats calculation
      const filteredData = (data || []).filter(
        (p: any) => !p.employees?.exclude_from_points
      );
      
      const totalBalance = filteredData.reduce((sum, p) => sum + (p.point_balance || 0), 0);
      const totalEarned = filteredData.reduce((sum, p) => sum + (p.total_earned || 0), 0);
      const totalSpent = filteredData.reduce((sum, p) => sum + (p.total_spent || 0), 0);
      const avgStreak = filteredData.length ? Math.round(filteredData.reduce((sum, p) => sum + (p.current_punctuality_streak || 0), 0) / filteredData.length) : 0;
      
      return { totalBalance, totalEarned, totalSpent, avgStreak, employeeCount: filteredData.length };
    },
  });

  const filteredPoints = happyPoints?.filter((p) =>
    p.employees?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.employees?.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const top3 = filteredPoints?.slice(0, 3) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-500" />
          Happy Points Dashboard
        </h1>
        <p className="text-muted-foreground">ภาพรวมแต้มความสุขของพนักงานทั้งหมด</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Balance</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Coins className="h-5 w-5 text-yellow-500" />
              {isLoading ? <Skeleton className="h-8 w-20" /> : stats?.totalBalance?.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Earned</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {isLoading ? <Skeleton className="h-8 w-20" /> : `+${stats?.totalEarned?.toLocaleString()}`}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Spent</CardDescription>
            <CardTitle className="text-2xl text-orange-600">
              {isLoading ? <Skeleton className="h-8 w-20" /> : `-${stats?.totalSpent?.toLocaleString()}`}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Streak</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              {isLoading ? <Skeleton className="h-8 w-20" /> : `${stats?.avgStreak} days`}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Top 3 Leaderboard */}
      {top3.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Top 3 Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center gap-4 md:gap-8">
              {top3.map((p, idx) => (
                <div key={p.id} className="text-center">
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-2 ${
                    idx === 0 ? 'bg-yellow-100 text-yellow-700 ring-4 ring-yellow-300' :
                    idx === 1 ? 'bg-gray-100 text-gray-700 ring-4 ring-gray-300' :
                    'bg-orange-100 text-orange-700 ring-4 ring-orange-300'
                  }`}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                  </div>
                  <p className="font-semibold text-sm truncate max-w-[100px]">{p.employees?.full_name}</p>
                  <p className="text-lg font-bold text-primary">{p.point_balance?.toLocaleString()}</p>
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <Flame className="h-3 w-3 text-orange-500" />
                    {p.current_punctuality_streak} days
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search & Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle>All Employees</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Earned</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-center">Streak</TableHead>
                    <TableHead className="text-center">Daily Resp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPoints?.map((p, idx) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{idx + 1}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{p.employees?.full_name}</p>
                          <p className="text-xs text-muted-foreground">{p.employees?.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>{p.employees?.branch?.name || '-'}</TableCell>
                      <TableCell className="text-right font-bold">{p.point_balance?.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600">+{p.total_earned?.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-orange-600">-{p.total_spent?.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="gap-1">
                          <Flame className="h-3 w-3 text-orange-500" />
                          {p.current_punctuality_streak}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.daily_response_score >= 5 ? 'default' : 'secondary'}>
                          {p.daily_response_score > 0 ? `+${p.daily_response_score}` : '-'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
