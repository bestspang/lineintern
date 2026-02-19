

## Cross-Group AI Query System — Implementation Plan (ปรับจาก Spec)

### 1) Spec Analysis: สิ่งที่ดีแล้ว (ไม่ต้องแก้)

- Core Principles 4 ข้อ (evidence-only, deterministic access, short answers, source attribution) — สมบูรณ์
- Triggering Rule (@mention only) — ตรงกับ `parseCommand` ที่มีอยู่แล้ว
- Two-sided permission model (requester scope intersect group export policy) — design ดีมาก
- Follow-up sources memory — ใช้ได้จริง
- Response style (Thai, short, Bangkok dates) — เข้ากับ bot ปัจจุบัน

### 2) สิ่งที่ต้องปรับให้เข้ากับ Reality ของ Codebase

#### 2.1 "Tools" concept ต้องเป็น server-side functions (ไม่ใช่ LLM tool-calling)

Spec เขียนเหมือน LLM จะ "call tools" เอง (resolve_entities, retrieve_attendance_facts, search_messages) แต่ในระบบจริง:
- ใช้ Lovable AI Gateway (OpenAI-compatible) ซึ่ง **ไม่รองรับ function calling / tool use**
- ต้องเปลี่ยนเป็น **server-side orchestration**: edge function เป็นคนดึงข้อมูล แล้วส่ง context ให้ AI ตอบ

**แนวทางปรับ:**
```text
// แทนที่จะให้ AI call tools:
Step 1: Server resolves entities (match group names/synonyms)
Step 2: Server retrieves data (messages, attendance) within scope
Step 3: Server builds context prompt with evidence
Step 4: AI generates answer from provided evidence
Step 5: Server extracts/stores sources_used
```

#### 2.2 Group Directory ใช้ข้อมูลที่มีอยู่แล้ว + เพิ่ม synonyms

ระบบมี `groups` table + `branches` table อยู่แล้ว:
- groups: Eastville Goodchoose team, Goodchoose Central Park สีลม, etc.
- branches: Central Park, Glowfish Office, Management (linked via line_group_id)

**แนวทาง:** เพิ่ม `synonyms` column ใน `groups` table (text[]) แทนการสร้าง table ใหม่ หรือเก็บใน `ai_query_access` config

#### 2.3 Attendance Facts ดึงจาก attendance_logs โดยตรง

Spec มี `retrieve_attendance_facts()` tool — ในจริงต้องดึงจาก:
- `attendance_logs` (check_in/check_out events per employee per branch)
- `employees` (ชื่อ, สาขา)
- `daily_attendance_summaries` (สรุปรายวัน)

ไม่ต้องสร้าง "facts table" แยก — ดึงจาก source tables ตรงๆ

#### 2.4 Conversation Memory ง่ายกว่า Spec ได้

Spec มี `ai_query_conversations` table เก็บ role/content/sources — ปรับให้ lightweight:
- เก็บแค่ last Q&A pair + sources_used per user per group
- TTL 1 ชั่วโมง (ใช้ `expires_at`)
- ไม่ต้องเก็บ full conversation history (ใช้ messages table ที่มีอยู่แทน)

#### 2.5 Admin Page วาง Route ที่ `/settings/ai-cross-group` ตาม spec — OK

แต่ลดจาก 5 tabs เหลือ 3 tabs ก่อน (MVP):
- **A) Access Rules** (requester + scope + data sources) — รวม requester rules
- **B) Group Export Policy** (per group: export_enabled, synonyms)
- **C) Activity Log** (recent queries + sources used)

**ตัด Tab D (AI Test Console) และ E (Audit Logs detail) ไว้ phase 2**

### 3) Database Design (ปรับจาก Spec)

**Table 1: `ai_query_policies`** (รวม requester + scope)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| source_type | text | 'group' or 'user' |
| source_group_id | uuid FK groups | nullable |
| source_user_id | uuid FK users | nullable |
| enabled | boolean default false | ต้องเปิดก่อนถึงจะใช้ได้ |
| scope_mode | text | 'all', 'include', 'exclude' |
| allowed_data_sources | text[] | ['messages','attendance','employees','tasks'] |
| time_window_days | int default 30 | |
| pii_mode | text default 'mask_sensitive' | |
| max_hits_per_group | int default 50 | |
| priority | int default 0 | สำหรับ resolve conflicts |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Table 2: `ai_query_scope_groups`** (include/exclude list)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| policy_id | uuid FK ai_query_policies | |
| group_id | uuid FK groups | |

**Table 3: `ai_query_group_export`** (per-group export control)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK groups UNIQUE | |
| export_enabled | boolean default false | default ปิด ตาม spec |
| allowed_data_sources | text[] default '{}' | override ต่อกลุ่ม |
| synonyms | text[] default '{}' | ชื่อเรียกอื่นๆ |
| masking_level | text default 'none' | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Table 4: `ai_query_memory`** (follow-up memory, lightweight)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK users | |
| group_id | uuid FK groups | |
| question | text | |
| answer | text | |
| sources_used | jsonb | structured citations |
| created_at | timestamptz | |
| expires_at | timestamptz | default now() + 1 hour |

### 4) Backend Flow (line-webhook modification)

**ตำแหน่งที่แก้:** เมื่อ `parsed.commandType === 'ask'` และ `!isDM` (group context)

