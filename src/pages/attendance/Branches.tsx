import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building, Plus, Edit } from 'lucide-react';

export default function AttendanceBranches() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'office',
    address: '',
    latitude: '',
    longitude: '',
    radius_meters: '200',
    photo_required: false,
    line_group_id: '',
    standard_start_time: '09:00'
  });

  const { data: branches, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('id, line_group_id, display_name')
        .eq('status', 'active')
        .order('display_name');
      
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        latitude: data.latitude ? parseFloat(data.latitude) : null,
        longitude: data.longitude ? parseFloat(data.longitude) : null,
        radius_meters: parseInt(data.radius_meters)
      };

      if (editingBranch) {
        const { error } = await supabase
          .from('branches')
          .update(payload)
          .eq('id', editingBranch.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('branches')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setDialogOpen(false);
      resetForm();
      toast({
        title: 'Success',
        description: `Branch ${editingBranch ? 'updated' : 'created'} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'office',
      address: '',
      latitude: '',
      longitude: '',
      radius_meters: '200',
      photo_required: false,
      line_group_id: '',
      standard_start_time: '09:00'
    });
    setEditingBranch(null);
  };

  const handleEdit = (branch: any) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      type: branch.type || 'office',
      address: branch.address || '',
      latitude: branch.latitude?.toString() || '',
      longitude: branch.longitude?.toString() || '',
      radius_meters: branch.radius_meters?.toString() || '200',
      photo_required: branch.photo_required || false,
      line_group_id: branch.line_group_id || '',
      standard_start_time: branch.standard_start_time || '09:00'
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.name) {
      toast({
        title: 'Validation Error',
        description: 'Branch name is required',
        variant: 'destructive',
      });
      return;
    }
    saveMutation.mutate(formData);
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                <Building className="h-4 w-4 sm:h-5 sm:w-5" />
                Branches
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Manage branches, geofences, and announcement groups
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Branch
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingBranch ? 'Edit' : 'Add'} Branch</DialogTitle>
                  <DialogDescription>
                    Configure branch details, location, and settings
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Branch Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Downtown Office"
                      />
                    </div>
                    <div>
                      <Label htmlFor="type">Type</Label>
                      <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="office">Office</SelectItem>
                          <SelectItem value="warehouse">Warehouse</SelectItem>
                          <SelectItem value="retail">Retail</SelectItem>
                          <SelectItem value="remote">Remote</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="123 Main St, Bangkok"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="latitude">Latitude</Label>
                      <Input
                        id="latitude"
                        type="number"
                        step="0.000001"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                        placeholder="13.756331"
                      />
                    </div>
                    <div>
                      <Label htmlFor="longitude">Longitude</Label>
                      <Input
                        id="longitude"
                        type="number"
                        step="0.000001"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                        placeholder="100.501765"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="radius_meters">Geofence Radius (meters)</Label>
                      <Input
                        id="radius_meters"
                        type="number"
                        value={formData.radius_meters}
                        onChange={(e) => setFormData({ ...formData, radius_meters: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="standard_start_time">Standard Start Time</Label>
                      <Input
                        id="standard_start_time"
                        type="time"
                        value={formData.standard_start_time}
                        onChange={(e) => setFormData({ ...formData, standard_start_time: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="line_group_id">LINE Group</Label>
                    <Select 
                      value={formData.line_group_id || undefined} 
                      onValueChange={(value) => setFormData({ ...formData, line_group_id: value })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select a LINE group (optional)" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {groups?.map((group) => (
                          <SelectItem key={group.id} value={group.line_group_id}>
                            {group.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="photo_required"
                      checked={formData.photo_required}
                      onCheckedChange={(checked) => setFormData({ ...formData, photo_required: checked as boolean })}
                    />
                    <Label htmlFor="photo_required" className="cursor-pointer">
                      Require photo for attendance
                    </Label>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px] text-xs sm:text-sm py-2">Name</TableHead>
                  <TableHead className="hidden sm:table-cell text-xs sm:text-sm py-2">Type</TableHead>
                  <TableHead className="hidden md:table-cell text-xs sm:text-sm py-2">Location</TableHead>
                  <TableHead className="hidden lg:table-cell text-xs sm:text-sm py-2">Radius</TableHead>
                  <TableHead className="text-xs sm:text-sm py-2">Photo</TableHead>
                  <TableHead className="hidden lg:table-cell text-xs sm:text-sm py-2">LINE</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm py-2">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches?.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium py-2">
                      <div className="flex flex-col">
                        <span className="text-sm">{branch.name}</span>
                        <span className="text-[10px] sm:hidden text-muted-foreground capitalize">{branch.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell capitalize text-sm py-2">{branch.type}</TableCell>
                    <TableCell className="hidden md:table-cell py-2">
                      {branch.latitude && branch.longitude ? (
                        <span className="text-[10px] font-mono">
                          {branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm py-2">{branch.radius_meters}m</TableCell>
                    <TableCell className="py-2">
                      <Badge variant={branch.photo_required ? 'default' : 'secondary'} className="h-4 sm:h-5 text-[10px] sm:text-xs">
                        {branch.photo_required ? '✓' : '✗'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell py-2">
                      <Badge variant={branch.line_group_id ? 'default' : 'secondary'} className="h-4 sm:h-5 text-[10px] sm:text-xs">
                        {branch.line_group_id ? 'Set' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 sm:h-8 sm:w-8"
                        onClick={() => handleEdit(branch)}
                      >
                        <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
