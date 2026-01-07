import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, Save, Trash2, Receipt, Calendar, Store, 
  FileText, Building2
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
  { value: 'food', labelTh: 'อาหาร', labelEn: 'Food' },
  { value: 'transport', labelTh: 'ค่าเดินทาง', labelEn: 'Transport' },
  { value: 'utilities', labelTh: 'สาธารณูปโภค', labelEn: 'Utilities' },
  { value: 'office', labelTh: 'อุปกรณ์สำนักงาน', labelEn: 'Office' },
  { value: 'other', labelTh: 'อื่นๆ', labelEn: 'Other' },
];

export default function ReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { employee, locale } = usePortal();
  const dateLocale = locale === 'th' ? th : enUS;

  const [formData, setFormData] = useState({
    vendor: '',
    total: '',
    receipt_date: '',
    category: '',
    description: '',
    business_id: '',
  });

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
        total: data.total?.toString() || '',
        receipt_date: data.receipt_date || '',
        category: data.category || '',
        description: data.description || '',
        business_id: data.business_id || '',
      });
      
      return data;
    },
    enabled: !!id,
  });

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

  // Get public URL for receipt image
  const imageUrl = useMemo(() => {
    const receiptFile = receipt?.receipt_files?.[0];
    if (!receiptFile?.storage_path) return null;
    const { data } = supabase.storage.from('receipt-files').getPublicUrl(receiptFile.storage_path);
    return data?.publicUrl;
  }, [receipt]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('receipts')
        .update({
          vendor: formData.vendor || null,
          total: formData.total ? parseFloat(formData.total) : null,
          receipt_date: formData.receipt_date || null,
          category: formData.category || null,
          description: formData.description || null,
          business_id: formData.business_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(locale === 'th' ? 'บันทึกสำเร็จ' : 'Saved successfully');
      queryClient.invalidateQueries({ queryKey: ['my-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['receipt-detail', id] });
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

      {/* Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {locale === 'th' ? 'รายละเอียด' : 'Details'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Vendor Name */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              {locale === 'th' ? 'ชื่อร้าน' : 'Vendor'}
            </Label>
            <Input
              value={formData.vendor}
              onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
              placeholder={locale === 'th' ? 'ชื่อร้านค้า/บริษัท' : 'Store/company name'}
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>{locale === 'th' ? 'จำนวนเงิน (บาท)' : 'Amount (THB)'}</Label>
            <Input
              type="number"
              value={formData.total}
              onChange={(e) => setFormData({ ...formData, total: e.target.value })}
              placeholder="0.00"
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {locale === 'th' ? 'วันที่ใบเสร็จ' : 'Receipt Date'}
            </Label>
            <Input
              type="date"
              value={formData.receipt_date}
              onChange={(e) => setFormData({ ...formData, receipt_date: e.target.value })}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>{locale === 'th' ? 'หมวดหมู่' : 'Category'}</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={locale === 'th' ? 'เลือกหมวดหมู่' : 'Select category'} />
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

          {/* Business */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {locale === 'th' ? 'ธุรกิจ' : 'Business'}
            </Label>
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

          {/* Description */}
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