```text
// ใน handleMessageEvent, ก่อน generateAiReply:

if (parsed.commandType === 'ask' && !isDM) {
  // 1. Check if cross-group query is enabled for this group/user
  const crossGroupPolicy = await getCrossGroupPolicy(group.id, user.id);
  
  if (crossGroupPolicy) {
    // 2. Compute effective_scope (intersection of policy + export policies)
    const effectiveScope = await computeEffectiveScope(crossGroupPolicy);
    
    // 3. Check for follow-up ("เอาข้อมูลมาจากไหน", "source?")
    if (isSourceQuery(parsed.userQuestion)) {
      const memory = await getLastAnswerMemory(user.id, group.id);
      if (memory) {
        aiReply = formatSourcesReply(memory.sources_used);
        // skip normal AI flow
      } else {
        aiReply = "ไม่มีข้อมูลคำตอบก่อนหน้า กรุณาถามคำถามใหม่อีกครั้งค่ะ";
      }
    } else {
      // 4. Server-side entity resolution
      const resolvedEntities = resolveEntities(parsed.userQuestion, effectiveScope);
      
      // 5. Retrieve cross-group evidence
      const evidence = await retrieveCrossGroupEvidence(
        resolvedEntities.targetGroupIds,
        effectiveScope,
        parsed.userQuestion
      );
      
      // 6. Build cross-group prompt
      const crossGroupPrompt = buildCrossGroupPrompt(
        parsed.userQuestion, evidence, effectiveScope
      );
      
      // 7. Generate AI reply with cross-group context
      aiReply = await callAI(CROSS_GROUP_SYSTEM_PROMPT, crossGroupPrompt, 500);
      
      // 8. Save memory for follow-up
      await saveQueryMemory(user.id, group.id, parsed.userQuestion, aiReply, evidence.sources);
    }
  }
  // else: fall through to normal single-group AI reply
}
```

### 5) Key Helper Functions (new, in line-webhook)

```text
getCrossGroupPolicy(groupId, userId)
  -> query ai_query_policies matching group or user, order by priority

computeEffectiveScope(policy)
  -> get scope groups (include/exclude)
  -> intersect with ai_query_group_export where export_enabled = true
  -> return { allowedGroupIds, allowedDataSources, timeWindowDays, ... }

resolveEntities(question, scope)
  -> load group names + synonyms from ai_query_group_export
  -> fuzzy match question text against names/synonyms
  -> return { targetGroupIds, dateRange, intent }

retrieveCrossGroupEvidence(groupIds, scope, question)
  -> if 'attendance' in allowedDataSources:
       query attendance_logs + employees for matched groups/dates
  -> if 'messages' in allowedDataSources:
       query messages table across groups with text search
  -> return { facts[], messages[], sources[] }

isSourceQuery(question)
  -> match patterns: "เอาข้อมูลมาจากไหน", "source", "อ้างอิง", "ที่มา"

buildCrossGroupPrompt(question, evidence, scope)
  -> format evidence into structured prompt
  -> include CROSS_GROUP_SYSTEM_PROMPT from spec (shortened)
```

### 6) Admin UI Page: `/settings/ai-cross-group`

**New file: `src/pages/settings/AIQueryControl.tsx`**

**Tab A: Access Rules**
- Table listing existing policies (source group/user, scope mode, enabled toggle)
- Dialog to create/edit: pick source (group dropdown or user search), scope mode (all/include/exclude), group picker for include/exclude, data source checkboxes, time window slider
- Enable/disable toggle per rule

**Tab B: Group Export Policy**
- Table listing all groups with export_enabled toggle
- Click to edit: synonyms (tag input), allowed data sources, masking level
- Default: export_enabled = false (admin must explicitly enable)

**Tab C: Recent Queries**
- Read-only log from ai_query_memory showing recent questions, answers, sources, requester

### 7) Files to Create/Modify

| File | Action | Risk |
|------|--------|------|
| Migration SQL | CREATE 4 tables + RLS | None (new) |
| `src/pages/settings/AIQueryControl.tsx` | New page | None |
| `src/App.tsx` | Add route | Low |
| `src/components/DashboardLayout.tsx` | Add sidebar link | Low |
| `supabase/functions/line-webhook/index.ts` | Add cross-group logic in ask handler | Medium (surgical insert) |

### 8) สิ่งที่จะไม่แตะ

- parseCommand / shouldTriggerBot (ใช้ commandType 'ask' เดิม)
- generateAiReply function เดิม (cross-group ใช้ callAI แยก)
- Memory system เดิม (memory_items, working_memory)
- Work assignment detection
- All other commands (summary, faq, report, todo, etc.)
- Receipt handler, attendance-submit, all other edge functions

### 9) Backward Compatibility

- ถ้าไม่มี policy ใน ai_query_policies -> behavior เดิม 100% (single-group AI reply)
- ถ้ามี policy แต่ disabled -> behavior เดิม
- export_enabled default = false -> ไม่มีกลุ่มไหนถูกดึงข้อมูลจนกว่า admin จะเปิด
- Feature เป็น opt-in ทั้งหมด, zero regression

### 10) Implementation Order

1. Database migration (4 tables + RLS)
2. Admin UI page (AIQueryControl.tsx + route + sidebar)
3. Backend cross-group query engine (line-webhook)
4. Deploy + test

### 11) จุดที่ปรับจาก Spec เดิม

| Spec เดิม | ปรับเป็น | เหตุผล |
|-----------|---------|--------|
| LLM tool-calling (resolve_entities, search_messages) | Server-side orchestration | Lovable AI Gateway ไม่รองรับ tool-calling |
| 5 tabs ใน admin page | 3 tabs (MVP) | Test Console + Audit Logs ไว้ phase 2 |
| Full conversation history table | Lightweight last-Q&A memory | ใช้ messages table ที่มีอยู่สำหรับ history |
| Separate group_directory table | synonyms ใน ai_query_group_export | ใช้ groups + branches ที่มีอยู่ |
| attendance_facts extraction | Query attendance_logs + employees ตรง | ไม่ต้องสร้าง facts table แยก |

