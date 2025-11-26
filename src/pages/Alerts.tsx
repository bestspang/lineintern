import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Circle } from 'lucide-react';

export default function Alerts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [resolvedFilter, setResolvedFilter] = useState('unresolved');
  const [confirmResolve, setConfirmResolve] = useState<{ id: string; resolved: boolean } | null>(null);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts', severityFilter, resolvedFilter],
    queryFn: async () => {
      let query = supabase
        .from('alerts')
        .select('*, groups(display_name)')
        .order('created_at', { ascending: false });
      
      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter as 'low' | 'medium' | 'high');
      }

      if (resolvedFilter !== 'all') {
        query = query.eq('resolved', resolvedFilter === 'resolved');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const toggleResolved = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await supabase
        .from('alerts')
        .update({ resolved: !resolved, resolved_at: !resolved ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast({ 
        title: 'Alert updated', 
        description: variables.resolved ? 'Alert marked as unresolved' : 'Alert resolved successfully' 
      });
      setConfirmResolve(null);
    },
    onError: (error) => {
      toast({ 
        title: 'Error', 
        description: 'Failed to update alert: ' + error.message,
        variant: 'destructive' 
      });
      setConfirmResolve(null);
    },
  });

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      low: 'secondary',
      medium: 'default',
      high: 'destructive',
    };
    return <Badge variant={variants[severity] || 'default'}>{severity}</Badge>;
  };

  return (
    <div className="space-y-4 sm:space-y-6">

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">All Alerts</CardTitle>
          <CardDescription className="flex flex-col sm:flex-row gap-2">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full sm:w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Select value={resolvedFilter} onValueChange={setResolvedFilter}>
              <SelectTrigger className="w-full sm:w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Alerts</SelectItem>
                <SelectItem value="unresolved">Unresolved</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : alerts && alerts.length > 0 ? (
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[55%] sm:w-[45%] min-w-[160px] text-xs sm:text-sm">Alert</TableHead>
                    <TableHead className="w-[45%] sm:w-[25%] min-w-[100px] text-xs sm:text-sm hidden sm:table-cell">Group</TableHead>
                    <TableHead className="w-[20%] text-xs sm:text-sm hidden md:table-cell">Time</TableHead>
                    <TableHead className="w-[45%] sm:w-[10%] text-right text-xs sm:text-sm">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id} className="hover:bg-muted/50">
                      <TableCell className="py-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] sm:text-xs h-4 sm:h-5">{alert.type}</Badge>
                            {getSeverityBadge(alert.severity)}
                            {alert.resolved ? (
                              <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500" />
                            ) : (
                              <Circle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <p className="text-xs sm:text-sm line-clamp-2">{alert.summary}</p>
                          <p className="sm:hidden text-[10px] text-muted-foreground">
                            {(alert.groups as any)?.display_name || 'N/A'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 hidden sm:table-cell">
                        <p className="text-xs sm:text-sm truncate">{(alert.groups as any)?.display_name || 'N/A'}</p>
                      </TableCell>
                      <TableCell className="py-2 hidden md:table-cell">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                        </p>
                      </TableCell>
                      <TableCell className="text-right py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] sm:text-xs px-2"
                          onClick={() => setConfirmResolve({ id: alert.id, resolved: alert.resolved })}
                          disabled={toggleResolved.isPending}
                        >
                          {toggleResolved.isPending ? 'Updating...' : (alert.resolved ? 'Unresolve' : 'Resolve')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No alerts found</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmResolve} onOpenChange={() => setConfirmResolve(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmResolve?.resolved 
                ? 'Mark this alert as unresolved?' 
                : 'Mark this alert as resolved?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmResolve && toggleResolved.mutate(confirmResolve)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
