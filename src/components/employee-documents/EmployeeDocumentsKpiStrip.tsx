import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Clock, XCircle, Archive } from "lucide-react";

export interface KpiCounts {
  total: number;
  expiringSoon: number; // ≤ 30 days
  expiringLater: number; // 31–90 days
  expired: number;
  pendingOrFailed: number;
}

interface KpiItem {
  key: string;
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "muted" | "primary" | "warning" | "destructive";
  active?: boolean;
  onClick?: () => void;
}

const toneStyles: Record<KpiItem["tone"], string> = {
  muted: "border-border",
  primary: "border-primary/30 hover:border-primary",
  warning: "border-amber-500/40 hover:border-amber-500",
  destructive: "border-destructive/40 hover:border-destructive",
};

const toneIcon: Record<KpiItem["tone"], string> = {
  muted: "text-muted-foreground",
  primary: "text-primary",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
};

interface Props {
  counts: KpiCounts;
  activePreset: string;
  onPreset: (preset: string) => void;
}

export function EmployeeDocumentsKpiStrip({ counts, activePreset, onPreset }: Props) {
  const items: KpiItem[] = [
    {
      key: "all",
      label: "ทั้งหมดที่ใช้งาน",
      value: counts.total,
      icon: CheckCircle2,
      tone: "primary",
      active: activePreset === "all",
      onClick: () => onPreset("all"),
    },
    {
      key: "expired",
      label: "หมดอายุแล้ว",
      value: counts.expired,
      icon: XCircle,
      tone: "destructive",
      active: activePreset === "expired",
      onClick: () => onPreset("expired"),
    },
    {
      key: "expiring30",
      label: "ใกล้หมดอายุ ≤30 วัน",
      value: counts.expiringSoon,
      icon: AlertTriangle,
      tone: "destructive",
      active: activePreset === "expiring30",
      onClick: () => onPreset("expiring30"),
    },
    {
      key: "expiring90",
      label: "ใกล้หมดอายุ ≤90 วัน",
      value: counts.expiringLater + counts.expiringSoon,
      icon: Clock,
      tone: "warning",
      active: activePreset === "expiring90",
      onClick: () => onPreset("expiring90"),
    },
    {
      key: "pending",
      label: "อัปโหลดค้าง / ล้มเหลว",
      value: counts.pendingOrFailed,
      icon: Archive,
      tone: "warning",
      active: activePreset === "pending",
      onClick: () => onPreset("pending"),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            type="button"
            onClick={it.onClick}
            className={cn(
              "text-left transition-all rounded-lg",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Card
              className={cn(
                "p-3 border-2 transition-all",
                toneStyles[it.tone],
                it.active && "ring-2 ring-ring shadow-md",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground line-clamp-1">{it.label}</span>
                <Icon className={cn("h-4 w-4 shrink-0", toneIcon[it.tone])} />
              </div>
              <div className="text-2xl font-bold mt-1 tabular-nums">{it.value}</div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
