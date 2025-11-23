import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

export default function Groups() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: groups, isLoading } = useQuery({
    queryKey: ['groups', search],
    queryFn: async () => {
      let query = supabase
        .from('groups')
        .select('*')
        .order('last_activity_at', { ascending: false, nullsFirst: false });

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,line_group_id.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Groups</h1>
          <p className="text-muted-foreground">Manage LINE group configurations</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Groups</CardTitle>
          <CardDescription>
            <Input
              placeholder="Search by name or LINE ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                    <TableHead className="w-[55%] min-w-[220px]">Group</TableHead>
                    <TableHead className="w-[15%] text-right">Members</TableHead>
                    <TableHead className="w-[30%] text-right">Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <TableRow
                      key={group.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/groups/${group.id}`)}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <p
                            className="font-medium truncate"
                            title={group.display_name}
                          >
                            {group.display_name}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {getStatusBadge(group.status)}
                            <span>•</span>
                            <Badge variant="outline" className="text-xs">
                              {group.mode}
                            </Badge>
                            {group.member_count !== null && (
                              <span className="hidden sm:inline-flex items-center gap-1">
                                <span>Members:</span>
                                <span className="font-medium">{group.member_count}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {group.member_count || 0}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground align-top whitespace-nowrap">
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
