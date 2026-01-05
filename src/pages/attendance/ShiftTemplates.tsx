import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit2, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface ShiftTemplate {
  id: string;
  branch_id: string | null;
  name: string;
  short_code: string;
  start_time: string;
  end_time: string;
  break_hours: number;
  color: string;
  is_active: boolean;
  branches?: { name: string } | null;
}

interface Branch {
  id: string;
  name: string;
}

const DEFAULT_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

export default function ShiftTemplates() {
  const queryClient = useQueryClient();
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    short_code: '',
    start_time: '08:00',
    end_time: '17:00',
    break_hours: 1,
    color: '#3B82F6',
    branch_id: '',
  });

  // Fetch branches
  const { data: branches = [] } = useQuery({
    queryKey: ['branches-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return data as Branch[];
    },
  });

  // Fetch shift templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['shift-templates', selectedBranch],
    queryFn: async () => {
      let query = supabase
        .from('shift_templates')
        .select('*, branches(name)')
        .order('start_time');
      
      if (selectedBranch !== 'all') {
        query = query.eq('branch_id', selectedBranch);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ShiftTemplate[];
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      const payload = {
        name: data.name,
        short_code: data.short_code.toUpperCase(),
        start_time: data.start_time,
        end_time: data.end_time,
        break_hours: data.break_hours,
        color: data.color,
        branch_id: data.branch_id || null,
      };

      if (data.id) {
        const { error } = await supabase
          .from('shift_templates')
          .update(payload)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shift_templates')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-templates'] });
      toast.success(editingTemplate ? 'อัพเดทกะเรียบร้อย' : 'สร้างกะใหม่เรียบร้อย');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('เกิดข้อผิดพลาด: ' + (error as Error).message);
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('shift_templates')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-templates'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('shift_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-templates'] });
      toast.success('ลบกะเรียบร้อย');
    },
    onError: (error) => {
      toast.error('ไม่สามารถลบได้: ' + (error as Error).message);
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
    setFormData({
      name: '',
      short_code: '',
      start_time: '08:00',
      end_time: '17:00',
      break_hours: 1,
      color: '#3B82F6',
      branch_id: '',
    });
  };

  const handleEdit = (template: ShiftTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      short_code: template.short_code,
      start_time: template.start_time,
      end_time: template.end_time,
      break_hours: template.break_hours,
      color: template.color,
      branch_id: template.branch_id || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      ...formData,
      id: editingTemplate?.id,
    });
  };

  const calculateWorkHours = (start: string, end: string, breakHours: number) => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let hours = endH - startH + (endM - startM) / 60;
    if (hours < 0) hours += 24; // overnight shift
    return Math.max(0, hours - breakHours);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">รูปแบบกะ (Shift Templates)</h1>
          <p className="text-muted-foreground">จัดการรูปแบบกะทำงานสำหรับแต่ละสาขา</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="เลือกสาขา" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสาขา</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                เพิ่มกะใหม่
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingTemplate ? 'แก้ไขรูปแบบกะ' : 'สร้างรูปแบบกะใหม่'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>ชื่อกะ</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="เช่น กะเช้า, กะบ่าย"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>รหัสย่อ</Label>
                    <Input
                      value={formData.short_code}
                      onChange={(e) => setFormData({ ...formData, short_code: e.target.value.toUpperCase() })}
                      placeholder="เช่น M, A, N"
                      maxLength={3}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>เวลาเริ่ม</Label>
                    <Input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>เวลาสิ้นสุด</Label>
                    <Input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>พักกี่ชั่วโมง</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="4"
                      value={formData.break_hours}
                      onChange={(e) => setFormData({ ...formData, break_hours: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>สาขา</Label>
                    <Select 
                      value={formData.branch_id} 
                      onValueChange={(v) => setFormData({ ...formData, branch_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="เลือกสาขา" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">ใช้ได้ทุกสาขา</SelectItem>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>สี</Label>
                  <div className="flex gap-2 flex-wrap">
                    {DEFAULT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          formData.color === color ? 'border-foreground scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>
                      ชั่วโมงทำงานสุทธิ: {calculateWorkHours(formData.start_time, formData.end_time, formData.break_hours).toFixed(1)} ชม.
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    ยกเลิก
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            รายการกะทั้งหมด
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">กำลังโหลด...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              ยังไม่มีรูปแบบกะ กรุณาเพิ่มกะใหม่
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>กะ</TableHead>
                  <TableHead>เวลา</TableHead>
                  <TableHead>พัก</TableHead>
                  <TableHead>ชม.ทำงาน</TableHead>
                  <TableHead>สาขา</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: template.color }}
                        />
                        <span className="font-medium">{template.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {template.short_code}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {template.start_time.slice(0, 5)} - {template.end_time.slice(0, 5)}
                    </TableCell>
                    <TableCell>{template.break_hours} ชม.</TableCell>
                    <TableCell>
                      {calculateWorkHours(template.start_time, template.end_time, template.break_hours).toFixed(1)} ชม.
                    </TableCell>
                    <TableCell>
                      {template.branches?.name || <span className="text-muted-foreground">ทุกสาขา</span>}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={template.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: template.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('ต้องการลบกะนี้?')) {
                              deleteMutation.mutate(template.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
