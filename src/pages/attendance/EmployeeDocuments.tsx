import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2, FileText, Plus, RefreshCw, Download as DownloadIcon,
  LayoutGrid, List, SlidersHorizontal, AlertCircle, RotateCcw, Columns3,
  WifiOff, ChevronDown, ChevronUp, ShieldAlert, ServerCrash, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { describeDocError, type FriendlyError } from "@/lib/employee-document-errors";
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
import { DocumentSearchCombobox, type SuggestionPick } from "@/components/employee-documents/DocumentSearchCombobox";

type ExpiryWindow = "all" | "expired" | "30d" | "60d" | "90d";
type StatusFilter = EmployeeDocumentStatus | "active_only" | "pending_or_failed";
type SortKey = "expiry_asc" | "expiry_desc" | "updated_desc" | "name_asc";
type ViewMode = "table" | "cards";
type Preset = "all" | "expiring30" | "expiring90" | "expired" | "pending" | "custom";
type SearchScope = "title" | "title_or_file";

const PAGE_SIZE = 50;

// --- Column visibility ---
type ColumnKey = "employee" | "branch" | "title" | "type" | "expiry" | "visibility" | "status";
const COLUMN_LABELS: Record<ColumnKey, string> = {
  employee: "พนักงาน",
  branch: "สาขา",
  title: "เอกสาร",
  type: "ประเภท",
  expiry: "วันหมดอายุ",
  visibility: "การมองเห็น",
  status: "สถานะ",
};
const ALL_COLUMNS: ColumnKey[] = ["employee", "branch", "title", "type", "expiry", "visibility", "status"];
const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  employee: true, branch: true, title: true, type: true,
  expiry: true, visibility: true, status: true,
};
const COLUMN_STORAGE_KEY = "employee-documents.columns.v1";

function loadColumns(): Record<ColumnKey, boolean> {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_COLUMNS, ...parsed };
  } catch {
    return DEFAULT_COLUMNS;
  }
}

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

const DEFAULT_STATE = {
  search: "",
  employeeFilter: null as { id: string; name: string } | null,
  branchId: "all",
  typeFilter: "all" as EmployeeDocumentType | "all",
  statusFilter: "active_only" as StatusFilter,
  expiryWindow: "all" as ExpiryWindow,
  sortKey: "expiry_asc" as SortKey,
  preset: "all" as Preset,
  searchScope: "title" as SearchScope,
};

