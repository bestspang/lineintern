import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getBangkokNow } from "../_shared/timezone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check management access
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (!roleData || !["admin", "owner", "manager"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { requester_group_id, requester_user_id, question } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: "question is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const startTime = Date.now();

    // Step 1: Get policy
    const { data: policy } = requester_group_id && requester_user_id
      ? await adminClient
          .from("ai_query_policies")
          .select("*")
          .or(`and(source_type.eq.user,source_user_id.eq.${requester_user_id}),and(source_type.eq.group,source_group_id.eq.${requester_group_id})`)
          .eq("enabled", true)
          .order("priority", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    if (!policy) {
      return new Response(JSON.stringify({
        success: true,
        steps: { policy: null, effective_scope: null, resolved_entities: null, evidence: null, answer: null },
        message: "No active policy found for this requester",
        duration_ms: Date.now() - startTime,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 2: Compute effective scope
    let candidateGroupIds: string[] = [];
    if (policy.scope_mode === "all") {
      const { data } = await adminClient.from("groups").select("id").eq("status", "active");
      candidateGroupIds = (data || []).map((g: any) => g.id);
    } else if (policy.scope_mode === "include") {
      const { data } = await adminClient.from("ai_query_scope_groups").select("group_id").eq("policy_id", policy.id);
      candidateGroupIds = (data || []).map((d: any) => d.group_id);
    } else {
      const { data: excluded } = await adminClient.from("ai_query_scope_groups").select("group_id").eq("policy_id", policy.id);
      const excludedIds = new Set((excluded || []).map((d: any) => d.group_id));
      const { data: allGroups } = await adminClient.from("groups").select("id").eq("status", "active");
      candidateGroupIds = (allGroups || []).filter((g: any) => !excludedIds.has(g.id)).map((g: any) => g.id);
    }

    const { data: exports } = await adminClient
      .from("ai_query_group_export")
      .select("group_id, allowed_data_sources")
      .eq("export_enabled", true)
      .in("group_id", candidateGroupIds.length > 0 ? candidateGroupIds : ["__none__"]);

    const exportedGroupIds = new Set((exports || []).map((e: any) => e.group_id));
    const allowedGroupIds = candidateGroupIds.filter((id) => exportedGroupIds.has(id));

    const groupDataSources = new Set<string>();
    (exports || []).forEach((e: any) => (e.allowed_data_sources || []).forEach((ds: string) => groupDataSources.add(ds)));
    const allowedDataSources = policy.allowed_data_sources.filter((ds: string) => groupDataSources.has(ds));

    // Load group names
    const { data: groupsData } = await adminClient.from("groups").select("id, display_name").in("id", allowedGroupIds.length > 0 ? allowedGroupIds : ["__none__"]);
    const groupNameMap = Object.fromEntries((groupsData || []).map((g: any) => [g.id, g.display_name]));

    const effectiveScope = {
      allowed_groups: allowedGroupIds.map(id => ({ id, name: groupNameMap[id] || id })),
      allowed_data_sources: allowedDataSources,
      time_window_days: policy.time_window_days,
      pii_mode: policy.pii_mode,
      max_hits_per_group: policy.max_hits_per_group,
    };

    if (allowedGroupIds.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        steps: {
          policy: { id: policy.id, source_type: policy.source_type, scope_mode: policy.scope_mode },
          effective_scope: effectiveScope,
          resolved_entities: null,
          evidence: null,
          answer: "ไม่มีกลุ่มที่อนุญาตให้เข้าถึงข้อมูล",
        },
        message: "No accessible groups in effective scope",
        duration_ms: Date.now() - startTime,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 3: Resolve entities (match question to group names/synonyms)
    const questionLower = question.toLowerCase();
    const { data: exportData } = await adminClient.from("ai_query_group_export").select("group_id, synonyms").in("group_id", allowedGroupIds);

    const matchedGroupIds: string[] = [];
    for (const gid of allowedGroupIds) {
      const expEntry = (exportData || []).find((e: any) => e.group_id === gid);
      const terms = [
        (groupNameMap[gid] || "").toLowerCase(),
        ...(expEntry?.synonyms || []).map((s: string) => s.toLowerCase()),
      ].filter(Boolean);
      if (terms.some(term => questionLower.includes(term))) {
        matchedGroupIds.push(gid);
      }
    }
    const targetGroupIds = matchedGroupIds.length > 0 ? matchedGroupIds : allowedGroupIds;

    // Parse date range
    const now = getBangkokNow();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    let dateStart: string, dateEnd: string;
    if (/เมื่อวาน|yesterday/i.test(questionLower)) {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      dateStart = y.toISOString(); dateEnd = today.toISOString();
    } else if (/วันนี้|today/i.test(questionLower)) {
      const tmr = new Date(today); tmr.setDate(tmr.getDate() + 1);
      dateStart = today.toISOString(); dateEnd = tmr.toISOString();
    } else {
      const ds = new Date(today); ds.setDate(ds.getDate() - Math.min(policy.time_window_days, 7));
      const tmr = new Date(today); tmr.setDate(tmr.getDate() + 1);
      dateStart = ds.toISOString(); dateEnd = tmr.toISOString();
    }

    // Step 4: Retrieve evidence
    const evidence: { messages: any[]; attendance: any[]; employees: any[]; sources: any[]; points: any[]; birthdays: any[]; rewards: any[]; leave: any[]; tasks: any[] } = { messages: [], attendance: [], employees: [], sources: [], points: [], birthdays: [], rewards: [], leave: [], tasks: [] };

    // Shared: resolve branches linked to target groups (moved up for reuse)
    const { data: _branchLinks } = await adminClient.from("branches").select("id, name, line_group_id").not("line_group_id", "is", null);
    const { data: _groupLines } = await adminClient.from("groups").select("id, line_group_id").in("id", targetGroupIds);
    const _targetLineIds = (_groupLines || []).map((g: any) => g.line_group_id).filter(Boolean);
    const matchedBranches = (_branchLinks || []).filter((b: any) => _targetLineIds.includes(b.line_group_id));

    if (allowedDataSources.includes("messages")) {
      for (const gid of targetGroupIds.slice(0, 5)) {
        const { data: msgs } = await adminClient
          .from("messages").select("id, text, sent_at, user_id, direction")
          .eq("group_id", gid).gte("sent_at", dateStart).lte("sent_at", dateEnd)
          .order("sent_at", { ascending: false }).limit(policy.max_hits_per_group);
        if (msgs?.length) {
          const userIds = [...new Set(msgs.filter((m: any) => m.user_id).map((m: any) => m.user_id))];
          const { data: usersData } = userIds.length > 0
            ? await adminClient.from("users").select("id, display_name").in("id", userIds)
            : { data: [] };
          const uMap = new Map((usersData || []).map((u: any) => [u.id, u.display_name || "Unknown"]));
          for (const msg of msgs) {
            const sender = msg.direction === "bot" ? "Bot" : (uMap.get(msg.user_id) || "Unknown");
            evidence.messages.push({ group_name: groupNameMap[gid] || gid, sender, text: msg.text || "", sent_at: msg.sent_at });
            evidence.sources.push({ group_name: groupNameMap[gid] || gid, group_id: gid, type: "message", timestamp: msg.sent_at, sender, excerpt: (msg.text || "").slice(0, 100) });
          }
        }
      }
    }

    if (allowedDataSources.includes("attendance")) {
      const branchIds = matchedBranches.map((b: any) => b.id);
      if (branchIds.length > 0) {
        const { data: logs } = await adminClient.from("attendance_logs").select("employee_id, event_type, server_time, branch_id")
          .in("branch_id", branchIds).gte("server_time", dateStart).lte("server_time", dateEnd)
          .order("server_time", { ascending: false }).limit(200);
        if (logs?.length) {
          const empIds = [...new Set(logs.map((l: any) => l.employee_id))];
          const { data: emps } = await adminClient.from("employees").select("id, full_name").in("id", empIds);
          const eMap = new Map((emps || []).map((e: any) => [e.id, e.full_name || "Unknown"]));
          const bMap = new Map(matchedBranches.map((b: any) => [b.id, b.name]));
          for (const log of logs) {
            evidence.attendance.push({ employee_name: eMap.get(log.employee_id) || "Unknown", branch_name: bMap.get(log.branch_id) || "Unknown", event_type: log.event_type, time: log.server_time });
          }
          evidence.sources.push({ group_name: matchedBranches.map((b: any) => b.name).join(", "), type: "attendance", excerpt: `${logs.length} records from ${matchedBranches.length} branch(es)` });
        }
      }
    }

    // Step 4a2: Retrieve employees
    if (allowedDataSources.includes("employees")) {
      const branchIdsE = matchedBranches.map((b: any) => b.id);
      if (branchIdsE.length > 0) {
        const bMapE = new Map(matchedBranches.map((b: any) => [b.id, b.name]));
        const { data: empsE } = await adminClient
          .from("employees").select("full_name, branch_id, role")
          .in("branch_id", branchIdsE).eq("is_active", true);
        for (const emp of empsE || []) {
          evidence.employees.push({
            name: emp.full_name || "Unknown",
            branch_name: bMapE.get(emp.branch_id) || "Unknown",
            role: emp.role || "employee"
          });
        }
      }
    }

    // Step 4b: Retrieve points
    if (allowedDataSources.includes("points")) {
      const branchIds2 = matchedBranches?.map((b: any) => b.id) || [];
      if (branchIds2.length > 0) {
        const { data: emps2 } = await adminClient.from("employees").select("id, full_name, branch_id").in("branch_id", branchIds2).eq("is_active", true);
        if (emps2?.length) {
          const empIds2 = emps2.map((e: any) => e.id);
          const { data: hp } = await adminClient.from("happy_points").select("employee_id, point_balance, streak").in("employee_id", empIds2);
          const { data: txns } = await adminClient.from("point_transactions").select("employee_id, description, amount").in("employee_id", empIds2).order("created_at", { ascending: false }).limit(100);
          const hpMap = new Map((hp || []).map((h: any) => [h.employee_id, h]));
          const txnsByEmp = new Map<string, string[]>();
          (txns || []).forEach((t: any) => { const list = txnsByEmp.get(t.employee_id) || []; if (list.length < 3) list.push(`${t.description} (${t.amount > 0 ? '+' : ''}${t.amount})`); txnsByEmp.set(t.employee_id, list); });
          const bMap2 = new Map(matchedBranches.map((b: any) => [b.id, b.name]));
          for (const emp of emps2) {
            const h = hpMap.get(emp.id);
            if (h) evidence.points.push({ employee_name: emp.full_name || "Unknown", branch_name: bMap2.get(emp.branch_id) || "Unknown", balance: h.point_balance || 0, streak: h.streak || 0, recent_transactions: txnsByEmp.get(emp.id) || [] });
          }
        }
      }
    }

    // Step 4c: Retrieve birthdays
    if (allowedDataSources.includes("birthdays")) {
      const branchIds3 = matchedBranches?.map((b: any) => b.id) || [];
      if (branchIds3.length > 0) {
        const bMap3 = new Map(matchedBranches.map((b: any) => [b.id, b.name]));
        const { data: emps3 } = await adminClient.from("employees").select("full_name, branch_id, date_of_birth").in("branch_id", branchIds3).eq("is_active", true).not("date_of_birth", "is", null);
        for (const emp of emps3 || []) evidence.birthdays.push({ employee_name: emp.full_name || "Unknown", branch_name: bMap3.get(emp.branch_id) || "Unknown", date_of_birth: emp.date_of_birth });
      }
    }

    // Step 4d: Retrieve rewards
    if (allowedDataSources.includes("rewards")) {
      const { data: items } = await adminClient.from("reward_items").select("id, name, points_cost, stock_quantity").eq("is_active", true);
      const { data: redemptions } = await adminClient.from("point_redemptions").select("employee_id, reward_item_id, quantity, status, created_at").order("created_at", { ascending: false }).limit(50);
      const rdEmpIds = [...new Set((redemptions || []).map((r: any) => r.employee_id))];
      const { data: rdEmps } = rdEmpIds.length > 0 ? await adminClient.from("employees").select("id, full_name").in("id", rdEmpIds) : { data: [] };
      const rdEmpMap = new Map((rdEmps || []).map((e: any) => [e.id, e.full_name || "Unknown"]));
      for (const item of items || []) {
        const itemRd = (redemptions || []).filter((r: any) => r.reward_item_id === item.id).slice(0, 3).map((r: any) => `${rdEmpMap.get(r.employee_id) || "?"} (${r.status})`);
        evidence.rewards.push({ item_name: item.name, points_cost: item.points_cost, stock: item.stock_quantity ?? 0, recent_redemptions: itemRd });
      }
    }

    // Step 4e: Retrieve leave
    if (allowedDataSources.includes("leave")) {
      const branchIds4 = matchedBranches?.map((b: any) => b.id) || [];
      if (branchIds4.length > 0) {
        const { data: emps4 } = await adminClient.from("employees").select("id, full_name, branch_id").in("branch_id", branchIds4).eq("is_active", true);
        if (emps4?.length) {
          const empIds4 = emps4.map((e: any) => e.id);
          const empMap4 = new Map(emps4.map((e: any) => [e.id, e]));
          const bMap4 = new Map(matchedBranches.map((b: any) => [b.id, b.name]));
          const { data: leaves } = await adminClient.from("leave_requests").select("employee_id, leave_type, start_date, end_date, status").in("employee_id", empIds4).gte("end_date", dateStart).lte("start_date", dateEnd).order("start_date", { ascending: false }).limit(100);
          for (const lv of leaves || []) {
            const emp = empMap4.get(lv.employee_id);
            evidence.leave.push({ employee_name: emp?.full_name || "Unknown", branch_name: bMap4.get(emp?.branch_id) || "Unknown", leave_type: lv.leave_type, start_date: lv.start_date, end_date: lv.end_date, status: lv.status });
          }
        }
      }
    }

    // Step 4f: Retrieve tasks
    if (allowedDataSources.includes("tasks")) {
      const { data: tasksData } = await adminClient.from("tasks").select("id, title, status, due_at, group_id, assigned_to").in("group_id", targetGroupIds).order("created_at", { ascending: false }).limit(100);
      if (tasksData?.length) {
        const assigneeIds = [...new Set(tasksData.filter((t: any) => t.assigned_to).map((t: any) => t.assigned_to))];
        const { data: usersData } = assigneeIds.length > 0 ? await adminClient.from("users").select("id, display_name").in("id", assigneeIds) : { data: [] };
        const userMap = new Map((usersData || []).map((u: any) => [u.id, u.display_name || "Unknown"]));
        for (const task of tasksData) {
          evidence.tasks.push({ title: task.title, group_name: groupNameMap[task.group_id] || task.group_id, status: task.status, assignee: userMap.get(task.assigned_to) || "—", due_at: task.due_at });
        }
      }
    }

    // Step 5: Generate AI answer
    let contextPrompt = `คำถามจากผู้ใช้: "${question}"\n\n--- ข้อมูลที่ค้นพบ ---\n\n`;
    if (evidence.attendance.length > 0) {
      contextPrompt += `📋 การลงเวลา:\n`;
      for (const a of evidence.attendance.slice(0, 30)) {
        contextPrompt += `- ${a.employee_name} | ${a.branch_name} | ${a.event_type === "check_in" ? "เข้างาน" : "ออกงาน"} | ${new Date(a.time).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}\n`;
      }
      contextPrompt += "\n";
    }
    if (evidence.messages.length > 0) {
      contextPrompt += `💬 ข้อความ:\n`;
      for (const m of evidence.messages.slice(0, 20)) {
        contextPrompt += `- [${m.group_name}] ${m.sender}: "${(m.text || "").slice(0, 150)}"\n`;
      }
      contextPrompt += "\n";
    }
    if (evidence.points.length > 0) {
      contextPrompt += `🏆 คะแนน:\n`;
      for (const p of evidence.points.slice(0, 20)) {
        contextPrompt += `- ${p.employee_name} | ${p.branch_name} | คะแนน: ${p.balance} | streak: ${p.streak}\n`;
      }
      contextPrompt += "\n";
    }
    if (evidence.birthdays.length > 0) {
      contextPrompt += `🎂 วันเกิด:\n`;
      for (const b of evidence.birthdays.slice(0, 20)) {
        contextPrompt += `- ${b.employee_name} | ${b.branch_name} | ${b.date_of_birth}\n`;
      }
      contextPrompt += "\n";
    }
    if (evidence.rewards.length > 0) {
      contextPrompt += `🎁 รางวัล:\n`;
      for (const r of evidence.rewards.slice(0, 15)) {
        contextPrompt += `- ${r.item_name} | ${r.points_cost} pts | คงเหลือ: ${r.stock}\n`;
      }
      contextPrompt += "\n";
    }
    if (evidence.leave.length > 0) {
      contextPrompt += `🏖️ วันลา:\n`;
      for (const l of evidence.leave.slice(0, 20)) {
        contextPrompt += `- ${l.employee_name} | ${l.leave_type} | ${l.start_date} - ${l.end_date} | ${l.status}\n`;
      }
      contextPrompt += "\n";
    }
    if (evidence.tasks.length > 0) {
      contextPrompt += `📝 งาน:\n`;
      for (const t of evidence.tasks.slice(0, 15)) {
        contextPrompt += `- ${t.title} | ${t.group_name} | ${t.status} | ${t.assignee}\n`;
      }
      contextPrompt += "\n";
    }
    if (evidence.employees.length > 0) {
      contextPrompt += `👥 พนักงาน:\n`;
      for (const e of evidence.employees.slice(0, 20)) {
        contextPrompt += `- ${e.name} | ${e.branch_name} | ${e.role}\n`;
      }
      contextPrompt += "\n";
    }
    if (evidence.attendance.length === 0 && evidence.messages.length === 0 && evidence.employees.length === 0 && evidence.points.length === 0 && evidence.birthdays.length === 0 && evidence.rewards.length === 0 && evidence.leave.length === 0 && evidence.tasks.length === 0) {
      contextPrompt += "⚠️ ไม่พบข้อมูลที่ตรงกับคำถาม\n\n";
    }

    let answer = "❌ ไม่สามารถประมวลผลได้";
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: `คุณเป็น "Cross-Group Query AI" ใน LINE bot คุณตอบคำถามโดยใช้ข้อมูลจากหลายกลุ่มที่อนุญาตเท่านั้น

กฎสำคัญ:
1. ตอบเฉพาะจากข้อมูลที่ให้มา (evidence) เท่านั้น ห้ามเดา ห้ามสร้างข้อมูลเอง
2. ตอบสั้น ตรงประเด็น 1-3 บรรทัด ใช้ภาษาไทย
3. ใช้วันที่ Bangkok time เสมอ (เช่น 18 ก.พ. 2026)
4. ถ้าข้อมูลไม่เพียงพอ ให้บอกว่าข้อมูลไม่เพียงพอ แล้วแนะนำว่าควรถามอะไรเพิ่ม
5. ห้ามเปิดเผยข้อมูลนอกขอบเขตที่อนุญาต
6. ถ้ามีข้อมูลการลงเวลา ให้ระบุชื่อ + เวลาเข้า/ออก อย่างชัดเจน
7. ถ้ามีข้อมูลคะแนน ให้ระบุชื่อ + คะแนนคงเหลือ + streak ที่ชัดเจน
8. ถ้ามีข้อมูลวันเกิด ให้ระบุชื่อ + วัน/เดือน/ปีเกิด
9. ถ้ามีข้อมูลรางวัล ให้ระบุชื่อรางวัล + ราคา(แต้ม) + จำนวนคงเหลือ
10. ถ้ามีข้อมูลวันลา ให้ระบุชื่อ + ประเภทลา + วันที่ + สถานะ(อนุมัติ/รอ/ปฏิเสธ)
11. ถ้ามีข้อมูลงาน ให้ระบุชื่องาน + สถานะ + ผู้รับผิดชอบ + กำหนดส่ง
12. ถ้ามีข้อมูลพนักงาน ให้ระบุชื่อ + สาขา + ตำแหน่ง
13. การตอบว่าใครมาทำงาน/เข้างาน ต้องอ้างอิงจาก 📋 ข้อมูลการลงเวลา (attendance) เท่านั้น ห้ามใช้ 💬 ข้อความแชทเป็นหลักฐานว่าคนนั้นมาทำงาน — การส่งข้อความในกลุ่มไม่ได้แปลว่ามาทำงาน
14. ระบุตัวผู้ถาม (Requester) ให้ชัด ห้ามรวมผู้ถามเข้าไปในรายชื่อผู้มาทำงาน ถ้าไม่มี attendance record ของเขา` },
            { role: "user", content: contextPrompt },
          ],
          max_completion_tokens: 500,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        answer = data.choices?.[0]?.message?.content?.trim() || answer;
      }
    } catch (e) {
      console.error("[ai-query-test] AI error:", e);
    }

    return new Response(JSON.stringify({
      success: true,
      steps: {
        policy: { id: policy.id, source_type: policy.source_type, scope_mode: policy.scope_mode, enabled: true },
        effective_scope: effectiveScope,
        resolved_entities: {
          target_groups: targetGroupIds.map(id => ({ id, name: groupNameMap[id] || id })),
          date_range: { start: dateStart, end: dateEnd },
        },
        evidence: {
          messages_count: evidence.messages.length,
          attendance_count: evidence.attendance.length,
          employees_count: evidence.employees.length,
          points_count: evidence.points.length,
          birthdays_count: evidence.birthdays.length,
          rewards_count: evidence.rewards.length,
          leave_count: evidence.leave.length,
          tasks_count: evidence.tasks.length,
          sources_count: evidence.sources.length,
          sample_messages: evidence.messages.slice(0, 5),
          sample_attendance: evidence.attendance.slice(0, 10),
          sample_employees: evidence.employees.slice(0, 5),
          sample_points: evidence.points.slice(0, 5),
          sample_birthdays: evidence.birthdays.slice(0, 5),
          sample_rewards: evidence.rewards.slice(0, 5),
          sample_leave: evidence.leave.slice(0, 5),
          sample_tasks: evidence.tasks.slice(0, 5),
          sources: evidence.sources.slice(0, 10),
        },
        answer,
      },
      duration_ms: Date.now() - startTime,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[ai-query-test] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
