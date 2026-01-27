import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Banknote, ChevronLeft, ChevronRight, Image } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface Deposit {
  id: string;
  amount: number | null;
  status: string;
  deposit_date: string;
  created_at: string;
  slip_photo_url: string | null;
  bank_name: string | null;
  reference_number: string | null;
  employee: {
    id: string;
    full_name: string;
    nickname: string | null;
  };
  branch: {
    id: string;
    name: string;
  } | null;
}

export default function DepositReviewList() {
  const navigate = useNavigate();
  const { employee, locale, isAdmin } = usePortal();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeposits = useCallback(async () => {
    if (!employee?.id) return;

    let query = supabase
      .from('daily_deposits')
      .select(`
        id, amount, status, deposit_date, created_at, slip_photo_url, bank_name, reference_number,
        employee:employees!inner(id, full_name, nickname),
        branch:branches!daily_deposits_branch_id_fkey(id, name)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    // Filter by branch for non-admin
    if (!isAdmin && employee.branch_id) {
      query = query.eq('branch_id', employee.branch_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching deposits:', error);
    } else {
      setDeposits((data as unknown as Deposit[]) || []);
    }
    setLoading(false);
  }, [employee?.id, employee?.branch_id, isAdmin]);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  const formatAmount = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/approvals')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {locale === 'th' ? '💰 ตรวจสอบใบฝากเงิน' : '💰 Review Deposits'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === 'th' ? 'ตรวจสอบใบฝากเงินจากสาขา' : 'Review deposit slips from branches'}
          </p>
        </div>
      </div>

      {/* Pending List */}
      {deposits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Banknote className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {locale === 'th' ? 'ไม่มีใบฝากที่รอตรวจสอบ' : 'No pending deposits'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deposits.map((deposit) => (
            <Card 
              key={deposit.id} 
              className="overflow-hidden cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
              onClick={() => navigate(`/portal/deposit-review/${deposit.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {deposit.slip_photo_url ? (
                      <img 
                        src={deposit.slip_photo_url} 
                        alt="Slip" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Image className="h-6 w-6 text-muted-foreground/50" />
                    )}
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">
                        {deposit.employee.nickname || deposit.employee.full_name}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {deposit.branch?.name || '-'}
                      </Badge>
                    </div>
                    <p className="text-lg font-bold text-green-600 mt-1">
                      {formatAmount(deposit.amount)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(deposit.deposit_date), 'd MMM yyyy', { 
                          locale: locale === 'th' ? th : undefined 
                        })}
                      </span>
                      {deposit.bank_name && (
                        <Badge variant="secondary" className="text-xs">
                          {deposit.bank_name}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
