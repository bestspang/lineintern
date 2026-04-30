import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Upload, Loader2, FileText, CheckCircle } from 'lucide-react';
import { useBranchReportContext } from '../context/BranchReportContext';

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
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-line-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ content }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult({ inserted: data.inserted || 0, updated: data.updated || 0 });
      toast.success(`นำเข้าสำเร็จ: ${data.inserted || 0} รายการใหม่, ${data.updated || 0} อัพเดท`);
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
