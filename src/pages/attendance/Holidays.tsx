/**
 * Holidays Management Page
 * Admin can add/edit/delete public holidays
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Calendar, Plus, Pencil, Trash2, PartyPopper, Building, Globe, RefreshCw } from "lucide-react";
import { format, parseISO, getYear } from "date-fns";
import { th } from "date-fns/locale";

interface Holiday {
  id: string;
  date: string;
  name: string;
  name_en: string | null;
  is_national: boolean;
  is_recurring: boolean;
  branch_id: string | null;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
}

export default function Holidays() {
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(getYear(new Date()));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  
  // Form state
  const [formDate, setFormDate] = useState("");
  const [formName, setFormName] = useState("");
  const [formNameEn, setFormNameEn] = useState("");
  const [formIsNational, setFormIsNational] = useState(true);
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formBranchId, setFormBranchId] = useState<string>("all");

  // Fetch holidays
  const { data: holidays, isLoading } = useQuery({
    queryKey: ["holidays-management", selectedYear],
    queryFn: async () => {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date");
      
      if (error) throw error;
      return data as Holiday[];
    },
  });

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ["branches-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name")
        .eq("is_deleted", false)
        .order("name");
      
      if (error) throw error;
      return data as Branch[];
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (holiday: Partial<Holiday>) => {
      if (editingHoliday) {
        const { error } = await supabase
          .from("holidays")
          .update({
            date: holiday.date,
            name: holiday.name,
            name_en: holiday.name_en || null,
            is_national: holiday.is_national,
            is_recurring: holiday.is_recurring,
            branch_id: holiday.branch_id || null,
          })
          .eq("id", editingHoliday.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("holidays")
          .insert({
            date: holiday.date,
            name: holiday.name,
            name_en: holiday.name_en || null,
            is_national: holiday.is_national,
            is_recurring: holiday.is_recurring,
            branch_id: holiday.branch_id || null,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingHoliday ? "แก้ไขวันหยุดสำเร็จ" : "เพิ่มวันหยุดสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["holidays-management"] });
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error("เกิดข้อผิดพลาด: " + error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("holidays")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบวันหยุดสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["holidays-management"] });
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
    },
    onError: (error: any) => {
      toast.error("เกิดข้อผิดพลาด: " + error.message);
    },
  });

  // Reset form
  const resetForm = () => {
    setFormDate("");
    setFormName("");
    setFormNameEn("");
    setFormIsNational(true);
    setFormIsRecurring(false);
    setFormBranchId("all");
    setEditingHoliday(null);
  };

  // Open dialog for editing
  const handleEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setFormDate(holiday.date);
    setFormName(holiday.name);
    setFormNameEn(holiday.name_en || "");
    setFormIsNational(holiday.is_national ?? true);
    setFormIsRecurring(holiday.is_recurring ?? false);
    setFormBranchId(holiday.branch_id || "all");
    setIsDialogOpen(true);
  };

  // Close dialog
  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  // Save holiday
  const handleSave = () => {
    if (!formDate || !formName) {
      toast.error("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    saveMutation.mutate({
      date: formDate,
      name: formName,
      name_en: formNameEn || null,
      is_national: formIsNational,
      is_recurring: formIsRecurring,
      branch_id: formBranchId === "all" ? null : formBranchId,
    });
  };

  // Get branch name
  const getBranchName = (branchId: string | null) => {
    if (!branchId) return "ทุกสาขา";
    const branch = branches?.find(b => b.id === branchId);
    return branch?.name || "ไม่ทราบ";
  };

  // Year options
  const yearOptions = [getYear(new Date()) - 1, getYear(new Date()), getYear(new Date()) + 1];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PartyPopper className="h-6 w-6 text-primary" />
            จัดการวันหยุด
          </h1>
          <p className="text-muted-foreground">เพิ่ม แก้ไข หรือลบวันหยุดนักขัตฤกษ์</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                เพิ่มวันหยุด
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingHoliday ? "แก้ไขวันหยุด" : "เพิ่มวันหยุดใหม่"}</DialogTitle>
                <DialogDescription>
                  กรอกข้อมูลวันหยุดนักขัตฤกษ์
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="date">วันที่</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">ชื่อวันหยุด (ภาษาไทย)</Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="เช่น วันสงกรานต์"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameEn">ชื่อวันหยุด (English)</Label>
                  <Input
                    id="nameEn"
                    value={formNameEn}
                    onChange={(e) => setFormNameEn(e.target.value)}
                    placeholder="e.g. Songkran"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>วันหยุดประจำชาติ</Label>
                    <p className="text-xs text-muted-foreground">ใช้กับทุกสาขา</p>
                  </div>
                  <Switch
                    checked={formIsNational}
                    onCheckedChange={setFormIsNational}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>วันหยุดประจำปี</Label>
                    <p className="text-xs text-muted-foreground">เกิดซ้ำทุกปี</p>
                  </div>
                  <Switch
                    checked={formIsRecurring}
                    onCheckedChange={setFormIsRecurring}
                  />
                </div>
                {!formIsNational && (
                  <div className="space-y-2">
                    <Label>สาขา</Label>
                    <Select value={formBranchId} onValueChange={setFormBranchId}>
                      <SelectTrigger>
                        <SelectValue placeholder="เลือกสาขา" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ทุกสาขา</SelectItem>
                        {branches?.map(branch => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDialog}>
                  ยกเลิก
                </Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{holidays?.length || 0}</p>
                <p className="text-xs text-muted-foreground">วันหยุดทั้งหมด</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-sky-500" />
              <div>
                <p className="text-2xl font-bold">{holidays?.filter(h => h.is_national).length || 0}</p>
                <p className="text-xs text-muted-foreground">วันหยุดประจำชาติ</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{holidays?.filter(h => !h.is_national).length || 0}</p>
                <p className="text-xs text-muted-foreground">วันหยุดเฉพาะสาขา</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{holidays?.filter(h => h.is_recurring).length || 0}</p>
                <p className="text-xs text-muted-foreground">วันหยุดประจำปี</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Holidays Table */}
      <Card>
        <CardHeader>
          <CardTitle>รายการวันหยุด {selectedYear}</CardTitle>
          <CardDescription>วันหยุดนักขัตฤกษ์และวันหยุดพิเศษ</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : holidays?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <PartyPopper className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>ไม่มีวันหยุดในปี {selectedYear}</p>
              <Button variant="outline" className="mt-4" onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                เพิ่มวันหยุดแรก
              </Button>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">วันที่</TableHead>
                    <TableHead>ชื่อวันหยุด</TableHead>
                    <TableHead className="hidden md:table-cell">ชื่อ (EN)</TableHead>
                    <TableHead className="text-center">ประเภท</TableHead>
                    <TableHead className="hidden sm:table-cell">สาขา</TableHead>
                    <TableHead className="w-[100px] text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays?.map((holiday) => (
                    <TableRow key={holiday.id}>
                      <TableCell className="font-medium">
                        {format(parseISO(holiday.date), "d MMM", { locale: th })}
                      </TableCell>
                      <TableCell>{holiday.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {holiday.name_en || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {holiday.is_national && (
                            <Badge variant="secondary" className="text-xs">
                              <Globe className="h-3 w-3 mr-1" />
                              ประจำชาติ
                            </Badge>
                          )}
                          {holiday.is_recurring && (
                            <Badge variant="outline" className="text-xs">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              ประจำปี
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {getBranchName(holiday.branch_id)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(holiday)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
                                <AlertDialogDescription>
                                  ต้องการลบวันหยุด "{holiday.name}" หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(holiday.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  ลบ
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}