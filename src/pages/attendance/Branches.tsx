import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building, Plus, Edit, MapPin, Trash2 } from 'lucide-react';
import { MapPicker } from '@/components/attendance/MapPicker';

export default function AttendanceBranches() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<any>(null);
  const [deleteStats, setDeleteStats] = useState<{ logs: number; summaries: number } | null>(null);
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
        .eq('is_deleted', false)
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

  const handleDeleteClick = async (branch: any) => {
    setBranchToDelete(branch);
    
    // Fetch stats for confirmation
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branch.id);
    
    const { data: summaries } = await supabase
      .from('daily_attendance_summaries')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branch.id);
    
    setDeleteStats({
      logs: logs?.length || 0,
      summaries: summaries?.length || 0
    });
    
    setDeleteDialogOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: async (branchId: string) => {
      const { data, error } = await supabase.rpc('soft_delete_branch', {
        p_branch_id: branchId
      });
      
      if (error) throw error;
      
      const result = data as any;
      if (!result.success) {
        throw new Error(result.message);
      }
      
      return result;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setDeleteDialogOpen(false);
      setBranchToDelete(null);
      setDeleteStats(null);
      toast({
        title: 'Success',
        description: data.message,
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

                  <div>
                    <Label>Location (Latitude, Longitude)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.000001"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                        placeholder="13.756331"
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        step="0.000001"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                        placeholder="100.501765"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setMapPickerOpen(true)}
                        className="flex-shrink-0"
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        แผนที่
                      </Button>
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
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 sm:h-8 sm:w-8"
                          onClick={() => handleEdit(branch)}
                        >
                          <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteClick(branch)}
                        >
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <MapPicker
        open={mapPickerOpen}
        onOpenChange={setMapPickerOpen}
        initialLat={parseFloat(formData.latitude) || 13.756331}
        initialLng={parseFloat(formData.longitude) || 100.501765}
        radiusMeters={parseInt(formData.radius_meters) || 200}
        onLocationSelect={(lat, lng) => {
          setFormData({
            ...formData,
            latitude: lat.toString(),
            longitude: lng.toString()
          });
          setMapPickerOpen(false);
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch: {branchToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>This branch will be hidden from the system, but all historical data will be preserved:</p>
              
              {deleteStats && (
                <div className="bg-muted p-3 rounded-md text-sm">
                  <div className="font-semibold mb-2">📊 Historical Data (will be preserved):</div>
                  <ul className="space-y-1 ml-4">
                    <li>• {deleteStats.logs.toLocaleString()} attendance logs</li>
                    <li>• {deleteStats.summaries.toLocaleString()} daily summaries</li>
                  </ul>
                </div>
              )}
              
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md text-sm">
                <div className="font-semibold text-amber-900 dark:text-amber-100 mb-1">⚠️ Important:</div>
                <p className="text-amber-800 dark:text-amber-200">
                  All attendance data will remain intact for salary calculations and reports. 
                  Only the branch configuration will be hidden.
                </p>
              </div>
              
              <p className="text-sm text-muted-foreground">
                Note: You cannot delete a branch with active employees. Please reassign or deactivate employees first.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => branchToDelete && deleteMutation.mutate(branchToDelete.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Branch'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
