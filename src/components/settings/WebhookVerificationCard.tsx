import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldCheck, ShieldAlert, RefreshCcw, ExternalLink, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface VerifyResult {
  ok: boolean;
  is_match: boolean;
  current_url: string | null;
  expected_url: string;
  test_success: boolean | null;
  test_status_code: number | null;
  test_reason: string | null;
  active: boolean | null;
  error: string | null;
  recommendation: string;
}

interface LogRow {
  id: string;
  checked_at: string;
  current_url: string | null;
  expected_url: string;
  is_match: boolean;
  test_success: boolean | null;
  test_status_code: number | null;
  triggered_by: string;
}

export function WebhookVerificationCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [history, setHistory] = useState<LogRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('webhook_verification_logs')
      .select('id, checked_at, current_url, expected_url, is_match, test_success, test_status_code, triggered_by')
      .order('checked_at', { ascending: false })
      .limit(10);
    setHistory(data || []);
    setHistoryLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const runVerify = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<VerifyResult>('verify-line-webhook', {
        method: 'POST',
      });
      if (error) throw error;
      setResult(data ?? null);
      toast({
        title: data?.ok ? '✅ Webhook ทำงานถูกต้อง' : '⚠️ Webhook มีปัญหา',
        description: data?.recommendation,
        variant: data?.ok ? 'default' : 'destructive',
      });
      await loadHistory();
    } catch (e) {
      toast({
        title: 'ตรวจไม่สำเร็จ',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (() => {
    if (!result) return null;
    if (result.ok) return <Badge className="bg-emerald-600 text-white"><ShieldCheck className="h-3 w-3 mr-1" />Healthy</Badge>;
    return <Badge variant="destructive"><ShieldAlert className="h-3 w-3 mr-1" />Mismatch</Badge>;
  })();

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
          LINE Webhook Verification
          {statusBadge}
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          ตรวจสอบว่า LINE Channel webhook URL ชี้มาที่ project นี้ (phhxdgaiwgaiuecvfjgj) — ตรวจสดแบบ one-click และอัตโนมัติทุกวัน
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <Button onClick={runVerify} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
          ตรวจสด (Verify Now)
        </Button>

        {result && (
          <>
            <Alert variant={result.ok ? 'default' : 'destructive'}>
              <AlertTitle className="text-sm">{result.ok ? '✅ ผ่าน' : '❌ ไม่ผ่าน'}</AlertTitle>
              <AlertDescription className="text-xs whitespace-pre-wrap">{result.recommendation}</AlertDescription>
            </Alert>

            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex flex-col gap-1 py-2 border-b">
                <span className="font-medium text-muted-foreground">URL ที่ควรเป็น</span>
                <code className="bg-muted px-2 py-1 rounded break-all text-[10px] sm:text-xs">{result.expected_url}</code>
              </div>
              <div className="flex flex-col gap-1 py-2 border-b">
                <span className="font-medium text-muted-foreground">URL ปัจจุบัน (จาก LINE API)</span>
                <code className={`px-2 py-1 rounded break-all text-[10px] sm:text-xs ${result.is_match ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                  {result.current_url ?? '(ยังไม่ได้ตั้งค่า)'}
                </code>
              </div>
              <div className="grid grid-cols-2 gap-2 py-2 border-b">
                <div>
                  <div className="text-muted-foreground text-[10px] sm:text-xs">URL Match</div>
                  <Badge variant={result.is_match ? 'default' : 'destructive'} className="text-xs">{result.is_match ? 'Yes' : 'No'}</Badge>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] sm:text-xs">Use webhook</div>
                  <Badge variant={result.active ? 'default' : 'secondary'} className="text-xs">{result.active === null ? '—' : result.active ? 'Enabled' : 'Disabled'}</Badge>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] sm:text-xs">LINE Test</div>
                  <Badge variant={result.test_success ? 'default' : result.test_success === false ? 'destructive' : 'secondary'} className="text-xs">
                    {result.test_success === null ? '—' : result.test_success ? 'Success' : 'Failed'}
                  </Badge>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] sm:text-xs">HTTP Status</div>
                  <span className="text-xs">{result.test_status_code ?? '—'}</span>
                </div>
              </div>
            </div>

            {!result.is_match && (
              <Button variant="outline" className="w-full" asChild>
                <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  เปิด LINE Developers Console เพื่อแก้ Webhook URL
                </a>
              </Button>
            )}
          </>
        )}

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium flex items-center gap-2"><History className="h-4 w-4" /> ประวัติการตรวจ (10 ล่าสุด)</h4>
            <Button size="sm" variant="ghost" onClick={loadHistory} disabled={historyLoading}>
              <RefreshCcw className={`h-3 w-3 ${historyLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          {history.length === 0 && !historyLoading && (
            <p className="text-xs text-muted-foreground">ยังไม่มีประวัติ — กดปุ่ม "ตรวจสด" ด้านบนเพื่อตรวจครั้งแรก</p>
          )}
          <div className="space-y-1">
            {history.map((row) => (
              <div key={row.id} className="flex items-center justify-between text-[10px] sm:text-xs py-1.5 px-2 rounded bg-muted/40">
                <span className="text-muted-foreground">{new Date(row.checked_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</span>
                <div className="flex items-center gap-1">
                  <Badge variant={row.is_match ? 'default' : 'destructive'} className="text-[9px] px-1.5 py-0">{row.is_match ? 'match' : 'mismatch'}</Badge>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">{row.triggered_by}</Badge>
                  {row.test_success !== null && (
                    <Badge variant={row.test_success ? 'default' : 'destructive'} className="text-[9px] px-1.5 py-0">
                      test:{row.test_success ? 'ok' : 'fail'}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
