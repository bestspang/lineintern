import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { MapPin, Camera, Smartphone, AlertTriangle, Clock } from 'lucide-react';

interface AttendanceLogDetailProps {
  log: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AttendanceLogDetail({ log, open, onOpenChange }: AttendanceLogDetailProps) {
  if (!log) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Attendance Detail
            {log.is_flagged && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Flagged
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Employee Info */}
          <div>
            <h3 className="font-semibold mb-2">Employee Information</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
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
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Event Information
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Event Type:</span>
                <Badge variant={log.event_type === 'check_in' ? 'default' : 'secondary'} className="ml-2">
                  {log.event_type === 'check_in' ? 'Check In' : 'Check Out'}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Server Time:</span>
                <p className="font-medium">{format(new Date(log.server_time), 'PPpp')}</p>
              </div>
              {log.device_time && (
                <div>
                  <span className="text-muted-foreground">Device Time:</span>
                  <p className="font-medium">{format(new Date(log.device_time), 'PPpp')}</p>
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
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Location
                </h3>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Coordinates:</span>
                    <p className="font-mono">{log.latitude}, {log.longitude}</p>
                  </div>
                  {log.timezone && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Timezone:</span>
                      <p>{log.timezone}</p>
                    </div>
                  )}
                  <div className="mt-2">
                    <a
                      href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm"
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
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Photo
                </h3>
                <img
                  src={log.photo_url}
                  alt="Attendance photo"
                  className="w-full max-w-md rounded-lg border"
                />
              </div>
            </>
          )}

          {/* Device Info */}
          {log.device_info && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Device Information
                </h3>
                <div className="bg-muted p-3 rounded-md">
                  <pre className="text-xs overflow-x-auto">
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
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Flag Reason
                </h3>
                <p className="text-sm bg-destructive/10 p-3 rounded-md">{log.flag_reason}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
