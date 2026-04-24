/**
 * ⚠️ CANONICAL PORTAL ACTION REGISTRY — single source of truth
 *
 * Purpose:
 * - Keep `PortalHome.tsx` (cards) and `portal/Help.tsx` (quick actions)
 *   in sync without duplicating role/path strings in two places.
 * - Prevent the regression pattern where one screen advertises a feature
 *   that another screen no longer supports (or vice versa).
 *
 * Rules of thumb:
 * - Every action `path` MUST exist as a real route in `App.tsx` under
 *   the `/portal/*` group. Verified routes (2026-04-24):
 *     /portal/checkin, /portal/my-history, /portal/my-leave,
 *     /portal/my-profile, /portal/my-points, /portal/my-redemptions,
 *     /portal/my-bag, /portal/my-receipts, /portal/my-schedule,
 *     /portal/my-payroll, /portal/leaderboard, /portal/status,
 *     /portal/rewards, /portal/request-leave, /portal/request-ot,
 *     /portal/deposit-upload, /portal/approvals,
 *     /portal/approvals/remote-checkout, /portal/team-summary,
 *     /portal/deposit-review-list, /portal/branch-report,
 *     /portal/manager-dashboard, /portal/photos, /portal/daily-summary,
 *     /portal/employees, /portal/receipt-management,
 *     /portal/receipt-analytics, /portal/approve-redemptions,
 *     /portal/payroll-report
 * - `roles` undefined  → visible to everyone (employee+).
 * - Use `isVisibleToRole()` to filter. Role strings are lower-cased.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Clock, Calendar, History, Users, Camera,
  CalendarPlus, ClipboardList, TrendingUp,
  Receipt, Gift, Banknote, FileText, CalendarDays,
  Wallet, Trophy, Building2, BarChart3, ReceiptText, Activity, Backpack,
  LayoutDashboard, Star, User, CheckSquare, CalendarMinus,
  Package, MapPin, XCircle,
} from 'lucide-react';

export type PortalActionGroup = 'employee' | 'manager' | 'admin' | 'hr';

export interface PortalAction {
  /** Stable ID — used as React key & for favorites lookup */
  id: string;
  icon: LucideIcon;
  label: string;     // Thai label
  labelEn: string;   // English label
  description: string;
  descriptionEn: string;
  path: string;
  /** Tailwind gradient classes for PortalHome cards. Help.tsx ignores this. */
  color: string;
  /** Allowed role keys (lower-case). Undefined → visible to all employees. */
  roles?: string[];
  group: PortalActionGroup;
}

/**
 * Role group constants — match `PortalContext.isManager` / `isAdmin` and
 * `Help.tsx` checks. Keep in one place so future role additions only
 * touch this file.
 */
export const MANAGER_ROLES = ['manager', 'supervisor', 'admin', 'owner'] as const;
export const ADMIN_ROLES = ['admin', 'owner'] as const;
export const HR_ROLES = ['hr', 'admin', 'owner'] as const;
export const TEAM_VIEW_ROLES = ['manager', 'supervisor', 'admin', 'owner', 'hr'] as const;

