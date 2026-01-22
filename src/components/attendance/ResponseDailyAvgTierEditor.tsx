import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Tier = {
  max_seconds: number;
  points: number;
  label?: string;
};

type Conditions = {
  min_responses?: number;
  tiers?: Tier[];
  [key: string]: unknown;
};

const DEFAULT_TIERS: Tier[] = [
  { max_seconds: 300, points: 8, label: "perfect" },
  { max_seconds: 600, points: 5, label: "good" },
  { max_seconds: 1800, points: 3, label: "ok" },
  { max_seconds: 999999, points: 1, label: "slow" },
];

function normalizeTiers(input: unknown): Tier[] {
  const tiers = Array.isArray(input) ? input : [];
  const normalized = tiers
    .map((t: any): Tier | null => {
      const max = Number(t?.max_seconds);
      const pts = Number(t?.points);
      if (!Number.isFinite(max) || !Number.isFinite(pts)) return null;
      return {
        max_seconds: Math.max(0, Math.floor(max)),
        points: Math.trunc(pts),
        label: typeof t?.label === "string" ? t.label : undefined,
      };
    })
    .filter(Boolean) as Tier[];

  return normalized.length > 0
    ? normalized.sort((a, b) => a.max_seconds - b.max_seconds)
    : DEFAULT_TIERS.slice();
}

function autoLabelForIndex(i: number): string {
  const labels = ["perfect", "good", "ok", "slow"];
  return labels[i] ?? `tier_${i + 1}`;
}

function buildConditions(base: Conditions, minResponses: number, tiers: Tier[]): Conditions {
  const sorted = tiers
    .map((t, idx) => ({
      ...t,
      max_seconds: Math.max(0, Math.floor(Number(t.max_seconds) || 0)),
      points: Math.trunc(Number(t.points) || 0),
      label: autoLabelForIndex(idx),
    }))
    .sort((a, b) => a.max_seconds - b.max_seconds);

  return {
    ...base,
    min_responses: Math.max(1, Math.floor(Number(minResponses) || 1)),
    tiers: sorted,
  };
}

export function ResponseDailyAvgTierEditor(props: {
  className?: string;
  conditions: Conditions;
  disabled?: boolean;
  onSave: (nextConditions: Conditions) => void;
}) {
  const { className, conditions, disabled, onSave } = props;

  const initialMinResponses = useMemo(
    () => Math.max(1, Math.floor(Number((conditions as any)?.min_responses ?? 1) || 1)),
    [conditions],
  );

  const initialTiers = useMemo(() => normalizeTiers((conditions as any)?.tiers), [conditions]);

  const [minResponses, setMinResponses] = useState<number>(initialMinResponses);
  const [tiers, setTiers] = useState<Tier[]>(initialTiers);

  // If data refreshes from query invalidation, sync local editor state.
  useEffect(() => {
    setMinResponses(initialMinResponses);
    setTiers(initialTiers);
  }, [initialMinResponses, initialTiers]);

  const isDirty = useMemo(() => {
    // Cheap dirty check
    if (minResponses !== initialMinResponses) return true;
    if (tiers.length !== initialTiers.length) return true;
    for (let i = 0; i < tiers.length; i++) {
      if (
        Number(tiers[i]?.max_seconds) !== Number(initialTiers[i]?.max_seconds) ||
        Number(tiers[i]?.points) !== Number(initialTiers[i]?.points)
      ) {
        return true;
      }
    }
    return false;
  }, [initialMinResponses, initialTiers, minResponses, tiers]);

  const previewLines = useMemo(() => {
    const sorted = [...tiers].sort((a, b) => a.max_seconds - b.max_seconds);
    return sorted.map((t, idx) => ({
      label: autoLabelForIndex(idx),
      max_seconds: Number(t.max_seconds) || 0,
      points: Number(t.points) || 0,
    }));
  }, [tiers]);

  const canSave = isDirty && tiers.length > 0;

  return (
    <div className={cn("mt-3 rounded-lg border bg-muted/20 p-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Daily Response Score Settings</div>
          <div className="text-xs text-muted-foreground">
            ตั้งค่าเกณฑ์เวลาตอบเฉลี่ย (วินาที) → คะแนนที่จะได้รับต่อวัน
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => onSave(buildConditions(conditions, minResponses, tiers))}
          disabled={disabled || !canSave}
        >
          บันทึก (tiers)
        </Button>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="min-responses" className="text-xs">
              min_responses
            </Label>
            <Input
              id="min-responses"
              type="number"
              min={1}
              value={minResponses}
              onChange={(e) => setMinResponses(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              disabled={disabled}
            />
            <div className="text-xs text-muted-foreground">
              ต้องมีอย่างน้อยกี่ครั้งที่วัด response_time_seconds ได้ในวันนั้นถึงจะให้แต้ม
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Max seconds (≤)</TableHead>
                <TableHead className="w-[140px]">Points</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers
                .slice()
                .sort((a, b) => a.max_seconds - b.max_seconds)
                .map((tier, idx) => {
                  const label = autoLabelForIndex(idx);
                  return (
                    <TableRow key={`${label}-${idx}`}>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={tier.max_seconds}
                          onChange={(e) => {
                            const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setTiers((prev) => {
                              const next = [...prev];
                              // Update by position in sorted view: find actual matching tier by idx after sorting
                              const sorted = prev.slice().sort((a, b) => a.max_seconds - b.max_seconds);
                              const target = sorted[idx];
                              const realIndex = prev.indexOf(target);
                              next[realIndex] = { ...next[realIndex], max_seconds: v };
                              return next;
                            });
                          }}
                          disabled={disabled}
                        />
                        <div className="mt-1 text-[11px] text-muted-foreground">label: {label}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={tier.points}
                          onChange={(e) => {
                            const v = Math.trunc(Number(e.target.value) || 0);
                            setTiers((prev) => {
                              const next = [...prev];
                              const sorted = prev.slice().sort((a, b) => a.max_seconds - b.max_seconds);
                              const target = sorted[idx];
                              const realIndex = prev.indexOf(target);
                              next[realIndex] = { ...next[realIndex], points: v };
                              return next;
                            });
                          }}
                          disabled={disabled}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTiers((prev) => {
                              if (prev.length <= 1) return prev;
                              const sorted = prev.slice().sort((a, b) => a.max_seconds - b.max_seconds);
                              const target = sorted[idx];
                              return prev.filter((t) => t !== target);
                            });
                          }}
                          disabled={disabled || tiers.length <= 1}
                        >
                          ลบ
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-2 border-t p-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTiers((prev) => [...prev, { max_seconds: 0, points: 0 }])}
              disabled={disabled}
            >
              เพิ่ม tier
            </Button>
            <div className="text-xs text-muted-foreground">
              ระบบจะเรียงตาม max_seconds อัตโนมัติ
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-background p-3">
          <div className="text-xs font-medium">Preview</div>
          <div className="mt-1 space-y-1 text-xs text-muted-foreground">
            {previewLines.map((p) => (
              <div key={p.label}>
                avg ≤ {p.max_seconds}s → {p.points >= 0 ? "+" : ""}
                {p.points} pts
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
