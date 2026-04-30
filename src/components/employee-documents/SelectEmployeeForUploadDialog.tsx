import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, User } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface EmployeeLite {
  id: string;
  full_name: string;
  branch_id: string | null;
  branches?: { name: string | null } | null;
}

/**
 * Phase 1A.2 — Lets HR open the upload flow from the global Employee Documents page.
 * Picks an employee, then routes to that employee's detail page with ?action=upload-document
 * which triggers EmployeeDocumentsTab to auto-open the upload dialog.
 */
export function SelectEmployeeForUploadDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees-for-upload-picker"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, branch_id, branches:branches!employees_branch_id_fkey(name)")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as EmployeeLite[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      (e.full_name || "").toLowerCase().includes(q) ||
      (e.branches?.name || "").toLowerCase().includes(q)
    );
  }, [employees, search]);

  const pick = (id: string) => {
    onOpenChange(false);
    navigate(`/attendance/employees/${id}?action=upload-document`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] grid grid-rows-[auto_auto_1fr]">
        <DialogHeader>
          <DialogTitle>เลือกพนักงานเพื่ออัปโหลดเอกสาร</DialogTitle>
          <DialogDescription>
            เอกสารแต่ละรายการต้องผูกกับพนักงานหนึ่งคน เลือกพนักงานเพื่อไปยังหน้าอัปโหลด
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="ค้นหาด้วยชื่อหรือสาขา..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="overflow-y-auto -mx-2 px-2">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">ไม่พบพนักงาน</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((e) => (
                <li key={e.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start h-auto py-2"
                    onClick={() => pick(e.id)}
                  >
                    <User className="h-4 w-4 mr-2 shrink-0" />
                    <span className="flex flex-col items-start text-left">
                      <span className="font-medium">{e.full_name}</span>
                      {e.branches?.name && (
                        <span className="text-xs text-muted-foreground">{e.branches.name}</span>
                      )}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
