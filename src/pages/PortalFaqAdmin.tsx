import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, ArrowUp, ArrowDown, HelpCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';

interface PortalFaq {
  id: string;
  question_th: string;
  question_en: string;
  answer_th: string;
  answer_en: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { value: 'attendance', label: 'Attendance', labelTh: 'การลงเวลา' },
  { value: 'leave-ot', label: 'Leave & OT', labelTh: 'ลา & OT' },
  { value: 'points', label: 'Points & Rewards', labelTh: 'แต้มและรางวัล' },
  { value: 'general', label: 'General', labelTh: 'ทั่วไป' },
];

export default function PortalFaqAdmin() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<PortalFaq | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    question_th: '',
    question_en: '',
    answer_th: '',
    answer_en: '',
    category: 'general',
    sort_order: 0,
  });

  // Fetch FAQs
  const { data: faqs, isLoading } = useQuery({
    queryKey: ['portal-faqs-admin', search, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('portal_faqs')
        .select('*')
        .order('sort_order', { ascending: true });

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      if (search) {
        query = query.or(`question_th.ilike.%${search}%,question_en.ilike.%${search}%,answer_th.ilike.%${search}%,answer_en.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PortalFaq[];
    },
  });

  // Create FAQ
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('portal_faqs').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-faqs-admin'] });
      queryClient.invalidateQueries({ queryKey: ['portal-faqs'] });
      toast.success(t('เพิ่ม FAQ สำเร็จ', 'FAQ added successfully'));
      closeDialog();
    },
    onError: (error) => {
      toast.error(t('เกิดข้อผิดพลาด', 'Error: ') + error.message);
    },
  });

  // Update FAQ
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PortalFaq> }) => {
      const { error } = await supabase.from('portal_faqs').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-faqs-admin'] });
      queryClient.invalidateQueries({ queryKey: ['portal-faqs'] });
      toast.success(t('อัพเดท FAQ สำเร็จ', 'FAQ updated successfully'));
      closeDialog();
    },
    onError: (error) => {
      toast.error(t('เกิดข้อผิดพลาด', 'Error: ') + error.message);
    },
  });

  // Delete FAQ
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('portal_faqs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-faqs-admin'] });
      queryClient.invalidateQueries({ queryKey: ['portal-faqs'] });
      toast.success(t('ลบ FAQ สำเร็จ', 'FAQ deleted successfully'));
      setDeleteConfirmId(null);
    },
    onError: (error) => {
      toast.error(t('เกิดข้อผิดพลาด', 'Error: ') + error.message);
    },
  });

  // Toggle active status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('portal_faqs').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-faqs-admin'] });
      queryClient.invalidateQueries({ queryKey: ['portal-faqs'] });
    },
  });

  // Move sort order
  const moveSortMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const currentFaq = faqs?.find(f => f.id === id);
      if (!currentFaq) return;

      const currentIndex = faqs?.findIndex(f => f.id === id) ?? -1;
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const targetFaq = faqs?.[targetIndex];

      if (!targetFaq) return;

      // Swap sort orders
      await supabase.from('portal_faqs').update({ sort_order: targetFaq.sort_order }).eq('id', currentFaq.id);
      await supabase.from('portal_faqs').update({ sort_order: currentFaq.sort_order }).eq('id', targetFaq.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-faqs-admin'] });
      queryClient.invalidateQueries({ queryKey: ['portal-faqs'] });
    },
  });

  const openCreateDialog = () => {
    setEditingFaq(null);
    setFormData({
      question_th: '',
      question_en: '',
      answer_th: '',
      answer_en: '',
      category: 'general',
      sort_order: (faqs?.length ?? 0) + 1,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (faq: PortalFaq) => {
    setEditingFaq(faq);
    setFormData({
      question_th: faq.question_th,
      question_en: faq.question_en,
      answer_th: faq.answer_th,
      answer_en: faq.answer_en,
      category: faq.category,
      sort_order: faq.sort_order,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingFaq(null);
    setFormData({
      question_th: '',
      question_en: '',
      answer_th: '',
      answer_en: '',
      category: 'general',
      sort_order: 0,
    });
  };

  const handleSubmit = () => {
    if (!formData.question_th || !formData.question_en || !formData.answer_th || !formData.answer_en) {
      toast.error(t('กรุณากรอกข้อมูลให้ครบ', 'Please fill in all fields'));
      return;
    }

    if (editingFaq) {
      updateMutation.mutate({ id: editingFaq.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getCategoryLabel = (category: string) => {
    const cat = CATEGORIES.find(c => c.value === category);
    return cat ? t(cat.labelTh, cat.label) : category;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HelpCircle className="h-6 w-6" />
          {t('จัดการ FAQ พอร์ทัล', 'Portal FAQ Management')}
        </h1>
        <p className="text-muted-foreground">
          {t('จัดการคำถามที่พบบ่อยสำหรับ Employee Portal', 'Manage frequently asked questions for Employee Portal')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-1 gap-2 w-full sm:w-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('ค้นหา FAQ...', 'Search FAQs...')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('หมวดหมู่', 'Category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('ทั้งหมด', 'All Categories')}</SelectItem>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {t(cat.labelTh, cat.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              {t('เพิ่ม FAQ', 'Add FAQ')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : faqs?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('ไม่พบ FAQ', 'No FAQs found')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>{t('คำถาม (ไทย)', 'Question (TH)')}</TableHead>
                  <TableHead>{t('หมวดหมู่', 'Category')}</TableHead>
                  <TableHead className="w-[100px]">{t('สถานะ', 'Status')}</TableHead>
                  <TableHead className="w-[150px]">{t('จัดการ', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faqs?.map((faq, index) => (
                  <TableRow key={faq.id}>
                    <TableCell className="font-medium">{faq.sort_order}</TableCell>
                    <TableCell>
                      <div className="max-w-md">
                        <p className="font-medium truncate">{faq.question_th}</p>
                        <p className="text-sm text-muted-foreground truncate">{faq.question_en}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getCategoryLabel(faq.category)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={faq.is_active}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: faq.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveSortMutation.mutate({ id: faq.id, direction: 'up' })}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveSortMutation.mutate({ id: faq.id, direction: 'down' })}
                          disabled={index === (faqs?.length ?? 0) - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(faq)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(faq.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingFaq ? t('แก้ไข FAQ', 'Edit FAQ') : t('เพิ่ม FAQ ใหม่', 'Add New FAQ')}
            </DialogTitle>
            <DialogDescription>
              {t('กรอกข้อมูลทั้งภาษาไทยและอังกฤษ', 'Fill in both Thai and English content')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('คำถาม (ไทย)', 'Question (Thai)')}</Label>
                <Input
                  value={formData.question_th}
                  onChange={(e) => setFormData(prev => ({ ...prev, question_th: e.target.value }))}
                  placeholder="ฉันจะเช็คอินได้อย่างไร?"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('คำถาม (อังกฤษ)', 'Question (English)')}</Label>
                <Input
                  value={formData.question_en}
                  onChange={(e) => setFormData(prev => ({ ...prev, question_en: e.target.value }))}
                  placeholder="How do I check in?"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('คำตอบ (ไทย)', 'Answer (Thai)')}</Label>
                <Textarea
                  value={formData.answer_th}
                  onChange={(e) => setFormData(prev => ({ ...prev, answer_th: e.target.value }))}
                  placeholder="กดเมนู 'เช็คอิน/เอาท์' แล้วเลือก 'เช็คอิน'"
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('คำตอบ (อังกฤษ)', 'Answer (English)')}</Label>
                <Textarea
                  value={formData.answer_en}
                  onChange={(e) => setFormData(prev => ({ ...prev, answer_en: e.target.value }))}
                  placeholder="Go to 'Check In/Out' menu and select 'Check In'"
                  rows={4}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('หมวดหมู่', 'Category')}</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {t(cat.labelTh, cat.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('ลำดับ', 'Sort Order')}</Label>
                <Input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              {t('ยกเลิก', 'Cancel')}
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingFaq ? t('บันทึก', 'Save') : t('เพิ่ม', 'Add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ยืนยันการลบ', 'Confirm Delete')}</DialogTitle>
            <DialogDescription>
              {t('คุณต้องการลบ FAQ นี้หรือไม่? การกระทำนี้ไม่สามารถยกเลิกได้', 'Are you sure you want to delete this FAQ? This action cannot be undone.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              {t('ยกเลิก', 'Cancel')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {t('ลบ', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
