import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { Check, X, Edit2, Image as ImageIcon, AlertTriangle, ZoomIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReceiptData {
  id: string;
  vendor: string | null;
  vendor_address: string | null;
  vendor_branch: string | null;
  tax_id: string | null;
  receipt_number: string | null;
  total: number | null;
  subtotal: number | null;
  vat: number | null;
  receipt_date: string | null;
  category: string | null;
  payment_method: string | null;
  payer_name: string | null;
  card_number_masked: string | null;
  card_type: string | null;
  description: string | null;
  notes: string | null;
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

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash (เงินสด)' },
  { value: 'visa', label: 'VISA' },
  { value: 'mastercard', label: 'MasterCard' },
  { value: 'jcb', label: 'JCB' },
  { value: 'amex', label: 'American Express' },
  { value: 'unionpay', label: 'UnionPay' },
  { value: 'promptpay', label: 'PromptPay/QR' },
  { value: 'transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
];

const CARD_TYPES = [
  { value: 'credit', label: 'Credit Card' },
  { value: 'debit', label: 'Debit Card' },
];

// Normalize category value to match Select options
const normalizeCategory = (cat: string | null): string => {
  if (!cat) return 'other';
  
  const lowerCat = cat.toLowerCase();
  
  // Match by exact value
  const exactMatch = CATEGORIES.find(c => c.value === lowerCat);
  if (exactMatch) return exactMatch.value;
  
  // Match by label (case-insensitive)
  const labelMatch = CATEGORIES.find(
    c => c.label.toLowerCase() === lowerCat ||
         c.labelTh === cat
  );
  if (labelMatch) return labelMatch.value;
  
  // Partial matching
  if (lowerCat.includes('food') || lowerCat.includes('dining') || lowerCat.includes('อาหาร')) return 'food';
  if (lowerCat.includes('transport') || lowerCat.includes('ขนส่ง')) return 'transport';
  if (lowerCat.includes('utilit') || lowerCat.includes('สาธารณูปโภค')) return 'utilities';
  if (lowerCat.includes('office') || lowerCat.includes('สำนักงาน')) return 'office';
  if (lowerCat.includes('software') || lowerCat.includes('ซอฟต์แวร์')) return 'software';
  if (lowerCat.includes('market') || lowerCat.includes('การตลาด')) return 'marketing';
  
  return 'other';
};

export function ReceiptInlineEdit({ receipt, onClose }: ReceiptInlineEditProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    vendor: receipt.vendor || '',
    vendor_address: receipt.vendor_address || '',
    vendor_branch: receipt.vendor_branch || '',
    tax_id: receipt.tax_id || '',
    receipt_number: receipt.receipt_number || '',
    receipt_date: receipt.receipt_date || '',
    subtotal: receipt.subtotal?.toString() || '',
    vat: receipt.vat?.toString() || '',
    total: receipt.total?.toString() || '',
    category: normalizeCategory(receipt.category),
    payment_method: receipt.payment_method || '',
    payer_name: receipt.payer_name || '',
    card_number_masked: receipt.card_number_masked || '',
    card_type: receipt.card_type || '',
    description: receipt.description || '',
    notes: receipt.notes || '',
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);

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
          const { data, error } = await supabase.storage
            .from('receipt-files')
            .createSignedUrl(files.storage_path, 3600);
          
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

    if (newData.vendor !== (receipt.vendor || '')) {
      corrections.push({
        receipt_id: receipt.id,
        field_name: 'vendor',
        original_value: receipt.vendor,
        corrected_value: newData.vendor || null,
        original_confidence: receipt.confidence?.vendor || null,
      });
    }

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

    if (newData.receipt_date !== (receipt.receipt_date || '')) {
      corrections.push({
        receipt_id: receipt.id,
        field_name: 'receipt_date',
        original_value: receipt.receipt_date,
        corrected_value: newData.receipt_date || null,
        original_confidence: receipt.confidence?.date || null,
      });
    }

    if (newData.category !== (receipt.category || 'other')) {
      corrections.push({
        receipt_id: receipt.id,
        field_name: 'category',
        original_value: receipt.category,
        corrected_value: newData.category,
        original_confidence: receipt.confidence?.category || null,
      });
    }

    if (corrections.length > 0) {
      await supabase.from('receipt_ocr_corrections').insert(corrections);
    }
  };

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await logCorrections(data);

      const { error } = await supabase
        .from('receipts')
        .update({
          vendor: data.vendor || null,
          vendor_address: data.vendor_address || null,
          vendor_branch: data.vendor_branch || null,
          tax_id: data.tax_id || null,
          receipt_number: data.receipt_number || null,
          receipt_date: data.receipt_date || null,
          subtotal: data.subtotal ? parseFloat(data.subtotal) : null,
          vat: data.vat ? parseFloat(data.vat) : null,
          total: data.total ? parseFloat(data.total) : null,
          category: data.category,
          payment_method: data.payment_method || null,
          payer_name: data.payer_name || null,
          card_number_masked: data.card_number_masked || null,
          card_type: data.card_type || null,
          description: data.description || null,
          notes: data.notes || null,
          status: 'saved',
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

  // Close zoom on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isZoomed) {
        setIsZoomed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);

  return (
    <>
      {/* Zoom Overlay */}
      {isZoomed && imageUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <img 
            src={imageUrl} 
            alt="Receipt" 
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setIsZoomed(false)}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      )}

      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
              <div 
                className="border rounded-lg overflow-hidden bg-muted aspect-[3/4] flex items-center justify-center relative cursor-pointer group"
                onClick={() => imageUrl && setIsZoomed(true)}
              >
                {imageLoading ? (
                  <div className="animate-pulse text-muted-foreground">Loading...</div>
                ) : imageUrl ? (
                  <>
                    <img 
                      src={imageUrl} 
                      alt="Receipt" 
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white px-3 py-2 rounded-lg flex items-center gap-2">
                        <ZoomIn className="h-4 w-4" />
                        Click to zoom
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">No image available</div>
                )}
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
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Section: Vendor Information */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                  ข้อมูลร้านค้า (Vendor Information)
                </h3>
                
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

                <div className="space-y-2">
                  <Label htmlFor="vendor_address">Address (ที่อยู่)</Label>
                  <Textarea
                    id="vendor_address"
                    value={formData.vendor_address}
                    onChange={(e) => setFormData({ ...formData, vendor_address: e.target.value })}
                    placeholder="Vendor address"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="vendor_branch">Branch (สาขา)</Label>
                    <Input
                      id="vendor_branch"
                      value={formData.vendor_branch}
                      onChange={(e) => setFormData({ ...formData, vendor_branch: e.target.value })}
                      placeholder="Branch name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_id">Tax ID (เลขผู้เสียภาษี)</Label>
                    <Input
                      id="tax_id"
                      value={formData.tax_id}
                      onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                      placeholder="13-digit tax ID"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Receipt Details */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                  ข้อมูลใบเสร็จ (Receipt Details)
                </h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="receipt_number">Receipt No.</Label>
                    <Input
                      id="receipt_number"
                      value={formData.receipt_number}
                      onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                      placeholder="Receipt number"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="date">Date</Label>
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
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="category">Category (หมวดหมู่)</Label>
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
                          {cat.label} ({cat.labelTh})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Section: Amounts */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                  ยอดเงิน (Amounts)
                </h3>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="subtotal">Subtotal (฿)</Label>
                    <Input
                      id="subtotal"
                      type="number"
                      step="0.01"
                      value={formData.subtotal}
                      onChange={(e) => setFormData({ ...formData, subtotal: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vat">VAT (฿)</Label>
                    <Input
                      id="vat"
                      type="number"
                      step="0.01"
                      value={formData.vat}
                      onChange={(e) => setFormData({ ...formData, vat: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="total">Total (฿)</Label>
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
                </div>
              </div>

              {/* Section: Payment */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                  การชำระเงิน (Payment)
                </h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="payment_method">Payment Method</Label>
                    <Select 
                      value={formData.payment_method} 
                      onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_number_masked">Card Number</Label>
                    <Input
                      id="card_number_masked"
                      value={formData.card_number_masked}
                      onChange={(e) => setFormData({ ...formData, card_number_masked: e.target.value })}
                      placeholder="**** **** **** 1234"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="card_type">Card Type</Label>
                    <Select 
                      value={formData.card_type} 
                      onValueChange={(value) => setFormData({ ...formData, card_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {CARD_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payer_name">Payer Name</Label>
                    <Input
                      id="payer_name"
                      value={formData.payer_name}
                      onChange={(e) => setFormData({ ...formData, payer_name: e.target.value })}
                      placeholder="Name on card"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Notes */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">
                  หมายเหตุ (Notes)
                </h3>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description (รายละเอียด)</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Item description from receipt"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (หมายเหตุ)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes"
                    rows={2}
                  />
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
    </>
  );
}
