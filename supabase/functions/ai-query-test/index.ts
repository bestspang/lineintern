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
    const evidence: { messages: any[]; attendance: any[]; employees: any[]; sources: any[] } = { messages: [], attendance: [], employees: [], sources: [] };

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
      const { data: branchLinks } = await adminClient.from("branches").select("id, name, line_group_id").not("line_group_id", "is", null);
      const { data: groupLines } = await adminClient.from("groups").select("id, line_group_id").in("id", targetGroupIds);
      const targetLineIds = (groupLines || []).map((g: any) => g.line_group_id).filter(Boolean);
      const matchedBranches = (branchLinks || []).filter((b: any) => targetLineIds.includes(b.line_group_id));
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
    if (evidence.attendance.length === 0 && evidence.messages.length === 0) {
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
            { role: "system", content: "คุณเป็น Cross-Group Query AI ตอบสั้นตรงประเด็น 1-3 บรรทัด ใช้ภาษาไทย ตอบจากข้อมูลที่ให้เท่านั้น" },
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
          sources_count: evidence.sources.length,
          sample_messages: evidence.messages.slice(0, 5),
          sample_attendance: evidence.attendance.slice(0, 10),
          sources: evidence.sources.slice(0, 10),
        },
        answer,
      },
      duration_ms: Date.now() - startTime,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[ai-query-test] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
