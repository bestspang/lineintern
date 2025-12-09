import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Clock, CheckCircle, XCircle, RefreshCw, Play, Calendar, Send, AlertTriangle, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
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

interface JobWithLastRun extends CronJob {
  lastRun?: CronHistory;
  lastSuccess?: CronHistory;
}

const parseCronSchedule = (schedule: string): string => {
  const patterns: Record<string, string> = {
    '* * * * *': 'ทุกนาที',
    '*/5 * * * *': 'ทุก 5 นาที',
    '*/15 * * * *': 'ทุก 15 นาที',
    '*/30 * * * *': 'ทุก 30 นาที',
    '0 * * * *': 'ทุกชั่วโมง',
    '0 0 * * *': 'เที่ยงคืนทุกวัน',
    '0 0 * * 1': 'ทุกวันจันทร์',
  };
  return patterns[schedule] || schedule;
};

const calculateDuration = (start: string, end: string): string => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

const getJobDescription = (jobname: string): string => {
  const descriptions: Record<string, string> = {
    // Attendance
    'attendance-reminder': 'เตือนพนักงานเช็คอิน/เช็คเอาต์',
    'attendance-daily-summary-30min': 'ส่งสรุปรายวันไป LINE',
    'auto-checkout-grace': 'Auto checkout หลัง grace period',
    'auto-checkout-midnight': 'Auto checkout เที่ยงคืน',
    'attendance-snapshot-update-30min': 'อัพเดท snapshot การเข้างาน',
    'missing-employee-check': 'ตรวจจับพนักงานหาย',
    // OT & Leave
    'overtime-warning': 'เตือน OT ที่ยังไม่ได้อนุมัติ',
    'request-timeout-checker': 'ตรวจสอบ timeout ของ requests',
    'flexible-day-off-reminder-weekly': 'เตือนวันหยุดที่เหลือ',
    // Tasks & Work
    'task-scheduler': 'ตรวจสอบและส่งแจ้งเตือน tasks',
    'work-summary-morning': 'สรุปงานตอนเช้า',
    'work-summary-evening': 'สรุปงานตอนเย็น',
    'work-check-in-daily': 'เตือน check-in งาน',
    'work-reminder-hourly': 'เตือนงานรายชั่วโมง',
    // Reports
    'generate-daily-reports': 'สร้างรายงานรายวัน',
    'generate-weekly-reports': 'สร้างรายงานรายสัปดาห์',
    // Team Health & Analytics
    'team-health-report-weekly': 'ส่ง Team Health Report ทุกวันจันทร์ 09:00',
    'sentiment-tracker-daily': 'วิเคราะห์ sentiment รายวัน',
    'sentiment-network-weekly': 'คำนวณ network metrics รายสัปดาห์',
    'response-analytics-daily': 'Aggregate response analytics',
    // Memory
    'memory-consolidator-every-6h': 'รวม working memory เป็น long-term',
    'memory-decay-daily': 'ลดน้ำหนัก memory เก่า',
    'pattern-learner-daily': 'เรียนรู้ patterns จาก data',
    // Broadcast
    'broadcast-scheduler-every-min': 'ตรวจสอบ scheduled broadcasts',
  };
  return descriptions[jobname] || 'Scheduled job';
};

