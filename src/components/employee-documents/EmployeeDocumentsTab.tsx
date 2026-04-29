import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Download, Plus, Archive, Replace, Loader2, FileText } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { UploadDocumentDialog } from "./UploadDocumentDialog";
import {
  DOCUMENT_TYPE_LABEL_TH, STATUS_LABEL_TH, VISIBILITY_LABEL_TH,
  UPLOAD_STATUS_LABEL_TH, SIGNED_URL_ERROR_CODE_TH,
  type EmployeeDocument, type EmployeeDocumentType, type EmployeeDocumentStatus,
  type EmployeeDocumentUploadStatus,
} from "@/lib/employee-document-types";

type StatusFilter = EmployeeDocumentStatus | "active_only" | "pending_or_failed";

interface Props { employeeId: string; }

export function EmployeeDocumentsTab({ employeeId }: Props) {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceOldId, setReplaceOldId] = useState<string | undefined>();
  const [archiveTarget, setArchiveTarget] = useState<EmployeeDocument | null>(null);
  const [typeFilter, setTypeFilter] = useState<EmployeeDocumentType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active_only");
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const { data: docs = [], isLoading, refetch } = useQuery({
    queryKey: ["employee-documents", employeeId, typeFilter, statusFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("employee_documents" as any)
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      if (typeFilter !== "all") q = q.eq("document_type", typeFilter);
      if (statusFilter === "active_only") {
        q = q.neq("status", "archived").eq("upload_status", "uploaded");
      } else if (statusFilter === "pending_or_failed") {
        q = q.in("upload_status", ["pending", "failed"]);
      } else {
        q = q.eq("status", statusFilter);
      }
      if (search.trim()) q = q.ilike("title", `%${search.trim()}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as EmployeeDocument[]) ?? [];
    },
  });

  const onUploaded = () => {
    setReplaceOldId(undefined);
    qc.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
    refetch();
  };

  const downloadDoc = async (doc: EmployeeDocument) => {
    setDownloadingId(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke("employee-document-signed-url", {
        body: { document_id: doc.id },
      });
      if (error || !data?.success) {
        const code = data?.error || error?.message || "";
        const msg = SIGNED_URL_ERROR_CODE_TH[code] || code || "ไม่สามารถสร้างลิงก์";
        // For file_missing/upload_failed the row state changed — refresh the list.
        if (code === "file_missing" || code === "upload_failed") refetch();
        throw new Error(msg);
      }
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message || "ดาวน์โหลดล้มเหลว");
    } finally {
      setDownloadingId(null);
    }
  };

  const uploadStatusBadge = (s: EmployeeDocumentUploadStatus) => {
    if (s === "uploaded") return null;
    const variant = s === "failed" ? "destructive" : "outline";
    return <Badge variant={variant as any}>{UPLOAD_STATUS_LABEL_TH[s]}</Badge>;
  };

  const archiveDoc = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const { data, error } = await supabase.functions.invoke("employee-document-archive", {
        body: { document_id: archiveTarget.id },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "เก็บถาวรล้มเหลว");
      toast.success("เก็บถาวรเอกสารแล้ว");
      setArchiveTarget(null);
      onUploaded();
    } catch (e: any) {
      toast.error(e.message || "เก็บถาวรล้มเหลว");
    } finally {
      setArchiving(false);
    }
  };

  const expiryBadge = (d: string | null) => {
    if (!d) return null;
    const days = differenceInCalendarDays(new Date(d), new Date());
    if (days < 0) return <Badge variant="destructive">หมดอายุแล้ว</Badge>;
    if (days <= 30) return <Badge variant="destructive">เหลือ {days} วัน</Badge>;
    if (days <= 90) return <Badge variant="secondary">เหลือ {days} วัน</Badge>;
    return null;
  };

  const statusBadge = (s: EmployeeDocumentStatus) => {
    const variant = s === "active" ? "default" : s === "archived" ? "secondary" : "outline";
    return <Badge variant={variant as any}>{STATUS_LABEL_TH[s]}</Badge>;
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" /> เอกสารพนักงาน
          </h3>
          <p className="text-sm text-muted-foreground">เก็บเอกสาร HR แบบปลอดภัย เข้าถึงได้เฉพาะผู้มีสิทธิ์</p>
        </div>
        <Button onClick={() => { setReplaceOldId(undefined); setUploadOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> อัปโหลดเอกสาร
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Input placeholder="ค้นหาชื่อเอกสาร..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
            <SelectItem value="active_only">ใช้งานอยู่ (ซ่อนเก็บถาวร)</SelectItem>
            <SelectItem value="active">เฉพาะ active</SelectItem>
            <SelectItem value="archived">เก็บถาวร</SelectItem>
            <SelectItem value="replaced">ถูกแทนที่</SelectItem>
            <SelectItem value="expired">หมดอายุ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อเอกสาร</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>วันที่ออก</TableHead>
              <TableHead>วันหมดอายุ</TableHead>
              <TableHead>การมองเห็น</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="text-right">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
            ) : docs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">ยังไม่มีเอกสาร</TableCell></TableRow>
            ) : docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">{d.file_name}</div>
                </TableCell>
                <TableCell>{DOCUMENT_TYPE_LABEL_TH[d.document_type]}</TableCell>
                <TableCell>{d.issue_date ? format(new Date(d.issue_date), "dd MMM yyyy") : "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span>{d.expiry_date ? format(new Date(d.expiry_date), "dd MMM yyyy") : "-"}</span>
                    {expiryBadge(d.expiry_date)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={d.visibility === "hr_only" ? "secondary" : "outline"}>
                    {VISIBILITY_LABEL_TH[d.visibility]}
                  </Badge>
                </TableCell>
                <TableCell>{statusBadge(d.status)}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => downloadDoc(d)} disabled={downloadingId === d.id}>
                    {downloadingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </Button>
                  {d.status !== "archived" && d.status !== "replaced" && (
                    <>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => { setReplaceOldId(d.id); setUploadOpen(true); }}
                        title="แทนที่ด้วยเอกสารใหม่"
                      ><Replace className="h-4 w-4" /></Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setArchiveTarget(d)}
                        title="เก็บถาวร"
                      ><Archive className="h-4 w-4" /></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        employeeId={employeeId}
        onUploaded={onUploaded}
        replaceOldDocumentId={replaceOldId}
      />

      <AlertDialog open={!!archiveTarget} onOpenChange={(v) => !v && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>เก็บถาวรเอกสาร?</AlertDialogTitle>
            <AlertDialogDescription>
              "{archiveTarget?.title}" จะถูกซ่อนจากรายการใช้งาน แต่ไฟล์ยังเก็บไว้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={archiveDoc} disabled={archiving}>
              {archiving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              เก็บถาวร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
