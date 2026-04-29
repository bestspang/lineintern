import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, ExternalLink, History, Loader2 } from "lucide-react";
import { SIGNED_URL_ERROR_CODE_TH, type ConfirmHistoryEntry } from "@/lib/employee-document-types";
import { DocumentActivityLogDialog } from "./DocumentActivityLogDialog";

interface Props {
  documentId: string;
  documentTitle: string;
  employeeId: string;
  uploadStatus: "pending" | "uploaded" | "failed";
  history: ConfirmHistoryEntry[];
  onStateChanged?: () => void;
}

export function EmployeeDocumentsRowActions({
  documentId, documentTitle, employeeId, uploadStatus, history, onStateChanged,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const showActivity = history.length > 0 || uploadStatus !== "uploaded";

  const downloadDoc = async () => {
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke("employee-document-signed-url", {
        body: { document_id: documentId },
      });
      if (error || !data?.success) {
        const code = data?.error || error?.message || "";
        const msg = SIGNED_URL_ERROR_CODE_TH[code] || code || "ไม่สามารถสร้างลิงก์";
        if (code === "file_missing" || code === "upload_failed") onStateChanged?.();
        throw new Error(msg);
      }
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message || "ดาวน์โหลดล้มเหลว");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {uploadStatus === "uploaded" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={downloadDoc} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>ดาวน์โหลด</TooltipContent>
        </Tooltip>
      )}
      {showActivity && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={() => setActivityOpen(true)}>
              <History className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>ประวัติการยืนยัน</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild size="sm" variant="ghost">
            <Link to={`/attendance/employees/${employeeId}`}>
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>เปิดโปรไฟล์พนักงาน</TooltipContent>
      </Tooltip>

      <DocumentActivityLogDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        documentTitle={documentTitle}
        history={history}
      />
    </div>
  );
}
