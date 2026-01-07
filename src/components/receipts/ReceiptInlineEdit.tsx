import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Check, X, Edit2, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ReceiptData {
  id: string;
  vendor: string | null;
  total: number | null;
  receipt_date: string | null;
  category: string | null;
  status: string | null;
  warnings?: string[] | null;
  confidence?: {
    vendor?: number;
    date?: number;
    total?: number;
    category?: number;
  } | null;
}

interface ReceiptInlineEditProps {
  receipt: ReceiptData;
  onClose: () => void;
}

const CATEGORIES = [
  { value: 'food', label: 'Food & Dining', labelTh: 'อาหาร' },
  { value: 'transport', label: 'Transportation', labelTh: 'ขนส่ง' },
  { value: 'utilities', label: 'Utilities', labelTh: 'สาธารณูปโภค' },
  { value: 'office', label: 'Office Supplies', labelTh: 'อุปกรณ์สำนักงาน' },
  { value: 'software', label: 'Software', labelTh: 'ซอฟต์แวร์' },
  { value: 'marketing', label: 'Marketing', labelTh: 'การตลาด' },
  { value: 'other', label: 'Other', labelTh: 'อื่นๆ' },
];

export function ReceiptInlineEdit({ receipt, onClose }: ReceiptInlineEditProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    vendor: receipt.vendor || '',
    total: receipt.total?.toString() || '',
    receipt_date: receipt.receipt_date || '',
    category: receipt.category || 'other',
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);

  // Fetch receipt image
  useEffect(() => {
    async function fetchImage() {
      try {
        const { data: files } = await supabase
          .from('receipt_files')
          .select('storage_path')
          .eq('receipt_id', receipt.id)
          .limit(1)
          .maybeSingle();

        if (files?.storage_path) {
          // Use signed URL for private bucket
          const { data, error } = await supabase.storage
            .from('receipt-files')
            .createSignedUrl(files.storage_path, 3600); // 1 hour expiry
          
          if (data?.signedUrl) {
            setImageUrl(data.signedUrl);
          } else if (error) {
            console.error('Error creating signed URL:', error);
          }
        }
      } catch (error) {
        console.error('Error fetching receipt image:', error);
      } finally {
        setImageLoading(false);
      }
    }
    fetchImage();
  }, [receipt.id]);

  // Log OCR corrections for AI improvement
  const logCorrections = async (newData: typeof formData) => {
    const corrections: Array<{
      receipt_id: string;
      field_name: string;
      original_value: string | null;
      corrected_value: string | null;
      original_confidence: number | null;
    }> = [];

    // Check vendor change
    if (newData.vendor !== (receipt.vendor || '')) {
      corrections.push({
        receipt_id: receipt.id,
        field_name: 'vendor',
        original_value: receipt.vendor,
        corrected_value: newData.vendor || null,
        original_confidence: receipt.confidence?.vendor || null,
      });
    }

    // Check total change
    const originalTotal = receipt.total?.toString() || '';
    if (newData.total !== originalTotal) {
      corrections.push({
        receipt_id: receipt.id,
        field_name: 'total',
        original_value: originalTotal || null,
        corrected_value: newData.total || null,
        original_confidence: receipt.confidence?.total || null,
      });
    }

    // Check date change
    if (newData.receipt_date !== (receipt.receipt_date || '')) {
      corrections.push({
        receipt_id: receipt.id,
        field_name: 'receipt_date',
        original_value: receipt.receipt_date,
        corrected_value: newData.receipt_date || null,
        original_confidence: receipt.confidence?.date || null,
      });
    }

    // Check category change
    if (newData.category !== (receipt.category || 'other')) {
      corrections.push({
        receipt_id: receipt.id,
        field_name: 'category',
        original_value: receipt.category,
        corrected_value: newData.category,
        original_confidence: receipt.confidence?.category || null,
      });
    }

    // Insert corrections if any
    if (corrections.length > 0) {
      await supabase.from('receipt_ocr_corrections').insert(corrections);
    }
  };

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Log corrections before updating
      await logCorrections(data);

      const { error } = await supabase
        .from('receipts')
        .update({
          vendor: data.vendor || null,
          total: data.total ? parseFloat(data.total) : null,
          receipt_date: data.receipt_date || null,
          category: data.category,
          status: 'saved', // Mark as reviewed/saved
          updated_at: new Date().toISOString(),
        })
        .eq('id', receipt.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-receipts'] });
      toast.success('Receipt updated successfully');
      onClose();
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast.error('Failed to update receipt');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const getConfidenceBadge = (field: keyof NonNullable<ReceiptData['confidence']>) => {
    const confidence = receipt.confidence?.[field];
    if (confidence === undefined) return null;
    
    if (confidence >= 0.8) {
      return <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">High</Badge>;
    } else if (confidence >= 0.5) {
      return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700">Medium</Badge>;
    } else {
      return <Badge variant="secondary" className="text-xs bg-red-100 text-red-700">Low</Badge>;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5" />
            Edit Receipt - OCR Correction
          </DialogTitle>
          <DialogDescription>
            Review and correct AI-extracted data. Fields with low confidence are highlighted.
          </DialogDescription>
        </DialogHeader>

        {/* Warnings */}
        {receipt.warnings && receipt.warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">AI Extraction Warnings</p>
              <ul className="text-xs text-yellow-700 mt-1 list-disc list-inside">
                {receipt.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Image Preview */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Receipt Image
            </Label>
            <div className="border rounded-lg overflow-hidden bg-muted aspect-[3/4] flex items-center justify-center">
              {imageLoading ? (
                <div className="animate-pulse text-muted-foreground">Loading...</div>
              ) : imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt="Receipt" 
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-muted-foreground text-sm">No image available</div>
              )}
            </div>
          </div>

          {/* Form Fields */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Vendor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="vendor">Vendor Name</Label>
                {getConfidenceBadge('vendor')}
              </div>
              <Input
                id="vendor"
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                placeholder="Enter vendor name"
                className={receipt.confidence?.vendor && receipt.confidence.vendor < 0.5 ? 'border-yellow-400' : ''}
              />
            </div>

            {/* Total */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="total">Total Amount (฿)</Label>
                {getConfidenceBadge('total')}
              </div>
              <Input
                id="total"
                type="number"
                step="0.01"
                value={formData.total}
                onChange={(e) => setFormData({ ...formData, total: e.target.value })}
                placeholder="0.00"
                className={receipt.confidence?.total && receipt.confidence.total < 0.5 ? 'border-yellow-400' : ''}
              />
            </div>

            {/* Date */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="date">Receipt Date</Label>
                {getConfidenceBadge('date')}
              </div>
              <Input
                id="date"
                type="date"
                value={formData.receipt_date}
                onChange={(e) => setFormData({ ...formData, receipt_date: e.target.value })}
                className={receipt.confidence?.date && receipt.confidence.date < 0.5 ? 'border-yellow-400' : ''}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="category">Category</Label>
                {getConfidenceBadge('category')}
              </div>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger className={receipt.confidence?.category && receipt.confidence.category < 0.5 ? 'border-yellow-400' : ''}>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Badge */}
            <div className="pt-2">
              <Label className="text-muted-foreground text-xs">Current Status</Label>
              <div className="mt-1">
                {receipt.status === 'needs_review' ? (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                    Needs Review
                  </Badge>
                ) : receipt.status === 'saved' ? (
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    Saved
                  </Badge>
                ) : (
                  <Badge variant="outline">{receipt.status}</Badge>
                )}
              </div>
            </div>
          </form>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={updateMutation.isPending}
          >
            <Check className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
