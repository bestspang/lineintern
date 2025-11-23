import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Users() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', search],
    queryFn: async () => {
      let query = supabase
        .from('users')
        .select('*')
        .order('last_seen_at', { ascending: false, nullsFirst: false });

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,line_user_id.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const fixNamesMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fix-user-names');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Fixed ${data.success} user names!`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to fix names: ${error.message}`);
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">LINE bot users across all groups</p>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">All Users</CardTitle>
          <CardDescription>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3 w-3 sm:h-4 sm:w-4" />
                <Input
                  placeholder="Search by name or LINE User ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 sm:pl-10 text-sm"
                />
              </div>

              <Button
                onClick={() => fixNamesMutation.mutate()}
                disabled={fixNamesMutation.isPending}
                variant="outline"
                className="w-full sm:w-auto shrink-0 text-sm"
              >
                <RefreshCw
                  className={cn(
                    'h-3 w-3 sm:h-4 sm:w-4 mr-2',
                    fixNamesMutation.isPending && 'animate-spin',
                  )}
                />
                <span className="hidden sm:inline">Fix Display Names</span>
                <span className="sm:hidden">Fix Names</span>
              </Button>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users && users.length > 0 ? (
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60%] sm:w-[60%] min-w-[180px] text-xs sm:text-sm">User</TableHead>
                    <TableHead className="w-[40%] sm:w-[20%] text-xs sm:text-sm hidden sm:table-cell">Language</TableHead>
                    <TableHead className="w-[40%] sm:w-[20%] text-right text-xs sm:text-sm">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/users/${user.id}`)}
                    >
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="text-xs sm:text-sm">
                              {user.display_name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 space-y-0.5 flex-1">
                            <p
                              className="text-xs sm:text-sm font-medium truncate"
                              title={user.display_name}
                            >
                              {user.display_name}
                            </p>
                            <p
                              className="font-mono text-[9px] sm:text-[11px] text-muted-foreground truncate"
                              title={user.line_user_id}
                            >
                              {user.line_user_id}
                            </p>
                            <p className="sm:hidden text-[10px] text-muted-foreground">
                              {user.primary_language || 'auto'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-2 hidden sm:table-cell">
                        <span className="text-xs sm:text-sm">{user.primary_language || 'auto'}</span>
                      </TableCell>
                      <TableCell className="text-right text-[10px] sm:text-xs text-muted-foreground align-top whitespace-nowrap py-2">
                        {user.last_seen_at
                          ? formatDistanceToNow(new Date(user.last_seen_at), {
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
            <div className="text-center py-8 sm:py-12 text-muted-foreground">
              <p className="text-sm">No users found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
