import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, Receipt, Building2 } from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ReceiptDuplicateAlert } from '@/components/receipts/ReceiptDuplicateAlert';

interface Business {
  id: string;
  name: string;
  is_default: boolean | null;
}

export default function ReceiptNew() {
  const { employee, locale } = usePortal();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [vendor, setVendor] = useState('');
  const [total, setTotal] = useState('');
  const [category, setCategory] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [businessId, setBusinessId] = useState<string>('');
  const [taxId, setTaxId] = useState('');

  // Fetch businesses
  const { data: businesses = [], isLoading: businessesLoading } = useQuery({
    queryKey: ['my-businesses', employee?.line_user_id],
    queryFn: async () => {
      if (!employee?.line_user_id) return [];
      const { data, error } = await supabase
        .from('receipt_businesses')
        .select('id, name, is_default')
        .eq('line_user_id', employee.line_user_id)
        .order('is_default', { ascending: false });
      if (error) throw error;
      
      // Set default business
      const defaultBiz = data?.find((b: Business) => b.is_default);
      if (defaultBiz && !businessId) {
        setBusinessId(defaultBiz.id);
      }
      
      return data as Business[];
    },
    enabled: !!employee?.line_user_id,
  });

  // Create receipt mutation
  const createReceiptMutation = useMutation({
    mutationFn: async () => {
      if (!employee?.line_user_id) throw new Error('No user');

      const { data, error } = await supabase
        .from('receipts')
        .insert({
          line_user_id: employee.line_user_id,
          business_id: businessId || null,
          vendor: vendor || null,
          total: total ? parseFloat(total) : null,
          category: category || null,
          receipt_date: receiptDate || null,
          notes: notes || null,
          tax_id: taxId || null,
          status: 'saved',
          extraction_source: 'manual',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-receipts'] });
      toast.success(locale === 'th' ? 'บันทึกใบเสร็จแล้ว' : 'Receipt saved');
      navigate(`/portal/receipts/${data.id}`);
    },
    onError: (error) => {
      console.error('Failed to create receipt:', error);
      toast.error(locale === 'th' ? 'ไม่สามารถบันทึกได้' : 'Failed to save');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!total && !vendor) {
      toast.error(locale === 'th' ? 'กรุณากรอกยอดเงินหรือชื่อร้านค้า' : 'Please enter amount or vendor name');
      return;
    }
    createReceiptMutation.mutate();
  };

  const categories = [
    { value: 'food', label: locale === 'th' ? 'อาหาร/เครื่องดื่ม' : 'Food & Beverage' },
    { value: 'transport', label: locale === 'th' ? 'การเดินทาง' : 'Transportation' },
    { value: 'utilities', label: locale === 'th' ? 'สาธารณูปโภค' : 'Utilities' },
    { value: 'office', label: locale === 'th' ? 'อุปกรณ์สำนักงาน' : 'Office Supplies' },
    { value: 'entertainment', label: locale === 'th' ? 'บันเทิง' : 'Entertainment' },
    { value: 'other', label: locale === 'th' ? 'อื่นๆ' : 'Other' },
  ];

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/my-receipts')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {locale === 'th' ? 'เพิ่มใบเสร็จใหม่' : 'Add New Receipt'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === 'th' ? 'กรอกข้อมูลใบเสร็จด้วยตนเอง' : 'Manual receipt entry'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              {locale === 'th' ? 'ข้อมูลใบเสร็จ' : 'Receipt Details'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Business Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {locale === 'th' ? 'ธุรกิจ' : 'Business'}
              </Label>
              <Select value={businessId} onValueChange={setBusinessId}>
                <SelectTrigger>
                  <SelectValue placeholder={locale === 'th' ? 'เลือกธุรกิจ' : 'Select business'} />
                </SelectTrigger>
                <SelectContent>
                  {businesses.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.is_default && '⭐'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vendor */}
            <div className="space-y-2">
              <Label htmlFor="vendor">
                {locale === 'th' ? 'ร้านค้า/ผู้ขาย' : 'Vendor/Store'}
              </Label>
              <Input
                id="vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder={locale === 'th' ? 'เช่น 7-Eleven, Big C' : 'e.g. 7-Eleven, Starbucks'}
              />
            </div>

            {/* Total Amount */}
            <div className="space-y-2">
              <Label htmlFor="total">
                {locale === 'th' ? 'ยอดเงินรวม (บาท)' : 'Total Amount (THB)'} *
              </Label>
              <Input
                id="total"
                type="number"
                step="0.01"
                min="0"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0.00"
                className="text-lg"
              />
            </div>

            {/* Receipt Date */}
            <div className="space-y-2">
              <Label htmlFor="date">
                {locale === 'th' ? 'วันที่ในใบเสร็จ' : 'Receipt Date'}
              </Label>
              <Input
                id="date"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>{locale === 'th' ? 'หมวดหมู่' : 'Category'}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder={locale === 'th' ? 'เลือกหมวดหมู่' : 'Select category'} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tax ID (optional) */}
            <div className="space-y-2">
              <Label htmlFor="taxId">
                {locale === 'th' ? 'เลขประจำตัวผู้เสียภาษี (ถ้ามี)' : 'Tax ID (optional)'}
              </Label>
              <Input
                id="taxId"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder={locale === 'th' ? '13 หลัก' : '13 digits'}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">
                {locale === 'th' ? 'หมายเหตุ' : 'Notes'}
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={locale === 'th' ? 'รายละเอียดเพิ่มเติม...' : 'Additional details...'}
                rows={3}
              />
            </div>

            {/* Duplicate Detection Alert */}
            {employee?.line_user_id && (vendor || total || receiptDate) && (
              <ReceiptDuplicateAlert
                vendor={vendor || null}
                total={total ? parseFloat(total) : null}
                receiptDate={receiptDate || null}
                lineUserId={employee.line_user_id}
              />
            )}
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-background border-t">
          <Button 
            type="submit" 
            className="w-full" 
            size="lg"
            disabled={createReceiptMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {createReceiptMutation.isPending 
              ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') 
              : (locale === 'th' ? 'บันทึกใบเสร็จ' : 'Save Receipt')}
          </Button>
        </div>
      </form>
    </div>
  );
}
