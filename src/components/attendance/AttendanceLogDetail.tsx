import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { MapPin, Camera, Smartphone, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AttendanceLogDetailProps {
  log: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AttendanceLogDetail({ log, open, onOpenChange }: AttendanceLogDetailProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Generate signed URL when log changes
  useEffect(() => {
    if (!log?.photo_url) {
      setPhotoUrl(null);
      return;
    }

    const generateUrl = async () => {
      // Check if it's already a full URL (backward compatibility)
      if (log.photo_url.startsWith('http://') || log.photo_url.startsWith('https://')) {
        setPhotoUrl(log.photo_url);
        return;
      }

      // Generate signed URL with 1 hour expiration
      const { data, error } = await supabase.storage
        .from('attendance-photos')
        .createSignedUrl(log.photo_url, 3600);

      if (data && !error) {
        setPhotoUrl(data.signedUrl);
      }
    };

    generateUrl();
  }, [log]);

  if (!log) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-base sm:text-lg">
            <span>Attendance Detail</span>
            <div className="flex gap-1">
              {log.is_flagged && (
                <Badge variant="destructive" className="flex items-center gap-1 h-5 sm:h-6 text-xs">
                  <AlertTriangle className="h-3 w-3" />
                  Flagged
                </Badge>
              )}
              {log.is_remote_checkin && (
                <Badge variant="outline" className="h-5 sm:h-6 text-xs">
                  🌐 Remote
                </Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
          {/* Employee Info */}
          <div>
            <h3 className="font-semibold mb-2 text-sm sm:text-base">Employee Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>
                <p className="font-medium">{log.employee?.full_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Branch:</span>
                <p className="font-medium">{log.branch?.name || '-'}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Event Info */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
              Event Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
              <div>
                <span className="text-muted-foreground">Event Type:</span>
                <Badge variant={log.event_type === 'check_in' ? 'default' : 'secondary'} className="ml-2 h-4 sm:h-5 text-xs">
                  {log.event_type === 'check_in' ? 'Check In' : 'Check Out'}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Server Time:</span>
                <p className="font-medium text-xs sm:text-sm">{format(new Date(log.server_time), 'PPpp')}</p>
              </div>
              {log.device_time && (
                <div>
                  <span className="text-muted-foreground">Device Time:</span>
                  <p className="font-medium text-xs sm:text-sm">{format(new Date(log.device_time), 'PPpp')}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Source:</span>
                <p className="font-medium capitalize">{log.source}</p>
              </div>
            </div>
          </div>

          {/* Location */}
          {(log.latitude || log.longitude) && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
                  <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
                  Location {log.is_remote_checkin && <Badge variant="outline" className="text-xs">🌐 Remote</Badge>}
                </h3>
                <div className="space-y-2">
                  <div className="text-xs sm:text-sm">
                    <span className="text-muted-foreground">Coordinates:</span>
                    <p className="font-mono text-xs">{log.latitude}, {log.longitude}</p>
                  </div>
                  {log.is_remote_checkin && (
                    <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded text-xs">
                      <p className="text-blue-700 dark:text-blue-300">
                        ✓ Check-in นี้ทำจากที่ไหนก็ได้ (Remote) - ไม่ตรวจสอบพื้นที่
                      </p>
                    </div>
                  )}
                  {log.timezone && (
                    <div className="text-xs sm:text-sm">
                      <span className="text-muted-foreground">Timezone:</span>
                      <p>{log.timezone}</p>
                    </div>
                  )}
                  <div className="mt-2">
                    <a
                      href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs sm:text-sm"
                    >
                      View on Google Maps →
                    </a>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Photo */}
          {log.photo_url && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
                  <Camera className="h-3 w-3 sm:h-4 sm:w-4" />
                  Photo
                </h3>
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Attendance photo"
                    className="w-full max-w-md rounded-lg border"
                  />
                ) : (
                  <div className="w-full max-w-md h-48 bg-muted rounded-lg border flex items-center justify-center">
                    <span className="text-muted-foreground">Loading photo...</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Device Info */}
          {log.device_info && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
                  <Smartphone className="h-3 w-3 sm:h-4 sm:w-4" />
                  Device Information
                </h3>
                <div className="bg-muted p-2 sm:p-3 rounded-md">
                  <pre className="text-[10px] sm:text-xs overflow-x-auto">
                    {JSON.stringify(log.device_info, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}

          {/* Flag Reason */}
          {log.is_flagged && log.flag_reason && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-destructive text-sm sm:text-base">
                  <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />
                  Flag Reason
                </h3>
                <p className="text-xs sm:text-sm bg-destructive/10 p-2 sm:p-3 rounded-md">{log.flag_reason}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}