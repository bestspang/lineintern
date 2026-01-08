import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  ArrowLeft, Search, Users, AlertTriangle, 
  CheckCircle, XCircle, MoreHorizontal, 
  RefreshCcw, ArrowUpCircle, Save, Gauge,
  Package, Crown, TrendingUp
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Plan {
  id: string;
  name: string;
  ai_receipts_limit: number;
  businesses_limit: number;
  price_thb: number;
}

interface UsageRecord {
  line_user_id: string;
  period_yyyymm: string;
  ai_receipts_used: number;
  created_at: string;
  updated_at: string;
}

interface Subscription {
  line_user_id: string;
  plan_id: string;
  current_period_start: string;
  current_period_end: string;
}

interface User {
  id: string;
  line_user_id: string;
  display_name: string | null;
}

interface UserQuotaDisplay {
  lineUserId: string;
  displayName: string;
  planId: string;
  planName: string;
  used: number;
  limit: number;
  period: string;
  status: 'ok' | 'warning' | 'exceeded';
  percentUsed: number;
}

export default function ReceiptQuota() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  
  // Dialog states
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [changePlanDialogOpen, setChangePlanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserQuotaDisplay | null>(null);
  const [selectedNewPlanId, setSelectedNewPlanId] = useState<string>('');
  
  // Plan editing state
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editedLimit, setEditedLimit] = useState<number>(0);

  // Get current period
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Fetch plans
  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['receipt-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_plans')
        .select('*')
        .order('price_thb');
      if (error) throw error;
      return data as Plan[];
    },
  });

  // Fetch usage for current period
  const { data: usageRecords = [], isLoading: usageLoading } = useQuery({
    queryKey: ['receipt-usage', currentPeriod],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_usage')
        .select('*')
        .eq('period_yyyymm', currentPeriod);
      if (error) throw error;
      return data as UsageRecord[];
    },
  });

  // Fetch subscriptions
  const { data: subscriptions = [], isLoading: subsLoading } = useQuery({
    queryKey: ['receipt-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_subscriptions')
        .select('*');
      if (error) throw error;
      return data as Subscription[];
    },
  });

  // Fetch users with LINE user IDs
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users-for-quota'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, line_user_id, display_name')
        .not('line_user_id', 'is', null);
      if (error) throw error;
      return data as User[];
    },
  });

  // Build user quota display data
  const userQuotaData: UserQuotaDisplay[] = usageRecords.map(usage => {
    const user = users.find(u => u.line_user_id === usage.line_user_id);
    const subscription = subscriptions.find(s => s.line_user_id === usage.line_user_id);
    const plan = plans.find(p => p.id === (subscription?.plan_id || 'free')) || 
      plans.find(p => p.id === 'free') || 
      { id: 'free', name: 'Free', ai_receipts_limit: 8, price_thb: 0 };
    
    const used = usage.ai_receipts_used || 0;
    const limit = plan.ai_receipts_limit || 8;
    const percentUsed = limit > 0 ? (used / limit) * 100 : 0;
    
    let status: 'ok' | 'warning' | 'exceeded' = 'ok';
    if (percentUsed >= 100) status = 'exceeded';
    else if (percentUsed >= 80) status = 'warning';
    
    return {
      lineUserId: usage.line_user_id,
      displayName: user?.display_name || usage.line_user_id.slice(0, 10) + '...',
      planId: plan.id,
      planName: plan.name,
      used,
      limit,
      period: usage.period_yyyymm,
      status,
      percentUsed,
    };
  });

  // Filter data
  const filteredData = userQuotaData.filter(u => {
    const matchesSearch = u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.lineUserId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    const matchesPlan = planFilter === 'all' || u.planId === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  // Sort by usage percentage descending
  const sortedData = [...filteredData].sort((a, b) => b.percentUsed - a.percentUsed);

  // Stats
  const totalUsers = userQuotaData.length;
  const exceededUsers = userQuotaData.filter(u => u.status === 'exceeded').length;
  const warningUsers = userQuotaData.filter(u => u.status === 'warning').length;
  const totalAiReceipts = userQuotaData.reduce((sum, u) => sum + u.used, 0);

  // Reset quota mutation
  const resetMutation = useMutation({
    mutationFn: async (lineUserId: string) => {
      const { error } = await supabase
        .from('receipt_usage')
        .update({ ai_receipts_used: 0, updated_at: new Date().toISOString() })
        .eq('line_user_id', lineUserId)
        .eq('period_yyyymm', currentPeriod);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Quota reset successfully');
      queryClient.invalidateQueries({ queryKey: ['receipt-usage'] });
      setResetDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast.error('Failed to reset quota: ' + error.message);
    },
  });

  // Change plan mutation
  const changePlanMutation = useMutation({
    mutationFn: async ({ lineUserId, planId }: { lineUserId: string; planId: string }) => {
      const today = new Date().toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      
      // Upsert subscription
      const { error } = await supabase
        .from('receipt_subscriptions')
        .upsert({
          line_user_id: lineUserId,
          plan_id: planId,
          current_period_start: today,
          current_period_end: endOfMonth,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'line_user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Plan changed successfully');
      queryClient.invalidateQueries({ queryKey: ['receipt-subscriptions'] });
      setChangePlanDialogOpen(false);
      setSelectedUser(null);
      setSelectedNewPlanId('');
    },
    onError: (error) => {
      toast.error('Failed to change plan: ' + error.message);
    },
  });

  // Update plan limit mutation
  const updatePlanMutation = useMutation({
    mutationFn: async ({ planId, limit }: { planId: string; limit: number }) => {
      const { error } = await supabase
        .from('receipt_plans')
        .update({ ai_receipts_limit: limit })
        .eq('id', planId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Plan limit updated');
      queryClient.invalidateQueries({ queryKey: ['receipt-plans'] });
      setEditingPlan(null);
    },
    onError: (error) => {
      toast.error('Failed to update plan: ' + error.message);
    },
  });

  const isLoading = plansLoading || usageLoading || subsLoading || usersLoading;

  const getStatusBadge = (status: 'ok' | 'warning' | 'exceeded') => {
    switch (status) {
      case 'exceeded':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Exceeded</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><AlertTriangle className="h-3 w-3" /> Warning</Badge>;
      default:
        return <Badge variant="outline" className="gap-1 text-green-600"><CheckCircle className="h-3 w-3" /> OK</Badge>;
    }
  };

  const getPlanBadge = (planId: string) => {
    switch (planId) {
      case 'scale':
        return <Badge className="gap-1 bg-purple-600"><Crown className="h-3 w-3" /> Scale</Badge>;
      case 'pro':
        return <Badge className="gap-1 bg-blue-600"><TrendingUp className="h-3 w-3" /> Pro</Badge>;
      case 'lite':
        return <Badge variant="secondary" className="gap-1"><Package className="h-3 w-3" /> Lite</Badge>;
      default:
        return <Badge variant="outline" className="gap-1">Free</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/receipts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Gauge className="h-6 w-6" />
              Receipt Quota Management
            </h1>
            <p className="text-muted-foreground">
              Manage AI receipt quotas, plans, and user limits • Period: {currentPeriod}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Users</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              {totalUsers}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Exceeded Quota</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              {exceededUsers}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Near Limit (≥80%)</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              {warningUsers}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>AI Receipts This Month</CardDescription>
            <CardTitle className="text-3xl">{totalAiReceipts}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* User Quota Table */}
      <Card>
        <CardHeader>
          <CardTitle>User Quotas</CardTitle>
          <CardDescription>View and manage quota usage per user</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="exceeded">Exceeded</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {plans.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sortedData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No usage data found for this period
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((user) => (
                  <TableRow key={user.lineUserId}>
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell>{getPlanBadge(user.planId)}</TableCell>
                    <TableCell>
                      <div className="space-y-1 min-w-[150px]">
                        <div className="flex justify-between text-sm">
                          <span>{user.used} / {user.limit}</span>
                          <span className="text-muted-foreground">{Math.round(user.percentUsed)}%</span>
                        </div>
                        <Progress 
                          value={Math.min(user.percentUsed, 100)} 
                          className={user.status === 'exceeded' ? '[&>div]:bg-destructive' : 
                            user.status === 'warning' ? '[&>div]:bg-yellow-500' : ''}
                        />
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(user.status)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setResetDialogOpen(true);
                          }}>
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            Reset Quota
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setSelectedNewPlanId(user.planId);
                            setChangePlanDialogOpen(true);
                          }}>
                            <ArrowUpCircle className="h-4 w-4 mr-2" />
                            Change Plan
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Plan Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Settings</CardTitle>
          <CardDescription>Configure AI receipt limits for each plan</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>AI Limit / Month</TableHead>
                <TableHead>Max Businesses</TableHead>
                <TableHead>Price (THB)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{getPlanBadge(plan.id)}</TableCell>
                  <TableCell>
                    {editingPlan === plan.id ? (
                      <Input
                        type="number"
                        value={editedLimit}
                        onChange={(e) => setEditedLimit(Number(e.target.value))}
                        className="w-24"
                        min={0}
                      />
                    ) : (
                      <span>{plan.ai_receipts_limit}</span>
                    )}
                  </TableCell>
                  <TableCell>{plan.businesses_limit}</TableCell>
                  <TableCell>฿{plan.price_thb.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {editingPlan === plan.id ? (
                      <div className="flex gap-2 justify-end">
                        <Button 
                          size="sm" 
                          onClick={() => updatePlanMutation.mutate({ planId: plan.id, limit: editedLimit })}
                          disabled={updatePlanMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => setEditingPlan(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setEditingPlan(plan.id);
                          setEditedLimit(plan.ai_receipts_limit);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reset Quota Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Quota</DialogTitle>
            <DialogDescription>
              Reset AI receipt quota for <strong>{selectedUser?.displayName}</strong> for period {currentPeriod}?
              This will set their usage back to 0.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedUser && resetMutation.mutate(selectedUser.lineUserId)}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? 'Resetting...' : 'Reset Quota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={changePlanDialogOpen} onOpenChange={setChangePlanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
            <DialogDescription>
              Change plan for <strong>{selectedUser?.displayName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Select New Plan</Label>
            <Select value={selectedNewPlanId} onValueChange={setSelectedNewPlanId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.ai_receipts_limit} AI receipts/month)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedUser && changePlanMutation.mutate({ 
                lineUserId: selectedUser.lineUserId, 
                planId: selectedNewPlanId 
              })}
              disabled={changePlanMutation.isPending || !selectedNewPlanId}
            >
              {changePlanMutation.isPending ? 'Changing...' : 'Change Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
