import { useState } from 'react';
import { usePortal } from '@/contexts/PortalContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Camera, Clock, MapPin, User } from 'lucide-react';
import { formatBangkokISODate, formatBangkokTime } from '@/lib/timezone';

export default function TodayPhotos() {
  const { employee, locale } = usePortal();
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const { data: branches } = useQuery({
    queryKey: ['portal-branches'],
    queryFn: async () => {
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
      return data || [];
    },
  });

  const { data: photos, isLoading } = useQuery({
    queryKey: ['portal-today-photos', selectedBranch],
    queryFn: async () => {
      // Use Bangkok timezone for today's date
      const today = formatBangkokISODate(new Date());
      
      let query = supabase
        .from('attendance_logs')
        .select(`
          id,
          event_type,
          server_time,
          photo_url,
          latitude,
          longitude,
          employee:employees!inner(id, full_name, code, branch:branches(name))
        `)
        .gte('server_time', `${today}T00:00:00+07:00`)
        .lt('server_time', `${today}T23:59:59+07:00`)
        .not('photo_url', 'is', null)
        .order('server_time', { ascending: false });

      if (selectedBranch !== 'all') {
        query = query.eq('employee.branch_id', selectedBranch);
      }

      const { data } = await query;
      return data || [];
    },
  });

  if (!employee) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {locale === 'th' ? '📸 รูปวันนี้' : '📸 Today\'s Photos'}
        </h1>
        <Select value={selectedBranch} onValueChange={setSelectedBranch}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{locale === 'th' ? 'ทุกสาขา' : 'All'}</SelectItem>
            {branches?.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          {locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}
        </div>
      ) : photos?.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
            {locale === 'th' ? 'ไม่มีรูปวันนี้' : 'No photos today'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos?.map((log: any) => (
            <Card 
              key={log.id} 
              className="overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all"
              onClick={() => setSelectedPhoto(log.photo_url)}
            >
              <div className="aspect-square relative">
                <img 
                  src={log.photo_url} 
                  alt="Check-in" 
                  className="w-full h-full object-cover"
                />
                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium ${
                  log.event_type === 'check_in' 
                    ? 'bg-green-500 text-white' 
                    : 'bg-orange-500 text-white'
                }`}>
                  {log.event_type === 'check_in' ? 'IN' : 'OUT'}
                </div>
              </div>
              <CardContent className="p-2 space-y-1">
                <div className="flex items-center gap-1 text-sm font-medium truncate">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{log.employee?.full_name}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatBangkokTime(log.server_time).slice(0, 5)}
                </div>
                {log.employee?.branch?.name && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{log.employee.branch.name}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-lg p-0">
          {selectedPhoto && (
            <img src={selectedPhoto} alt="Full size" className="w-full h-auto" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
