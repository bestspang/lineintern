// Phase 1A.3 — Read-only activity log for an employee document.
// Renders the per-row confirm_history array (last 20 attempts) so HR can
// troubleshoot pending/failed uploads without leaving the documents tab.
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CONFIRM_OUTCOME_LABEL_TH,
  type ConfirmHistoryEntry,
  type ConfirmHistoryOutcome,
} from "@/lib/employee-document-types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentTitle: string;
  history: ConfirmHistoryEntry[];
}

const variantFor = (o: ConfirmHistoryOutcome): "default" | "destructive" | "secondary" | "outline" => {
  if (o === "uploaded") return "default";
  if (o === "failed") return "destructive";
  return "secondary"; // file_missing
};

const formatBangkokDisplay = (iso: string): string => {
  // Inputs are already Bangkok ISO strings (e.g. 2026-04-29T15:04:05+07:00).
  // Render in a friendly Thai-locale form without re-converting timezone.
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
};

export function DocumentActivityLogDialog({ open, onOpenChange, documentTitle, history }: Props) {
  const ordered = [...history].reverse(); // newest first

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] grid grid-rows-[auto_auto_1fr]">
        <DialogHeader>
          <DialogTitle>ประวัติการยืนยันการอัปโหลด</DialogTitle>
          <DialogDescription>
            "{documentTitle}" — บันทึกล่าสุด 20 รายการ ใช้สำหรับตรวจสอบเมื่อเอกสารค้างหรืออัปโหลดล้มเหลว
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">อัปโหลดสำเร็จ</Badge>
            <Badge variant="destructive">ล้มเหลว</Badge>
            <Badge variant="secondary">ไฟล์หาย (รอลองใหม่)</Badge>
          </div>
          <p>เวลาทั้งหมดอยู่ในเขตเวลา Asia/Bangkok</p>
        </div>

        <div className="overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">เวลา</TableHead>
                <TableHead>ผลลัพธ์</TableHead>
                <TableHead>เหตุผล / รายละเอียด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    ยังไม่มีบันทึกการยืนยัน
                  </TableCell>
                </TableRow>
              ) : ordered.map((h, idx) => (
                <TableRow key={`${h.at}-${idx}`}>
                  <TableCell className="font-mono text-xs">{formatBangkokDisplay(h.at)}</TableCell>
                  <TableCell>
                    <Badge variant={variantFor(h.outcome)}>
                      {CONFIRM_OUTCOME_LABEL_TH[h.outcome] ?? h.outcome}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {h.reason || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
