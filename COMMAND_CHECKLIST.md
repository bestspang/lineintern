# Bot Command Checklist

When adding a new bot command, **ALL** of the following must be completed to ensure full system integration.

## Quick Reference

| Step | Location | Required? |
|------|----------|-----------|
| Command Type | `command-parser.ts` | ✅ Yes |
| Command Mapping | `command-parser.ts` commandMap | ✅ Yes |
| Handler | `line-webhook/index.ts` | ✅ Yes |
| Database Entry | `bot_commands` table | ✅ Yes (for /help) |
| Aliases | `command_aliases` table | ✅ Yes |
| Help Category | `handleHelpCommand()` categoryInfo | If new category |

---

## Step 1: Command Parser (REQUIRED)

**File**: `supabase/functions/line-webhook/utils/command-parser.ts`

### 1.1 Add command type to union
```typescript
export type CommandType =
  | 'summary'
  | 'faq'
  | 'YOUR_NEW_COMMAND'  // Add here
  | 'unknown';
```

### 1.2 Add to commandMap
```typescript
const commandMap: CommandMapping[] = [
  // English
  { pattern: '/yournewcommand', type: 'YOUR_NEW_COMMAND', requiresMention: false },
  // Thai
  { pattern: '/คำสั่งใหม่', type: 'YOUR_NEW_COMMAND', requiresMention: false },
];
```

---

## Step 2: Handler Implementation (REQUIRED)

**File**: `supabase/functions/line-webhook/index.ts`

### 2.1 Add handler function
```typescript
async function handleYourNewCommand(
  userId: string,
  groupId: string | null,
  replyToken: string,
  locale: 'th' | 'en',
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[handleYourNewCommand] Processing for user: ${userId}`);
  
  // Implement your logic here
  
  const message = locale === 'th' 
    ? 'ข้อความภาษาไทย' 
    : 'English message';
  
  await lineReply(replyToken, [{ type: 'text', text: message }]);
}
```

### 2.2 Add case in command dispatcher
```typescript
case 'YOUR_NEW_COMMAND':
  await handleYourNewCommand(userId, groupId, replyToken, locale, supabase);
  break;
```

---

## Step 3: Database - bot_commands Table (REQUIRED for /help)

```sql
INSERT INTO bot_commands (
  command_key, 
  category, 
  display_name_en, 
  display_name_th,
  description_en, 
  description_th, 
  usage_example_en, 
  usage_example_th,
  display_order, 
  is_enabled, 
  available_in_dm, 
  available_in_group
) VALUES (
  'yournewcommand',           -- command_key (lowercase, no spaces)
  'general',                  -- category (must exist in categoryInfo)
  'Your Command Name',        -- display_name_en
  'ชื่อคำสั่ง',                -- display_name_th
  'Description of what this command does',
  'คำอธิบายว่าคำสั่งนี้ทำอะไร',
  '/yournewcommand',          -- usage_example_en
  '/คำสั่งใหม่',               -- usage_example_th
  50,                         -- display_order (10-90, higher = later in list)
  true,                       -- is_enabled
  true,                       -- available_in_dm
  true                        -- available_in_group
);
```

---

## Step 4: Database - command_aliases Table (REQUIRED)

```sql
-- Get the command_id first
WITH cmd AS (SELECT id FROM bot_commands WHERE command_key = 'yournewcommand')
INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/yournewcommand', 'en', true FROM cmd
UNION ALL
SELECT id, '/คำสั่งใหม่', 'th', true FROM cmd
UNION ALL
SELECT id, '/ync', 'en', false FROM cmd;  -- Optional short alias
```

---

## Step 5: Help Category (Only if NEW category)

**File**: `supabase/functions/line-webhook/index.ts`

### 5.1 Add to categoryInfo object in handleHelpCommand()
```typescript
const categoryInfo: Record<string, { icon: string; name_en: string; name_th: string }> = {
  // Existing categories...
  yourcategory: { 
    icon: '🆕', 
    name_en: 'Your Category', 
    name_th: 'หมวดใหม่' 
  },
};
```

### 5.2 Add to categoryOrder array
```typescript
const categoryOrder = [
  'general', 
  'conversation', 
  'work', 
  'attendance', 
  'receipt',
  'yourcategory',  // Add here
  'knowledge', 
  'analytics', 
  'creative', 
  'settings', 
  'memory'
];
```

---

## Verification Checklist

After completing all steps, verify:

- [ ] Test command in DM → Should trigger handler and respond
- [ ] Test command in Group → Should work (if available_in_group = true)
- [ ] Test `/help` command → New command appears in correct category
- [ ] Test Thai alias → Same handler triggers
- [ ] Check edge function logs → No "unhandled command" errors
- [ ] Check bot_message_logs → Responses are logged correctly

---

## Existing Categories Reference

| Category Key | Icon | English Name | Thai Name |
|-------------|------|--------------|-----------|
| general | 📋 | General | ทั่วไป |
| conversation | 💬 | Conversation | สนทนา |
| work | 💼 | Work & Tasks | งานและกิจกรรม |
| attendance | ⏰ | Attendance (DM Only) | ลงเวลา (DM เท่านั้น) |
| receipt | 🧾 | Receipts (DM Only) | ใบเสร็จ (DM เท่านั้น) |
| knowledge | 📚 | Knowledge Base | ฐานความรู้ |
| analytics | 📊 | Analytics | วิเคราะห์ |
| creative | 🎨 | Creative | สร้างสรรค์ |
| settings | ⚙️ | Settings | ตั้งค่า |
| memory | 🧠 | Memory | ความจำ |

---

## Common Mistakes to Avoid

1. **Forgetting database entries** → Command works but doesn't show in /help
2. **Mismatched command_key** → Aliases don't link correctly
3. **Wrong category** → Command appears in wrong section of /help
4. **Missing Thai alias** → Thai users can't trigger command
5. **Not handling locale** → Response always in same language
6. **Not logging** → Hard to debug issues later

---

## Template: Complete New Command Addition

```sql
-- 1. Add to bot_commands
INSERT INTO bot_commands (
  command_key, category, display_name_en, display_name_th,
  description_en, description_th, usage_example_en, usage_example_th,
  display_order, is_enabled, available_in_dm, available_in_group
) VALUES (
  'newcmd', 'general', 'New Command', 'คำสั่งใหม่',
  'Does something useful', 'ทำอะไรบางอย่างที่มีประโยชน์',
  '/newcmd', '/คำสั่งใหม่',
  45, true, true, true
);

-- 2. Add aliases
INSERT INTO command_aliases (command_id, alias_text, language, is_primary)
SELECT id, '/newcmd', 'en', true FROM bot_commands WHERE command_key = 'newcmd'
UNION ALL
SELECT id, '/คำสั่งใหม่', 'th', true FROM bot_commands WHERE command_key = 'newcmd';
```

---

*Last updated: 2026-01-07*
