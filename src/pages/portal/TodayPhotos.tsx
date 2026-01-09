import { useState } from 'react';
import { usePortal } from '@/contexts/PortalContext';
import { portalApi } from '@/lib/portal-api';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Camera, Clock, MapPin, User } from 'lucide-react';
import { formatBangkokTime } from '@/lib/timezone';

interface Branch {
  id: string;
  name: string;
}

interface PhotoLog {
  id: string;
  event_type: string;
  server_time: string;
  photo_url: string;
  employee: {
    id: string;
    full_name: string;
    nickname: string | null;
    branch: { id: string; name: string } | null;
  };
}

export default function TodayPhotos() {
  const { employee, locale } = usePortal();
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const { data: branches } = useQuery({
    queryKey: ['portal-branches'],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data } = await portalApi<Branch[]>({
        endpoint: 'branches',
        employee_id: employee.id
      });
      return data || [];
    },
    enabled: !!employee?.id
  });

  const { data: photos, isLoading } = useQuery({
    queryKey: ['portal-today-photos', selectedBranch, employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const { data } = await portalApi<PhotoLog[]>({
        endpoint: 'today-photos',
        employee_id: employee.id,
        params: selectedBranch !== 'all' ? { branchId: selectedBranch } : undefined
      });
      return data || [];
    },
    enabled: !!employee?.id
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
          {photos?.map((log) => (
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
