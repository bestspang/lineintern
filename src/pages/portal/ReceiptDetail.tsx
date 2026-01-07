import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { 
  ArrowLeft, Save, Trash2, Receipt, Calendar, Store, 
  FileText, Building2, CreditCard, Hash, MapPin, Plus, X
} from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const CATEGORIES = [
  { value: 'Food & Dining', labelTh: 'อาหาร', labelEn: 'Food & Dining' },
  { value: 'Transportation', labelTh: 'ค่าเดินทาง', labelEn: 'Transportation' },
  { value: 'Utilities', labelTh: 'สาธารณูปโภค', labelEn: 'Utilities' },
  { value: 'Office Supplies', labelTh: 'อุปกรณ์สำนักงาน', labelEn: 'Office Supplies' },
  { value: 'Software', labelTh: 'ซอฟต์แวร์', labelEn: 'Software' },
  { value: 'Marketing', labelTh: 'การตลาด', labelEn: 'Marketing' },
  { value: 'Professional Services', labelTh: 'บริการวิชาชีพ', labelEn: 'Professional Services' },
  { value: 'Other', labelTh: 'อื่นๆ', labelEn: 'Other' },
];

interface ReceiptItem {
  id?: string;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number;
}

export default function ReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { employee, locale } = usePortal();
  const dateLocale = locale === 'th' ? th : enUS;

  const [formData, setFormData] = useState({
    vendor: '',
    vendor_address: '',
    vendor_branch: '',
    tax_id: '',
    receipt_number: '',
    total: '',
    receipt_date: '',
    category: '',
    description: '',
    business_id: '',
    payment_method: '',
    card_number_masked: '',
    payer_name: '',
  });

  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Fetch receipt
  const { data: receipt, isLoading } = useQuery({
    queryKey: ['receipt-detail', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('receipts')
        .select('*, receipt_files(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      
      // Populate form
      setFormData({
        vendor: data.vendor || '',
        vendor_address: data.vendor_address || '',
        vendor_branch: data.vendor_branch || '',
        tax_id: data.tax_id || '',
        receipt_number: data.receipt_number || '',
        total: data.total?.toString() || '',
        receipt_date: data.receipt_date || '',
        category: data.category || '',
        description: data.description || '',
        business_id: data.business_id || '',
        payment_method: data.payment_method || '',
        card_number_masked: data.card_number_masked || '',
        payer_name: data.payer_name || '',
      });
      
      return data;
    },
    enabled: !!id,
  });

  // Fetch receipt items
  const { data: receiptItems = [] } = useQuery({
    queryKey: ['receipt-items', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('receipt_items')
        .select('*')
        .eq('receipt_id', id)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Set items when fetched
  useEffect(() => {
    if (receiptItems.length > 0) {
      setItems(receiptItems.map(item => ({
        id: item.id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        amount: item.amount,
      })));
    }
  }, [receiptItems]);

  // Fetch receipt image
  useEffect(() => {
    async function fetchImage() {
      if (!receipt?.receipt_files?.[0]?.storage_path) return;
      
      const { data } = await supabase.storage
        .from('receipt-files')
        .createSignedUrl(receipt.receipt_files[0].storage_path, 3600);
      
      if (data?.signedUrl) {
        setImageUrl(data.signedUrl);
      }
    }
    fetchImage();
  }, [receipt]);

  // Fetch businesses
  const { data: businesses = [] } = useQuery({
    queryKey: ['my-businesses', employee?.line_user_id],
    queryFn: async () => {
      if (!employee?.line_user_id) return [];
      const { data, error } = await supabase
        .from('receipt_businesses')
        .select('id, name, is_default')
        .eq('line_user_id', employee.line_user_id)
        .order('is_default', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.line_user_id,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      // Update receipt
      const { error: receiptError } = await supabase
        .from('receipts')
        .update({
          vendor: formData.vendor || null,
          vendor_address: formData.vendor_address || null,
          vendor_branch: formData.vendor_branch || null,
          tax_id: formData.tax_id || null,
          receipt_number: formData.receipt_number || null,
          total: formData.total ? parseFloat(formData.total) : null,
          receipt_date: formData.receipt_date || null,
          category: formData.category || null,
          description: formData.description || null,
          business_id: formData.business_id || null,
          payment_method: formData.payment_method || null,
          card_number_masked: formData.card_number_masked || null,
          payer_name: formData.payer_name || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (receiptError) throw receiptError;

      // Delete existing items and re-insert
      await supabase.from('receipt_items').delete().eq('receipt_id', id);
      
      if (items.length > 0) {
        const itemsToInsert = items.map((item, index) => ({
          receipt_id: id,
          item_name: item.item_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          amount: item.amount,
          sort_order: index,
        }));
        
        const { error: itemsError } = await supabase
          .from('receipt_items')
          .insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }
    },
    onSuccess: () => {
      toast.success(locale === 'th' ? 'บันทึกสำเร็จ' : 'Saved successfully');
      queryClient.invalidateQueries({ queryKey: ['my-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['receipt-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['receipt-items', id] });
    },
    onError: () => {
      toast.error(locale === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('receipts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(locale === 'th' ? 'ลบสำเร็จ' : 'Deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['my-receipts'] });
      navigate('/portal/my-receipts');
    },
    onError: () => {
      toast.error(locale === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred');
    },
  });

  // Item management
  const addItem = () => {
    setItems([...items, { item_name: '', quantity: 1, unit: null, unit_price: null, amount: 0 }]);
  };

  const updateItem = (index: number, field: keyof ReceiptItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-calculate amount if quantity and unit_price are set
    if ((field === 'quantity' || field === 'unit_price') && newItems[index].quantity && newItems[index].unit_price) {
      newItems[index].amount = newItems[index].quantity! * newItems[index].unit_price!;
    }
    
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="text-center py-12">
        <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">
          {locale === 'th' ? 'ไม่พบใบเสร็จ' : 'Receipt not found'}
        </p>
        <Button variant="outline" onClick={() => navigate('/portal/my-receipts')} className="mt-4">
          {locale === 'th' ? 'กลับ' : 'Go back'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/my-receipts')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {locale === 'th' ? 'แก้ไขใบเสร็จ' : 'Edit Receipt'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {receipt.created_at && format(new Date(receipt.created_at), 'd MMM yyyy HH:mm', { locale: dateLocale })}
          </p>
        </div>
      </div>

      {/* Receipt Image */}
      {imageUrl && (
        <Card>
          <CardContent className="p-2">
            <img
              src={imageUrl}
              alt="Receipt"
              className="w-full max-h-64 object-contain rounded-lg bg-muted"
            />
          </CardContent>
        </Card>
      )}

      {/* Vendor Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="h-4 w-4" />
            {locale === 'th' ? 'ข้อมูลร้านค้า' : 'Vendor Info'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{locale === 'th' ? 'ชื่อบริษัท/ร้านค้า' : 'Company/Vendor Name'}</Label>
            <Input
              value={formData.vendor}
              onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
              placeholder={locale === 'th' ? 'ชื่อเต็มบริษัท' : 'Full company name'}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-3 w-3" />
              {locale === 'th' ? 'ที่อยู่' : 'Address'}
            </Label>
            <Textarea
              value={formData.vendor_address}
              onChange={(e) => setFormData({ ...formData, vendor_address: e.target.value })}
              placeholder={locale === 'th' ? 'ที่อยู่เต็ม' : 'Full address'}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{locale === 'th' ? 'สาขา' : 'Branch'}</Label>
              <Input
                value={formData.vendor_branch}
                onChange={(e) => setFormData({ ...formData, vendor_branch: e.target.value })}
                placeholder={locale === 'th' ? 'ชื่อสาขา' : 'Branch name'}
              />
            </div>
            <div className="space-y-2">
              <Label>{locale === 'th' ? 'เลขผู้เสียภาษี' : 'Tax ID'}</Label>
              <Input
                value={formData.tax_id}
                onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                placeholder="0000000000000"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Receipt Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {locale === 'th' ? 'รายละเอียดใบเสร็จ' : 'Receipt Details'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Hash className="h-3 w-3" />
                {locale === 'th' ? 'เลขที่ใบเสร็จ' : 'Receipt No.'}
              </Label>
              <Input
                value={formData.receipt_number}
                onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                {locale === 'th' ? 'วันที่' : 'Date'}
              </Label>
              <Input
                type="date"
                value={formData.receipt_date}
                onChange={(e) => setFormData({ ...formData, receipt_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{locale === 'th' ? 'จำนวนเงิน (บาท)' : 'Amount (THB)'}</Label>
              <Input
                type="number"
                value={formData.total}
                onChange={(e) => setFormData({ ...formData, total: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>{locale === 'th' ? 'หมวดหมู่' : 'Category'}</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={locale === 'th' ? 'เลือก' : 'Select'} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {locale === 'th' ? cat.labelTh : cat.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {locale === 'th' ? 'รายการสินค้า' : 'Items'}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" />
            {locale === 'th' ? 'เพิ่ม' : 'Add'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {locale === 'th' ? 'ไม่มีรายการ' : 'No items'}
            </p>
          ) : (
            items.map((item, index) => (
              <div key={index} className="flex gap-2 items-start border rounded-lg p-3">
                <div className="flex-1 space-y-2">
                  <Input
                    placeholder={locale === 'th' ? 'ชื่อสินค้า' : 'Item name'}
                    value={item.item_name}
                    onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <Input
                      type="number"
                      placeholder={locale === 'th' ? 'จำนวน' : 'Qty'}
                      value={item.quantity ?? ''}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value ? parseFloat(e.target.value) : null)}
                    />
                    <Input
                      placeholder={locale === 'th' ? 'หน่วย' : 'Unit'}
                      value={item.unit ?? ''}
                      onChange={(e) => updateItem(index, 'unit', e.target.value || null)}
                    />
                    <Input
                      type="number"
                      placeholder={locale === 'th' ? 'ราคา/หน่วย' : 'Price'}
                      value={item.unit_price ?? ''}
                      onChange={(e) => updateItem(index, 'unit_price', e.target.value ? parseFloat(e.target.value) : null)}
                    />
                    <Input
                      type="number"
                      placeholder={locale === 'th' ? 'รวม' : 'Total'}
                      value={item.amount || ''}
                      onChange={(e) => updateItem(index, 'amount', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Payment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {locale === 'th' ? 'การชำระเงิน' : 'Payment'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{locale === 'th' ? 'วิธีจ่าย' : 'Method'}</Label>
              <Input
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                placeholder="VISA, Cash, QR..."
              />
            </div>
            <div className="space-y-2">
              <Label>{locale === 'th' ? 'เลขบัตร' : 'Card No.'}</Label>
              <Input
                value={formData.card_number_masked}
                onChange={(e) => setFormData({ ...formData, card_number_masked: e.target.value })}
                placeholder="XXXX XXXX XXXX 1234"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{locale === 'th' ? 'ชื่อผู้จ่าย' : 'Payer Name'}</Label>
            <Input
              value={formData.payer_name}
              onChange={(e) => setFormData({ ...formData, payer_name: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Business & Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {locale === 'th' ? 'ธุรกิจ & หมายเหตุ' : 'Business & Notes'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{locale === 'th' ? 'ธุรกิจ' : 'Business'}</Label>
            <Select
              value={formData.business_id}
              onValueChange={(value) => setFormData({ ...formData, business_id: value })}
            >
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

          <div className="space-y-2">
            <Label>{locale === 'th' ? 'หมายเหตุ' : 'Notes'}</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={locale === 'th' ? 'หมายเหตุเพิ่มเติม' : 'Additional notes'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t">
        <div className="flex gap-3 max-w-lg mx-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="lg" className="flex-1">
                <Trash2 className="h-4 w-4 mr-2" />
                {locale === 'th' ? 'ลบ' : 'Delete'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {locale === 'th' ? 'ยืนยันการลบ?' : 'Confirm delete?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {locale === 'th' 
                    ? 'ใบเสร็จนี้จะถูกลบถาวรและไม่สามารถกู้คืนได้'
                    : 'This receipt will be permanently deleted and cannot be recovered.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                </AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {locale === 'th' ? 'ลบ' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button 
            size="lg" 
            className="flex-1"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending 
              ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') 
              : (locale === 'th' ? 'บันทึก' : 'Save')}
          </Button>
        </div>
      </div>
    </div>
  );
}