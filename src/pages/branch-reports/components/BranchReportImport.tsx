import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Upload, Loader2, FileText, CheckCircle } from 'lucide-react';
import { useBranchReportContext } from '../context/BranchReportContext';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BranchReportImport({ open, onOpenChange }: Props) {
  const [content, setContent] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null);
  const { refetch } = useBranchReportContext();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setContent(text);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!content.trim()) {
      toast.error('กรุณาใส่ข้อมูลที่จะนำเข้า');
      return;
    }

    setIsImporting(true);
    setResult(null);

    try {
      // Phase 0A: use supabase.functions.invoke so the user's JWT is auto-attached.
      // The import-line-chat edge function now requires a management-role bearer.
      const { data, error } = await supabase.functions.invoke('import-line-chat', {
        body: { content },
      });

      if (error) {
        throw new Error(error.message || 'Import failed');
      }
      if (data && (data as any).error) {
        throw new Error((data as any).error);
      }

      const inserted = (data as any)?.inserted || 0;
      const updated = (data as any)?.updated || 0;
      setResult({ inserted, updated });
      toast.success(`นำเข้าสำเร็จ: ${inserted} รายการใหม่, ${updated} อัพเดท`);
      refetch();
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการนำเข้า');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setContent('');
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            นำเข้าข้อมูลจาก LINE
          </DialogTitle>
          <DialogDescription>
            วางข้อความจาก LINE group หรืออัปโหลดไฟล์ .txt ที่ export จาก LINE
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload */}
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <label className="cursor-pointer">
                <FileText className="h-4 w-4 mr-2" />
                เลือกไฟล์ .txt
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </Button>
            <span className="text-sm text-muted-foreground">
              หรือวางข้อความด้านล่าง
            </span>
          </div>

          {/* Text Area */}
          <Textarea
            placeholder="วางข้อความจาก LINE group ที่นี่..."
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setResult(null);
            }}
            className="min-h-[200px] font-mono text-sm"
          />

          {/* Result */}
          {result && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-700 dark:text-green-400">
              <CheckCircle className="h-5 w-5" />
              <span>นำเข้าสำเร็จ: {result.inserted} รายการใหม่, {result.updated} อัพเดท</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              ปิด
            </Button>
            <Button onClick={handleImport} disabled={isImporting || !content.trim()}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  กำลังนำเข้า...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  นำเข้าข้อมูล
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
