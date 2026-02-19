// Cross-Group AI Query Engine
// Server-side orchestration: resolve entities, retrieve evidence, build prompt

import { createClient } from "npm:@supabase/supabase-js@2";
import { getBangkokDateString, getBangkokNow } from "../../_shared/timezone.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Types ──────────────────────────────────────────────

interface CrossGroupPolicy {
  id: string;
  source_type: string;
  scope_mode: string;
  allowed_data_sources: string[];
  time_window_days: number;
  pii_mode: string;
  max_hits_per_group: number;
  priority: number;
}

interface EffectiveScope {
  allowedGroupIds: string[];
  allowedDataSources: string[];
  timeWindowDays: number;
  piiMode: string;
  maxHitsPerGroup: number;
}

interface GroupDirectoryEntry {
  group_id: string;
  display_name: string;
  synonyms: string[];
  branch_name?: string;
}

interface EvidenceSource {
  group_name: string;
  group_id: string;
  type: string; // 'message' | 'attendance' | 'employee'
  timestamp?: string;
  sender?: string;
  excerpt?: string;
  message_id?: string;
}

interface CrossGroupEvidence {
  messages: Array<{ group_name: string; sender: string; text: string; sent_at: string; message_id: string }>;
  attendance: Array<{ employee_name: string; branch_name: string; event_type: string; time: string }>;
  employees: Array<{ name: string; branch_name: string; role: string }>;
  sources: EvidenceSource[];
  points: Array<{ employee_name: string; branch_name: string; balance: number; streak: number; recent_transactions: string[] }>;
  birthdays: Array<{ employee_name: string; branch_name: string; date_of_birth: string }>;
  rewards: Array<{ item_name: string; points_cost: number; stock: number; recent_redemptions: string[] }>;
  leave: Array<{ employee_name: string; branch_name: string; leave_type: string; start_date: string; end_date: string; status: string }>;
  tasks: Array<{ title: string; group_name: string; status: string; assignee: string; due_at: string | null }>;
}

// ── Source Query Detection ──────────────────────────────

const SOURCE_PATTERNS = [
  /เอาข้อมูลมาจากไหน/i,
  /ข้อมูลมาจากไหน/i,
  /ที่มา/i,
  /อ้างอิง/i,
  /แหล่งข้อมูล/i,
  /\bsource\b/i,
  /\breference\b/i,
  /\bwhere.+from\b/i,
  /\bcite\b/i,
];

export function isSourceQuery(question: string): boolean {
  return SOURCE_PATTERNS.some(p => p.test(question));
}

// ── Get Policy ─────────────────────────────────────────

export async function getCrossGroupPolicy(
  groupId: string,
  userId: string
): Promise<CrossGroupPolicy | null> {
  // Check user-specific policy first (higher priority), then group policy
  const { data, error } = await supabase
    .from("ai_query_policies")
    .select("*")
    .or(
      `and(source_type.eq.user,source_user_id.eq.${userId}),and(source_type.eq.group,source_group_id.eq.${groupId})`
    )
    .eq("enabled", true)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[crossGroupQuery] Error fetching policy:", error);
    return null;
  }
  return data;
}

// ── Compute Effective Scope ────────────────────────────

