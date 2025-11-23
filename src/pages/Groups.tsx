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
      let query = supabase.from('groups').select('*').order('last_activity_at', { ascending: false, nullsFirst: false });
      
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Group Name</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[100px]">Mode</TableHead>
                    <TableHead className="min-w-[100px]">Members</TableHead>
                    <TableHead className="min-w-[150px]">Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <TableRow
                      key={group.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/groups/${group.id}`)}
                    >
                      <TableCell className="font-medium">{group.display_name}</TableCell>
                      <TableCell>{getStatusBadge(group.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{group.mode}</Badge>
                      </TableCell>
                      <TableCell>{group.member_count || 0}</TableCell>
                      <TableCell className="text-muted-foreground">{group.last_activity_at ? formatDistanceToNow(new Date(group.last_activity_at), { addSuffix: true }) : 'Never'}</TableCell>
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
