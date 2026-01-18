import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, ExternalLink } from 'lucide-react';
import { getMapboxToken } from '@/lib/api-config';
import { MapboxTokenDialog } from './MapboxTokenDialog';

interface MapPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  latitude: number;
  longitude: number;
  title?: string;
}

export function MapPreviewModal({ open, onOpenChange, latitude, longitude, title }: MapPreviewModalProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [showTokenDialog, setShowTokenDialog] = useState(false);

  // Load token on mount
  useEffect(() => {
    getMapboxToken().then(token => {
      if (token) {
        setMapboxToken(token);
      } else {
        setShowTokenDialog(true);
      }
    });
  }, []);

  // Initialize map when dialog opens
  useEffect(() => {
    if (!open || !mapContainer.current || !mapboxToken) return;

    // Clean up existing map
    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [longitude, latitude],
      zoom: 15,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add marker
    marker.current = new mapboxgl.Marker({ color: '#ef4444' })
      .setLngLat([longitude, latitude])
      .addTo(map.current);

    return () => {
      if (marker.current) {
        marker.current.remove();
        marker.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [open, mapboxToken, latitude, longitude]);

  const openInOpenStreetMap = () => {
    window.open(`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`, '_blank');
  };

  return (
    <>
      <MapboxTokenDialog
        open={showTokenDialog}
        onTokenSet={(token) => {
          setMapboxToken(token);
          setShowTokenDialog(false);
        }}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {title || 'Location'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {mapboxToken ? (
              <div 
                ref={mapContainer} 
                className="w-full h-[400px] rounded-lg border overflow-hidden"
              />
            ) : (
              <div className="w-full h-[400px] rounded-lg border bg-muted flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Mapbox token required to display map</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <span className="font-mono">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
              </div>
              <Button variant="outline" size="sm" onClick={openInOpenStreetMap}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in OpenStreetMap
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
