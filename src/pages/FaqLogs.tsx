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
import { MessageSquare, Star, ThumbsUp, ThumbsDown, Edit } from 'lucide-react';

export default function FaqLogs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedAnswer, setEditedAnswer] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['faq-logs', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('faq_logs')
        .select('*, groups(display_name), users(display_name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (searchTerm) {
        query = query.or(`question.ilike.%${searchTerm}%,answer.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const rateLogMutation = useMutation({
    mutationFn: async ({ id, rating, wasHelpful }: { id: string; rating?: number; wasHelpful?: boolean }) => {
      const updates: any = {};
      if (rating !== undefined) updates.rating = rating;
      if (wasHelpful !== undefined) updates.was_helpful = wasHelpful;

      const { error } = await supabase
        .from('faq_logs')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faq-logs'] });
      toast({ title: 'Rating updated' });
    },
  });

  const updateAnswerMutation = useMutation({
    mutationFn: async ({ id, answer }: { id: string; answer: string }) => {
      const { error } = await supabase
        .from('faq_logs')
        .update({ answer })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faq-logs'] });
      setIsEditDialogOpen(false);
      toast({ title: 'Answer updated successfully' });
    },
  });

  const renderStars = (rating: number | null, logId: string) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => rateLogMutation.mutate({ id: logId, rating: star })}
            className={`${
              rating && star <= rating ? 'text-yellow-500' : 'text-muted-foreground'
            } hover:text-yellow-400 transition-colors`}
          >
            <Star className={`w-4 h-4 ${rating && star <= rating ? 'fill-current' : ''}`} />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6 sm:w-8 sm:h-8" />
          FAQ Logs
        </h1>
        <p className="text-sm text-muted-foreground">Track and improve AI-powered Q&A interactions</p>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">FAQ Interaction History</CardTitle>
          <CardDescription>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Search questions or answers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:max-w-md text-sm"
              />
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
          ) : logs && logs.length > 0 ? (
            <div className="min-w-[800px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Time</TableHead>
                    <TableHead className="text-xs sm:text-sm">Group</TableHead>
                    <TableHead className="text-xs sm:text-sm">Question</TableHead>
                    <TableHead className="text-xs sm:text-sm">Answer Preview</TableHead>
                    <TableHead className="text-xs sm:text-sm">Language</TableHead>
                    <TableHead className="text-xs sm:text-sm">Rating</TableHead>
                    <TableHead className="text-xs sm:text-sm">Helpful</TableHead>
                    <TableHead className="text-xs sm:text-sm">Response Time</TableHead>
                    <TableHead className="text-xs sm:text-sm">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{(log.groups as any)?.display_name || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="truncate font-medium">{log.question}</div>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="text-sm text-muted-foreground truncate">{log.answer}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{log.language}</Badge>
                    </TableCell>
                    <TableCell>{renderStars(log.rating, log.id)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button
                          onClick={() => rateLogMutation.mutate({ id: log.id, wasHelpful: true })}
                          className={`${
                            log.was_helpful === true ? 'text-green-500' : 'text-muted-foreground'
                          } hover:text-green-600`}
                        >
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => rateLogMutation.mutate({ id: log.id, wasHelpful: false })}
                          className={`${
                            log.was_helpful === false ? 'text-red-500' : 'text-muted-foreground'
                          } hover:text-red-600`}
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.response_time_ms ? `${log.response_time_ms}ms` : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setSelectedLog(log);
                          setEditedAnswer(log.answer);
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 sm:py-12 text-muted-foreground p-3 sm:p-0">
              <MessageSquare className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm sm:text-base">No FAQ logs found</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Answer</DialogTitle>
            <DialogDescription>
              Correct the answer to improve future responses
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div>
                <Label className="font-semibold">Question</Label>
                <p className="text-sm mt-1">{selectedLog.question}</p>
              </div>
              <div>
                <Label>Answer</Label>
                <Textarea
                  value={editedAnswer}
                  onChange={(e) => setEditedAnswer(e.target.value)}
                  rows={10}
                  className="mt-2"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedLog && updateAnswerMutation.mutate({ id: selectedLog.id, answer: editedAnswer })
              }
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
