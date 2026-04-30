import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, FileText, Paperclip, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SuggestionPick =
  | { kind: "title"; value: string }
  | { kind: "file"; value: string }
  | { kind: "employee"; value: string; employeeId: string };

interface Props {
  /** Free-text query value (mirrors the upstream `search` state). */
  value: string;
  onValueChange: (v: string) => void;
  /** Active employee chip; null if none. */
  employeeChip: { id: string; name: string } | null;
  onClearEmployee: () => void;
  /** Called when a suggestion is selected. */
  onPick: (pick: SuggestionPick) => void;
  placeholder?: string;
}

export function DocumentSearchCombobox({
  value, onValueChange, employeeChip, onClearEmployee, onPick, placeholder,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [debounced, setDebounced] = useState(value);

  // Keep local draft synced when parent clears value (e.g. reset).
  useEffect(() => { setDraft(value); }, [value]);

  // 200ms debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(draft), 200);
    return () => clearTimeout(t);
  }, [draft]);

  const q = debounced.trim();
  const enabled = q.length >= 1;

  const { data: suggestions } = useQuery({
    queryKey: ["employee-documents-suggest", q],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const like = `%${q}%`;
      const [titles, files, employees] = await Promise.all([
        supabase
          .from("employee_documents" as any)
          .select("title")
          .ilike("title", like)
          .neq("status", "archived")
          .limit(8),
        supabase
          .from("employee_documents" as any)
          .select("file_name")
          .ilike("file_name", like)
          .neq("status", "archived")
          .limit(5),
        supabase
          .from("employees")
          .select("id, full_name")
          .ilike("full_name", like)
          .eq("is_active", true)
          .limit(8),
      ]);

      // De-dup titles + files (case-insensitive)
      const dedup = (arr: { val: string }[]) => {
        const seen = new Set<string>();
        return arr.filter(({ val }) => {
          const k = val.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };
      const titleItems = dedup(((titles.data as any[]) ?? []).map((r) => ({ val: r.title })));
      const fileItems = dedup(((files.data as any[]) ?? []).map((r) => ({ val: r.file_name })));
      const empItems = ((employees.data as any[]) ?? []).map((r) => ({ id: r.id as string, name: r.full_name as string }));
      return { titles: titleItems, files: fileItems, employees: empItems };
    },
  });

  const handleInput = (next: string) => {
    setDraft(next);
    onValueChange(next);
    if (!open && next.length > 0) setOpen(true);
  };

  return (
    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "ring-offset-background placeholder:text-muted-foreground pl-8",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              placeholder={placeholder ?? "ค้นหาชื่อเอกสาร / ไฟล์ / พนักงาน..."}
              value={draft}
              onChange={(e) => handleInput(e.target.value)}
              onFocus={() => { if (draft.length > 0) setOpen(true); }}
              aria-autocomplete="list"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[var(--radix-popover-trigger-width)]"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={draft}
              onValueChange={handleInput}
              placeholder="พิมพ์เพื่อค้นหา..."
            />
            <CommandList>
              {!enabled && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  พิมพ์อย่างน้อย 1 ตัวอักษร
                </div>
              )}
              {enabled && suggestions &&
                suggestions.titles.length === 0 &&
                suggestions.files.length === 0 &&
                suggestions.employees.length === 0 && (
                  <CommandEmpty>ไม่พบรายการที่ตรงกัน</CommandEmpty>
              )}
              {suggestions && suggestions.titles.length > 0 && (
                <CommandGroup heading="เอกสาร">
                  {suggestions.titles.map((it) => (
                    <CommandItem
                      key={`t-${it.val}`}
                      value={`t-${it.val}`}
                      onSelect={() => {
                        onPick({ kind: "title", value: it.val });
                        setOpen(false);
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span className="truncate">{it.val}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {suggestions && suggestions.files.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="ไฟล์">
                    {suggestions.files.map((it) => (
                      <CommandItem
                        key={`f-${it.val}`}
                        value={`f-${it.val}`}
                        onSelect={() => {
                          onPick({ kind: "file", value: it.val });
                          setOpen(false);
                        }}
                      >
                        <Paperclip className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="truncate">{it.val}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              {suggestions && suggestions.employees.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="พนักงาน">
                    {suggestions.employees.map((it) => (
                      <CommandItem
                        key={`e-${it.id}`}
                        value={`e-${it.id}`}
                        onSelect={() => {
                          onPick({ kind: "employee", value: it.name, employeeId: it.id });
                          setOpen(false);
                        }}
                      >
                        <User className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="truncate">{it.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {employeeChip && (
        <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1 shrink-0">
          <User className="h-3 w-3" />
          <span className="max-w-[120px] truncate">{employeeChip.name}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 hover:bg-background/60"
            onClick={onClearEmployee}
            aria-label="ล้างพนักงาน"
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      )}
    </div>
  );
}
