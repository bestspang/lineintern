/**
 * LIFF Receipt Edit - Mobile-optimized receipt editing in LINE app
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useLiff } from '@/contexts/LiffContext';
import { supabase } from '@/integrations/supabase/client';
import LiffLayout from './LiffLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  Save, Check, Trash2, Receipt, Store, Calendar, 
  DollarSign, Tag, Loader2, ImageIcon 
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  { value: 'food', label: 'อาหาร', icon: '🍽️' },
  { value: 'transport', label: 'การเดินทาง', icon: '🚗' },
  { value: 'supplies', label: 'วัสดุสิ้นเปลือง', icon: '📦' },
  { value: 'utilities', label: 'สาธารณูปโภค', icon: '💡' },
  { value: 'marketing', label: 'การตลาด', icon: '📢' },
  { value: 'equipment', label: 'อุปกรณ์', icon: '🛠️' },
  { value: 'services', label: 'บริการ', icon: '💼' },
  { value: 'other', label: 'อื่นๆ', icon: '📋' },
];

interface ReceiptData {
  id: string;
  vendor: string | null;
  receipt_date: string | null;
  total: number | null;
  currency: string | null;
  category: string | null;
  status: string;
  description: string | null;
  confidence: any;
}

export default function LiffReceiptEdit() {
  const { id } = useParams<{ id: string }>();
  const { profile, closeLiff } = useLiff();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    const fetchReceipt = async () => {
      if (!id || !profile?.userId) return;

      const { data, error } = await supabase
        .from('receipts')
        .select('id, vendor, receipt_date, total, currency, category, status, description, confidence')
        .eq('id', id)
        .eq('line_user_id', profile.userId)
        .single();

      if (error) {
        console.error('[LiffReceiptEdit] Error:', error);
        toast.error('ไม่พบใบเสร็จ');
        setLoading(false);
        return;
      }

      setReceipt(data);
      setVendor(data.vendor || '');
      setDate(data.receipt_date || '');
      setTotal(data.total?.toString() || '');
      setCategory(data.category || '');
      setDescription(data.description || '');
      setLoading(false);
    };

    fetchReceipt();
  }, [id, profile?.userId]);

  const handleSave = async () => {
    if (!id || !receipt) return;

    setSaving(true);
    try {
      // Track original values for OCR correction logging
      const originalData = {
        vendor: receipt.vendor,
        receipt_date: receipt.receipt_date,
        total: receipt.total,
        category: receipt.category,
      };

      const newData = {
        vendor: vendor || null,
        receipt_date: date || null,
        total: total ? parseFloat(total) : null,
        category: category || null,
        description: description || null,
      };

      // Update receipt
      const { error } = await supabase
        .from('receipts')
        .update(newData)
        .eq('id', id);

      if (error) throw error;

      // Log OCR corrections if AI extracted and user changed
      if (receipt.confidence) {
        const corrections: any[] = [];
        
        if (originalData.vendor !== newData.vendor && originalData.vendor) {
          corrections.push({
            receipt_id: id,
            field_name: 'vendor',
            original_value: originalData.vendor,
            corrected_value: newData.vendor,
            line_user_id: profile?.userId,
          });
        }
        
        if (originalData.total !== newData.total && originalData.total) {
          corrections.push({
            receipt_id: id,
            field_name: 'total',
            original_value: originalData.total?.toString(),
            corrected_value: newData.total?.toString(),
            line_user_id: profile?.userId,
          });
        }
        
        if (originalData.category !== newData.category && originalData.category) {
          corrections.push({
            receipt_id: id,
            field_name: 'category',
            original_value: originalData.category,
            corrected_value: newData.category,
            line_user_id: profile?.userId,
          });
        }

        if (corrections.length > 0) {
          await supabase.from('receipt_ocr_corrections').insert(corrections);
        }
      }

      toast.success('บันทึกเรียบร้อย');
      
      // Close LIFF after short delay
      setTimeout(() => {
        closeLiff();
      }, 1000);
    } catch (err: any) {
      console.error('[LiffReceiptEdit] Save error:', err);
      toast.error('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('receipts')
        .update({ status: 'confirmed' })
        .eq('id', id);

      if (error) throw error;

      toast.success('ยืนยันใบเสร็จแล้ว');
      setTimeout(() => closeLiff(), 1000);
    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('ต้องการลบใบเสร็จนี้?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('receipts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('ลบใบเสร็จแล้ว');
      setTimeout(() => closeLiff(), 1000);
    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LiffLayout title="แก้ไขใบเสร็จ">
        <div className="p-4 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </LiffLayout>
    );
  }

  if (!receipt) {
    return (
      <LiffLayout title="แก้ไขใบเสร็จ">
        <div className="p-4 text-center">
          <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">ไม่พบใบเสร็จ</p>
        </div>
      </LiffLayout>
    );
  }

  return (
    <LiffLayout title="แก้ไขใบเสร็จ">
      <div className="p-4 space-y-4">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <Badge variant={receipt.status === 'confirmed' ? 'default' : 'secondary'}>
            {receipt.status === 'confirmed' ? '✓ ยืนยันแล้ว' : 'รอยืนยัน'}
          </Badge>
          {receipt.confidence && (
            <Badge variant="outline">🤖 AI Extracted</Badge>
          )}
        </div>

        {/* Form */}
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Vendor */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                ร้านค้า
              </Label>
              <Input 
                value={vendor} 
                onChange={(e) => setVendor(e.target.value)}
                placeholder="ชื่อร้านค้า"
              />
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                วันที่
              </Label>
              <Input 
                type="date"
                value={date} 
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {/* Total */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                ยอดรวม
              </Label>
              <Input 
                type="number"
                value={total} 
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                หมวดหมู่
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือกหมวดหมู่" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.icon} {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>รายละเอียด</Label>
              <Input 
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pb-4">
          <Button 
            variant="outline" 
            onClick={handleDelete}
            disabled={saving}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            ลบ
          </Button>
          
          {receipt.status !== 'confirmed' ? (
            <Button 
              onClick={handleConfirm}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              ยืนยัน
            </Button>
          ) : (
            <Button 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              บันทึก
            </Button>
          )}
        </div>
      </div>
    </LiffLayout>
  );
}
