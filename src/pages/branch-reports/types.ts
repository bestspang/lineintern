import type { Json } from '@/integrations/supabase/types';

export interface BranchReport {
  id: string;
  branch_code: string;
  branch_name: string;
  report_date: string;
  sales: number | null;
  sales_target: number | null;
  diff_target: number | null;
  diff_target_percent: number | null;
  tc: number | null;
  cup_size_s: number | null;
  cup_size_m: number | null;
  lineman_orders: number | null;
  stock_lemon: number | null;
  bottled_water: number | null;
  snacks: number | null;
  honey_bottle: number | null;
  dried_lemon: number | null;
  chili_salt: number | null;
  top_lemonade: Json;
  top_slurpee: Json;
  merchandise_sold: Json;
  created_at: string | null;
  updated_at: string | null;
}

export type TimeRange = '1d' | '3d' | '7d' | '14d' | '30d' | '90d';

export const TIME_RANGE_OPTIONS = [
  { value: '1d' as TimeRange, label: 'วันนี้', days: 1 },
  { value: '3d' as TimeRange, label: '3 วัน', days: 3 },
  { value: '7d' as TimeRange, label: '7 วัน', days: 7 },
  { value: '14d' as TimeRange, label: '14 วัน', days: 14 },
  { value: '30d' as TimeRange, label: '30 วัน', days: 30 },
  { value: '90d' as TimeRange, label: '90 วัน', days: 90 },
] as const;

export const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
