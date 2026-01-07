/**
 * LIFF Receipt List - Mobile-optimized receipt listing in LINE app
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiff } from '@/contexts/LiffContext';
import { supabase } from '@/integrations/supabase/client';
import LiffLayout from './LiffLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Receipt, Calendar, ChevronRight, ImageIcon } from 'lucide-react';

interface ReceiptItem {
  id: string;
  vendor: string | null;
  receipt_date: string | null;
  total: number | null;
  currency: string | null;
  category: string | null;
  status: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  food: '🍽️ อาหาร',
  transport: '🚗 การเดินทาง',
  supplies: '📦 วัสดุ',
  utilities: '💡 สาธารณูปโภค',
  marketing: '📢 การตลาด',
  equipment: '🛠️ อุปกรณ์',
  services: '💼 บริการ',
  other: '📋 อื่นๆ',
};

export default function LiffReceiptList() {
  const navigate = useNavigate();
  const { profile } = useLiff();
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReceipts = async () => {
      if (!profile?.userId) return;

      const { data, error } = await supabase
        .from('receipts')
        .select('id, vendor, receipt_date, total, currency, category, status, created_at')
        .eq('line_user_id', profile.userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[LiffReceiptList] Error:', error);
      } else {
        setReceipts(data || []);
      }
      setLoading(false);
    };

    fetchReceipts();
  }, [profile?.userId]);

  const formatAmount = (amount: number | null, currency: string | null) => {
    if (amount === null) return '-';
    const curr = currency || 'THB';
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <LiffLayout title="ใบเสร็จของฉัน">
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </LiffLayout>
    );
  }

  return (
    <LiffLayout title="ใบเสร็จของฉัน">
      <div className="p-4 space-y-3">
        {receipts.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">ยังไม่มีใบเสร็จ</p>
            <p className="text-sm text-muted-foreground mt-1">ส่งรูปใบเสร็จมาในแชทเพื่อเริ่มต้น</p>
          </div>
        ) : (
          receipts.map(receipt => (
            <Card 
              key={receipt.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/liff/receipt/${receipt.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="h-12 w-12 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center">
                    <Receipt className="h-6 w-6 text-muted-foreground" />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium truncate">
                          {receipt.vendor || 'ไม่ระบุร้านค้า'}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {receipt.receipt_date 
                              ? format(new Date(receipt.receipt_date), 'd MMM yy', { locale: th })
                              : format(new Date(receipt.created_at), 'd MMM yy', { locale: th })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-semibold text-primary">
                          {formatAmount(receipt.total, receipt.currency)}
                        </div>
                        <Badge 
                          variant={receipt.status === 'confirmed' ? 'default' : 'secondary'}
                          className="text-xs mt-1"
                        >
                          {receipt.status === 'confirmed' ? '✓ ยืนยัน' : 'รอ'}
                        </Badge>
                      </div>
                    </div>
                    
                    {receipt.category && (
                      <div className="mt-2">
                        <span className="text-xs text-muted-foreground">
                          {CATEGORY_LABELS[receipt.category] || receipt.category}
                        </span>
                      </div>
                    )}
                  </div>

                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 self-center" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </LiffLayout>
  );
}