export async function computeEffectiveScope(
  policy: CrossGroupPolicy
): Promise<EffectiveScope> {
  // 1. Determine candidate groups based on scope_mode
  let candidateGroupIds: string[] = [];

  if (policy.scope_mode === "all") {
    // All groups the bot is in
    const { data } = await supabase.from("groups").select("id").eq("status", "active");
    candidateGroupIds = (data || []).map((g: any) => g.id);
  } else if (policy.scope_mode === "include") {
    const { data } = await supabase
      .from("ai_query_scope_groups")
      .select("group_id")
      .eq("policy_id", policy.id);
    candidateGroupIds = (data || []).map((d: any) => d.group_id);
  } else {
    // exclude
    const { data: excluded } = await supabase
      .from("ai_query_scope_groups")
      .select("group_id")
      .eq("policy_id", policy.id);
    const excludedIds = new Set((excluded || []).map((d: any) => d.group_id));
    const { data: allGroups } = await supabase.from("groups").select("id").eq("status", "active");
    candidateGroupIds = (allGroups || []).filter((g: any) => !excludedIds.has(g.id)).map((g: any) => g.id);
  }

  // 2. Intersect with group export policies (only groups that allow export)
  const { data: exports } = await supabase
    .from("ai_query_group_export")
    .select("group_id, allowed_data_sources")
    .eq("export_enabled", true)
    .in("group_id", candidateGroupIds);

  const exportedGroupIds = new Set((exports || []).map((e: any) => e.group_id));
  const allowedGroupIds = candidateGroupIds.filter((id) => exportedGroupIds.has(id));

  // 3. Intersect data sources (policy allowed ∩ union of group-level allowed)
  const groupDataSources = new Set<string>();
  (exports || []).forEach((e: any) => {
    (e.allowed_data_sources || []).forEach((ds: string) => groupDataSources.add(ds));
  });
  const allowedDataSources = policy.allowed_data_sources.filter((ds) => groupDataSources.has(ds));

  return {
    allowedGroupIds,
    allowedDataSources,
    timeWindowDays: policy.time_window_days,
    piiMode: policy.pii_mode,
    maxHitsPerGroup: policy.max_hits_per_group,
  };
}

// ── Entity Resolution ──────────────────────────────────

export async function resolveEntities(
  question: string,
  scope: EffectiveScope
): Promise<{ targetGroupIds: string[]; dateRange: { start: string; end: string } }> {
  const questionLower = question.toLowerCase();

  // Load group directory with synonyms
  const { data: exportData } = await supabase
    .from("ai_query_group_export")
    .select("group_id, synonyms")
    .in("group_id", scope.allowedGroupIds);

  const { data: groupsData } = await supabase
    .from("groups")
    .select("id, display_name")
    .in("id", scope.allowedGroupIds);

  // Also load branches for matching
  const { data: branchesData } = await supabase
    .from("branches")
    .select("name, line_group_id")
    .not("line_group_id", "is", null);

  const { data: groupsWithLine } = await supabase
    .from("groups")
    .select("id, line_group_id")
    .in("id", scope.allowedGroupIds);

  const lineToGroupId = new Map<string, string>();
  (groupsWithLine || []).forEach((g: any) => {
    if (g.line_group_id) lineToGroupId.set(g.line_group_id, g.id);
  });

  // Build directory entries
  const directory: GroupDirectoryEntry[] = [];
  (groupsData || []).forEach((g: any) => {
    const exportEntry = (exportData || []).find((e: any) => e.group_id === g.id);
    const branch = (branchesData || []).find((b: any) => {
      const groupLineId = (groupsWithLine || []).find((gl: any) => gl.id === g.id)?.line_group_id;
      return groupLineId && b.line_group_id === groupLineId;
    });
    directory.push({
      group_id: g.id,
      display_name: g.display_name || "",
      synonyms: exportEntry?.synonyms || [],
      branch_name: branch?.name,
    });
  });

  // Match question against directory
  const matchedGroupIds: string[] = [];
  for (const entry of directory) {
    const searchTerms = [
      entry.display_name.toLowerCase(),
      ...(entry.synonyms || []).map((s: string) => s.toLowerCase()),
      entry.branch_name?.toLowerCase(),
    ].filter(Boolean) as string[];

    if (searchTerms.some((term) => questionLower.includes(term))) {
      matchedGroupIds.push(entry.group_id);
    }
  }

  // If no specific group matched, search all allowed groups
  const targetGroupIds = matchedGroupIds.length > 0 ? matchedGroupIds : scope.allowedGroupIds;

  // Parse date range from question
  const now = getBangkokNow();
  const dateRange = parseDateRange(questionLower, now, scope.timeWindowDays);

  return { targetGroupIds, dateRange };
}

