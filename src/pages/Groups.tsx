import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type SortOption = 'last_activity' | 'name';

export default function Groups() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('last_activity');

  const { data: groups, isLoading } = useQuery({
    queryKey: ['groups', search, sortBy],
    queryFn: async () => {
      let query = supabase
        .from('groups')
        .select('*');

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,line_group_id.ilike.%${search}%`);
      }

      // Apply sorting
      if (sortBy === 'last_activity') {
        query = query.order('last_activity_at', { ascending: false, nullsFirst: false });
      } else {
        query = query.order('display_name', { ascending: true });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('refresh-member-count');
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      
      if (data.summary) {
        toast.success(
          `อัปเดต member count สำเร็จ!`,
          {
            description: `อัปเดต ${data.summary.success} groups สำเร็จ ${data.summary.errors > 0 ? `(${data.summary.errors} errors)` : ''}`
          }
        );
      }
    },
    onError: (error: any) => {
      toast.error('เกิดข้อผิดพลาด', {
        description: error.message || 'ไม่สามารถอัปเดต member count ได้'
      });
    }
  });

  const handleRefresh = () => {
    toast.info('กำลังอัปเดต member counts จาก LINE API...');
    refreshMutation.mutate();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      active: 'default',
      left: 'secondary',
      error: 'destructive',
      pending: 'secondary',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Groups</h1>
          <p className="text-sm text-muted-foreground">Manage LINE group configurations</p>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={refreshMutation.isPending}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          {refreshMutation.isPending ? 'กำลังอัปเดต...' : 'Sync Member Count'}
        </Button>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base sm:text-lg">All Groups</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort by:</span>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_activity">Last Activity</SelectItem>
                  <SelectItem value="name">Group Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <CardDescription className="mt-3">
            <Input
              placeholder="Search by name or LINE ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-sm text-sm"
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : groups && groups.length > 0 ? (
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60%] sm:w-[55%] min-w-[180px] text-xs sm:text-sm">Group</TableHead>
                    <TableHead className="w-[40%] sm:w-[15%] text-right text-xs sm:text-sm hidden sm:table-cell">Members</TableHead>
                    <TableHead className="w-[40%] sm:w-[30%] text-right text-xs sm:text-sm">Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <TableRow
                      key={group.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/groups/${group.id}`)}
                    >
                      <TableCell className="py-2">
                        <div className="space-y-1 min-w-0">
                          <p
                            className="text-xs sm:text-sm font-medium truncate"
                            title={group.display_name}
                          >
                            {group.display_name}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
                            {getStatusBadge(group.status)}
                            <span className="hidden sm:inline">•</span>
                            <Badge variant="outline" className="text-[10px] sm:text-xs h-4 sm:h-5">
                              {group.mode}
                            </Badge>
                            {group.member_count !== null && (
                              <>
                                <span className="sm:hidden">•</span>
                                <span className="sm:hidden text-[10px]">{group.member_count}m</span>
                              </>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top py-2 hidden sm:table-cell">
                        <span className="text-sm">{group.member_count || 0}</span>
                      </TableCell>
                      <TableCell className="text-right text-[10px] sm:text-xs text-muted-foreground align-top whitespace-nowrap py-2">
                        {group.last_activity_at
                          ? formatDistanceToNow(new Date(group.last_activity_at), {
                              addSuffix: true,
                            })
                          : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No groups found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
