import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Navigation, AlertCircle } from 'lucide-react';

interface MapPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLat: number;
  initialLng: number;
  onLocationSelect: (lat: number, lng: number) => void;
}

export function MapPicker({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  onLocationSelect,
}: MapPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [currentLat, setCurrentLat] = useState(initialLat);
  const [currentLng, setCurrentLng] = useState(initialLng);
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapboxToken, setMapboxToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);

  useEffect(() => {
    const envToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if (envToken) {
      setMapboxToken(envToken);
    } else {
      setShowTokenInput(true);
    }
  }, []);

  useEffect(() => {
    if (!open || !mapContainer.current || !mapboxToken) return;

    try {
      setMapLoading(true);
      mapboxgl.accessToken = mapboxToken;

      // Initialize map
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [currentLng, currentLat],
        zoom: 15,
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Create draggable marker
      marker.current = new mapboxgl.Marker({
        draggable: true,
        color: '#ef4444',
      })
        .setLngLat([currentLng, currentLat])
        .addTo(map.current);

      // Update coordinates when marker is dragged
      marker.current.on('dragend', () => {
        const lngLat = marker.current!.getLngLat();
        setCurrentLng(lngLat.lng);
        setCurrentLat(lngLat.lat);
      });

      // Update marker when clicking on map
      map.current.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        marker.current?.setLngLat([lng, lat]);
        setCurrentLng(lng);
        setCurrentLat(lat);
      });

      // Map loaded event
      map.current.on('load', () => {
        setMapLoading(false);
      });

      // Error handling
      map.current.on('error', (e) => {
        console.error('Map error:', e);
        setError('เกิดข้อผิดพลาดในการโหลดแผนที่');
        setMapLoading(false);
      });
    } catch (err) {
      setError('ไม่สามารถโหลดแผนที่ได้ กรุณาตรวจสอบ Mapbox token');
      console.error('Map initialization error:', err);
      setMapLoading(false);
    }

    return () => {
      marker.current?.remove();
      map.current?.remove();
    };
  }, [open, mapboxToken]);

  const handleUseCurrentLocation = () => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLat(latitude);
        setCurrentLng(longitude);
        
        if (map.current && marker.current) {
          map.current.flyTo({ center: [longitude, latitude], zoom: 15 });
          marker.current.setLngLat([longitude, latitude]);
        }
        
        setLoading(false);
      },
      (error) => {
        setError(`Unable to get location: ${error.message}`);
        setLoading(false);
      }
    );
  };

  const handleConfirm = () => {
    onLocationSelect(currentLat, currentLng);
    onOpenChange(false);
  };

  const handleSetToken = () => {
    if (tokenInput.trim()) {
      setMapboxToken(tokenInput.trim());
      setShowTokenInput(false);
      setError(null);
    }
  };

  if (showTokenInput) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mapbox Token Required</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg flex gap-2">
              <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <p className="font-medium mb-1">Mapbox Public Token</p>
                <p>ต้องใส่ Mapbox Public Token เพื่อแสดงแผนที่</p>
                <p className="mt-2">
                  สมัครและรับ token ฟรีได้ที่{' '}
                  <a 
                    href="https://account.mapbox.com/access-tokens/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    Mapbox
                  </a>
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="mapbox-token">Mapbox Public Token</Label>
              <Input
                id="mapbox-token"
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="pk.eyJ1..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Token จะถูกใช้ในเซสชันนี้เท่านั้น
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button onClick={handleSetToken} disabled={!tokenInput.trim()}>
              ใช้ Token นี้
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>เลือกตำแหน่งบนแผนที่</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-lg">
            <MapPin className="h-4 w-4 text-destructive" />
            <span className="font-mono text-xs">
              {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
            </span>
          </div>

          <div className="flex-1 rounded-lg overflow-hidden border relative">
            {mapLoading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="text-sm text-muted-foreground">กำลังโหลดแผนที่...</span>
                </div>
              </div>
            )}
            <div ref={mapContainer} className="w-full h-full" />
          </div>

          <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
            💡 <strong>วิธีใช้:</strong> คลิกบนแผนที่ หรือลาก marker สีแดง หรือใช้ปุ่ม "ใช้ตำแหน่งปัจจุบัน"
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleUseCurrentLocation}
            disabled={loading}
            className="flex-1 sm:flex-initial"
          >
            <Navigation className="h-4 w-4 mr-2" />
            {loading ? 'กำลังค้นหา...' : 'ใช้ตำแหน่งปัจจุบัน'}
          </Button>
          
          <div className="flex gap-2 flex-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              className="flex-1"
            >
              ยืนยัน
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