// ── Date Range Parser ──────────────────────────────────

function parseDateRange(
  question: string,
  now: Date,
  maxDays: number
): { start: string; end: string } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // "เมื่อวาน" / "yesterday"
  if (/เมื่อวาน|yesterday/i.test(question)) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      start: yesterday.toISOString(),
      end: today.toISOString(),
    };
  }

  // "วันนี้" / "today"
  if (/วันนี้|today/i.test(question)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      start: today.toISOString(),
      end: tomorrow.toISOString(),
    };
  }

  // "สัปดาห์นี้" / "this week"
  if (/สัปดาห์นี้|this week/i.test(question)) {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
  }

  // "เมื่อวานซืน" / "day before yesterday"
  if (/เมื่อวานซืน|day before yesterday/i.test(question)) {
    const dayBefore = new Date(today);
    dayBefore.setDate(dayBefore.getDate() - 2);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: dayBefore.toISOString(), end: yesterday.toISOString() };
  }

  // Default: last N days based on policy
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - Math.min(maxDays, 7));
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { start: defaultStart.toISOString(), end: tomorrow.toISOString() };
}

// ── Retrieve Cross-Group Evidence ──────────────────────

export async function retrieveCrossGroupEvidence(
  targetGroupIds: string[],
  scope: EffectiveScope,
  question: string,
  dateRange: { start: string; end: string }
): Promise<CrossGroupEvidence> {
  const evidence: CrossGroupEvidence = { messages: [], attendance: [], employees: [], sources: [], points: [], birthdays: [], rewards: [], leave: [], tasks: [] };

  // Load group names for display
  const { data: groupsData } = await supabase
    .from("groups")
    .select("id, display_name")
    .in("id", targetGroupIds);
  const groupNameMap = new Map((groupsData || []).map((g: any) => [g.id, g.display_name]));

  // 1. Messages
  if (scope.allowedDataSources.includes("messages")) {
    for (const gid of targetGroupIds) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, text, sent_at, user_id, direction")
        .eq("group_id", gid)
        .gte("sent_at", dateRange.start)
        .lte("sent_at", dateRange.end)
        .order("sent_at", { ascending: false })
        .limit(scope.maxHitsPerGroup);

      if (msgs && msgs.length > 0) {
        // Get user names for these messages
        const userIds = [...new Set(msgs.filter((m: any) => m.user_id).map((m: any) => m.user_id))];
        const { data: usersData } = userIds.length > 0
          ? await supabase.from("users").select("id, display_name").in("id", userIds)
          : { data: [] };
        const userNameMap = new Map((usersData || []).map((u: any) => [u.id, u.display_name || "Unknown"]));

        for (const msg of msgs) {
          const sender = msg.direction === "bot" ? "Bot" : (userNameMap.get(msg.user_id) || "Unknown");
          const groupName = groupNameMap.get(gid) || gid;
          evidence.messages.push({
            group_name: groupName,
            sender,
            text: msg.text || "",
            sent_at: msg.sent_at,
            message_id: msg.id,
          });
          evidence.sources.push({
            group_name: groupName,
            group_id: gid,
            type: "message",
            timestamp: msg.sent_at,
            sender,
            excerpt: (msg.text || "").slice(0, 100),
            message_id: msg.id,
          });
        }
      }
    }
  }

  // 2. Attendance
  if (scope.allowedDataSources.includes("attendance")) {
    // Get branches linked to target groups
    const { data: branchLinks } = await supabase
      .from("branches")
      .select("id, name, line_group_id")
      .not("line_group_id", "is", null);

    const { data: groupLines } = await supabase
      .from("groups")
      .select("id, line_group_id")
      .in("id", targetGroupIds);

    const targetLineGroupIds = (groupLines || []).map((g: any) => g.line_group_id).filter(Boolean);
    const matchedBranches = (branchLinks || []).filter((b: any) => targetLineGroupIds.includes(b.line_group_id));
    const branchIds = matchedBranches.map((b: any) => b.id);
    const branchNameMap = new Map(matchedBranches.map((b: any) => [b.id, b.name]));

    if (branchIds.length > 0) {
      const { data: logs } = await supabase
        .from("attendance_logs")
        .select("employee_id, event_type, server_time, branch_id")
        .in("branch_id", branchIds)
        .gte("server_time", dateRange.start)
        .lte("server_time", dateRange.end)
        .order("server_time", { ascending: false })
        .limit(200);

      if (logs && logs.length > 0) {
        const empIds = [...new Set(logs.map((l: any) => l.employee_id))];
        const { data: emps } = await supabase.from("employees").select("id, full_name").in("id", empIds);
        const empNameMap = new Map((emps || []).map((e: any) => [e.id, e.full_name || "Unknown"]));

        for (const log of logs) {
          const branchName = branchNameMap.get(log.branch_id) || "Unknown";
          const empName = empNameMap.get(log.employee_id) || "Unknown";
          evidence.attendance.push({
            employee_name: empName,
            branch_name: branchName,
            event_type: log.event_type,
            time: log.server_time,
          });
        }

        // Add grouped source
        evidence.sources.push({
          group_name: matchedBranches.map((b: any) => b.name).join(", "),
          group_id: targetGroupIds[0],
          type: "attendance",
          excerpt: `${logs.length} attendance records from ${matchedBranches.length} branch(es)`,
        });
      }
    }
  }

  // 3. Employees
  if (scope.allowedDataSources.includes("employees")) {
    const { data: branchLinks } = await supabase
      .from("branches")
      .select("id, name, line_group_id")
      .not("line_group_id", "is", null);

    const { data: groupLines } = await supabase
      .from("groups")
      .select("id, line_group_id")
      .in("id", targetGroupIds);

    const targetLineGroupIds = (groupLines || []).map((g: any) => g.line_group_id).filter(Boolean);
    const matchedBranches = (branchLinks || []).filter((b: any) => targetLineGroupIds.includes(b.line_group_id));
    const branchIds = matchedBranches.map((b: any) => b.id);
    const branchNameMap = new Map(matchedBranches.map((b: any) => [b.id, b.name]));

    if (branchIds.length > 0) {
      const { data: emps } = await supabase
        .from("employees")
        .select("full_name, branch_id, role")
        .in("branch_id", branchIds)
        .eq("is_active", true);

      for (const emp of emps || []) {
        evidence.employees.push({
          name: emp.full_name || "Unknown",
          branch_name: branchNameMap.get(emp.branch_id) || "Unknown",
          role: emp.role || "employee",
        });
      }
    }
  }

  // Helper: get branch IDs from target groups
  const getBranchContext = async () => {
    const { data: branchLinks } = await supabase.from("branches").select("id, name, line_group_id").not("line_group_id", "is", null);
    const { data: groupLines } = await supabase.from("groups").select("id, line_group_id").in("id", targetGroupIds);
    const targetLineGroupIds = (groupLines || []).map((g: any) => g.line_group_id).filter(Boolean);
    const matchedBranches = (branchLinks || []).filter((b: any) => targetLineGroupIds.includes(b.line_group_id));
    return { branchIds: matchedBranches.map((b: any) => b.id), branchNameMap: new Map(matchedBranches.map((b: any) => [b.id, b.name])) };
  };

  // 4. Points
  if (scope.allowedDataSources.includes("points")) {
    const { branchIds, branchNameMap } = await getBranchContext();
    if (branchIds.length > 0) {
      const { data: emps } = await supabase.from("employees").select("id, full_name, branch_id").in("branch_id", branchIds).eq("is_active", true);
      if (emps?.length) {
        const empIds = emps.map((e: any) => e.id);
        const { data: hp } = await supabase.from("happy_points").select("employee_id, point_balance, streak").in("employee_id", empIds);
        const { data: txns } = await supabase.from("point_transactions").select("employee_id, description, amount, created_at").in("employee_id", empIds).order("created_at", { ascending: false }).limit(100);
        const hpMap = new Map((hp || []).map((h: any) => [h.employee_id, h]));
        const txnsByEmp = new Map<string, string[]>();
        (txns || []).forEach((t: any) => {
          const list = txnsByEmp.get(t.employee_id) || [];
          if (list.length < 3) list.push(`${t.description} (${t.amount > 0 ? '+' : ''}${t.amount})`);
          txnsByEmp.set(t.employee_id, list);
        });
        for (const emp of emps) {
          const h = hpMap.get(emp.id);
          if (h) {
            evidence.points.push({ employee_name: emp.full_name || "Unknown", branch_name: branchNameMap.get(emp.branch_id) || "Unknown", balance: h.point_balance || 0, streak: h.streak || 0, recent_transactions: txnsByEmp.get(emp.id) || [] });
          }
        }
        evidence.sources.push({ group_name: [...branchNameMap.values()].join(", "), group_id: targetGroupIds[0], type: "points", excerpt: `${evidence.points.length} employees with point data` });
      }
    }
  }

  // 5. Birthdays
  if (scope.allowedDataSources.includes("birthdays")) {
    const { branchIds, branchNameMap } = await getBranchContext();
    if (branchIds.length > 0) {
      const { data: emps } = await supabase.from("employees").select("full_name, branch_id, date_of_birth").in("branch_id", branchIds).eq("is_active", true).not("date_of_birth", "is", null);
      for (const emp of emps || []) {
        evidence.birthdays.push({ employee_name: emp.full_name || "Unknown", branch_name: branchNameMap.get(emp.branch_id) || "Unknown", date_of_birth: emp.date_of_birth });
      }
      if (evidence.birthdays.length > 0) {
        evidence.sources.push({ group_name: [...branchNameMap.values()].join(", "), group_id: targetGroupIds[0], type: "birthdays", excerpt: `${evidence.birthdays.length} employees with birthday data` });
      }
    }
  }

  // 6. Rewards
  if (scope.allowedDataSources.includes("rewards")) {
    const { data: items } = await supabase.from("reward_items").select("id, name, points_cost, stock_quantity").eq("is_active", true);
    const { data: redemptions } = await supabase.from("point_redemptions").select("employee_id, reward_item_id, quantity, status, created_at").order("created_at", { ascending: false }).limit(50);
    const { data: emps } = redemptions?.length ? await supabase.from("employees").select("id, full_name").in("id", [...new Set(redemptions.map((r: any) => r.employee_id))]) : { data: [] };
    const empMap = new Map((emps || []).map((e: any) => [e.id, e.full_name || "Unknown"]));
    const itemMap = new Map((items || []).map((i: any) => [i.id, i]));

    for (const item of items || []) {
      const itemRedemptions = (redemptions || []).filter((r: any) => r.reward_item_id === item.id).slice(0, 3).map((r: any) => `${empMap.get(r.employee_id) || "?"} (${r.status})`);
      evidence.rewards.push({ item_name: item.name, points_cost: item.points_cost, stock: item.stock_quantity ?? 0, recent_redemptions: itemRedemptions });
    }
    if (evidence.rewards.length > 0) {
      evidence.sources.push({ group_name: "All", group_id: targetGroupIds[0], type: "rewards", excerpt: `${evidence.rewards.length} reward items` });
    }
  }

  // 7. Leave
  if (scope.allowedDataSources.includes("leave")) {
    const { branchIds, branchNameMap } = await getBranchContext();
    if (branchIds.length > 0) {
      const { data: emps } = await supabase.from("employees").select("id, full_name, branch_id").in("branch_id", branchIds).eq("is_active", true);
      if (emps?.length) {
        const empIds = emps.map((e: any) => e.id);
        const empMap = new Map(emps.map((e: any) => [e.id, e]));
        const { data: leaves } = await supabase.from("leave_requests").select("employee_id, leave_type, start_date, end_date, status").in("employee_id", empIds).gte("end_date", dateRange.start).lte("start_date", dateRange.end).order("start_date", { ascending: false }).limit(100);
        for (const lv of leaves || []) {
          const emp = empMap.get(lv.employee_id);
          evidence.leave.push({ employee_name: emp?.full_name || "Unknown", branch_name: branchNameMap.get(emp?.branch_id) || "Unknown", leave_type: lv.leave_type, start_date: lv.start_date, end_date: lv.end_date, status: lv.status });
        }
        if (evidence.leave.length > 0) {
          evidence.sources.push({ group_name: [...branchNameMap.values()].join(", "), group_id: targetGroupIds[0], type: "leave", excerpt: `${evidence.leave.length} leave requests` });
        }
      }
    }
  }

  // 8. Tasks
  if (scope.allowedDataSources.includes("tasks")) {
    const { data: tasksData } = await supabase.from("tasks").select("id, title, status, due_at, group_id, assigned_to").in("group_id", targetGroupIds).order("created_at", { ascending: false }).limit(100);
    if (tasksData?.length) {
      const assigneeIds = [...new Set((tasksData || []).filter((t: any) => t.assigned_to).map((t: any) => t.assigned_to))];
      const { data: usersData } = assigneeIds.length > 0 ? await supabase.from("users").select("id, display_name").in("id", assigneeIds) : { data: [] };
      const userMap = new Map((usersData || []).map((u: any) => [u.id, u.display_name || "Unknown"]));
      for (const task of tasksData) {
        evidence.tasks.push({ title: task.title, group_name: groupNameMap.get(task.group_id) || task.group_id, status: task.status, assignee: userMap.get(task.assigned_to) || "—", due_at: task.due_at });
      }
      evidence.sources.push({ group_name: "Tasks", group_id: targetGroupIds[0], type: "tasks", excerpt: `${tasksData.length} tasks` });
    }
  }
}

