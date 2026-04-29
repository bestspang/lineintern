import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Activity, AlertCircle, CheckCircle2, ClipboardList, ExternalLink,
  RefreshCw, Settings, ShieldAlert, Users, MapPin,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBangkokISODate } from "@/lib/timezone";
import { format } from "date-fns";

interface OpsData {
  liff: { configured: boolean; recentErrors: number };
  attendance: { checkIns: number; checkOuts: number; expiredTokens: number };
  pending: { remoteCheckout: number; earlyLeave: number; ot: number; leave: number };
  setup: {
    employeesNoLineId: number;
    employeesNoAuth: number;
    branchesNoGroup: number;
    branchesNoGeo: number;
  };
}

export default function OpsCenter() {
  const navigate = useNavigate();
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    const today = formatBangkokISODate(new Date());
    const startISO = `${today}T00:00:00+07:00`;
    const endISO = `${today}T23:59:59+07:00`;

    try {
      const [
        liffCfg, recentErrLogs,
        ciToday, coToday, expiredTokens,
        rcoPending, elPending, otPending, leavePending,
        empNoLine, empNoAuth, branchesNoGroup, branchesNoGeo,
      ] = await Promise.all([
        supabase.from("api_configurations").select("key_value").eq("key_name", "LIFF_ID").maybeSingle(),
        supabase.from("bot_logs" as any).select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 86400000).toISOString())
          .ilike("error_message" as any, "%line profile%"),
        supabase.from("attendance_logs").select("id", { count: "exact", head: true })
          .eq("event_type", "check_in").gte("server_time", startISO).lte("server_time", endISO),
        supabase.from("attendance_logs").select("id", { count: "exact", head: true })
          .eq("event_type", "check_out").gte("server_time", startISO).lte("server_time", endISO),
        supabase.from("attendance_tokens").select("id", { count: "exact", head: true })
          .eq("status", "expired").gte("created_at", startISO),
        supabase.from("remote_checkout_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("early_leave_requests" as any).select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("overtime_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("employees").select("id", { count: "exact", head: true }).is("line_user_id", null).eq("is_active", true),
        supabase.from("employees").select("id", { count: "exact", head: true }).is("auth_user_id", null).eq("is_active", true),
        supabase.from("branches").select("id", { count: "exact", head: true }).is("line_group_id", null).eq("is_deleted", false),
        supabase.from("branches").select("id", { count: "exact", head: true }).is("latitude", null).eq("is_deleted", false),
      ]);

      setData({
        liff: { configured: !!liffCfg.data?.key_value, recentErrors: recentErrLogs.count || 0 },
        attendance: { checkIns: ciToday.count || 0, checkOuts: coToday.count || 0, expiredTokens: expiredTokens.count || 0 },
        pending: {
          remoteCheckout: rcoPending.count || 0,
          earlyLeave: elPending.count || 0,
          ot: otPending.count || 0,
          leave: leavePending.count || 0,
        },
        setup: {
          employeesNoLineId: empNoLine.count || 0,
          employeesNoAuth: empNoAuth.count || 0,
          branchesNoGroup: branchesNoGroup.count || 0,
          branchesNoGeo: branchesNoGeo.count || 0,
        },
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[OpsCenter] load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const StatCard = ({ icon: Icon, label, value, tone = "default", warn = false }: any) => (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${warn ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${warn ? "text-destructive" : "text-muted-foreground"}`} />
        <span className="text-sm">{label}</span>
      </div>
      <Badge variant={warn ? "destructive" : "secondary"}>{value}</Badge>
    </div>
  );

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ศูนย์ปฏิบัติการประจำวัน / Daily Ops Center</h1>
          <p className="text-sm text-muted-foreground">
            {lastUpdated && `อัพเดต ${format(lastUpdated, "HH:mm:ss")}`}
          </p>
        </div>
        <Button onClick={load} disabled={loading} size="sm" variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          รีเฟรช
        </Button>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> LINE / LIFF Health</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <StatCard icon={CheckCircle2} label="LIFF ID configured" value={data?.liff.configured ? "✓" : "✗"} warn={!data?.liff.configured} />
              <StatCard icon={AlertCircle} label="Profile-fetch errors (24h)" value={data?.liff.recentErrors ?? 0} warn={(data?.liff.recentErrors ?? 0) > 0} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Check-in / Check-out (วันนี้)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <StatCard icon={CheckCircle2} label="Check-ins วันนี้" value={data?.attendance.checkIns ?? 0} />
              <StatCard icon={CheckCircle2} label="Check-outs วันนี้" value={data?.attendance.checkOuts ?? 0} />
              <StatCard icon={AlertCircle} label="Expired tokens" value={data?.attendance.expiredTokens ?? 0} warn={(data?.attendance.expiredTokens ?? 0) > 5} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Pending Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <StatCard icon={MapPin} label="Remote checkout" value={data?.pending.remoteCheckout ?? 0} warn={(data?.pending.remoteCheckout ?? 0) > 0} />
              <StatCard icon={ClipboardList} label="Early leave" value={data?.pending.earlyLeave ?? 0} warn={(data?.pending.earlyLeave ?? 0) > 0} />
              <StatCard icon={ClipboardList} label="OT approval" value={data?.pending.ot ?? 0} warn={(data?.pending.ot ?? 0) > 0} />
              <StatCard icon={ClipboardList} label="Leave approval" value={data?.pending.leave ?? 0} warn={(data?.pending.leave ?? 0) > 0} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Setup Issues</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <StatCard icon={Users} label="พนักงานยังไม่ผูก LINE" value={data?.setup.employeesNoLineId ?? 0} warn={(data?.setup.employeesNoLineId ?? 0) > 0} />
              <StatCard icon={Users} label="พนักงานยังไม่มี auth" value={data?.setup.employeesNoAuth ?? 0} warn={(data?.setup.employeesNoAuth ?? 0) > 0} />
              <StatCard icon={MapPin} label="สาขาไม่มี LINE group" value={data?.setup.branchesNoGroup ?? 0} warn={(data?.setup.branchesNoGroup ?? 0) > 0} />
              <StatCard icon={MapPin} label="สาขาไม่มี geofence" value={data?.setup.branchesNoGeo ?? 0} warn={(data?.setup.branchesNoGeo ?? 0) > 0} />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ExternalLink className="h-4 w-4" /> Quick Links</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/audit-logs")}>Audit Logs</Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/attendance/live-tracking")}>Live Tracking</Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/attendance/dashboard")}>Attendance Dashboard</Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/attendance/employee-documents")}>Employee Documents</Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/attendance/branches")}>Branches / Geofence</Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/settings")}><Settings className="h-3 w-3 mr-1" /> Settings</Button>
        </CardContent>
      </Card>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          หน้านี้แสดงข้อมูลภาพรวมเท่านั้น — ใช้ปุ่ม Quick Links เพื่อแก้ไขรายการแต่ละประเภท
        </AlertDescription>
      </Alert>
    </div>
  );
}