export const PORTAL_ACTIONS: PortalAction[] = [
  // ───── Employee actions (visible to everyone) ─────
  {
    id: 'checkin',
    icon: Clock,
    label: 'เช็คอิน/เอาท์',
    labelEn: 'Check In/Out',
    description: 'บันทึกเวลาเข้า-ออกงาน',
    descriptionEn: 'Record attendance',
    path: '/portal/checkin',
    color: 'from-primary to-primary/80',
    group: 'employee',
  },
  {
    id: 'my-history',
    icon: History,
    label: 'ประวัติการทำงาน',
    labelEn: 'Work History',
    description: 'ดูประวัติเช็คอิน/เอาท์',
    descriptionEn: 'View check-in/out history',
    path: '/portal/my-history',
    color: 'from-blue-500 to-blue-600',
    group: 'employee',
  },
  {
    id: 'my-schedule',
    icon: CalendarDays,
    label: 'ตารางกะ',
    labelEn: 'My Schedule',
    description: 'ดูตารางกะประจำสัปดาห์',
    descriptionEn: 'View weekly schedule',
    path: '/portal/my-schedule',
    color: 'from-sky-500 to-sky-600',
    group: 'employee',
  },
  {
    id: 'my-payroll',
    icon: Wallet,
    label: 'Payroll ของฉัน',
    labelEn: 'My Payroll',
    description: 'ดูรายได้ประมาณการ',
    descriptionEn: 'View estimated earnings',
    path: '/portal/my-payroll',
    color: 'from-emerald-500 to-emerald-600',
    group: 'employee',
  },
  {
    id: 'my-leave',
    icon: CalendarMinus,
    label: 'วันลาคงเหลือ',
    labelEn: 'Leave Balance',
    description: 'ตรวจสอบวันลาที่เหลือ',
    descriptionEn: 'Check remaining leave days',
    path: '/portal/my-leave',
    color: 'from-teal-500 to-teal-600',
    group: 'employee',
  },
  {
    id: 'request-leave',
    icon: CalendarPlus,
    label: 'ขอลางาน',
    labelEn: 'Request Leave',
    description: 'ส่งคำขอลางาน',
    descriptionEn: 'Submit leave request',
    path: '/portal/request-leave',
    color: 'from-violet-500 to-violet-600',
    group: 'employee',
  },
  {
    id: 'request-ot',
    icon: FileText,
    label: 'ขอ OT',
    labelEn: 'Request OT',
    description: 'ส่งคำขอทำ OT',
    descriptionEn: 'Submit OT request',
    path: '/portal/request-ot',
    color: 'from-orange-500 to-orange-600',
    group: 'employee',
  },
  {
    id: 'my-receipts',
    icon: Receipt,
    label: 'ใบเสร็จของฉัน',
    labelEn: 'My Receipts',
    description: 'ดูและจัดการใบเสร็จ',
    descriptionEn: 'View & manage receipts',
    path: '/portal/my-receipts',
    color: 'from-cyan-500 to-cyan-600',
    group: 'employee',
  },
  {
    id: 'leaderboard',
    icon: Trophy,
    label: 'อันดับคะแนน',
    labelEn: 'Leaderboard',
    description: 'อันดับแต้มในทีม',
    descriptionEn: 'Team point rankings',
    path: '/portal/leaderboard',
    color: 'from-amber-500 to-amber-600',
    group: 'employee',
  },
  {
    id: 'status',
    icon: Activity,
    label: 'สถานะวันนี้',
    labelEn: 'Today Status',
    description: 'ดูสถานะการทำงานวันนี้',
    descriptionEn: 'View today work status',
    path: '/portal/status',
    color: 'from-green-500 to-green-600',
    group: 'employee',
  },
  {
    id: 'rewards',
    icon: Gift,
    label: 'แลกรางวัล',
    labelEn: 'Rewards',
    description: 'ใช้แต้มแลกของรางวัล',
    descriptionEn: 'Redeem rewards',
    path: '/portal/rewards',
    color: 'from-pink-500 to-pink-600',
    group: 'employee',
  },
  {
    id: 'my-bag',
    icon: Backpack,
    label: 'กระเป๋าของฉัน',
    labelEn: 'My Bag',
    description: 'ดูไอเทมที่เก็บไว้',
    descriptionEn: 'View stored items',
    path: '/portal/my-bag',
    color: 'from-purple-500 to-purple-600',
    group: 'employee',
  },
  {
    id: 'my-points',
    icon: Star,
    label: 'คะแนนของฉัน',
    labelEn: 'My Points',
    description: 'ดู Happy Points และประวัติ',
    descriptionEn: 'View points and history',
    path: '/portal/my-points',
    color: 'from-yellow-500 to-amber-500',
    group: 'employee',
  },
  {
    id: 'my-redemptions',
    icon: Package,
    label: 'ประวัติการแลก',
    labelEn: 'My Redemptions',
    description: 'ดูประวัติการแลกของรางวัล',
    descriptionEn: 'View redemption history',
    path: '/portal/my-redemptions',
    color: 'from-fuchsia-500 to-fuchsia-600',
    group: 'employee',
  },
  {
    id: 'my-profile',
    icon: User,
    label: 'โปรไฟล์',
    labelEn: 'My Profile',
    description: 'ดูข้อมูลส่วนตัว',
    descriptionEn: 'View your profile',
    path: '/portal/my-profile',
    color: 'from-slate-500 to-slate-600',
    group: 'employee',
  },
  {
    id: 'deposit-upload',
    icon: Banknote,
    label: 'ฝากเงิน',
    labelEn: 'Deposit',
    description: 'ส่งใบฝากเงินประจำวัน',
    descriptionEn: 'Submit daily deposit slip',
    path: '/portal/deposit-upload',
    color: 'from-lime-500 to-green-600',
    group: 'employee',
  },

  // ───── Manager actions ─────
  {
    id: 'manager-dashboard',
    icon: LayoutDashboard,
    label: 'แดชบอร์ดหัวหน้า',
    labelEn: 'Manager Dashboard',
    description: 'ภาพรวมทีมและคำขอ',
    descriptionEn: 'Team overview & approvals',
    path: '/portal/manager-dashboard',
    color: 'from-rose-500 to-rose-600',
    roles: [...MANAGER_ROLES],
    group: 'manager',
  },
  {
    id: 'approvals',
    icon: ClipboardList,
    label: 'อนุมัติคำขอ',
    labelEn: 'Approve Requests',
    description: 'OT และการลา',
    descriptionEn: 'OT and leave requests',
    path: '/portal/approvals',
    color: 'from-amber-500 to-amber-600',
    roles: [...MANAGER_ROLES],
    group: 'manager',
  },
  {
    id: 'team-summary',
    icon: Users,
    label: 'สรุปทีม',
    labelEn: 'Team Summary',
    description: 'ดูสถานะทีมวันนี้',
    descriptionEn: 'View team status today',
    path: '/portal/team-summary',
    color: 'from-cyan-500 to-cyan-600',
    roles: [...TEAM_VIEW_ROLES],
    group: 'manager',
  },
  {
    id: 'deposit-review-list',
    icon: Banknote,
    label: 'ตรวจสอบใบฝาก',
    labelEn: 'Review Deposits',
    description: 'ตรวจสอบใบฝากเงินสาขา',
    descriptionEn: 'Review branch deposits',
    path: '/portal/deposit-review-list',
    color: 'from-green-500 to-green-600',
    roles: ['manager', 'admin', 'owner'],
    group: 'manager',
  },
  {
    id: 'branch-report-portal',
    icon: Building2,
    label: 'รายงานสาขา',
    labelEn: 'Branch Report',
    description: 'ดูยอดขายและสถิติสาขา',
    descriptionEn: 'View branch sales & stats',
    path: '/portal/branch-report',
    color: 'from-indigo-500 to-indigo-600',
    roles: ['manager', 'admin', 'owner'],
    group: 'manager',
  },
  {
    id: 'approvals-remote-checkout',
    icon: MapPin,
    label: 'อนุมัติ Checkout นอกสถานที่',
    labelEn: 'Approve Remote Checkout',
    description: 'อนุมัติคำขอ checkout นอกพื้นที่',
    descriptionEn: 'Approve remote checkout requests',
    path: '/portal/approvals/remote-checkout',
    color: 'from-orange-500 to-red-500',
    roles: [...MANAGER_ROLES],
    group: 'manager',
  },

  // ───── Admin actions ─────
  {
    id: 'photos',
    icon: Camera,
    label: 'รูปวันนี้',
    labelEn: "Today's Photos",
    description: 'ดูรูปเช็คอินวันนี้',
    descriptionEn: "View today's check-in photos",
    path: '/portal/photos',
    color: 'from-rose-500 to-rose-600',
    roles: [...ADMIN_ROLES],
    group: 'admin',
  },
  {
    id: 'daily-summary',
    icon: TrendingUp,
    label: 'สรุปประจำวัน',
    labelEn: 'Daily Summary',
    description: 'สถิติและรายงาน',
    descriptionEn: 'Statistics and reports',
    path: '/portal/daily-summary',
    color: 'from-indigo-500 to-indigo-600',
    roles: [...ADMIN_ROLES],
    group: 'admin',
  },
  {
    id: 'employees',
    icon: Users,
    label: 'จัดการพนักงาน',
    labelEn: 'Manage Employees',
    description: 'ดูข้อมูลพนักงาน',
    descriptionEn: 'View employee data',
    path: '/portal/employees',
    color: 'from-blue-500 to-blue-600',
    roles: [...ADMIN_ROLES],
    group: 'admin',
  },
  {
    id: 'receipt-management',
    icon: ReceiptText,
    label: 'จัดการใบเสร็จ',
    labelEn: 'Receipt Management',
    description: 'ตรวจสอบและอนุมัติใบเสร็จ',
    descriptionEn: 'Review and approve receipts',
    path: '/portal/receipt-management',
    color: 'from-teal-500 to-teal-600',
    roles: [...ADMIN_ROLES],
    group: 'admin',
  },
  {
    id: 'receipt-analytics',
    icon: BarChart3,
    label: 'วิเคราะห์ใบเสร็จ',
    labelEn: 'Receipt Analytics',
    description: 'สถิติและรายงานใบเสร็จ',
    descriptionEn: 'Receipt statistics and reports',
    path: '/portal/receipt-analytics',
    color: 'from-violet-500 to-violet-600',
    roles: [...ADMIN_ROLES],
    group: 'admin',
  },
  {
    id: 'approve-redemptions',
    icon: Gift,
    label: 'อนุมัติแลกรางวัล',
    labelEn: 'Approve Redemptions',
    description: 'อนุมัติการแลกรางวัล',
    descriptionEn: 'Approve reward redemptions',
    path: '/portal/approve-redemptions',
    color: 'from-fuchsia-500 to-fuchsia-600',
    roles: [...ADMIN_ROLES],
    group: 'admin',
  },

  // ───── HR actions ─────
  {
    id: 'payroll-report',
    icon: FileText,
    label: 'รายงาน Payroll',
    labelEn: 'Payroll Report',
    description: 'ดูสรุปการจ่ายเงินเดือน',
    descriptionEn: 'View payroll summary',
    path: '/portal/payroll-report',
    color: 'from-slate-500 to-slate-600',
    roles: [...HR_ROLES],
    group: 'hr',
  },
];

/**
 * Filter helper used by both PortalHome and Help.
 * `roleKey` should already be lower-cased; we lower-case again as a safety net.
 */
export function isVisibleToRole(action: PortalAction, roleKey: string | null | undefined): boolean {
  if (!action.roles) return true;
  const key = (roleKey ?? '').toLowerCase();
  return action.roles.includes(key);
}

export function getActionsByGroup(group: PortalActionGroup): PortalAction[] {
  return PORTAL_ACTIONS.filter((a) => a.group === group);
}

/**
 * Convenience getter used by `Help.tsx` to render a single flat list of
 * all actions visible to the current employee role, in display order:
 * employee → manager → admin → hr.
 */
export function getVisibleActions(roleKey: string | null | undefined): PortalAction[] {
  const order: PortalActionGroup[] = ['employee', 'manager', 'admin', 'hr'];
  return order.flatMap((g) =>
    getActionsByGroup(g).filter((a) => isVisibleToRole(a, roleKey))
  );
}