// ── Build Cross-Group Prompt ───────────────────────────

export function buildCrossGroupPrompt(
  question: string,
  evidence: CrossGroupEvidence,
  scope: EffectiveScope
): string {
  let prompt = `คำถามจากผู้ใช้: "${question}"\n\n`;
  prompt += `--- ข้อมูลที่ค้นพบ (จาก ${scope.allowedGroupIds.length} กลุ่มที่อนุญาต) ---\n\n`;

  if (evidence.attendance.length > 0) {
    prompt += `📋 ข้อมูลการลงเวลา:\n`;
    for (const a of evidence.attendance.slice(0, 50)) {
      const time = new Date(a.time).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
      prompt += `- ${a.employee_name} | ${a.branch_name} | ${a.event_type === "check_in" ? "เข้างาน" : "ออกงาน"} | ${time}\n`;
    }
    prompt += "\n";
  }

  if (evidence.employees.length > 0) {
    prompt += `👥 พนักงาน:\n`;
    for (const e of evidence.employees.slice(0, 30)) {
      prompt += `- ${e.name} | ${e.branch_name} | ${e.role}\n`;
    }
    prompt += "\n";
  }

  if (evidence.messages.length > 0) {
    prompt += `💬 ข้อความที่เกี่ยวข้อง:\n`;
    for (const m of evidence.messages.slice(0, 30)) {
      const time = new Date(m.sent_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
      prompt += `- [${m.group_name}] ${m.sender}: "${m.text.slice(0, 150)}" (${time})\n`;
    }
    prompt += "\n";
  }

  if (evidence.attendance.length === 0 && evidence.messages.length === 0 && evidence.employees.length === 0 && evidence.points.length === 0 && evidence.birthdays.length === 0 && evidence.rewards.length === 0 && evidence.leave.length === 0 && evidence.tasks.length === 0) {
    prompt += `⚠️ ไม่พบข้อมูลที่ตรงกับคำถามในช่วงเวลาที่ค้นหา\n\n`;
  }

  if (evidence.points.length > 0) {
    prompt += `🏆 คะแนน Happy Points:\n`;
    for (const p of evidence.points.slice(0, 30)) {
      prompt += `- ${p.employee_name} | ${p.branch_name} | คะแนน: ${p.balance} | streak: ${p.streak}`;
      if (p.recent_transactions.length) prompt += ` | ล่าสุด: ${p.recent_transactions.join(', ')}`;
      prompt += `\n`;
    }
    prompt += "\n";
  }

  if (evidence.birthdays.length > 0) {
    prompt += `🎂 วันเกิดพนักงาน:\n`;
    for (const b of evidence.birthdays.slice(0, 30)) {
      prompt += `- ${b.employee_name} | ${b.branch_name} | วันเกิด: ${b.date_of_birth}\n`;
    }
    prompt += "\n";
  }

  if (evidence.rewards.length > 0) {
    prompt += `🎁 รางวัล:\n`;
    for (const r of evidence.rewards.slice(0, 20)) {
      prompt += `- ${r.item_name} | ${r.points_cost} pts | คงเหลือ: ${r.stock}`;
      if (r.recent_redemptions.length) prompt += ` | แลกล่าสุด: ${r.recent_redemptions.join(', ')}`;
      prompt += `\n`;
    }
    prompt += "\n";
  }

  if (evidence.leave.length > 0) {
    prompt += `🏖️ วันลา:\n`;
    for (const l of evidence.leave.slice(0, 30)) {
      prompt += `- ${l.employee_name} | ${l.branch_name} | ${l.leave_type} | ${l.start_date} - ${l.end_date} | สถานะ: ${l.status}\n`;
    }
    prompt += "\n";
  }

  if (evidence.tasks.length > 0) {
    prompt += `📝 งานที่มอบหมาย:\n`;
    for (const t of evidence.tasks.slice(0, 20)) {
      prompt += `- ${t.title} | [${t.group_name}] | สถานะ: ${t.status} | ผู้รับผิดชอบ: ${t.assignee}`;
      if (t.due_at) prompt += ` | กำหนด: ${new Date(t.due_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`;
      prompt += `\n`;
    }
    prompt += "\n";
  }

  return prompt;
}

// ── Cross-Group System Prompt ──────────────────────────

export const CROSS_GROUP_SYSTEM_PROMPT = `คุณเป็น "Cross-Group Query AI" ใน LINE bot คุณตอบคำถามโดยใช้ข้อมูลจากหลายกลุ่มที่อนุญาตเท่านั้น

กฎสำคัญ:
1. ตอบเฉพาะจากข้อมูลที่ให้มา (evidence) เท่านั้น ห้ามเดา ห้ามสร้างข้อมูลเอง
2. ตอบสั้น ตรงประเด็น 1-3 บรรทัด ใช้ภาษาไทย
3. ใช้วันที่ Bangkok time เสมอ (เช่น 18 ก.พ. 2026)
4. ถ้าข้อมูลไม่เพียงพอ ให้บอกว่าข้อมูลไม่เพียงพอ แล้วแนะนำว่าควรถามอะไรเพิ่ม
5. ห้ามเปิดเผยข้อมูลนอกขอบเขตที่อนุญาต
6. ถ้ามีข้อมูลการลงเวลา ให้ระบุชื่อ + เวลาเข้า/ออก อย่างชัดเจน`;

// ── Generate Cross-Group AI Reply ──────────────────────

export async function generateCrossGroupReply(
  question: string,
  evidence: CrossGroupEvidence,
  scope: EffectiveScope
): Promise<string> {
  const contextPrompt = buildCrossGroupPrompt(question, evidence, scope);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: CROSS_GROUP_SYSTEM_PROMPT },
          { role: "user", content: contextPrompt },
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return "⏳ ระบบกำลังมีการใช้งานมาก กรุณาลองใหม่อีกครั้ง";
      if (response.status === 402) return "⚠️ ระบบ AI ใช้งานไม่ได้ชั่วคราว กรุณาติดต่อผู้ดูแล";
      console.error("[crossGroupReply] AI error:", response.status);
      return "❌ เกิดข้อผิดพลาดในการประมวลผลคำถาม";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "❌ ไม่ได้รับคำตอบจาก AI";
  } catch (error) {
    console.error("[crossGroupReply] Error:", error);
    return "❌ เกิดข้อผิดพลาดในการประมวลผลคำถาม";
  }
}

