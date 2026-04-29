import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Loader2, FileText, Plus, Search, RefreshCw, Download as DownloadIcon,
  LayoutGrid, List, SlidersHorizontal, AlertCircle,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_TYPE_LABEL_TH, STATUS_LABEL_TH, VISIBILITY_LABEL_TH, UPLOAD_STATUS_LABEL_TH,
  type EmployeeDocumentType, type EmployeeDocumentStatus, type ConfirmHistoryEntry,
} from "@/lib/employee-document-types";
import { SelectEmployeeForUploadDialog } from "@/components/employee-documents/SelectEmployeeForUploadDialog";
import { EmployeeDocumentsKpiStrip, type KpiCounts } from "@/components/employee-documents/EmployeeDocumentsKpiStrip";
import { EmployeeDocumentsRowActions } from "@/components/employee-documents/EmployeeDocumentsRowActions";
import { EmployeeDocumentsCardGrid, type DocRow } from "@/components/employee-documents/EmployeeDocumentsCardGrid";

type ExpiryWindow = "all" | "expired" | "30d" | "60d" | "90d";
type StatusFilter = EmployeeDocumentStatus | "active_only" | "pending_or_failed";
type SortKey = "expiry_asc" | "expiry_desc" | "updated_desc" | "name_asc";
type ViewMode = "table" | "cards";
type Preset = "all" | "expiring30" | "expiring90" | "expired" | "pending" | "custom";

function urgencyRowClass(expiry: string | null, uploadStatus: string): string {
  if (uploadStatus === "failed") return "border-l-4 border-l-destructive bg-destructive/5";
  if (uploadStatus === "pending") return "border-l-4 border-l-amber-500 bg-amber-500/5";
  if (!expiry) return "";
  const days = differenceInCalendarDays(new Date(expiry), new Date());
  if (days < 0) return "border-l-4 border-l-destructive bg-destructive/5";
  if (days <= 30) return "border-l-4 border-l-destructive bg-destructive/5";
  if (days <= 90) return "border-l-4 border-l-amber-500 bg-amber-500/5";
  return "";
}

function expiryBadge(d: string | null) {
  if (!d) return null;
  const days = differenceInCalendarDays(new Date(d), new Date());
  if (days < 0) return <Badge variant="destructive">หมดอายุแล้ว</Badge>;
  if (days <= 30) return <Badge variant="destructive">เหลือ {days} วัน</Badge>;
  if (days <= 90) return <Badge variant="secondary">เหลือ {days} วัน</Badge>;
  return null;
}

function toCsv(rows: DocRow[]): string {
  const header = ["พนักงาน", "สาขา", "ชื่อเอกสาร", "ไฟล์", "ประเภท", "วันที่ออก", "วันหมดอายุ", "การมองเห็น", "สถานะ", "การอัปโหลด"];
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [
    r.employees?.full_name || "",
    r.employees?.branches?.name || "",
    r.title,
    r.file_name,
    DOCUMENT_TYPE_LABEL_TH[r.document_type],
    r.issue_date ? format(new Date(r.issue_date), "yyyy-MM-dd") : "",
    r.expiry_date ? format(new Date(r.expiry_date), "yyyy-MM-dd") : "",
    VISIBILITY_LABEL_TH[r.visibility],
    STATUS_LABEL_TH[r.status],
    UPLOAD_STATUS_LABEL_TH[r.upload_status],
  ].map(escape).join(","));
  return "\uFEFF" + [header.join(","), ...lines].join("\n");
}

