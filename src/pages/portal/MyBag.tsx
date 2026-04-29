import { useState } from 'react';
import { formatBangkokDate } from '@/lib/timezone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Backpack, Sparkles, CheckCircle2, Clock, Info, Zap, ShieldCheck } from 'lucide-react';

interface BagItem {
  id: string;
  item_name: string;
  item_name_th: string | null;
  item_icon: string;
  item_type: string;
  status: string;
  usage_rules: string | null;
  usage_rules_th: string | null;
  auto_activate: boolean;
  used_at: string | null;
  expires_at: string | null;
  granted_by: string;
  created_at: string;
  reward_id: string | null;
}

export default function MyBag() {
  const { employee, locale } = usePortal();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<BagItem | null>(null);
  const [rulesItem, setRulesItem] = useState<BagItem | null>(null);

  const { data: bagItems, isLoading } = useQuery({
    queryKey: ['my-bag-items', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data, error } = await portalApi<BagItem[]>({
        endpoint: 'my-bag-items',
        employee_id: employee.id,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
  });

  const useMutation_ = useMutation({
    mutationFn: async (itemId: string) => {
      if (!employee?.id) throw new Error('Employee not found');
      const { data, error } = await portalApi<any>({
        endpoint: 'use-bag-item',
        employee_id: employee.id,
        params: { bag_item_id: itemId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bag-items'] });
      queryClient.invalidateQueries({ queryKey: ['my-bag-count'] });
      toast({
        title: locale === 'th' ? '✅ ใช้ไอเทมสำเร็จ!' : '✅ Item Used!',
        description: locale === 'th' ? 'ไอเทมถูกใช้งานแล้ว' : 'Item has been activated',
      });
      setSelectedItem(null);
    },
    onError: (error) => {
      toast({
        title: locale === 'th' ? 'เกิดข้อผิดพลาด' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const activeItems = bagItems?.filter(i => i.status === 'active') || [];
  const usedItems = bagItems?.filter(i => i.status === 'used') || [];
  const expiredItems = bagItems?.filter(i => i.status === 'expired') || [];

  const renderItem = (item: BagItem, showUseButton = false) => (
    <Card key={item.id} className="transition-all hover:shadow-md">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl">{item.item_icon || '🎁'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">
                  {locale === 'th' ? item.item_name_th || item.item_name : item.item_name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                {item.granted_by === 'admin_grant'
                    ? (locale === 'th' ? '🎁 ได้รับจากผู้จัดการ' : '🎁 Granted by manager')
                    : item.granted_by === 'gacha'
                    ? (locale === 'th' ? '🎲 สุ่มได้จาก Gacha' : '🎲 Won from Gacha')
                    : (locale === 'th' ? '🛒 ซื้อจากร้านค้า' : '🛒 Purchased')}
                </p>
                {item.status === 'active' && item.expires_at && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    ⏰ {locale === 'th' ? 'หมดอายุ' : 'Expires'}: {formatBangkokDate(item.expires_at)}
                  </p>
                )}
                {item.status === 'used' && item.used_at && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ✅ {locale === 'th' ? 'ใช้เมื่อ' : 'Used on'}: {formatBangkokDate(item.used_at)}
                  </p>
                )}
              </div>
              <Badge
                variant={item.status === 'active' ? 'default' : item.status === 'used' ? 'secondary' : 'destructive'}
                className="shrink-0 text-xs"
              >
                {item.status === 'active'
                  ? (locale === 'th' ? 'พร้อมใช้' : 'Active')
                  : item.status === 'used'
                  ? (locale === 'th' ? 'ใช้แล้ว' : 'Used')
                  : (locale === 'th' ? 'หมดอายุ' : 'Expired')}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {item.auto_activate && (
                <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700">
                  <Zap className="h-3 w-3" />
                  {locale === 'th' ? 'ใช้อัตโนมัติ' : 'Auto-activate'}
                </Badge>
              )}
              {item.usage_rules && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={(e) => { e.stopPropagation(); setRulesItem(item); }}
                >
                  <Info className="h-3 w-3" />
                  {locale === 'th' ? 'เงื่อนไข' : 'Rules'}
                </Button>
              )}
            </div>
            {showUseButton && !item.auto_activate && item.status === 'active' && (
              <Button
                size="sm"
                className="mt-3 w-full"
                onClick={() => setSelectedItem(item)}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                {locale === 'th' ? 'ใช้ไอเทม' : 'Use Item'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const emptyState = (message: string) => (
    <div className="text-center py-12 text-muted-foreground">
      <Backpack className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Backpack className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">
          {locale === 'th' ? 'กระเป๋าของฉัน' : 'My Bag'}
        </h1>
        <Badge variant="secondary" className="ml-auto">
          {activeItems.length} {locale === 'th' ? 'ชิ้น' : 'items'}
        </Badge>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3" />
            {locale === 'th' ? 'พร้อมใช้' : 'Active'} ({activeItems.length})
          </TabsTrigger>
          <TabsTrigger value="used" className="gap-1 text-xs">
            <CheckCircle2 className="h-3 w-3" />
            {locale === 'th' ? 'ใช้แล้ว' : 'Used'} ({usedItems.length})
          </TabsTrigger>
          <TabsTrigger value="expired" className="gap-1 text-xs">
            <Clock className="h-3 w-3" />
            {locale === 'th' ? 'หมดอายุ' : 'Expired'} ({expiredItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3 mt-3">
          {activeItems.length === 0
            ? emptyState(locale === 'th' ? 'ยังไม่มีไอเทม ไปแลกรางวัลกันเลย!' : 'No items yet. Go redeem some rewards!')
            : activeItems.map(item => renderItem(item, true))}
        </TabsContent>
        <TabsContent value="used" className="space-y-3 mt-3">
          {usedItems.length === 0
            ? emptyState(locale === 'th' ? 'ยังไม่มีไอเทมที่ใช้แล้ว' : 'No used items')
            : usedItems.map(item => renderItem(item))}
        </TabsContent>
        <TabsContent value="expired" className="space-y-3 mt-3">
          {expiredItems.length === 0
            ? emptyState(locale === 'th' ? 'ไม่มีไอเทมหมดอายุ' : 'No expired items')
            : expiredItems.map(item => renderItem(item))}
        </TabsContent>
      </Tabs>

      {/* Use Confirm Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{selectedItem?.item_icon}</span>
              {locale === 'th' ? selectedItem?.item_name_th || selectedItem?.item_name : selectedItem?.item_name}
            </DialogTitle>
            <DialogDescription>
              {locale === 'th' ? 'คุณต้องการใช้ไอเทมนี้หรือไม่?' : 'Do you want to use this item?'}
            </DialogDescription>
          </DialogHeader>
          {selectedItem?.usage_rules && (
            <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground mb-1">
                {locale === 'th' ? '📋 เงื่อนไขการใช้งาน' : '📋 Usage Rules'}
              </p>
              {locale === 'th'
                ? selectedItem.usage_rules_th || selectedItem.usage_rules
                : selectedItem.usage_rules}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedItem(null)}>
              {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button
              onClick={() => selectedItem && useMutation_.mutate(selectedItem.id)}
              disabled={useMutation_.isPending}
            >
              {useMutation_.isPending
                ? (locale === 'th' ? 'กำลังใช้...' : 'Using...')
                : (locale === 'th' ? 'ยืนยันใช้ไอเทม' : 'Confirm Use')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rules Dialog */}
      <Dialog open={!!rulesItem} onOpenChange={() => setRulesItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              {locale === 'th' ? 'เงื่อนไขการใช้งาน' : 'Usage Rules'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{rulesItem?.item_icon}</span>
              <span className="font-medium">
                {locale === 'th' ? rulesItem?.item_name_th || rulesItem?.item_name : rulesItem?.item_name}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {locale === 'th' ? rulesItem?.usage_rules_th || rulesItem?.usage_rules : rulesItem?.usage_rules}
            </p>
            {rulesItem?.auto_activate && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <ShieldCheck className="h-4 w-4 inline mr-1" />
                {locale === 'th'
                  ? 'ไอเทมนี้จะถูกใช้โดยอัตโนมัติเมื่อถึงเงื่อนไข ไม่ต้องกดใช้เอง'
                  : 'This item activates automatically when conditions are met'}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