// ── Memory: Save & Retrieve ────────────────────────────

export async function saveQueryMemory(
  userId: string,
  groupId: string,
  question: string,
  answer: string,
  sources: EvidenceSource[]
): Promise<void> {
  try {
    // Delete old expired entries for this user+group
    await supabase
      .from("ai_query_memory")
      .delete()
      .eq("user_id", userId)
      .eq("group_id", groupId);

    // Insert new
    await supabase.from("ai_query_memory").insert({
      user_id: userId,
      group_id: groupId,
      question,
      answer,
      sources_used: sources,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    console.error("[saveQueryMemory] Error:", error);
  }
}

export async function getLastAnswerMemory(
  userId: string,
  groupId: string
): Promise<{ answer: string; sources_used: EvidenceSource[] } | null> {
  const { data, error } = await supabase
    .from("ai_query_memory")
    .select("answer, sources_used")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { answer: data.answer, sources_used: data.sources_used as EvidenceSource[] };
}

// ── Format Sources Reply ───────────────────────────────

// ── Audit Logging ──────────────────────────────────────

export async function logQueryAudit(params: {
  userId: string;
  groupId: string;
  question: string;
  answer: string;
  targetGroupIds: string[];
  dataSourcesUsed: string[];
  sourcesUsed: EvidenceSource[];
  policyId: string | null;
  evidenceCount: number;
  responseTimeMs: number;
}): Promise<void> {
  try {
    await supabase.from("ai_query_audit_logs").insert({
      user_id: params.userId,
      group_id: params.groupId,
      question: params.question,
      answer: params.answer,
      target_group_ids: params.targetGroupIds,
      data_sources_used: params.dataSourcesUsed,
      sources_used: params.sourcesUsed,
      policy_id: params.policyId,
      evidence_count: params.evidenceCount,
      response_time_ms: params.responseTimeMs,
    });
  } catch (error) {
    console.error("[logQueryAudit] Error:", error);
  }
}

export function formatSourcesReply(sources: EvidenceSource[]): string {
  if (!sources || sources.length === 0) {
    return "ไม่มีข้อมูลแหล่งที่มาสำหรับคำตอบก่อนหน้า";
  }

  let reply = "📎 แหล่งข้อมูลที่ใช้ตอบ:\n\n";
  const shown = sources.slice(0, 10);

  for (const s of shown) {
    reply += `• กลุ่ม: ${s.group_name}\n`;
    if (s.type) reply += `  ประเภท: ${s.type}\n`;
    if (s.timestamp) {
      const time = new Date(s.timestamp).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
      reply += `  เวลา: ${time}\n`;
    }
    if (s.sender) reply += `  โดย: ${s.sender}\n`;
    if (s.excerpt) reply += `  ข้อความ: "${s.excerpt}"\n`;
    reply += "\n";
  }

  if (sources.length > 10) {
    reply += `... และอีก ${sources.length - 10} รายการ`;
  }

  return reply.trim();
}
