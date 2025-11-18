import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export default function KnowledgeBase() {
  const [search, setSearch] = useState('');

  const { data: globalItems, isLoading: globalLoading } = useQuery({
    queryKey: ['knowledge', 'global', search],
    queryFn: async () => {
      let query = supabase
        .from('knowledge_items')
        .select('*')
        .eq('scope', 'global')
        .order('updated_at', { ascending: false });
      
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: groupItems, isLoading: groupLoading } = useQuery({
    queryKey: ['knowledge', 'group', search],
    queryFn: async () => {
      let query = supabase
        .from('knowledge_items')
        .select('*, groups(display_name)')
        .eq('scope', 'group')
        .order('updated_at', { ascending: false });
      
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const renderTable = (items: any[] | undefined, isLoading: boolean) => {
    if (isLoading) {
      return (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }

    if (!items || items.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <p>No knowledge items found</p>
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50">
              <TableCell className="font-medium">{item.title}</TableCell>
              <TableCell>
                <Badge variant="outline">{item.category}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={item.is_active ? 'default' : 'secondary'}>
                  {item.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {item.last_used_at
                  ? formatDistanceToNow(new Date(item.last_used_at), { addSuffix: true })
                  : 'Never'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Knowledge Base</h1>
        <p className="text-muted-foreground">Manage FAQ and documentation snippets</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Knowledge</CardTitle>
          <CardDescription>
            <Input
              placeholder="Search by title or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="global">
        <TabsList>
          <TabsTrigger value="global">Global Knowledge</TabsTrigger>
          <TabsTrigger value="group">Per-Group Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <Card>
            <CardHeader>
              <CardTitle>Global Knowledge Items</CardTitle>
              <CardDescription>Available to all groups</CardDescription>
            </CardHeader>
            <CardContent>
              {renderTable(globalItems, globalLoading)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="group">
          <Card>
            <CardHeader>
              <CardTitle>Group-Specific Knowledge</CardTitle>
              <CardDescription>Scoped to individual groups</CardDescription>
            </CardHeader>
            <CardContent>
              {renderTable(groupItems, groupLoading)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
