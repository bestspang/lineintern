import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { 
  DollarSign, 
  Users, 
  Download, 
  Search,
  Building,
  FileText,
  TrendingUp,
  Calendar,
  Check,
  ChevronsUpDown
} from "lucide-react";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface YTDRecord {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  branch_name: string;
  total_gross: number;
  total_net: number;
  total_ot_pay: number;
  total_ot_hours: number;
  total_deductions: number;
  total_allowances: number;
  total_social_security: number;
  total_withholding_tax: number;
  months_worked: number;
}

export default function PayrollYTD() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [comboboxOpen, setComboboxOpen] = useState(false);

  // Fetch all payroll records for the year
  const { data: payrollData, isLoading } = useQuery({
    queryKey: ["payroll-ytd", selectedYear],
    queryFn: async () => {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      
      // First get all periods in this year
      const { data: periods, error: periodError } = await supabase
        .from("payroll_periods")
        .select("id, name")
        .gte("start_date", startDate)
        .lte("end_date", endDate)
        .eq("status", "completed");
      
      if (periodError) throw periodError;
      if (!periods?.length) return [];
      
      // Then get all records for those periods
      const { data: records, error: recordsError } = await supabase
        .from("payroll_records")
        .select(`
          *,
          employee:employees (
            id,
            full_name,
            code,
            branch_id,
            branches (name)
          )
        `)
        .in("period_id", periods.map(p => p.id));
      
      if (recordsError) throw recordsError;
      return records || [];
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
      return data;
    },
  });

  // Aggregate YTD data by employee
  const ytdRecords = useMemo(() => {
    if (!payrollData?.length) return [];
    
    const employeeMap = new Map<string, YTDRecord>();
    
    payrollData.forEach(record => {
      const empId = record.employee_id;
      const existing = employeeMap.get(empId);
      
      // Calculate social security and withholding tax from deductions
      const deductionsRaw = record.deductions;
      const deductions: Array<{ name?: string; amount?: number }> = Array.isArray(deductionsRaw) ? deductionsRaw as Array<{ name?: string; amount?: number }> : [];
      const socialSecurity = deductions.find(d => d.name?.includes('ประกันสังคม'))?.amount || 0;
      const withholdingTax = deductions.find(d => d.name?.includes('ภาษี'))?.amount || 0;
      
      if (existing) {
        existing.total_gross += record.gross_pay || 0;
        existing.total_net += record.net_pay || 0;
        existing.total_ot_pay += record.ot_pay || 0;
        existing.total_ot_hours += record.ot_hours || 0;
        existing.total_deductions += record.total_deductions || 0;
        existing.total_allowances += record.total_allowances || 0;
        existing.total_social_security += socialSecurity;
        existing.total_withholding_tax += withholdingTax;
        existing.months_worked += 1;
      } else {
        employeeMap.set(empId, {
          employee_id: empId,
          employee_name: record.employee?.full_name || "Unknown",
          employee_code: record.employee?.code || "-",
          branch_name: record.employee?.branches?.name || "-",
          total_gross: record.gross_pay || 0,
          total_net: record.net_pay || 0,
          total_ot_pay: record.ot_pay || 0,
          total_ot_hours: record.ot_hours || 0,
          total_deductions: record.total_deductions || 0,
          total_allowances: record.total_allowances || 0,
          total_social_security: socialSecurity,
          total_withholding_tax: withholdingTax,
          months_worked: 1,
        });
      }
    });
    
    return Array.from(employeeMap.values());
  }, [payrollData]);

  // Filter records
  const filteredRecords = useMemo(() => {
    let result = ytdRecords;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.employee_name.toLowerCase().includes(query) ||
        r.employee_code.toLowerCase().includes(query)
      );
    }
    
    if (selectedBranch !== "all") {
      result = result.filter(r => r.branch_name === branches?.find(b => b.id === selectedBranch)?.name);
    }
    
    return result.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  }, [ytdRecords, searchQuery, selectedBranch, branches]);

  // Calculate totals
  const totals = useMemo(() => {
    return {
      totalGross: filteredRecords.reduce((sum, r) => sum + r.total_gross, 0),
      totalNet: filteredRecords.reduce((sum, r) => sum + r.total_net, 0),
      totalOT: filteredRecords.reduce((sum, r) => sum + r.total_ot_pay, 0),
      totalDeductions: filteredRecords.reduce((sum, r) => sum + r.total_deductions, 0),
      totalSocialSecurity: filteredRecords.reduce((sum, r) => sum + r.total_social_security, 0),
      totalWithholdingTax: filteredRecords.reduce((sum, r) => sum + r.total_withholding_tax, 0),
      employeeCount: filteredRecords.length,
    };
  }, [filteredRecords]);

  // Export to CSV for tax filing
  const handleExport = () => {
    if (!filteredRecords.length) {
      toast.error("ไม่มีข้อมูลให้ Export");
      return;
    }
    
    const headers = [
      "รหัสพนักงาน",
      "ชื่อ-นามสกุล",
      "สาขา",
      "จำนวนเดือน",
      "รายได้รวมทั้งปี",
      "OT รวม",
      "เบี้ยเลี้ยงรวม",
      "หักประกันสังคม",
      "หักภาษี ณ ที่จ่าย",
      "หักอื่นๆ",
      "เงินสุทธิรวม"
    ];
    
    const rows = filteredRecords.map(r => [
      r.employee_code,
      r.employee_name,
      r.branch_name,
      r.months_worked,
      r.total_gross.toFixed(2),
      r.total_ot_pay.toFixed(2),
      r.total_allowances.toFixed(2),
      r.total_social_security.toFixed(2),
      r.total_withholding_tax.toFixed(2),
      (r.total_deductions - r.total_social_security - r.total_withholding_tax).toFixed(2),
      r.total_net.toFixed(2),
    ]);
    
    // Add summary row
    rows.push([
      "",
      "รวมทั้งหมด",
      "",
      "",
      totals.totalGross.toFixed(2),
      totals.totalOT.toFixed(2),
      filteredRecords.reduce((sum, r) => sum + r.total_allowances, 0).toFixed(2),
      totals.totalSocialSecurity.toFixed(2),
      totals.totalWithholdingTax.toFixed(2),
      (totals.totalDeductions - totals.totalSocialSecurity - totals.totalWithholdingTax).toFixed(2),
      totals.totalNet.toFixed(2),
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll_ytd_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success("Export สำเร็จ");
  };

  // Export ภงด.1 format
  const handleExportPND1 = () => {
    if (!filteredRecords.length) {
      toast.error("ไม่มีข้อมูลให้ Export");
      return;
    }
    
    const headers = [
      "ลำดับ",
      "เลขประจำตัวประชาชน",
      "คำนำหน้า",
      "ชื่อ",
      "นามสกุล",
      "วันเดือนปีที่จ่าย",
      "ประเภทเงินได้",
      "จำนวนเงินได้",
      "ภาษีที่หัก"
    ];
    
    const rows = filteredRecords.map((r, index) => {
      const nameParts = r.employee_name.split(" ");
      return [
        index + 1,
        "", // เลขประจำตัวประชาชน - ต้องเพิ่มใน employees table
        "", // คำนำหน้า
        nameParts[0] || "",
        nameParts.slice(1).join(" ") || "",
        `01/01/${selectedYear}-31/12/${selectedYear}`,
        "40(1)", // ประเภทเงินได้ - เงินเดือน
        r.total_gross.toFixed(2),
        r.total_withholding_tax.toFixed(2),
      ];
    });
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnd1_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success("Export ภงด.1 สำเร็จ");
  };

  // Available years
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Year-to-Date Summary
          </h1>
          <p className="text-muted-foreground">
            สรุปเงินเดือนสะสมรายปี สำหรับยื่นภาษี
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPND1}>
            <FileText className="h-4 w-4 mr-2" />
            Export ภงด.1
          </Button>
          <Button onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">รายได้รวมทั้งปี</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">฿{totals.totalGross.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ประกันสังคมสะสม</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">฿{totals.totalSocialSecurity.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ภาษีหัก ณ ที่จ่าย</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">฿{totals.totalWithholdingTax.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">เงินสุทธิรวม</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">฿{totals.totalNet.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[150px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="เลือกปี" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>
                    {year + 543} ({year})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[200px]">
                <Building className="h-4 w-4 mr-2" />
                <SelectValue placeholder="ทุกสาขา" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกสาขา</SelectItem>
                {branches?.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="flex-1 justify-between min-w-[250px]"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {searchQuery || "ค้นหาชื่อหรือรหัสพนักงาน..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="พิมพ์ชื่อหรือรหัส..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>ไม่พบพนักงาน</CommandEmpty>
                    <CommandGroup>
                      {searchQuery && (
                        <CommandItem
                          value="__clear__"
                          onSelect={() => {
                            setSearchQuery("");
                            setComboboxOpen(false);
                          }}
                        >
                          <Search className="mr-2 h-4 w-4" />
                          แสดงทั้งหมด
                        </CommandItem>
                      )}
                      {ytdRecords
                        .filter(r =>
                          r.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.employee_code.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .slice(0, 10)
                        .map((record) => (
                          <CommandItem
                            key={record.employee_id}
                            value={record.employee_name}
                            onSelect={() => {
                              setSearchQuery(record.employee_name);
                              setComboboxOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                searchQuery === record.employee_name ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{record.employee_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {record.employee_code} • {record.branch_name}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>รายละเอียดรายบุคคล</CardTitle>
          <CardDescription>
            {filteredRecords.length} พนักงาน | ปี {parseInt(selectedYear) + 543}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>ไม่พบข้อมูลเงินเดือนในปี {selectedYear}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อ-นามสกุล</TableHead>
                    <TableHead>สาขา</TableHead>
                    <TableHead className="text-center">เดือน</TableHead>
                    <TableHead className="text-right">รายได้รวม</TableHead>
                    <TableHead className="text-right">OT รวม</TableHead>
                    <TableHead className="text-right">ประกันสังคม</TableHead>
                    <TableHead className="text-right">ภาษี</TableHead>
                    <TableHead className="text-right">เงินสุทธิ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map(record => (
                    <TableRow key={record.employee_id}>
                      <TableCell className="font-mono">{record.employee_code}</TableCell>
                      <TableCell className="font-medium">{record.employee_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{record.branch_name}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{record.months_worked}</TableCell>
                      <TableCell className="text-right font-medium">
                        ฿{record.total_gross.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        ฿{record.total_ot_pay.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        ฿{record.total_social_security.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        ฿{record.total_withholding_tax.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600">
                        ฿{record.total_net.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Summary Row */}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={4}>รวมทั้งหมด ({filteredRecords.length} คน)</TableCell>
                    <TableCell className="text-right">฿{totals.totalGross.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-blue-600">฿{totals.totalOT.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-orange-600">฿{totals.totalSocialSecurity.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-red-600">฿{totals.totalWithholdingTax.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-green-600">฿{totals.totalNet.toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
