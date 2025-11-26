import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  active: boolean;
}

interface CronHistory {
  jobid: number;
  runid: number;
  jobname: string;
  status: string;
  start_time: string;
  end_time: string;
  return_message: string;
}

const parseCronSchedule = (schedule: string): string => {
  const patterns: Record<string, string> = {
    '* * * * *': 'Every minute',
    '*/5 * * * *': 'Every 5 minutes',
    '*/15 * * * *': 'Every 15 minutes',
    '0 * * * *': 'Hourly',
    '0 0 * * *': 'Daily at midnight',
    '0 0 * * 1': 'Weekly on Monday',
  };
  return patterns[schedule] || schedule;
};

const calculateDuration = (start: string, end: string): string => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

export default function CronJobs() {
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [filterJob, setFilterJob] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: jobs = [], refetch: refetchJobs } = useQuery<CronJob[]>({
    queryKey: ['cron-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_cron_jobs');
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000, // Normal: Cron job monitoring
  });

  const { data: history = [], refetch: refetchHistory } = useQuery<CronHistory[]>({
    queryKey: ['cron-history'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_cron_history', { limit_count: 50 });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000, // Normal: Cron history monitoring
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (jobId: number) => {
    try {
      const { data, error } = await supabase.rpc('retry_cron_job', {
        job_id: jobId
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; message: string };
      
      if (result.success) {
        toast.success('Job executed successfully');
        refetchHistory();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to retry job');
      console.error(error);
    }
  };

  const activeJobs = jobs.filter(j => j.active).length;
  const recentFailures = history.filter(h => h.status === 'failed').length;

  const filteredHistory = history.filter(h => {
    if (filterJob !== "all" && h.jobname !== filterJob) return false;
    if (filterStatus !== "all" && h.status !== filterStatus) return false;
    return true;
  });

  const uniqueJobNames = Array.from(new Set(history.map(h => h.jobname)));

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Cron Job Monitor</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Monitor scheduled jobs and execution history
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Last updated: {format(lastUpdated, 'HH:mm:ss')}
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Jobs</CardTitle>
            <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold">{jobs.length}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Scheduled cron jobs</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{activeJobs}</div>
            <p className="text-xs text-muted-foreground">Currently running</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Failures</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{recentFailures}</div>
            <p className="text-xs text-muted-foreground">Failed executions</p>
          </CardContent>
        </Card>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job ID</TableHead>
                <TableHead>Job Name</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map(job => (
                <TableRow key={job.jobid}>
                  <TableCell className="font-mono text-xs">{job.jobid}</TableCell>
                  <TableCell className="font-medium">{job.jobname}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <code className="text-xs bg-muted px-2 py-1 rounded block">
                        {job.schedule}
                      </code>
                      <p className="text-xs text-muted-foreground">
                        {parseCronSchedule(job.schedule)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {job.active ? (
                      <Badge variant="default" className="bg-green-600">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No cron jobs found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Execution History */}
      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <div className="flex gap-2 mt-2">
            <Select value={filterJob} onValueChange={setFilterJob}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by job" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {uniqueJobNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="succeeded">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run ID</TableHead>
                <TableHead>Job Name</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHistory.map(run => (
                <TableRow key={run.runid}>
                  <TableCell className="font-mono text-xs">{run.runid}</TableCell>
                  <TableCell className="font-medium">{run.jobname}</TableCell>
                  <TableCell>
                    {format(new Date(run.start_time), 'MMM d, HH:mm:ss')}
                  </TableCell>
                  <TableCell>
                    {calculateDuration(run.start_time, run.end_time)}
                  </TableCell>
                  <TableCell>
                    {run.status === 'succeeded' ? (
                      <Badge variant="default" className="bg-green-600">Success</Badge>
                    ) : (
                      <Badge variant="destructive">Failed</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {run.status === 'failed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(run.jobid)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredHistory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No execution history found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