export default function CronJobs() {
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [filterJob, setFilterJob] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);

  const { data: jobs = [], refetch: refetchJobs } = useQuery<CronJob[]>({
    queryKey: ['cron-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_cron_jobs');
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: history = [], refetch: refetchHistory } = useQuery<CronHistory[]>({
    queryKey: ['cron-history'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_cron_history', { limit_count: 100 });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Combine jobs with their last run info
  const jobsWithLastRun: JobWithLastRun[] = jobs.map(job => {
    const jobHistory = history.filter(h => h.jobid === job.jobid);
    const lastRun = jobHistory[0];
    const lastSuccess = jobHistory.find(h => h.status === 'succeeded');
    return { ...job, lastRun, lastSuccess };
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (jobId: number) => {
    try {
      const { data, error } = await supabase.rpc('retry_cron_job', { job_id: jobId });
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

  const triggerManualSummary = useMutation({
    mutationFn: async (targetDate: string) => {
      // Use edge function proxy to avoid exposing secrets
      const { data, error } = await supabase.functions.invoke('trigger-daily-summary', {
        body: { target_date: targetDate, force_send: true }
      });
      
      if (error) {
        throw new Error(error.message || 'Failed to trigger daily summary');
      }
      
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to trigger daily summary');
      }
      
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Daily Summary sent! Processed: ${data.processed || 0} configs`);
      setIsManualDialogOpen(false);
      refetchHistory();
    },
    onError: (error: Error) => {
      toast.error(`Failed to send: ${error.message}`);
    },
  });

  const activeJobs = jobs.filter(j => j.active).length;
  const recentFailures = history.filter(h => h.status === 'failed').slice(0, 20).length;
  const recentSuccesses = history.filter(h => h.status === 'succeeded').slice(0, 20).length;

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
            ติดตาม scheduled jobs และประวัติการทำงาน
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline" className="text-xs">
            อัปเดต: {format(lastUpdated, 'HH:mm:ss')}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchJobs();
              refetchHistory();
              setLastUpdated(new Date());
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Active</CardTitle>
            <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-green-600">{activeJobs}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">กำลังทำงาน</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Success (20)</CardTitle>
            <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-blue-600">{recentSuccesses}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">สำเร็จล่าสุด</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Failures</CardTitle>
            <XCircle className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-destructive">{recentFailures}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">ล้มเหลว</p>
          </CardContent>
        </Card>
      </div>

      {/* Manual Trigger Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="h-5 w-5" />
            Manual Trigger
          </CardTitle>
          <CardDescription>ส่ง Daily Summary ย้อนหลังสำหรับวันที่ต้องการ</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">เลือกวันที่</label>
              <Input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <Dialog open={isManualDialogOpen} onOpenChange={setIsManualDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Play className="h-4 w-4" />
                  ส่ง Daily Summary
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>ยืนยันการส่ง Daily Summary</DialogTitle>
                  <DialogDescription>
                    ต้องการส่ง Daily Summary สำหรับวันที่ <strong>{manualDate}</strong> ไป LINE หรือไม่?
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm">
                      ข้อความจะถูกส่งไปยังทุก LINE group/user ที่ตั้งค่าไว้ใน delivery config
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsManualDialogOpen(false)}>
                    ยกเลิก
                  </Button>
                  <Button 
                    onClick={() => triggerManualSummary.mutate(manualDate)}
                    disabled={triggerManualSummary.isPending}
                  >
                    {triggerManualSummary.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        กำลังส่ง...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        ยืนยันส่ง
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table with Last Run Status */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Jobs</CardTitle>
          <CardDescription>สถานะ jobs และการรันล่าสุด</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="hidden sm:table-cell">Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead className="hidden md:table-cell">Last Success</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobsWithLastRun.map(job => (
                  <TableRow key={job.jobid}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{job.jobname}</div>
                        <div className="text-xs text-muted-foreground">{getJobDescription(job.jobname)}</div>
                        <div className="sm:hidden">
                          <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                            {job.schedule}
                          </code>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="space-y-1">
                        <code className="text-xs bg-muted px-2 py-1 rounded block w-fit">
                          {job.schedule}
                        </code>
                        <p className="text-xs text-muted-foreground">
                          {parseCronSchedule(job.schedule)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {job.active ? (
                        <Badge variant="default" className="bg-green-600 text-[10px] sm:text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] sm:text-xs">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.lastRun ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            {job.lastRun.status === 'succeeded' ? (
                              <CheckCircle className="h-3 w-3 text-green-600" />
                            ) : (
                              <XCircle className="h-3 w-3 text-destructive" />
                            )}
                            <span className="text-xs">
                              {formatDistanceToNow(new Date(job.lastRun.start_time), { addSuffix: true, locale: th })}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(job.lastRun.start_time), 'dd MMM HH:mm', { locale: th })}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {job.lastSuccess ? (
                        <div className="space-y-1">
                          <span className="text-xs text-green-600">
                            {formatDistanceToNow(new Date(job.lastSuccess.start_time), { addSuffix: true, locale: th })}
                          </span>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(job.lastSuccess.start_time), 'dd MMM HH:mm', { locale: th })}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">ไม่มีประวัติ</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {jobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No cron jobs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Execution History */}
      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            <Select value={filterJob} onValueChange={setFilterJob}>
              <SelectTrigger className="w-[180px]">
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
              <SelectTrigger className="w-[140px]">
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden sm:table-cell">Run ID</TableHead>
                  <TableHead>Job Name</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead className="hidden sm:table-cell">Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.slice(0, 50).map(run => (
                  <TableRow key={run.runid}>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">{run.runid}</TableCell>
                    <TableCell>
                      <span className="font-medium text-xs sm:text-sm">{run.jobname}</span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="text-xs sm:text-sm">
                          {format(new Date(run.start_time), 'MMM d, HH:mm:ss')}
                        </span>
                        <p className="text-[10px] text-muted-foreground sm:hidden">
                          {calculateDuration(run.start_time, run.end_time)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {calculateDuration(run.start_time, run.end_time)}
                    </TableCell>
                    <TableCell>
                      {run.status === 'succeeded' ? (
                        <Badge variant="default" className="bg-green-600 text-[10px] sm:text-xs">Success</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] sm:text-xs">Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {run.status === 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(run.jobid)}
                          className="h-7 px-2"
                        >
                          <RefreshCw className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">Retry</span>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
