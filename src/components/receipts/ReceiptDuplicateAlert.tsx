import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface ReceiptDuplicateAlertProps {
  vendor: string | null;
  total: number | null;
  receiptDate: string | null;
  lineUserId: string;
  excludeReceiptId?: string;
  onViewDuplicate?: (receiptId: string) => void;
}

interface PotentialDuplicate {
  id: string;
  vendor: string | null;
  total: number | null;
  receipt_date: string | null;
  created_at: string | null;
}

export function ReceiptDuplicateAlert({
  vendor,
  total,
  receiptDate,
  lineUserId,
  excludeReceiptId,
  onViewDuplicate,
}: ReceiptDuplicateAlertProps) {
  // Check for potential duplicates
  const { data: duplicates = [] } = useQuery({
    queryKey: ['receipt-duplicate-check', vendor, total, receiptDate, lineUserId],
    queryFn: async () => {
      if (!vendor && !total && !receiptDate) return [];

      let query = supabase
        .from('receipts')
        .select('id, vendor, total, receipt_date, created_at')
        .eq('line_user_id', lineUserId)
        .eq('status', 'saved');

      if (excludeReceiptId) {
        query = query.neq('id', excludeReceiptId);
      }

      // Check within date range (+/- 3 days)
      if (receiptDate) {
        const date = new Date(receiptDate);
        const dateFrom = new Date(date);
        dateFrom.setDate(dateFrom.getDate() - 3);
        const dateTo = new Date(date);
        dateTo.setDate(dateTo.getDate() + 3);
        
        query = query
          .gte('receipt_date', format(dateFrom, 'yyyy-MM-dd'))
          .lte('receipt_date', format(dateTo, 'yyyy-MM-dd'));
      }

      const { data, error } = await query.limit(10);
      if (error) throw error;

      // Filter for potential matches
      return (data as PotentialDuplicate[]).filter((receipt) => {
        let matchScore = 0;

        // Vendor match (fuzzy)
        if (vendor && receipt.vendor) {
          const vendorLower = vendor.toLowerCase().trim();
          const receiptVendorLower = receipt.vendor.toLowerCase().trim();
          if (vendorLower === receiptVendorLower) {
            matchScore += 3;
          } else if (vendorLower.includes(receiptVendorLower) || receiptVendorLower.includes(vendorLower)) {
            matchScore += 2;
          }
        }

        // Total match (within 5% tolerance)
        if (total && receipt.total) {
          const tolerance = Math.max(total, receipt.total) * 0.05;
          if (Math.abs(total - receipt.total) <= tolerance) {
            matchScore += 3;
          } else if (Math.abs(total - receipt.total) <= tolerance * 2) {
            matchScore += 1;
          }
        }

        // Exact total match is highly suspicious
        if (total && receipt.total && total === receipt.total) {
          matchScore += 2;
        }

        // Date match
        if (receiptDate && receipt.receipt_date && receiptDate === receipt.receipt_date) {
          matchScore += 2;
        }

        // Consider it a potential duplicate if score >= 4
        return matchScore >= 4;
      });
    },
    enabled: !!(vendor || total || receiptDate) && !!lineUserId,
    staleTime: 30000, // Cache for 30 seconds
  });

  if (duplicates.length === 0) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Alert variant="destructive" className="bg-yellow-50 border-yellow-200 text-yellow-800">
      <AlertTriangle className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="text-yellow-800">Potential Duplicate Detected</AlertTitle>
      <AlertDescription className="text-yellow-700">
        <p className="mb-2">
          This receipt may be similar to {duplicates.length} existing receipt(s):
        </p>
        <div className="space-y-2">
          {duplicates.slice(0, 3).map((dup) => (
            <div 
              key={dup.id} 
              className="flex items-center justify-between bg-yellow-100/50 p-2 rounded text-sm"
            >
              <div>
                <span className="font-medium">{dup.vendor || 'Unknown vendor'}</span>
                <span className="mx-2">·</span>
                <span>{dup.total ? formatCurrency(dup.total) : '-'}</span>
                <span className="mx-2">·</span>
                <span>{dup.receipt_date || 'No date'}</span>
              </div>
              {onViewDuplicate && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-7 text-yellow-700 hover:text-yellow-800"
                  onClick={() => onViewDuplicate(dup.id)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View
                </Button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs mt-2 text-yellow-600">
          Please verify this is not a duplicate before saving.
        </p>
      </AlertDescription>
    </Alert>
  );
}
