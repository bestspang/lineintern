import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, FileText, ExternalLink, Plus } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import {
  DOCUMENT_TYPE_LABEL_TH, STATUS_LABEL_TH, VISIBILITY_LABEL_TH,
  type EmployeeDocument, type EmployeeDocumentType, type EmployeeDocumentStatus,
} from "@/lib/employee-document-types";
import { SelectEmployeeForUploadDialog } from "@/components/employee-documents/SelectEmployeeForUploadDialog";

type ExpiryWindow = "all" | "expired" | "30d" | "60d" | "90d";
type StatusFilter = EmployeeDocumentStatus | "active_only" | "pending_or_failed";

export default function EmployeeDocuments() {
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<EmployeeDocumentType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active_only");
  const [expiryWindow, setExpiryWindow] = useState<ExpiryWindow>("all");
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-light"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("is_deleted", false).order("name");
      return data ?? [];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
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
      return (data as any[]) ?? [];
    },
  });

  const expiryBadge = (d: string | null) => {
    if (!d) return null;
    const days = differenceInCalendarDays(new Date(d), new Date());
    if (days < 0) return <Badge variant="destructive">หมดอายุแล้ว</Badge>;
    if (days <= 30) return <Badge variant="destructive">เหลือ {days} วัน</Badge>;
    if (days <= 90) return <Badge variant="secondary">เหลือ {days} วัน</Badge>;
    return null;
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            <h1 className="text-2xl font-bold">เอกสารพนักงาน</h1>
          </div>
          <p className="text-muted-foreground">
            จัดการและติดตามเอกสาร HR ทั้งหมดของพนักงาน รวมถึงการแจ้งเตือนเอกสารใกล้หมดอายุ
          </p>
        </div>
        <Button onClick={() => setPickerOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> อัปโหลดเอกสาร
        </Button>
      </div>

      <Card className="p-4 grid grid-cols-1 md:grid-cols-5 gap-2">
        <Input placeholder="ค้นหาชื่อเอกสาร..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger><SelectValue placeholder="สาขา" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสาขา</SelectItem>
            {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกประเภท</SelectItem>
            {Object.entries(DOCUMENT_TYPE_LABEL_TH).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
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
        <Select value={expiryWindow} onValueChange={(v) => setExpiryWindow(v as ExpiryWindow)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกวันหมดอายุ</SelectItem>
            <SelectItem value="expired">หมดอายุแล้ว</SelectItem>
            <SelectItem value="30d">ภายใน 30 วัน</SelectItem>
            <SelectItem value="60d">ภายใน 60 วัน</SelectItem>
            <SelectItem value="90d">ภายใน 90 วัน</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>พนักงาน</TableHead>
              <TableHead>สาขา</TableHead>
              <TableHead>เอกสาร</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>วันหมดอายุ</TableHead>
              <TableHead>การมองเห็น</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <span>ไม่พบเอกสาร</span>
                    <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" /> เลือกพนักงานเพื่ออัปโหลดเอกสาร
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.employees?.full_name || "-"}</TableCell>
                <TableCell>{r.employees?.branches?.name || "-"}</TableCell>
                <TableCell>
                  <div>{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.file_name}</div>
                </TableCell>
                <TableCell>{DOCUMENT_TYPE_LABEL_TH[r.document_type as EmployeeDocumentType]}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span>{r.expiry_date ? format(new Date(r.expiry_date), "dd MMM yyyy") : "-"}</span>
                    {expiryBadge(r.expiry_date)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={r.visibility === "hr_only" ? "secondary" : "outline"}>
                    {VISIBILITY_LABEL_TH[r.visibility as keyof typeof VISIBILITY_LABEL_TH]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={r.status === "active" ? "default" : "secondary"}>
                    {STATUS_LABEL_TH[r.status as EmployeeDocumentStatus]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/attendance/employees/${r.employee_id}`} title="ดูพนักงาน">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <SelectEmployeeForUploadDialog open={pickerOpen} onOpenChange={setPickerOpen} />
    </div>
  );
}
