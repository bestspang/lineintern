/**
 * Pre-Deploy Checklist Page
 * 
 * Helps ensure deployments are safe by running automated checks and 
 * providing a manual verification checklist.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ClipboardCheck, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Clock,
  Database,
  MessageSquare,
  Server,
  Flag,
  History,
  Loader2,
  RefreshCw,
  Save
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface CheckResult {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  message?: string;
  duration?: number;
}

interface ManualCheckItem {
  id: string;
  label: string;
  labelTh: string;
  checked: boolean;
  critical: boolean;
}

const MANUAL_CHECKS: ManualCheckItem[] = [
  { id: 'line_checkin', label: 'Test Check-in from LINE', labelTh: 'ทดสอบ Check-in จาก LINE', checked: false, critical: true },
  { id: 'line_checkout', label: 'Test Check-out from LINE', labelTh: 'ทดสอบ Check-out จาก LINE', checked: false, critical: true },
  { id: 'portal_open', label: 'Test open Portal from Rich Menu', labelTh: 'ทดสอบเปิด Portal จาก Rich Menu', checked: false, critical: true },
  { id: 'admin_login', label: 'Test Admin Dashboard login', labelTh: 'ทดสอบ Login เข้า Admin Dashboard', checked: false, critical: true },
  { id: 'error_logs', label: 'Check Error Logs in Health Monitoring', labelTh: 'ตรวจสอบ Error Logs ใน Health Monitoring', checked: false, critical: false },
  { id: 'cron_jobs', label: 'Verify Cron Jobs are running', labelTh: 'ตรวจสอบ Cron Jobs ทำงานปกติ', checked: false, critical: false },
  { id: 'bot_response', label: 'Test bot responds to commands', labelTh: 'ทดสอบบอทตอบคำสั่ง', checked: false, critical: false },
  { id: 'deposit_upload', label: 'Test deposit slip upload', labelTh: 'ทดสอบอัปโหลดสลิปเงิน', checked: false, critical: false },
];

const AUTOMATED_CHECKS = [
  { id: 'database', name: 'Database Connection', nameTh: 'เชื่อมต่อ Database' },
  { id: 'liff_config', name: 'LIFF Configuration', nameTh: 'ตั้งค่า LIFF' },
  { id: 'line_api', name: 'LINE API Connection', nameTh: 'เชื่อมต่อ LINE API' },
  { id: 'auth', name: 'Authentication System', nameTh: 'ระบบ Authentication' },
  { id: 'edge_functions', name: 'Critical Edge Functions', nameTh: 'Edge Functions สำคัญ' },
];

function AutomatedChecks({ 
  onComplete 
}: { 
  onComplete: (results: CheckResult[]) => void 
}) {
  const [results, setResults] = useState<CheckResult[]>(
    AUTOMATED_CHECKS.map((c) => ({ id: c.id, name: c.nameTh, status: 'pending' as const }))
  );
  const [isRunning, setIsRunning] = useState(false);

  const runChecks = async () => {
    setIsRunning(true);
    const newResults: CheckResult[] = [];

    for (const check of AUTOMATED_CHECKS) {
      setResults((prev) => 
        prev.map((r) => r.id === check.id ? { ...r, status: 'running' as const } : r)
      );

      const start = Date.now();
      let result: CheckResult;

      try {
        switch (check.id) {
          case 'database': {
            const { error } = await supabase.from('app_settings').select('id').limit(1);
            result = {
              id: check.id,
              name: check.nameTh,
              status: error ? 'failed' : 'passed',
              message: error ? error.message : 'Database connection OK',
              duration: Date.now() - start,
            };
            break;
          }
          case 'liff_config': {
            const { data } = await supabase
              .from('api_configurations')
              .select('key_value')
              .eq('key_name', 'LIFF_ID')
              .single();
            result = {
              id: check.id,
              name: check.nameTh,
              status: data?.key_value ? 'passed' : 'failed',
              message: data?.key_value ? 'LIFF_ID configured' : 'LIFF_ID not configured',
              duration: Date.now() - start,
            };
            break;
          }
          case 'line_api': {
            const { data } = await supabase
              .from('api_configurations')
              .select('key_value')
              .eq('key_name', 'LINE_CHANNEL_ACCESS_TOKEN')
              .single();
            result = {
              id: check.id,
              name: check.nameTh,
              status: data?.key_value ? 'passed' : 'failed',
              message: data?.key_value ? 'LINE token configured' : 'LINE token not configured',
              duration: Date.now() - start,
            };
            break;
          }
          case 'auth': {
            const { data: session } = await supabase.auth.getSession();
            result = {
              id: check.id,
              name: check.nameTh,
              status: 'passed',
              message: session?.session ? 'Authenticated' : 'Auth system operational',
              duration: Date.now() - start,
            };
            break;
          }
          case 'edge_functions': {
            try {
              const { data, error } = await supabase.functions.invoke('health-check', {
                method: 'GET',
              });
              result = {
                id: check.id,
                name: check.nameTh,
                status: error ? 'failed' : 'passed',
                message: error ? error.message : `Health endpoint OK (${data?.status || 'ok'})`,
                duration: Date.now() - start,
              };
            } catch (e) {
              result = {
                id: check.id,
                name: check.nameTh,
                status: 'failed',
                message: String(e),
                duration: Date.now() - start,
              };
            }
            break;
          }
          default:
            result = {
              id: check.id,
              name: check.nameTh,
              status: 'skipped',
              message: 'Unknown check',
              duration: 0,
            };
        }
      } catch (error) {
        result = {
          id: check.id,
          name: check.nameTh,
          status: 'failed',
          message: String(error),
          duration: Date.now() - start,
        };
      }

      newResults.push(result);
      setResults((prev) => 
        prev.map((r) => r.id === result.id ? result : r)
      );

      // Small delay between checks
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setIsRunning(false);
    onComplete(newResults);
  };

  const passedCount = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const progress = (results.filter((r) => r.status !== 'pending').length / results.length) * 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Automated Checks
            </CardTitle>
            <CardDescription>ทดสอบระบบอัตโนมัติก่อน deploy</CardDescription>
          </div>
          <Button onClick={runChecks} disabled={isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                กำลังทดสอบ...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Checks
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isRunning && <Progress value={progress} className="mb-4" />}
        
        <div className="space-y-2">
          {results.map((result) => (
            <div 
              key={result.id} 
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3">
                {result.status === 'pending' && (
                  <div className="h-5 w-5 rounded-full border-2 border-muted" />
                )}
                {result.status === 'running' && (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                )}
                {result.status === 'passed' && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                {result.status === 'failed' && (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                {result.status === 'skipped' && (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <div className="font-medium text-sm">{result.name}</div>
                  {result.message && (
                    <div className="text-xs text-muted-foreground">{result.message}</div>
                  )}
                </div>
              </div>
              {result.duration !== undefined && (
                <Badge variant="outline">{result.duration}ms</Badge>
              )}
            </div>
          ))}
        </div>

        {/* Summary */}
        {!isRunning && results.some((r) => r.status !== 'pending') && (
          <div className="flex items-center gap-4 pt-4 border-t">
            <Badge variant="default" className="bg-green-500">
              ✓ {passedCount} passed
            </Badge>
            {failedCount > 0 && (
              <Badge variant="destructive">✗ {failedCount} failed</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ManualChecklist({ 
  items, 
  onChange 
}: { 
  items: ManualCheckItem[]; 
  onChange: (items: ManualCheckItem[]) => void;
}) {
  const toggleItem = (id: string) => {
    onChange(items.map((item) => 
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const completedCount = items.filter((i) => i.checked).length;
  const criticalItems = items.filter((i) => i.critical);
  const criticalCompleted = criticalItems.filter((i) => i.checked).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Manual Checklist
        </CardTitle>
        <CardDescription>
          รายการที่ต้องทดสอบด้วยตนเองก่อน deploy
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {items.map((item) => (
            <div 
              key={item.id} 
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                item.checked ? 'bg-green-50 border-green-200' : ''
              }`}
              onClick={() => toggleItem(item.id)}
            >
              <Checkbox 
                checked={item.checked} 
                onCheckedChange={() => toggleItem(item.id)}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={item.checked ? 'line-through text-muted-foreground' : ''}>
                    {item.labelTh}
                  </span>
                  {item.critical && (
                    <Badge variant="destructive" className="text-xs">Critical</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div className="pt-4 border-t space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{completedCount}/{items.length}</span>
          </div>
          <Progress value={(completedCount / items.length) * 100} />
          
          {criticalCompleted < criticalItems.length && (
            <Alert variant="destructive" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Critical items incomplete</AlertTitle>
              <AlertDescription>
                ยังมี {criticalItems.length - criticalCompleted} รายการสำคัญที่ยังไม่ได้ทดสอบ
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureFlagsStatus() {
  const { data: flags, isLoading } = useFeatureFlags();

  if (isLoading) return <Skeleton className="h-40" />;

  const enabledFlags = flags?.filter((f) => f.is_enabled) || [];
  const disabledFlags = flags?.filter((f) => !f.is_enabled) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flag className="h-5 w-5" />
          Feature Flags Status
        </CardTitle>
        <CardDescription>
          สถานะ flags ก่อน deploy
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              เปิดใช้งาน ({enabledFlags.length})
            </h4>
            <div className="space-y-1">
              {enabledFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground">ไม่มี flags ที่เปิด</p>
              ) : (
                enabledFlags.map((flag) => (
                  <div key={flag.id} className="text-sm p-2 bg-green-50 rounded border border-green-100">
                    {flag.display_name}
                    {flag.rollout_percentage < 100 && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {flag.rollout_percentage}%
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <XCircle className="h-4 w-4 text-gray-500" />
              ปิดใช้งาน ({disabledFlags.length})
            </h4>
            <div className="space-y-1">
              {disabledFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground">ไม่มี flags ที่ปิด</p>
              ) : (
                disabledFlags.slice(0, 5).map((flag) => (
                  <div key={flag.id} className="text-sm p-2 bg-muted rounded">
                    {flag.display_name}
                  </div>
                ))
              )}
              {disabledFlags.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  + {disabledFlags.length - 5} more
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistHistory() {
  const { data: history, isLoading } = useQuery({
    queryKey: ['checklist-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deploy_checklist_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Checklist History
        </CardTitle>
        <CardDescription>ประวัติการ run checklist</CardDescription>
      </CardHeader>
      <CardContent>
        {!history || history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            ยังไม่มีประวัติ
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((run) => (
              <div 
                key={run.id} 
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  {run.overall_status === 'passed' && (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  )}
                  {run.overall_status === 'failed' && (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  {run.overall_status === 'partial' && (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                  {run.overall_status === 'pending' && (
                    <Clock className="h-5 w-5 text-gray-500" />
                  )}
                  <div>
                    <div className="text-sm font-medium">
                      {format(new Date(run.created_at), 'dd MMM yyyy HH:mm', { locale: th })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ✓ {run.passed_count} passed • ✗ {run.failed_count} failed
                    </div>
                  </div>
                </div>
                <Badge 
                  variant={
                    run.overall_status === 'passed' ? 'default' :
                    run.overall_status === 'failed' ? 'destructive' : 'secondary'
                  }
                >
                  {run.overall_status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PreDeployChecklist() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [automatedResults, setAutomatedResults] = useState<CheckResult[]>([]);
  const [manualItems, setManualItems] = useState<ManualCheckItem[]>(MANUAL_CHECKS);
  const [notes, setNotes] = useState('');

  const saveRun = useMutation({
    mutationFn: async () => {
      const passedCount = automatedResults.filter((r) => r.status === 'passed').length +
        manualItems.filter((i) => i.checked).length;
      const failedCount = automatedResults.filter((r) => r.status === 'failed').length +
        manualItems.filter((i) => i.critical && !i.checked).length;
      
      const overallStatus = failedCount === 0 && passedCount > 0 ? 'passed' :
        failedCount > 0 && passedCount > 0 ? 'partial' :
        failedCount > 0 ? 'failed' : 'pending';

      const { error } = await supabase.from('deploy_checklist_runs').insert([{
        checks: JSON.parse(JSON.stringify({
          automated: automatedResults,
          manual: manualItems,
        })),
        passed_count: passedCount,
        failed_count: failedCount,
        overall_status: overallStatus,
        notes: notes || null,
      }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-history'] });
      toast({
        title: 'บันทึก Checklist แล้ว',
        description: 'ผลการทดสอบถูกบันทึกเรียบร้อย',
      });
    },
    onError: (error) => {
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: String(error),
        variant: 'destructive',
      });
    },
  });

  const canSave = automatedResults.length > 0 || manualItems.some((i) => i.checked);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7" />
            Pre-Deploy Checklist
          </h1>
          <p className="text-muted-foreground mt-1">
            ทดสอบระบบก่อน deploy เพื่อป้องกันปัญหา
          </p>
        </div>
        <Button onClick={() => saveRun.mutate()} disabled={!canSave || saveRun.isPending}>
          {saveRun.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          บันทึกผล
        </Button>
      </div>

      <Tabs defaultValue="checks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="checks">Checks</TabsTrigger>
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="checks" className="space-y-6">
          {/* Automated Checks */}
          <AutomatedChecks onComplete={setAutomatedResults} />

          {/* Manual Checklist */}
          <ManualChecklist items={manualItems} onChange={setManualItems} />

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="บันทึกข้อสังเกตหรือปัญหาที่พบ..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flags">
          <FeatureFlagsStatus />
        </TabsContent>

        <TabsContent value="history">
          <ChecklistHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
