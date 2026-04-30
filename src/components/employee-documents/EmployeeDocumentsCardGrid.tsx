import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_TYPE_LABEL_TH, STATUS_LABEL_TH, VISIBILITY_LABEL_TH, UPLOAD_STATUS_LABEL_TH,
  type EmployeeDocumentType, type EmployeeDocumentStatus, type EmployeeDocumentVisibility,
  type EmployeeDocumentUploadStatus, type ConfirmHistoryEntry,
} from "@/lib/employee-document-types";
import { EmployeeDocumentsRowActions } from "./EmployeeDocumentsRowActions";
import { Building2, User } from "lucide-react";

export interface DocRow {
  id: string;
  employee_id: string;
  title: string;
  file_name: string;
  document_type: EmployeeDocumentType;
  expiry_date: string | null;
  issue_date: string | null;
  status: EmployeeDocumentStatus;
  visibility: EmployeeDocumentVisibility;
  upload_status: EmployeeDocumentUploadStatus;
  metadata: Record<string, unknown> | null;
  employees?: { full_name?: string; branches?: { name?: string } | null } | null;
}

function urgencyTone(expiry: string | null, uploadStatus: EmployeeDocumentUploadStatus): string {
  if (uploadStatus === "failed") return "border-l-destructive";
  if (uploadStatus === "pending") return "border-l-amber-500";
  if (!expiry) return "border-l-transparent";
  const days = differenceInCalendarDays(new Date(expiry), new Date());
  if (days < 0) return "border-l-destructive";
  if (days <= 30) return "border-l-destructive";
  if (days <= 90) return "border-l-amber-500";
  return "border-l-transparent";
}

function expiryBadge(d: string | null) {
  if (!d) return null;
  const days = differenceInCalendarDays(new Date(d), new Date());
  if (days < 0) return <Badge variant="destructive">หมดอายุแล้ว</Badge>;
  if (days <= 30) return <Badge variant="destructive">เหลือ {days} วัน</Badge>;
  if (days <= 90) return <Badge variant="secondary">เหลือ {days} วัน</Badge>;
  return null;
}

interface Props {
  rows: DocRow[];
  onStateChanged: () => void;
}

export function EmployeeDocumentsCardGrid({ rows, onStateChanged }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {rows.map((r) => {
        const history = Array.isArray((r.metadata as any)?.confirm_history)
          ? ((r.metadata as any).confirm_history as ConfirmHistoryEntry[]) : [];
        return (
          <Card key={r.id} className={cn("p-4 border-l-4 transition-shadow hover:shadow-md", urgencyTone(r.expiry_date, r.upload_status))}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{r.employees?.full_name || "-"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{r.employees?.branches?.name || "-"}</span>
                </div>
              </div>
              <Badge variant={r.visibility === "hr_only" ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                {VISIBILITY_LABEL_TH[r.visibility]}
              </Badge>
            </div>

            <div className="mt-3">
              <div className="font-semibold leading-tight line-clamp-2">{r.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{r.file_name}</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 items-center">
              <Badge variant="outline" className="text-[10px]">{DOCUMENT_TYPE_LABEL_TH[r.document_type]}</Badge>
              <Badge variant={r.status === "active" ? "default" : "secondary"} className="text-[10px]">
                {STATUS_LABEL_TH[r.status]}
              </Badge>
              {r.upload_status !== "uploaded" && (
                <Badge variant={r.upload_status === "failed" ? "destructive" : "outline"} className="text-[10px]">
                  {UPLOAD_STATUS_LABEL_TH[r.upload_status]}
                </Badge>
              )}
            </div>

            <div className="mt-3 flex items-end justify-between gap-2">
              <div className="text-xs">
                <div className="text-muted-foreground">วันหมดอายุ</div>
                <div className="font-medium">
                  {r.expiry_date ? format(new Date(r.expiry_date), "dd MMM yyyy") : "ไม่กำหนด"}
                </div>
                <div className="mt-1">{expiryBadge(r.expiry_date)}</div>
              </div>
              <EmployeeDocumentsRowActions
                documentId={r.id}
                documentTitle={r.title}
                employeeId={r.employee_id}
                uploadStatus={r.upload_status}
                history={history}
                onStateChanged={onStateChanged}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
