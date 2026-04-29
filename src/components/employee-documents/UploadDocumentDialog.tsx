import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import {
  DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL_TH, ALLOWED_MIME_TYPES, MAX_FILE_BYTES,
  type EmployeeDocumentType, type EmployeeDocumentVisibility,
} from "@/lib/employee-document-types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: string;
  onUploaded?: () => void;
  /** When set, marks this old document as replaced after successful upload. */
  replaceOldDocumentId?: string;
}

export function UploadDocumentDialog({ open, onOpenChange, employeeId, onUploaded, replaceOldDocumentId }: Props) {
  const [docType, setDocType] = useState<EmployeeDocumentType>("employment_contract");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [visibility, setVisibility] = useState<EmployeeDocumentVisibility>("hr_only");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setDocType("employment_contract"); setTitle(""); setDescription("");
    setIssueDate(""); setExpiryDate(""); setVisibility("hr_only"); setFile(null);
  };

  const handleFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_BYTES) {
      toast.error("ไฟล์ใหญ่เกิน 10MB");
      return;
    }
    if (f.type && !ALLOWED_MIME_TYPES.includes(f.type)) {
      toast.error("ประเภทไฟล์ไม่รองรับ (รองรับ PDF / JPG / PNG / WebP / HEIC)");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 100));
  };

  const submit = async () => {
    if (!file) { toast.error("เลือกไฟล์ก่อน"); return; }
    if (!title.trim()) { toast.error("ระบุชื่อเอกสาร"); return; }
    setBusy(true);
    try {
      const { data: meta, error: fnErr } = await supabase.functions.invoke("employee-document-upload", {
        body: {
          employee_id: employeeId,
          document_type: docType,
          title: title.trim(),
          description: description.trim() || null,
          issue_date: issueDate || null,
          expiry_date: expiryDate || null,
          visibility,
          file_name: file.name,
          file_mime_type: file.type || null,
          file_size_bytes: file.size,
        },
      });
      if (fnErr || !meta?.success) {
        throw new Error(meta?.error || fnErr?.message || "อัปโหลดล้มเหลว");
      }

      // Use the returned signed upload URL
      const { error: upErr } = await supabase.storage
        .from("employee-documents")
        .uploadToSignedUrl(meta.file_path, meta.upload_token, file, {
          contentType: file.type || undefined,
        });
      if (upErr) throw upErr;

      if (replaceOldDocumentId) {
        await supabase.functions.invoke("employee-document-replace", {
          body: { old_document_id: replaceOldDocumentId, new_document_id: meta.document_id },
        });
      }

      toast.success("อัปโหลดเอกสารสำเร็จ");
      reset();
      onOpenChange(false);
      onUploaded?.();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "อัปโหลดล้มเหลว");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] grid grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>{replaceOldDocumentId ? "แทนที่เอกสาร" : "อัปโหลดเอกสารพนักงาน"}</DialogTitle>
          <DialogDescription>เก็บเอกสาร HR แบบปลอดภัย เข้าถึงได้เฉพาะผู้มีสิทธิ์</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div>
            <Label>ประเภทเอกสาร</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as EmployeeDocumentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{DOCUMENT_TYPE_LABEL_TH[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>ชื่อเอกสาร *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>

          <div>
            <Label>คำอธิบาย</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>วันที่ออก</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <Label>วันหมดอายุ</Label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>การมองเห็น</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as EmployeeDocumentVisibility)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hr_only">เฉพาะ HR (พนักงานมองไม่เห็น)</SelectItem>
                <SelectItem value="employee_visible">พนักงานเห็นเอกสารของตัวเองได้</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>ไฟล์ (PDF / รูปภาพ, สูงสุด 10MB)</Label>
            <Input
              type="file"
              accept={ALLOWED_MIME_TYPES.join(",")}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {file && <p className="text-xs text-muted-foreground mt-1">{file.name} • {(file.size / 1024).toFixed(0)} KB</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy || !file || !title.trim()}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            อัปโหลด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