export default function EmployeeDocuments() {
  const [search, setSearch] = useState(DEFAULT_STATE.search);
  const [employeeFilter, setEmployeeFilter] = useState<{ id: string; name: string } | null>(DEFAULT_STATE.employeeFilter);
  const [branchId, setBranchId] = useState<string>(DEFAULT_STATE.branchId);
  const [typeFilter, setTypeFilter] = useState<EmployeeDocumentType | "all">(DEFAULT_STATE.typeFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(DEFAULT_STATE.statusFilter);
  const [expiryWindow, setExpiryWindow] = useState<ExpiryWindow>(DEFAULT_STATE.expiryWindow);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_STATE.sortKey);
  const [searchScope, setSearchScope] = useState<SearchScope>(DEFAULT_STATE.searchScope);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>(DEFAULT_STATE.preset);
  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>(() => loadColumns());
  const [exportingAll, setExportingAll] = useState(false);

  // Persist column prefs
  useEffect(() => {
    try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columns)); } catch { /* ignore */ }
  }, [columns]);

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

  // Build the filtered query (used for both pages and exhaustive export).
  const buildBaseQuery = (selectClause: string) => {
    let q = supabase
      .from("employee_documents" as any)
      .select(selectClause, { count: "exact" })
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
    if (employeeFilter) q = q.eq("employee_id", employeeFilter.id);

    if (search.trim()) {
      const s = search.trim().replace(/[%]/g, "");
      if (searchScope === "title_or_file") {
        q = q.or(`title.ilike.%${s}%,file_name.ilike.%${s}%`);
      } else {
        q = q.ilike("title", `%${s}%`);
      }
    }

    const today = new Date();
    const isoDate = (d: Date) => d.toISOString().slice(0, 10);
    if (expiryWindow === "expired") q = q.lt("expiry_date", isoDate(today));
    else if (expiryWindow !== "all") {
      const days = expiryWindow === "30d" ? 30 : expiryWindow === "60d" ? 60 : 90;
      const cutoff = new Date(today); cutoff.setDate(today.getDate() + days);
      q = q.gte("expiry_date", isoDate(today)).lte("expiry_date", isoDate(cutoff));
    }

    return q;
  };

  // Infinite-paginated rows
  const {
    data: pageData,
    isLoading, isFetching, error, refetch, dataUpdatedAt,
    fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: [
      "all-employee-documents-v2",
      branchId, typeFilter, statusFilter, expiryWindow, search, searchScope,
      employeeFilter?.id ?? null,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam as number;
      const to = from + PAGE_SIZE - 1;
      const q = buildBaseQuery("*, employees!inner(id, full_name, branch_id, branches:branches!employees_branch_id_fkey(name))");
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data as unknown as DocRow[]) ?? [], count: count ?? 0, from, to };
    },
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((sum, p) => sum + p.rows.length, 0);
      if (loaded >= last.count) return undefined;
      return loaded;
    },
  });

  const rows: DocRow[] = useMemo(
    () => (pageData?.pages.flatMap((p) => p.rows) ?? []),
    [pageData],
  );
  const totalCount = pageData?.pages[0]?.count ?? 0;

  // KPI counts
  const {
    data: kpiRows = [],
    isError: kpiIsError,
    error: kpiError,
    refetch: refetchKpi,
    isFetching: kpiIsFetching,
  } = useQuery({
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
      if (r.upload_status !== "uploaded") { pendingOrFailed++; continue; }
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
      case "all": setStatusFilter("active_only"); setExpiryWindow("all"); break;
      case "expiring30": setStatusFilter("active_only"); setExpiryWindow("30d"); break;
      case "expiring90": setStatusFilter("active_only"); setExpiryWindow("90d"); break;
      case "expired": setStatusFilter("active_only"); setExpiryWindow("expired"); break;
      case "pending": setStatusFilter("pending_or_failed"); setExpiryWindow("all"); break;
      case "custom": break;
    }
  };

  const onAnyAdvancedChange = () => setPreset("custom");

  // --- Reset detection ---
  const isDirty =
    search !== DEFAULT_STATE.search ||
    employeeFilter !== null ||
    branchId !== DEFAULT_STATE.branchId ||
    typeFilter !== DEFAULT_STATE.typeFilter ||
    statusFilter !== DEFAULT_STATE.statusFilter ||
    expiryWindow !== DEFAULT_STATE.expiryWindow ||
    sortKey !== DEFAULT_STATE.sortKey ||
    preset !== DEFAULT_STATE.preset ||
    searchScope !== DEFAULT_STATE.searchScope;

  const resetAll = () => {
    setSearch(DEFAULT_STATE.search);
    setEmployeeFilter(DEFAULT_STATE.employeeFilter);
    setBranchId(DEFAULT_STATE.branchId);
    setTypeFilter(DEFAULT_STATE.typeFilter);
    setStatusFilter(DEFAULT_STATE.statusFilter);
    setExpiryWindow(DEFAULT_STATE.expiryWindow);
    setSortKey(DEFAULT_STATE.sortKey);
    setSearchScope(DEFAULT_STATE.searchScope);
    setPreset(DEFAULT_STATE.preset);
  };

  // --- Suggestion picker ---
  const onSuggestionPick = (pick: SuggestionPick) => {
    onAnyAdvancedChange();
    if (pick.kind === "title") {
      setSearch(pick.value);
      setSearchScope("title");
    } else if (pick.kind === "file") {
      setSearch(pick.value);
      setSearchScope("title_or_file");
    } else {
      setEmployeeFilter({ id: pick.employeeId, name: pick.value });
      // Don't overwrite the user's typed text — the chip itself filters by employee.
    }
  };

  // --- CSV export (loads all pages first if needed) ---
  const exportCsv = async () => {
    if (exportingAll) return;
    setExportingAll(true);
    try {
      // If everything is already loaded, export directly
      let allRows = sortedRows;
      if (hasNextPage) {
        // Fetch all remaining pages directly (bypass paging UI)
        const q = buildBaseQuery("*, employees!inner(id, full_name, branch_id, branches:branches!employees_branch_id_fkey(name))");
        const { data, error } = await q.range(0, Math.max(0, totalCount - 1));
        if (error) throw error;
        allRows = ((data as unknown as DocRow[]) ?? []);
      }
      const csv = toCsv(allRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `employee-documents-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("ส่งออก CSV สำเร็จ", {
        description: `${allRows.length.toLocaleString()} รายการ`,
      });
    } catch (err) {
      const friendly = describeDocError(err);
      toast.error(friendly.title, {
        description: friendly.hint,
        action: friendly.canRetry
          ? { label: "ลองใหม่", onClick: () => exportCsv() }
          : undefined,
      });
    } finally {
      setExportingAll(false);
    }
  };

  // --- Auto-load on scroll (sentinel) ---
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || rows.length < PAGE_SIZE) return;
    // หยุด auto-load หากหน้าก่อนหน้า fail เพื่อกัน retry วน — ผู้ใช้ต้องกด "ลองใหม่" เอง
    if (isFetchNextPageError) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, rows.length, fetchNextPage]);

  // --- Offline awareness ---
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine === false : false,
  );
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const lastRefreshed = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "-";
  const visibleColumns = columns;
  const sortIsLocal = sortKey !== "expiry_asc";

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
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={totalCount === 0 || exportingAll}>
              {exportingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DownloadIcon className="h-4 w-4 mr-2" />}
              ส่งออก CSV
            </Button>
            <Button onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> อัปโหลดเอกสาร
            </Button>
          </div>
        </div>

        {/* Offline banner */}
        {isOffline && (
          <Alert className="border-amber-500/50 bg-amber-500/10 text-foreground">
            <WifiOff className="h-4 w-4 text-amber-600" />
            <AlertTitle>คุณกำลังออฟไลน์</AlertTitle>
            <AlertDescription>
              ข้อมูลที่แสดงอาจไม่อัปเดต เมื่อเชื่อมต่ออินเทอร์เน็ตได้แล้ว ระบบจะดึงข้อมูลล่าสุดให้อัตโนมัติ
            </AlertDescription>
          </Alert>
        )}

        {/* KPI strip */}
        <EmployeeDocumentsKpiStrip counts={kpi} activePreset={preset} onPreset={(p) => applyPreset(p as Preset)} />

        {/* KPI error (compact, non-blocking) */}
        {kpiIsError && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2 text-sm">
              <span>โหลดสรุปตัวเลข KPI ไม่สำเร็จ ตัวเลขด้านบนอาจไม่ถูกต้อง</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetchKpi()}
                disabled={kpiIsFetching}
              >
                {kpiIsFetching ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                โหลด KPI ใหม่
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Search + sort + view + filters */}
        <Card className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DocumentSearchCombobox
              value={search}
              onValueChange={(v) => { setSearch(v); onAnyAdvancedChange(); }}
              employeeChip={employeeFilter}
              onClearEmployee={() => { setEmployeeFilter(null); onAnyAdvancedChange(); }}
              onPick={onSuggestionPick}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expiry_asc">หมดอายุเร็วสุดก่อน</SelectItem>
                      <SelectItem value="expiry_desc">หมดอายุช้าสุดก่อน</SelectItem>
                      <SelectItem value="updated_desc">อัปเดตล่าสุด</SelectItem>
                      <SelectItem value="name_asc">ชื่อพนักงาน A→ฮ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              {sortIsLocal && (
                <TooltipContent side="bottom">
                  เรียงเฉพาะรายการที่โหลดมาแล้ว ({rows.length}/{totalCount})
                </TooltipContent>
              )}
            </Tooltip>

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

            {viewMode === "table" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Columns3 className="h-4 w-4 mr-2" />
                    คอลัมน์
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>แสดงคอลัมน์</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_COLUMNS.map((key) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={visibleColumns[key]}
                      onCheckedChange={(checked) =>
                        setColumns((prev) => ({ ...prev, [key]: !!checked }))
                      }
                      onSelect={(e) => e.preventDefault()}
                    >
                      {COLUMN_LABELS[key]}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <button
                    type="button"
                    onClick={() => setColumns(DEFAULT_COLUMNS)}
                    className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded-sm"
                  >
                    คืนค่าเริ่มต้น
                  </button>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  ตัวกรองขั้นสูง
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent />
            </Collapsible>

            {isDirty && (
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <RotateCcw className="h-4 w-4 mr-2" />
                รีเซ็ต
              </Button>
            )}
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
              แสดง <strong className="text-foreground tabular-nums">{rows.length}</strong>
              {totalCount > 0 && <> จาก <strong className="text-foreground tabular-nums">{totalCount}</strong></>} รายการ
              {searchScope === "title_or_file" && search.trim() && (
                <span className="ml-2 text-muted-foreground/80">(ค้นในชื่อ + ชื่อไฟล์)</span>
              )}
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
              <Button variant="outline" size="sm" onClick={resetAll}>ล้างตัวกรอง</Button>
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> เลือกพนักงานเพื่ออัปโหลด
              </Button>
            </div>
          </Card>
        ) : viewMode === "cards" ? (
          <>
            <EmployeeDocumentsCardGrid rows={sortedRows} onStateChanged={() => refetch()} />
            <PaginationFooter
              loaded={rows.length}
              total={totalCount}
              hasNext={!!hasNextPage}
              loading={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
              sentinelRef={sentinelRef}
            />
          </>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30 sticky top-0">
                  <TableRow>
                    {visibleColumns.employee && <TableHead>พนักงาน</TableHead>}
                    {visibleColumns.branch && <TableHead>สาขา</TableHead>}
                    {visibleColumns.title && <TableHead>เอกสาร</TableHead>}
                    {visibleColumns.type && <TableHead>ประเภท</TableHead>}
                    {visibleColumns.expiry && <TableHead>วันหมดอายุ</TableHead>}
                    {visibleColumns.visibility && <TableHead>การมองเห็น</TableHead>}
                    {visibleColumns.status && <TableHead>สถานะ</TableHead>}
                    <TableHead className="text-right">การดำเนินการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((r) => {
                    const history = Array.isArray((r.metadata as any)?.confirm_history)
                      ? ((r.metadata as any).confirm_history as ConfirmHistoryEntry[]) : [];
                    return (
                      <TableRow key={r.id} className={cn(urgencyRowClass(r.expiry_date, r.upload_status))}>
                        {visibleColumns.employee && (
                          <TableCell className="font-medium">
                            <div>{r.employees?.full_name || "-"}</div>
                            {!visibleColumns.branch && (
                              <div className="text-xs text-muted-foreground">{r.employees?.branches?.name || ""}</div>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.branch && (
                          <TableCell>{r.employees?.branches?.name || "-"}</TableCell>
                        )}
                        {visibleColumns.title && (
                          <TableCell>
                            <div className="font-medium line-clamp-1">{r.title}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">{r.file_name}</div>
                            {!visibleColumns.type && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {DOCUMENT_TYPE_LABEL_TH[r.document_type]}
                              </div>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.type && (
                          <TableCell>{DOCUMENT_TYPE_LABEL_TH[r.document_type]}</TableCell>
                        )}
                        {visibleColumns.expiry && (
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-sm">{r.expiry_date ? format(new Date(r.expiry_date), "dd MMM yyyy") : "-"}</span>
                              {expiryBadge(r.expiry_date)}
                            </div>
                          </TableCell>
                        )}
                        {visibleColumns.visibility && (
                          <TableCell>
                            <Badge variant={r.visibility === "hr_only" ? "secondary" : "outline"}>
                              {VISIBILITY_LABEL_TH[r.visibility]}
                            </Badge>
                          </TableCell>
                        )}
                        {visibleColumns.status && (
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
                        )}
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
            <PaginationFooter
              loaded={rows.length}
              total={totalCount}
              hasNext={!!hasNextPage}
              loading={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
              sentinelRef={sentinelRef}
            />
            {isFetching && !isLoading && !isFetchingNextPage && (
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

interface PaginationFooterProps {
  loaded: number;
  total: number;
  hasNext: boolean;
  loading: boolean;
  onLoadMore: () => void;
  sentinelRef: React.RefObject<HTMLDivElement>;
}

function PaginationFooter({ loaded, total, hasNext, loading, onLoadMore, sentinelRef }: PaginationFooterProps) {
  if (total === 0) return null;
  return (
    <div className="border-t px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">
        แสดง <strong className="text-foreground tabular-nums">{loaded}</strong> จาก <strong className="text-foreground tabular-nums">{total}</strong> รายการ
      </span>
      {hasNext ? (
        <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          โหลดเพิ่ม
        </Button>
      ) : loaded > 0 ? (
        <span className="text-xs text-muted-foreground">โหลดครบทุกรายการแล้ว</span>
      ) : null}
      <div ref={sentinelRef} aria-hidden className="h-1 w-full sm:hidden" />
    </div>
  );
}
