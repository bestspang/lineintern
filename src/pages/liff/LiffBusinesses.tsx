/**
 * LIFF Businesses - Manage receipt businesses in LINE app
 */

import { useState, useEffect } from 'react';
import { useLiff } from '@/contexts/LiffContext';
import { supabase } from '@/integrations/supabase/client';
import LiffLayout from './LiffLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Building2, Plus, Star, Check, Loader2 } from 'lucide-react';

interface Business {
  id: string;
  name: string;
  is_default: boolean;
}

export default function LiffBusinesses() {
  const { profile } = useLiff();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const fetchBusinesses = async () => {
    if (!profile?.userId) return;

    const { data, error } = await supabase
      .from('receipt_businesses')
      .select('id, name, is_default')
      .eq('line_user_id', profile.userId)
      .order('is_default', { ascending: false })
      .order('name');

    if (!error) {
      setBusinesses(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBusinesses();
  }, [profile?.userId]);

  const handleAdd = async () => {
    if (!newName.trim() || !profile?.userId) return;

    setAdding(true);
    try {
      const isFirst = businesses.length === 0;
      
      const { error } = await supabase
        .from('receipt_businesses')
        .insert({
          line_user_id: profile.userId,
          name: newName.trim(),
          is_default: isFirst,
        });

      if (error) throw error;

      toast.success('เพิ่มธุรกิจแล้ว');
      setNewName('');
      fetchBusinesses();
    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setAdding(false);
    }
  };

  const handleSetDefault = async (businessId: string) => {
    if (!profile?.userId) return;

    setSettingDefault(businessId);
    try {
      // Clear all defaults
      await supabase
        .from('receipt_businesses')
        .update({ is_default: false })
        .eq('line_user_id', profile.userId);

      // Set new default
      await supabase
        .from('receipt_businesses')
        .update({ is_default: true })
        .eq('id', businessId);

      toast.success('ตั้งเป็นธุรกิจเริ่มต้นแล้ว');
      fetchBusinesses();
    } catch (err) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setSettingDefault(null);
    }
  };

  if (loading) {
    return (
      <LiffLayout title="ธุรกิจของฉัน">
        <div className="p-4 space-y-3">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </LiffLayout>
    );
  }

  return (
    <LiffLayout title="ธุรกิจของฉัน">
      <div className="p-4 space-y-4">
        {/* Add new business */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ชื่อธุรกิจใหม่"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Button 
                onClick={handleAdd}
                disabled={!newName.trim() || adding}
                className="shrink-0"
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Business list */}
        {businesses.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">ยังไม่มีธุรกิจ</p>
            <p className="text-sm text-muted-foreground mt-1">เพิ่มธุรกิจแรกของคุณด้านบน</p>
          </div>
        ) : (
          <div className="space-y-2">
            {businesses.map(business => (
              <Card 
                key={business.id}
                className={business.is_default ? 'border-primary' : ''}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">{business.name}</span>
                      {business.is_default && (
                        <Badge variant="default" className="bg-primary/20 text-primary">
                          <Star className="h-3 w-3 mr-1" />
                          เริ่มต้น
                        </Badge>
                      )}
                    </div>
                    {!business.is_default && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetDefault(business.id)}
                        disabled={settingDefault === business.id}
                      >
                        {settingDefault === business.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-muted-foreground text-center">
          ธุรกิจเริ่มต้นจะถูกใช้โดยอัตโนมัติเมื่อส่งใบเสร็จใหม่
        </p>
      </div>
    </LiffLayout>
  );
}
