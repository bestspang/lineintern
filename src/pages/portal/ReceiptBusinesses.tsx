import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { 
  ArrowLeft, Building2, Plus, Star, Trash2, Pencil
} from 'lucide-react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { portalApi } from '@/lib/portal-api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { formatBangkokISODate } from '@/lib/timezone';

interface Business {
  id: string;
  name: string;
  is_default: boolean | null;
  tax_id: string | null;
  created_at: string | null;
}

export default function ReceiptBusinesses() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { employee, locale } = usePortal();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    tax_id: '',
    is_default: false,
  });

  // Fetch businesses via portal API (bypasses RLS)
  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['my-businesses', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data, error } = await portalApi<Business[]>({
        endpoint: 'my-businesses',
        employee_id: employee.id
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
  });

  // Fetch quota via portal API (bypasses RLS)
  const { data: quota } = useQuery({
    queryKey: ['my-quota', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return null;
      const { data, error } = await portalApi<{ used: number; limit: number; planName: string }>({
        endpoint: 'my-receipt-quota',
        employee_id: employee.id
      });
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id,
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingBusiness) {
        // Update
        const { error } = await supabase
          .from('receipt_businesses')
          .update({
            name: formData.name,
            tax_id: formData.tax_id || null,
            is_default: formData.is_default,
          })
          .eq('id', editingBusiness.id);
        if (error) throw error;

        // If setting as default, unset others
        if (formData.is_default) {
          await supabase
            .from('receipt_businesses')
            .update({ is_default: false })
            .eq('line_user_id', employee?.line_user_id)
            .neq('id', editingBusiness.id);
        }
      } else {
        // Create
        const { error } = await supabase
          .from('receipt_businesses')
          .insert({
            line_user_id: employee?.line_user_id,
            name: formData.name,
            tax_id: formData.tax_id || null,
            is_default: formData.is_default || businesses.length === 0,
          });
        if (error) throw error;

        // If setting as default, unset others
        if (formData.is_default && businesses.length > 0) {
          await supabase
            .from('receipt_businesses')
            .update({ is_default: false })
            .eq('line_user_id', employee?.line_user_id);
        }
      }
    },
    onSuccess: () => {
      toast.success(
        editingBusiness 
          ? (locale === 'th' ? 'แก้ไขสำเร็จ' : 'Updated successfully')
          : (locale === 'th' ? 'เพิ่มธุรกิจสำเร็จ' : 'Business added successfully')
      );
      queryClient.invalidateQueries({ queryKey: ['my-businesses'] });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error(locale === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (businessId: string) => {
      const { error } = await supabase
        .from('receipt_businesses')
        .delete()
        .eq('id', businessId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(locale === 'th' ? 'ลบสำเร็จ' : 'Deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['my-businesses'] });
    },
    onError: () => {
      toast.error(locale === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred');
    },
  });

  const resetForm = () => {
    setFormData({ name: '', tax_id: '', is_default: false });
    setEditingBusiness(null);
  };

  const openEditDialog = (business: Business) => {
    setEditingBusiness(business);
    setFormData({
      name: business.name,
      tax_id: business.tax_id || '',
      is_default: business.is_default || false,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/my-receipts')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {locale === 'th' ? 'จัดการธุรกิจ' : 'Manage Businesses'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === 'th' ? 'แยกใบเสร็จตามธุรกิจ' : 'Organize receipts by business'}
          </p>
        </div>
      </div>

      {/* Quota Card */}
      <Card className="bg-gradient-to-br from-violet-500 to-violet-600 text-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">
                {locale === 'th' ? 'โควตา AI เดือนนี้' : 'AI Quota This Month'}
              </p>
              <p className="text-2xl font-bold">
                {quota?.used || 0} / {quota?.limit || 5}
              </p>
            </div>
            <div className="text-right">
              <Badge variant="secondary" className="bg-white/20 text-white">
                {quota?.planName || 'Free'}
              </Badge>
              <p className="text-xs opacity-80 mt-1">
                {locale === 'th' ? 'รายการ AI ที่ใช้' : 'AI extractions used'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {locale === 'th' ? 'ธุรกิจของคุณ' : 'Your Businesses'}
          </h3>
          <Dialog open={dialogOpen} onOpenChange={(open) => { 
            setDialogOpen(open); 
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                {locale === 'th' ? 'เพิ่ม' : 'Add'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingBusiness 
                    ? (locale === 'th' ? 'แก้ไขธุรกิจ' : 'Edit Business')
                    : (locale === 'th' ? 'เพิ่มธุรกิจใหม่' : 'Add New Business')}
                </DialogTitle>
                <DialogDescription>
                  {locale === 'th' 
                    ? 'กรอกข้อมูลธุรกิจของคุณ'
                    : 'Enter your business information'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{locale === 'th' ? 'ชื่อธุรกิจ' : 'Business Name'} *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={locale === 'th' ? 'เช่น บริษัท ABC จำกัด' : 'e.g. ABC Company Ltd.'}
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
                <div className="flex items-center justify-between">
                  <Label>{locale === 'th' ? 'ตั้งเป็นค่าเริ่มต้น' : 'Set as default'}</Label>
                  <Switch
                    checked={formData.is_default}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                </Button>
                <Button 
                  onClick={() => saveMutation.mutate()}
                  disabled={!formData.name || saveMutation.isPending}
                >
                  {saveMutation.isPending 
                    ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') 
                    : (locale === 'th' ? 'บันทึก' : 'Save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : businesses.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {locale === 'th' ? 'ยังไม่มีธุรกิจ' : 'No businesses yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {locale === 'th' 
                  ? 'เพิ่มธุรกิจเพื่อจัดหมวดหมู่ใบเสร็จ' 
                  : 'Add a business to categorize receipts'}
              </p>
            </CardContent>
          </Card>
        ) : (
          businesses.map((business) => (
            <Card key={business.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{business.name}</p>
                      {business.is_default && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                          <Star className="h-3 w-3 mr-1" />
                          {locale === 'th' ? 'หลัก' : 'Default'}
                        </Badge>
                      )}
                    </div>
                    {business.tax_id && (
                      <p className="text-sm text-muted-foreground">
                        Tax ID: {business.tax_id}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => openEditDialog(business)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {locale === 'th' ? 'ยืนยันการลบ?' : 'Confirm delete?'}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {locale === 'th' 
                              ? 'ธุรกิจนี้จะถูกลบ แต่ใบเสร็จที่เกี่ยวข้องจะยังคงอยู่'
                              : 'This business will be deleted but related receipts will remain.'}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                          </AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteMutation.mutate(business.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {locale === 'th' ? 'ลบ' : 'Delete'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
