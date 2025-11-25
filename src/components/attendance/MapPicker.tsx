import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, AlertCircle } from 'lucide-react';
import { getMapboxToken } from '@/lib/api-config';
import { MapboxTokenDialog } from '@/components/shared/MapboxTokenDialog';

interface MapPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLat: number;
  initialLng: number;
  radiusMeters?: number;
  onLocationSelect: (lat: number, lng: number) => void;
}

export function MapPicker({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  radiusMeters = 200,
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
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [showTokenDialog, setShowTokenDialog] = useState(false);

  // Load token on mount
  useEffect(() => {
    getMapboxToken().then(token => {
      if (token) {
        setMapboxToken(token);
      } else if (open) {
        setShowTokenDialog(true);
      }
    });
  }, [open]);

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

      // Helper function to create circle GeoJSON
      const createCircleGeoJSON = (center: [number, number], radiusInMeters: number) => {
        const points = 64;
        const coords = {
          latitude: center[1],
          longitude: center[0]
        };
        
        const km = radiusInMeters / 1000;
        const ret = [];
        const distanceX = km / (111.32 * Math.cos(coords.latitude * Math.PI / 180));
        const distanceY = km / 110.574;

        for (let i = 0; i < points; i++) {
          const theta = (i / points) * (2 * Math.PI);
          const x = distanceX * Math.cos(theta);
          const y = distanceY * Math.sin(theta);
          ret.push([coords.longitude + x, coords.latitude + y]);
        }
        ret.push(ret[0]);

        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [ret]
          },
          properties: {}
        };
      };

      // Update circle function
      const updateCircle = (lng: number, lat: number) => {
        const circleGeoJSON = createCircleGeoJSON([lng, lat], radiusMeters);
        
        if (map.current?.getSource('geofence-circle')) {
          (map.current.getSource('geofence-circle') as mapboxgl.GeoJSONSource).setData(circleGeoJSON as any);
        }
      };

      // Update coordinates when marker is dragged
      marker.current.on('dragend', () => {
        const lngLat = marker.current!.getLngLat();
        setCurrentLng(lngLat.lng);
        setCurrentLat(lngLat.lat);
        updateCircle(lngLat.lng, lngLat.lat);
      });

      // Update marker when clicking on map
      map.current.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        marker.current?.setLngLat([lng, lat]);
        setCurrentLng(lng);
        setCurrentLat(lat);
        updateCircle(lng, lat);
      });

      // Map loaded event
      map.current.on('load', () => {
        setMapLoading(false);
        
        // Add geofence circle
        const circleGeoJSON = createCircleGeoJSON([currentLng, currentLat], radiusMeters);
        
        map.current!.addSource('geofence-circle', {
          type: 'geojson',
          data: circleGeoJSON as any
        });

        map.current!.addLayer({
          id: 'geofence-fill',
          type: 'fill',
          source: 'geofence-circle',
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.15
          }
        });

        map.current!.addLayer({
          id: 'geofence-outline',
          type: 'line',
          source: 'geofence-circle',
          paint: {
            'line-color': '#ef4444',
            'line-width': 2,
            'line-dasharray': [2, 2]
          }
        });
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
  }, [open, mapboxToken, currentLat, currentLng, radiusMeters]);

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
          
          // Update circle
          const circleGeoJSON = {
            type: 'Feature' as const,
            geometry: {
              type: 'Polygon' as const,
              coordinates: [[]]
            },
            properties: {}
          };
          
          const createCircle = (center: [number, number], radiusInMeters: number) => {
            const points = 64;
            const coords = { latitude: center[1], longitude: center[0] };
            const km = radiusInMeters / 1000;
            const ret = [];
            const distanceX = km / (111.32 * Math.cos(coords.latitude * Math.PI / 180));
            const distanceY = km / 110.574;

            for (let i = 0; i < points; i++) {
              const theta = (i / points) * (2 * Math.PI);
              const x = distanceX * Math.cos(theta);
              const y = distanceY * Math.sin(theta);
              ret.push([coords.longitude + x, coords.latitude + y]);
            }
            ret.push(ret[0]);
            return ret;
          };
          
          circleGeoJSON.geometry.coordinates = [createCircle([longitude, latitude], radiusMeters)];
          
          if (map.current?.getSource('geofence-circle')) {
            (map.current.getSource('geofence-circle') as mapboxgl.GeoJSONSource).setData(circleGeoJSON as any);
          }
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

  return (
    <>
      {/* Token input dialog */}
      <MapboxTokenDialog
        open={showTokenDialog}
        onTokenSet={(token) => {
          setMapboxToken(token);
          setShowTokenDialog(false);
        }}
      />

      {/* Main map dialog - แสดงเฉพาะเมื่อมี token แล้ว */}
      <Dialog open={open && !!mapboxToken} onOpenChange={onOpenChange}>
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
          
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-lg">
              <MapPin className="h-4 w-4 text-destructive" />
              <span className="font-mono text-xs">
                {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
              <span className="text-xs font-medium text-blue-900 dark:text-blue-100">
                Radius: {radiusMeters}m
              </span>
            </div>
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
    </>
  );
}
