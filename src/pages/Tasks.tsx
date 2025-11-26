import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns';
import { CalendarIcon, CheckCircle2, Plus, XCircle, Clock, AlertCircle, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Tasks() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: 'completed' | 'cancelled' } | null>(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    dueDate: new Date(),
    groupId: '',
  });
  
  const queryClient = useQueryClient();

  // Real-time subscription for tasks
  useEffect(() => {
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', search, statusFilter, groupFilter],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('*, groups(display_name), users!tasks_assigned_to_user_id_fkey(display_name), created_by:users!tasks_created_by_user_id_fkey(display_name)')
        .order('due_at', { ascending: true });
      
      if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as 'pending' | 'completed' | 'cancelled');
      }

      if (groupFilter !== 'all') {
        query = query.eq('group_id', groupFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('id, display_name')
        .eq('status', 'active')
        .order('display_name');
      if (error) throw error;
      return data;
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (task: typeof newTask) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: task.title,
          description: task.description || null,
          due_at: task.dueDate.toISOString(),
          group_id: task.groupId,
          status: 'pending',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task created successfully!');
      setIsCreateOpen(false);
      setNewTask({ title: '', description: '', dueDate: new Date(), groupId: '' });
    },
    onError: (error) => {
      toast.error('Failed to create task: ' + error.message);
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'completed' | 'cancelled' }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      const message = variables.status === 'completed' ? 'Task marked as completed!' : 'Task cancelled';
      toast.success(message);
      setConfirmAction(null);
    },
    onError: (error) => {
      toast.error('Failed to update task: ' + error.message);
      setConfirmAction(null);
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      pending: 'default',
      completed: 'secondary',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold">Tasks & Reminders</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage scheduled tasks across all groups</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Create Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>
                Create a new task or reminder for a group
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Task title..."
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Task details..."
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="group">Group</Label>
                <Select value={newTask.groupId} onValueChange={(value) => setNewTask({ ...newTask, groupId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups?.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !newTask.dueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newTask.dueDate ? format(newTask.dueDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newTask.dueDate}
                      onSelect={(date) => date && setNewTask({ ...newTask, dueDate: date })}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createTaskMutation.mutate(newTask)}
                disabled={!newTask.title || !newTask.groupId || createTaskMutation.isPending}
              >
                {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg md:text-xl">All Tasks</CardTitle>
          <CardDescription>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 sm:max-w-xs text-sm"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : tasks && tasks.length > 0 ? (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50%] min-w-[200px] text-xs sm:text-sm">Task</TableHead>
                        <TableHead className="w-[20%] min-w-[90px] text-xs sm:text-sm hidden sm:table-cell">Group</TableHead>
                        <TableHead className="w-[18%] min-w-[70px] text-xs sm:text-sm text-right">Due</TableHead>
                        <TableHead className="w-[12%] min-w-[60px] text-xs sm:text-sm text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((task) => {
                        const isOverdue = isPast(new Date(task.due_at)) && task.status === 'pending';
                        return (
                          <TableRow key={task.id} className="hover:bg-muted/50">
                            <TableCell className="py-2">
                              <div className="space-y-1 min-w-0 max-w-full">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-xs sm:text-sm font-medium flex-1 min-w-0 break-words">{task.title}</p>
                                  {getStatusBadge(task.status)}
                                </div>
                                {task.description && (
                                  <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1 break-words">
                                    {task.description}
                                  </p>
                                )}
                                <div className="sm:hidden text-[10px] text-muted-foreground truncate">
                                  {(task.groups as any)?.display_name || 'N/A'}
                                </div>
                                {task.is_recurring && (
                                  <Badge variant="outline" className="text-[10px] h-4 hidden sm:inline-flex">
                                    🔄 {task.recurrence_pattern}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-2 hidden sm:table-cell">
                              <div className="space-y-0.5 min-w-0 max-w-[120px]">
                                <p className="text-[11px] font-medium truncate">{(task.groups as any)?.display_name || 'N/A'}</p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {(task.users as any)?.display_name || 'Unassigned'}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right py-2">
                              <div className={cn("whitespace-nowrap", isOverdue && 'text-destructive')}>
                                <p className="text-[10px] sm:text-xs font-medium">
                                  {format(new Date(task.due_at), 'MMM d')}
                                </p>
                                <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                                  {format(new Date(task.due_at), 'HH:mm')}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right py-2">
                              {task.status === 'pending' && (
                                <div className="flex gap-0.5 justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setConfirmAction({ id: task.id, status: 'completed' })}
                                    disabled={updateTaskStatusMutation.isPending}
                                  >
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setConfirmAction({ id: task.id, status: 'cancelled' })}
                                    disabled={updateTaskStatusMutation.isPending}
                                  >
                                    <XCircle className="h-3 w-3 text-red-600" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No tasks found</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.status === 'completed' 
                ? 'Mark this task as completed?' 
                : 'Cancel this task? This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && updateTaskStatusMutation.mutate(confirmAction)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
