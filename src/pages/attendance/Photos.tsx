import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Camera, Search, Calendar, User, MapPin, Building2, X } from 'lucide-react';
import { format } from 'date-fns';

interface AttendancePhoto {
  id: string;
  photo_url: string | null;
  server_time: string;
  event_type: string;
  latitude: number | null;
  longitude: number | null;
  is_remote_checkin: boolean | null;
  employee: {
    id: string;
    full_name: string;
    code: string;
  };
  branch: {
    id: string;
    name: string;
  } | null;
}

export default function AttendancePhotos() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<AttendancePhoto | null>(null);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      return data;
    }
  });

  const { data: photos, isLoading } = useQuery({
    queryKey: ['attendance-photos', searchTerm, selectedBranch, selectedEventType, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('attendance_logs')
        .select(`
          id,
          photo_url,
          server_time,
          event_type,
          latitude,
          longitude,
          is_remote_checkin,
          employee:employees!inner(id, full_name, code),
          branch:branches(id, name)
        `)
        .order('server_time', { ascending: false });

      // Apply filters
      if (searchTerm) {
        query = query.ilike('employees.full_name', `%${searchTerm}%`);
      }

      if (selectedBranch !== 'all') {
        query = query.eq('branch_id', selectedBranch);
      }

      if (selectedEventType !== 'all') {
        query = query.eq('event_type', selectedEventType);
      }

      if (dateFrom) {
        query = query.gte('server_time', new Date(dateFrom).toISOString());
      }

      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        query = query.lte('server_time', endDate.toISOString());
      }

      const { data, error } = await query.limit(100);
      
      if (error) throw error;
      return data as AttendancePhoto[];
    }
  });

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedBranch('all');
    setSelectedEventType('all');
    setDateFrom('');
    setDateTo('');
  };

  const getPhotoUrl = (path: string) => {
    // ถ้าเป็น full URL อยู่แล้ว ใช้เลย (backward compatibility)
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    
    // ถ้าเป็น path ให้สร้าง public URL
    const { data } = supabase.storage
      .from('attendance-photos')
      .getPublicUrl(path);
    return data.publicUrl;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 sm:py-6 space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
            Attendance Records
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            View all employee attendance records (with or without photos)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search Employee
              </Label>
              <Input
                id="search"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Branch
              </Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger id="branch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches?.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-type">Event Type</Label>
              <Select value={selectedEventType} onValueChange={setSelectedEventType}>
                <SelectTrigger id="event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="check_in">Check In</SelectItem>
                  <SelectItem value="check_out">Check Out</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-from" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                From Date
              </Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-to">To Date</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full">
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {photos?.length || 0} records found ({photos?.filter(p => p.photo_url).length || 0} with photos)
              </p>
            </div>

            {photos && photos.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <Card 
                    key={photo.id} 
                    className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <div className="aspect-square relative bg-muted">
                      {photo.photo_url ? (
                        <img
                          src={getPhotoUrl(photo.photo_url)}
                          alt={`${photo.employee.full_name} - ${photo.event_type}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                          <Camera className="h-12 w-12 opacity-30 mb-2" />
                          <span className="text-sm">No Photo</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex flex-col gap-1">
                        <Badge 
                          variant={photo.event_type === 'check_in' ? 'default' : 'secondary'}
                        >
                          {photo.event_type === 'check_in' ? 'In' : 'Out'}
                        </Badge>
                        {photo.is_remote_checkin && (
                          <Badge variant="outline" className="bg-background/80">
                            🌐 Remote
                          </Badge>
                        )}
                        {!photo.photo_url && (
                          <Badge variant="destructive" className="text-xs">
                            No Photo
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium text-sm truncate">
                          {photo.employee.full_name}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(photo.server_time), 'dd MMM yyyy, HH:mm')}
                      </p>
                      {photo.branch && (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground truncate">
                            {photo.branch.name}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No attendance records found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2"
                onClick={() => setSelectedPhoto(null)}
              >
                <X className="h-4 w-4" />
              </Button>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {selectedPhoto.employee.full_name}
              </CardTitle>
              <CardDescription>
                Employee Code: {selectedPhoto.employee.code}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-video relative bg-muted rounded-lg overflow-hidden">
                {selectedPhoto.photo_url ? (
                  <img
                    src={getPhotoUrl(selectedPhoto.photo_url)}
                    alt={`${selectedPhoto.employee.full_name} - ${selectedPhoto.event_type}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                    <Camera className="h-16 w-16 opacity-30 mb-3" />
                    <span className="text-lg font-medium">No Photo Available</span>
                    <span className="text-sm">This check-in was completed without a photo</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Event Type</Label>
                  <div className="flex gap-2">
                    <Badge variant={selectedPhoto.event_type === 'check_in' ? 'default' : 'secondary'}>
                      {selectedPhoto.event_type === 'check_in' ? 'Check In' : 'Check Out'}
                    </Badge>
                    {selectedPhoto.is_remote_checkin && (
                      <Badge variant="outline">🌐 Remote</Badge>
                    )}
                    {!selectedPhoto.photo_url && (
                      <Badge variant="destructive">No Photo</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date & Time</Label>
                  <p className="text-sm">
                    {format(new Date(selectedPhoto.server_time), 'dd MMM yyyy, HH:mm:ss')}
                  </p>
                </div>

                {selectedPhoto.branch && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Branch
                    </Label>
                    <p className="text-sm">{selectedPhoto.branch.name}</p>
                  </div>
                )}

                {selectedPhoto.latitude && selectedPhoto.longitude && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Location
                    </Label>
                    <a
                      href={`https://www.google.com/maps?q=${selectedPhoto.latitude},${selectedPhoto.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      View on Map
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