export default function EmployeeDocuments() {
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<EmployeeDocumentType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active_only");
  const [expiryWindow, setExpiryWindow] = useState<ExpiryWindow>("all");
  const [sortKey, setSortKey] = useState<SortKey>("expiry_asc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("all");

  // Auto-switch to cards on small screens
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setViewMode(mq.matches ? "cards" : "table");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-light"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("is_deleted", false).order("name");
      return data ?? [];
    },
  });

  const {
    data: rows = [], isLoading, isFetching, error, refetch, dataUpdatedAt,
  } = useQuery({
    queryKey: ["all-employee-documents", branchId, typeFilter, statusFilter, expiryWindow, search],
    queryFn: async () => {
      let q = supabase
        .from("employee_documents" as any)
        .select("*, employees!inner(id, full_name, branch_id, branches:branches!employees_branch_id_fkey(name))")
        .order("expiry_date", { ascending: true, nullsFirst: false });

      if (typeFilter !== "all") q = q.eq("document_type", typeFilter);
      if (statusFilter === "active_only") {
        q = q.neq("status", "archived").eq("upload_status", "uploaded");
      } else if (statusFilter === "pending_or_failed") {
        q = q.in("upload_status", ["pending", "failed"]);
      } else {
        q = q.eq("status", statusFilter);
      }
      if (branchId !== "all") q = q.eq("employees.branch_id", branchId);
      if (search.trim()) q = q.ilike("title", `%${search.trim()}%`);

      const today = new Date();
      const isoDate = (d: Date) => d.toISOString().slice(0, 10);
      if (expiryWindow === "expired") q = q.lt("expiry_date", isoDate(today));
      else if (expiryWindow !== "all") {
        const days = expiryWindow === "30d" ? 30 : expiryWindow === "60d" ? 60 : 90;
        const cutoff = new Date(today); cutoff.setDate(today.getDate() + days);
        q = q.gte("expiry_date", isoDate(today)).lte("expiry_date", isoDate(cutoff));
      }

      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data as unknown as DocRow[]) ?? [];
    },
  });

  // Compute KPI counts client-side from a separate query of "everything active-ish"
  // To avoid a second round-trip we compute from current `rows` but ALSO derive from raw rows when possible.
  // For accurate KPIs we use a lightweight secondary query.
  const { data: kpiRows = [] } = useQuery({
    queryKey: ["employee-documents-kpi", branchId],
    queryFn: async () => {
      let q = supabase
        .from("employee_documents" as any)
        .select("id, expiry_date, upload_status, status, employee_id, employees!inner(branch_id)")
        .neq("status", "archived");
      if (branchId !== "all") q = q.eq("employees.branch_id", branchId);
      const { data, error } = await q.limit(2000);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const kpi: KpiCounts = useMemo(() => {
    const today = new Date();
    let expired = 0, expiringSoon = 0, expiringLater = 0, total = 0, pendingOrFailed = 0;
    for (const r of kpiRows) {
      if (r.upload_status !== "uploaded") {
        pendingOrFailed++;
        continue;
      }
      total++;
      if (!r.expiry_date) continue;
      const days = differenceInCalendarDays(new Date(r.expiry_date), today);
      if (days < 0) expired++;
      else if (days <= 30) expiringSoon++;
      else if (days <= 90) expiringLater++;
    }
    return { total, expiringSoon, expiringLater, expired, pendingOrFailed };
  }, [kpiRows]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "expiry_asc":
          return (a.expiry_date || "9999").localeCompare(b.expiry_date || "9999");
        case "expiry_desc":
          return (b.expiry_date || "0000").localeCompare(a.expiry_date || "0000");
        case "updated_desc":
          return ((b as any).updated_at || "").localeCompare((a as any).updated_at || "");
        case "name_asc":
          return (a.employees?.full_name || "").localeCompare(b.employees?.full_name || "", "th");
      }
    });
    return arr;
  }, [rows, sortKey]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    switch (p) {
      case "all":
        setStatusFilter("active_only"); setExpiryWindow("all"); break;
      case "expiring30":
        setStatusFilter("active_only"); setExpiryWindow("30d"); break;
      case "expiring90":
        setStatusFilter("active_only"); setExpiryWindow("90d"); break;
      case "expired":
        setStatusFilter("active_only"); setExpiryWindow("expired"); break;
      case "pending":
        setStatusFilter("pending_or_failed"); setExpiryWindow("all"); break;
      case "custom": break;
    }
  };

  const onAnyAdvancedChange = () => setPreset("custom");

  const exportCsv = () => {
    const csv = toCsv(sortedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employee-documents-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lastRefreshed = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "-";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">เอกสารพนักงาน</h1>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              จัดการเอกสาร HR ติดตามวันหมดอายุ และตรวจสอบสถานะการอัปโหลด
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              รีเฟรช
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={sortedRows.length === 0}>
              <DownloadIcon className="h-4 w-4 mr-2" />
              ส่งออก CSV
            </Button>
            <Button onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> อัปโหลดเอกสาร
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <EmployeeDocumentsKpiStrip counts={kpi} activePreset={preset} onPreset={(p) => applyPreset(p as Preset)} />

        {/* Search + advanced filter toggle */}
        <Card className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="ค้นหาชื่อเอกสาร..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); onAnyAdvancedChange(); }}
              />
            </div>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expiry_asc">หมดอายุเร็วสุดก่อน</SelectItem>
                <SelectItem value="expiry_desc">หมดอายุช้าสุดก่อน</SelectItem>
                <SelectItem value="updated_desc">อัปเดตล่าสุด</SelectItem>
                <SelectItem value="name_asc">ชื่อพนักงาน A→ฮ</SelectItem>
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              size="sm"
              value={viewMode}
              onValueChange={(v) => v && setViewMode(v as ViewMode)}
              className="hidden md:flex"
            >
              <ToggleGroupItem value="table" aria-label="ตาราง"><List className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="cards" aria-label="การ์ด"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
            </ToggleGroup>
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  ตัวกรองขั้นสูง
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent />
            </Collapsible>
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-2 border-t">
                <Select value={branchId} onValueChange={(v) => { setBranchId(v); onAnyAdvancedChange(); }}>
                  <SelectTrigger><SelectValue placeholder="สาขา" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกสาขา</SelectItem>
                    {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as any); onAnyAdvancedChange(); }}>
                  <SelectTrigger><SelectValue placeholder="ประเภท" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกประเภท</SelectItem>
                    {Object.entries(DOCUMENT_TYPE_LABEL_TH).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); onAnyAdvancedChange(); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active_only">ใช้งานอยู่</SelectItem>
                    <SelectItem value="active">เฉพาะ active</SelectItem>
                    <SelectItem value="archived">เก็บถาวร</SelectItem>
                    <SelectItem value="replaced">ถูกแทนที่</SelectItem>
                    <SelectItem value="expired">หมดอายุ</SelectItem>
                    <SelectItem value="pending_or_failed">อัปโหลดค้าง / ล้มเหลว</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={expiryWindow} onValueChange={(v) => { setExpiryWindow(v as ExpiryWindow); onAnyAdvancedChange(); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกวันหมดอายุ</SelectItem>
                    <SelectItem value="expired">หมดอายุแล้ว</SelectItem>
                    <SelectItem value="30d">ภายใน 30 วัน</SelectItem>
                    <SelectItem value="60d">ภายใน 60 วัน</SelectItem>
                    <SelectItem value="90d">ภายใน 90 วัน</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>
              แสดง <strong className="text-foreground tabular-nums">{sortedRows.length}</strong> รายการ
              {rows.length >= 500 && <span className="text-amber-600 dark:text-amber-400 ml-1">(จำกัด 500)</span>}
            </span>
            <span>อัปเดตล่าสุด {lastRefreshed}</span>
          </div>
        </Card>

        {/* Error banner */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>โหลดข้อมูลไม่สำเร็จ</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-2">
              <span className="truncate">{(error as any)?.message || "เกิดข้อผิดพลาด"}</span>
              <Button size="sm" variant="outline" onClick={() => refetch()}>ลองใหม่</Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Content */}
        {isLoading ? (
          <Card className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </Card>
        ) : sortedRows.length === 0 ? (
          <Card className="p-10 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground mt-3">ไม่พบเอกสารที่ตรงกับตัวกรอง</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => applyPreset("all")}>ล้างตัวกรอง</Button>
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> เลือกพนักงานเพื่ออัปโหลด
              </Button>
            </div>
          </Card>
        ) : viewMode === "cards" ? (
          <EmployeeDocumentsCardGrid rows={sortedRows} onStateChanged={() => refetch()} />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30 sticky top-0">
                  <TableRow>
                    <TableHead>พนักงาน</TableHead>
                    <TableHead className="hidden lg:table-cell">สาขา</TableHead>
                    <TableHead>เอกสาร</TableHead>
                    <TableHead className="hidden md:table-cell">ประเภท</TableHead>
                    <TableHead>วันหมดอายุ</TableHead>
                    <TableHead className="hidden xl:table-cell">การมองเห็น</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">การดำเนินการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((r) => {
                    const history = Array.isArray((r.metadata as any)?.confirm_history)
                      ? ((r.metadata as any).confirm_history as ConfirmHistoryEntry[]) : [];
                    return (
                      <TableRow key={r.id} className={cn(urgencyRowClass(r.expiry_date, r.upload_status))}>
                        <TableCell className="font-medium">
                          <div>{r.employees?.full_name || "-"}</div>
                          <div className="text-xs text-muted-foreground lg:hidden">{r.employees?.branches?.name || ""}</div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{r.employees?.branches?.name || "-"}</TableCell>
                        <TableCell>
                          <div className="font-medium line-clamp-1">{r.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{r.file_name}</div>
                          <div className="text-xs text-muted-foreground md:hidden mt-0.5">
                            {DOCUMENT_TYPE_LABEL_TH[r.document_type]}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{DOCUMENT_TYPE_LABEL_TH[r.document_type]}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm">{r.expiry_date ? format(new Date(r.expiry_date), "dd MMM yyyy") : "-"}</span>
                            {expiryBadge(r.expiry_date)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <Badge variant={r.visibility === "hr_only" ? "secondary" : "outline"}>
                            {VISIBILITY_LABEL_TH[r.visibility]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant={r.status === "active" ? "default" : "secondary"}>
                              {STATUS_LABEL_TH[r.status]}
                            </Badge>
                            {r.upload_status !== "uploaded" && (
                              <Badge variant={r.upload_status === "failed" ? "destructive" : "outline"}>
                                {UPLOAD_STATUS_LABEL_TH[r.upload_status]}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <EmployeeDocumentsRowActions
                            documentId={r.id}
                            documentTitle={r.title}
                            employeeId={r.employee_id}
                            uploadStatus={r.upload_status}
                            history={history}
                            onStateChanged={() => refetch()}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {isFetching && !isLoading && (
              <div className="border-t px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> กำลังอัปเดต…
              </div>
            )}
          </Card>
        )}

        <SelectEmployeeForUploadDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      </div>
    </TooltipProvider>
  );
}
