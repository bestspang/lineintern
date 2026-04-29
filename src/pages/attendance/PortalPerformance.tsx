/**
 * ⚠️ VERIFIED 2026-04-29 — Phase 1B/1C portal_performance_events viewer
 * Touchpoints: portal_performance_events table, webapp_page_config (9 roles),
 *              OpsCenter "Open Portal Performance" button.
 * Allowed changes: additive metric cards, new filter, new sort option.
 * Forbidden: changing the SQL aggregation logic (p50/p75/p95), removing
 *            error-rate calculation, breaking the read-only contract.
 * Phase 1C scope cap: NO Export CSV, NO branch filter, NO trend chart yet.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Activity, AlertTriangle, Gauge, RefreshCw, Timer, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { APP_BUILD_STAMP } from "@/lib/app-version";

type Range = "1h" | "24h" | "7d";

interface PerfRow {
  id: string;
  event_name: string;
  duration_ms: number | null;
  route: string | null;
  employee_id: string | null;
  branch_id: string | null;
  error_code: string | null;
  metadata: any;
  created_at: string;
}

const RANGE_MS: Record<Range, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function colorForLatency(ms: number, green: number, amber: number): string {
  if (ms === 0) return "text-muted-foreground";
  if (ms < green) return "text-emerald-600 dark:text-emerald-400";
  if (ms < amber) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function colorForRate(pct: number): string {
  if (pct < 2) return "text-emerald-600 dark:text-emerald-400";
  if (pct < 5) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export default function PortalPerformance() {
  const [range, setRange] = useState<Range>("24h");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["portal-perf", range],
    queryFn: async (): Promise<PerfRow[]> => {
      const sinceISO = new Date(Date.now() - RANGE_MS[range]).toISOString();
      const { data, error } = await supabase
        .from("portal_performance_events" as any)
        .select("*")
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data || []) as unknown as PerfRow[];
    },
    staleTime: 20_000,
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const stats = useMemo(() => {
    const rows = data || [];
    const byEvent = new Map<string, PerfRow[]>();
    rows.forEach((r) => {
      if (!byEvent.has(r.event_name)) byEvent.set(r.event_name, []);
      byEvent.get(r.event_name)!.push(r);
    });

    const eventStats = Array.from(byEvent.entries()).map(([name, list]) => {
      const durations = list
        .map((r) => r.duration_ms)
        .filter((d): d is number => d !== null && d >= 0)
        .sort((a, b) => a - b);
      const failed = list.filter((r) => r.error_code !== null).length;
      const success = list.length - failed;
      return {
        name,
        total: list.length,
        success,
        failed,
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        lastSeen: list[0]?.created_at,
      };
    }).sort((a, b) => b.total - a.total);

    // KPI helpers
    const get = (n: string) => byEvent.get(n) || [];
    const dur = (list: PerfRow[]) =>
      list.map((r) => r.duration_ms).filter((d): d is number => d !== null && d >= 0).sort((a, b) => a - b);

    const portalReady = dur(get("portal_ready"));
    const liffInit = dur(get("liff_init_done"));
    const checkinSuccess = dur(get("checkin_submit_success"));

    const failKeys = ["token_validate_failed", "checkin_submit_failed", "checkout_submit_failed"];
    const succKeys = ["token_validate_success", "checkin_submit_success", "checkout_submit_success"];
    const totalFail = failKeys.reduce((s, k) => s + get(k).length, 0);
    const totalSucc = succKeys.reduce((s, k) => s + get(k).length, 0);
    const totalAll = totalFail + totalSucc;
    const errorRate = totalAll > 0 ? (totalFail / totalAll) * 100 : 0;

    // Recent errors
    const recentErrors = rows
      .filter((r) => r.error_code !== null)
      .slice(0, 50);

    // Per route
    const byRoute = new Map<string, { count: number; totalMs: number; samples: number }>();
    rows.forEach((r) => {
      const key = r.route || "(unknown)";
      if (!byRoute.has(key)) byRoute.set(key, { count: 0, totalMs: 0, samples: 0 });
      const b = byRoute.get(key)!;
      b.count += 1;
      if (r.duration_ms !== null && r.duration_ms >= 0) {
        b.totalMs += r.duration_ms;
        b.samples += 1;
      }
    });
    const routeStats = Array.from(byRoute.entries())
      .map(([route, v]) => ({
        route,
        count: v.count,
        avgMs: v.samples > 0 ? Math.round(v.totalMs / v.samples) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      eventStats,
      recentErrors,
      routeStats,
      kpi: {
        portalReadyP50: percentile(portalReady, 50),
        portalReadyP95: percentile(portalReady, 95),
        portalReadySamples: portalReady.length,
        liffInitP50: percentile(liffInit, 50),
        liffInitP95: percentile(liffInit, 95),
        liffInitSamples: liffInit.length,
        checkinAvg: checkinSuccess.length > 0
          ? Math.round(checkinSuccess.reduce((s, x) => s + x, 0) / checkinSuccess.length)
          : 0,
        checkinSamples: checkinSuccess.length,
        errorRate,
        errorTotal: totalFail,
        successTotal: totalSucc,
      },
    };
  }, [data]);

  const isEmpty = !isLoading && (data?.length ?? 0) === 0;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Gauge className="h-7 w-7 text-primary" />
            Portal Performance
          </h1>
          <p className="text-sm text-muted-foreground">
            ภาพรวม performance ของ Member Portal · Real-time monitoring
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">1 ชั่วโมง · 1h</SelectItem>
              <SelectItem value="24h">24 ชั่วโมง · 24h</SelectItem>
              <SelectItem value="7d">7 วัน · 7d</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="auto-refresh" className="text-sm cursor-pointer">Auto 30s</Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground">
          อัปเดตล่าสุด · Last updated: {format(new Date(dataUpdatedAt), "HH:mm:ss")} · {data?.length ?? 0} events
        </p>
      )}

      {isEmpty && (
        <Alert>
          <Activity className="h-4 w-4" />
          <AlertDescription>
            ยังไม่มีข้อมูล performance ในช่วงที่เลือก — รอให้พนักงานเข้าใช้ portal สักครู่ ·
            No performance data yet.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Timer className="h-4 w-4" /> First Paint
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className={`text-3xl font-bold ${colorForLatency(stats.kpi.portalReadyP50, 1500, 3000)}`}>
                  {stats.kpi.portalReadyP50}<span className="text-base ml-1">ms</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  p95: <span className={colorForLatency(stats.kpi.portalReadyP95, 2500, 5000)}>
                    {stats.kpi.portalReadyP95}ms
                  </span> · n={stats.kpi.portalReadySamples}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> LIFF Init
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className={`text-3xl font-bold ${colorForLatency(stats.kpi.liffInitP50, 800, 2000)}`}>
                  {stats.kpi.liffInitP50}<span className="text-base ml-1">ms</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  p95: {stats.kpi.liffInitP95}ms · n={stats.kpi.liffInitSamples}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Check-in Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className={`text-3xl font-bold ${colorForLatency(stats.kpi.checkinAvg, 1500, 3000)}`}>
                  {stats.kpi.checkinAvg}<span className="text-base ml-1">ms</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  avg · n={stats.kpi.checkinSamples}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Error Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className={`text-3xl font-bold ${colorForRate(stats.kpi.errorRate)}`}>
                  {stats.kpi.errorRate.toFixed(1)}<span className="text-base ml-1">%</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stats.kpi.errorTotal} fail / {stats.kpi.errorTotal + stats.kpi.successTotal} total
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Event volume table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event Volume · ปริมาณตามชนิด event</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-32 w-full" /> : stats.eventStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีข้อมูล · No data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2 pr-4 text-right">Success</th>
                    <th className="py-2 pr-4 text-right">Failed</th>
                    <th className="py-2 pr-4 text-right">p50</th>
                    <th className="py-2 pr-4 text-right">p95</th>
                    <th className="py-2 text-right">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.eventStats.map((e) => (
                    <tr key={e.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{e.name}</td>
                      <td className="py-2 pr-4 text-right">{e.total}</td>
                      <td className="py-2 pr-4 text-right text-emerald-600 dark:text-emerald-400">{e.success}</td>
                      <td className="py-2 pr-4 text-right">
                        {e.failed > 0 ? (
                          <span className="text-destructive">{e.failed}</span>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="py-2 pr-4 text-right">{e.p50 || "—"}</td>
                      <td className="py-2 pr-4 text-right">{e.p95 || "—"}</td>
                      <td className="py-2 text-right text-xs text-muted-foreground">
                        {e.lastSeen ? format(new Date(e.lastSeen), "HH:mm:ss") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent errors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Recent Errors · ข้อผิดพลาดล่าสุด
            {stats.recentErrors.length > 0 && (
              <Badge variant="destructive">{stats.recentErrors.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-24 w-full" /> : stats.recentErrors.length === 0 ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              ✓ ไม่พบข้อผิดพลาด · No errors in selected range
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2 pr-4">Error code</th>
                    <th className="py-2">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentErrors.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "MM/dd HH:mm:ss")}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{r.event_name}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-destructive border-destructive/40">
                          {r.error_code}
                        </Badge>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground truncate max-w-xs">
                        {r.route || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-route breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Route Breakdown · แยกตาม route (top 20)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-32 w-full" /> : stats.routeStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีข้อมูล · No data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Route</th>
                    <th className="py-2 pr-4 text-right">Events</th>
                    <th className="py-2 text-right">Avg ms</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.routeStats.map((r) => (
                    <tr key={r.route} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{r.route}</td>
                      <td className="py-2 pr-4 text-right">{r.count}</td>
                      <td className={`py-2 text-right ${colorForLatency(r.avgMs, 1500, 3000)}`}>
                        {r.avgMs || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center pt-2">build {APP_BUILD_STAMP}</p>
    </div>
  );
}
