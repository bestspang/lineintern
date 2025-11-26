import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';

export default function Training() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['training-requests', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('training_requests')
        .select('*, users!requested_by_user_id(display_name), groups(display_name)')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching training requests:', error);
        return [];
      }
      return data || [];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: 'approved' | 'rejected';
      notes?: string;
    }) => {
      const { error } = await supabase
        .from('training_requests')
        .update({
          status,
          notes,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;

      // If approved, create knowledge items
      if (status === 'approved') {
        const request = requests?.find((r) => r.id === id);
        if (request?.extracted_items && Array.isArray(request.extracted_items)) {
          const knowledgeItems = request.extracted_items.map((item: any) => ({
            scope: 'group' as const,
            group_id: request.group_id,
            title: item.title || 'Untitled',
            category: item.category || 'General',
            content: item.content || '',
            tags: item.tags || [],
            is_active: true,
          }));

          const { error: insertError } = await supabase.from('knowledge_items').insert(knowledgeItems);
          if (insertError) {
            console.error('Error creating knowledge items:', insertError);
            throw insertError;
          }
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-items'] });
      setIsReviewDialogOpen(false);
      toast({
        title: variables.status === 'approved' ? 'Request approved' : 'Request rejected',
        description:
          variables.status === 'approved'
            ? 'Knowledge items have been added to the database'
            : 'Training request has been rejected',
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive'; icon: any }> = {
      pending: { variant: 'secondary', icon: Clock },
      processing: { variant: 'default', icon: Clock },
      approved: { variant: 'default', icon: CheckCircle },
      rejected: { variant: 'destructive', icon: XCircle },
    };
    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6 sm:w-8 sm:h-8" />
          Training Queue
        </h1>
        <p className="text-sm text-muted-foreground">Review and approve knowledge base training requests</p>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Training Requests</CardTitle>
          <CardDescription>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                className="text-xs sm:text-sm"
                onClick={() => setStatusFilter('all')}
              >
                All
              </Button>
              <Button
                variant={statusFilter === 'pending' ? 'default' : 'outline'}
                size="sm"
                className="text-xs sm:text-sm"
                onClick={() => setStatusFilter('pending')}
              >
                Pending
              </Button>
              <Button
                variant={statusFilter === 'approved' ? 'default' : 'outline'}
                size="sm"
                className="text-xs sm:text-sm"
                onClick={() => setStatusFilter('approved')}
              >
                Approved
              </Button>
              <Button
                variant={statusFilter === 'rejected' ? 'default' : 'outline'}
                size="sm"
                className="text-xs sm:text-sm"
                onClick={() => setStatusFilter('rejected')}
              >
                Rejected
              </Button>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2 p-3 sm:p-0">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : requests && requests.length > 0 ? (
            <div className="min-w-[900px]">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Source Type</TableHead>
                  <TableHead>Content Preview</TableHead>
                  <TableHead>Items Extracted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>{(request.users as any)?.display_name || 'Unknown'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{(request.groups as any)?.display_name || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{request.source_type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      {request.source_type === 'url' ? (
                        <a
                          href={request.source_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {request.source_url}
                        </a>
                      ) : (
                        <div className="text-sm text-muted-foreground truncate">
                          {request.source_content?.substring(0, 100) || 'N/A'}...
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {Array.isArray(request.extracted_items) ? request.extracted_items.length : 0}
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell>
                      {request.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedRequest(request);
                            setReviewNotes('');
                            setIsReviewDialogOpen(true);
                          }}
                        >
                          Review
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 px-4">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
              <p className="text-lg text-muted-foreground mb-2">No training requests found</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                Training requests are created when users submit documents, URLs, or text for the bot to learn from. 
                You can create knowledge items directly from the Knowledge Base page.
              </p>
              <Button variant="outline" size="sm" onClick={() => window.location.href = '/knowledge-base'}>
                Go to Knowledge Base
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Training Request</DialogTitle>
            <DialogDescription>
              Review extracted knowledge items and approve or reject
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div>
                <Label className="font-semibold">Source</Label>
                <p className="text-sm mt-1">
                  Type: {selectedRequest.source_type}
                  {selectedRequest.source_url && (
                    <>
                      {' | '}
                      <a
                        href={selectedRequest.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {selectedRequest.source_url}
                      </a>
                    </>
                  )}
                </p>
              </div>
              <div>
                <Label className="font-semibold">Extracted Knowledge Items</Label>
                <div className="space-y-4 mt-2">
                  {Array.isArray(selectedRequest.extracted_items) &&
                  selectedRequest.extracted_items.length > 0 ? (
                    selectedRequest.extracted_items.map((item: any, idx: number) => (
                      <Card key={idx}>
                        <CardHeader>
                          <CardTitle className="text-base">{item.title || 'Untitled'}</CardTitle>
                          <CardDescription>
                            Category: {item.category || 'General'} | Tags:{' '}
                            {Array.isArray(item.tags) ? item.tags.join(', ') : 'None'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm">{item.content || 'No content'}</p>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No items extracted</p>
                  )}
                </div>
              </div>
              <div>
                <Label>Review Notes (optional)</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                  placeholder="Add any notes about this review..."
                  className="mt-2"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                selectedRequest &&
                updateStatusMutation.mutate({
                  id: selectedRequest.id,
                  status: 'rejected',
                  notes: reviewNotes,
                })
              }
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
            <Button
              onClick={() =>
                selectedRequest &&
                updateStatusMutation.mutate({
                  id: selectedRequest.id,
                  status: 'approved',
                  notes: reviewNotes,
                })
              }
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve & Add to KB
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
