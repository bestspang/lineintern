import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, MapPin, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { getMapboxToken } from '@/lib/api-config';
import { MapboxTokenDialog } from '@/components/shared/MapboxTokenDialog';

interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  eventType: string;
  branchName?: string;
  isRemote: boolean;
}

interface LocationHeatmapProps {
  employeeId: string;
  employeeName: string;
  locations: LocationPoint[];
}

const LocationHeatmap: React.FC<LocationHeatmapProps> = ({
  employeeId,
  employeeName,
  locations
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showMarkers, setShowMarkers] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date()
  });
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [filteredLocations, setFilteredLocations] = useState<LocationPoint[]>([]);
  const markers = useRef<mapboxgl.Marker[]>([]);

  // Filter locations by date range
  useEffect(() => {
    const filtered = locations.filter(loc => {
      const locDate = new Date(loc.timestamp);
      return locDate >= dateRange.from && locDate <= dateRange.to;
    });
    setFilteredLocations(filtered);
  }, [locations, dateRange]);

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

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken || map.current) return;
    if (filteredLocations.length === 0) return;

    mapboxgl.accessToken = mapboxToken;

    // Calculate center and bounds
    const lats = filteredLocations.map(l => l.latitude);
    const lngs = filteredLocations.map(l => l.longitude);
    const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [centerLng, centerLat],
      zoom: 11,
      minZoom: 5,
      maxZoom: 18
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      if (!map.current) return;

      // Add location data as GeoJSON source
      map.current.addSource('check-ins', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: filteredLocations.map(loc => ({
            type: 'Feature',
            properties: {
              timestamp: loc.timestamp,
              eventType: loc.eventType,
              branchName: loc.branchName,
              isRemote: loc.isRemote
            },
            geometry: {
              type: 'Point',
              coordinates: [loc.longitude, loc.latitude]
            }
          }))
        }
      });

      // Add heatmap layer
      map.current.addLayer({
        id: 'check-ins-heat',
        type: 'heatmap',
        source: 'check-ins',
        maxzoom: 17,
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1,
            17, 3
          ],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(33,102,172,0)',
            0.2, 'rgb(103,169,207)',
            0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)',
            0.8, 'rgb(239,138,98)',
            1, 'rgb(178,24,43)'
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 2,
            17, 20
          ],
          'heatmap-opacity': 0.8
        }
      });

      // Add circle layer for individual points (hidden by default)
      map.current.addLayer({
        id: 'check-ins-point',
        type: 'circle',
        source: 'check-ins',
        minzoom: 14,
        layout: {
          visibility: 'none'
        },
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['to-string', ['get', 'isRemote']],
            'true', '#10b981',
            '#3b82f6'
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Fit bounds to show all points
      const bounds = new mapboxgl.LngLatBounds();
      filteredLocations.forEach(loc => {
        bounds.extend([loc.longitude, loc.latitude]);
      });
      map.current.fitBounds(bounds, { 
        padding: 50,
        maxZoom: 15
      });

      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
      setMapLoaded(false);
    };
  }, [mapboxToken, filteredLocations]);

  // Toggle markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Check if layer exists before trying to modify it
    const layerExists = map.current.getLayer('check-ins-point');
    if (!layerExists) {
      console.log('[LocationHeatmap] Layer not ready yet, skipping toggle');
      return;
    }

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    if (showMarkers) {
      map.current.setLayoutProperty('check-ins-point', 'visibility', 'visible');
      
      // Add popup markers
      filteredLocations.forEach(loc => {
        const el = document.createElement('div');
        el.className = 'marker';
        el.style.backgroundColor = loc.isRemote ? '#10b981' : '#3b82f6';
        el.style.width = '12px';
        el.style.height = '12px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.cursor = 'pointer';

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
          `<div style="padding: 8px;">
            <strong>${loc.eventType}</strong><br/>
            <small>${format(new Date(loc.timestamp), 'PPp')}</small><br/>
            ${loc.branchName ? `<small>📍 ${loc.branchName}</small><br/>` : ''}
            <small>${loc.isRemote ? '🌐 Remote' : '🏢 On-site'}</small>
          </div>`
        );

        const marker = new mapboxgl.Marker(el)
          .setLngLat([loc.longitude, loc.latitude])
          .setPopup(popup)
          .addTo(map.current!);

        markers.current.push(marker);
      });
    } else {
      map.current.setLayoutProperty('check-ins-point', 'visibility', 'none');
    }
  }, [showMarkers, mapLoaded, filteredLocations]);

  // Calculate statistics
  const stats = {
    totalCheckins: filteredLocations.length,
    remoteCheckins: filteredLocations.filter(l => l.isRemote).length,
    uniqueLocations: new Set(filteredLocations.map(l => `${l.latitude},${l.longitude}`)).size,
    coverageArea: calculateCoverageArea(filteredLocations)
  };

  function calculateCoverageArea(points: LocationPoint[]): number {
    if (points.length < 2) return 0;
    
    const lats = points.map(p => p.latitude);
    const lngs = points.map(p => p.longitude);
    
    const maxLat = Math.max(...lats);
    const minLat = Math.min(...lats);
    const maxLng = Math.max(...lngs);
    const minLng = Math.min(...lngs);
    
    // Rough approximation of area in km²
    const latDiff = (maxLat - minLat) * 111;
    const lngDiff = (maxLng - minLng) * 111 * Math.cos(((maxLat + minLat) / 2) * Math.PI / 180);
    
    return Math.round(latDiff * lngDiff * 100) / 100;
  }


  if (locations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location History Heatmap
          </CardTitle>
          <CardDescription>No location data available for this employee</CardDescription>
        </CardHeader>
      </Card>
    );
  }

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

      <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location History Heatmap
            </CardTitle>
            <CardDescription>
              Check-in locations for {employeeName} over the selected period
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-4 space-y-4">
                  <div>
                    <Label className="text-sm font-medium">From</Label>
                    <Calendar
                      mode="single"
                      selected={dateRange.from}
                      onSelect={(date) => date && setDateRange({ ...dateRange, from: date })}
                      disabled={(date) => date > dateRange.to}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">To</Label>
                    <Calendar
                      mode="single"
                      selected={dateRange.to}
                      onSelect={(date) => date && setDateRange({ ...dateRange, to: date })}
                      disabled={(date) => date < dateRange.from || date > new Date()}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant={showMarkers ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowMarkers(!showMarkers)}
            >
              <MapPin className="h-4 w-4 mr-2" />
              {showMarkers ? 'Hide' : 'Show'} Points
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Total Check-ins</div>
              <div className="text-2xl font-bold">{stats.totalCheckins}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Remote Check-ins</div>
              <div className="text-2xl font-bold text-green-600">{stats.remoteCheckins}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Unique Locations</div>
              <div className="text-2xl font-bold">{stats.uniqueLocations}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Coverage Area
              </div>
              <div className="text-2xl font-bold">{stats.coverageArea} km²</div>
            </div>
          </div>

          {/* Map */}
          <div className="relative rounded-lg overflow-hidden border" style={{ height: '500px' }}>
            <div ref={mapContainer} className="absolute inset-0" />
            
            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border">
              <div className="text-sm font-medium mb-2">Legend</div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>On-site Check-in</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span>Remote Check-in</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-2 bg-gradient-to-r from-blue-200 to-red-600 rounded"></div>
                  <span>Heatmap Intensity</span>
                </div>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="text-sm text-muted-foreground">
            💡 Tip: Zoom in to see individual check-in points. The heatmap shows concentration of check-ins in different areas.
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
};

export default LocationHeatmap;
