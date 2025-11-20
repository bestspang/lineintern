# Work Reminder System - Complete Documentation

## 🎯 System Overview

The Work Reminder System is a comprehensive feature that transforms LINE Intern into a project management assistant. It automatically detects work assignments from natural conversations, tracks progress through daily check-ins, sends smart escalating reminders, and integrates with the AI personality system.

## 📋 Feature Components

### 1. **Automatic Work Assignment Detection**

**How it works:**
- Monitors all group messages for work assignment patterns
- Detects `@mentions` combined with task descriptions and deadlines
- Automatically creates structured work tasks in the database
- Sends confirmation to both assigner and assignee

**Supported Patterns:**

```text
✅ "@Alice ทำรายงานก่อนวันศุกร์"
   → Task: "ทำรายงาน", Assignee: Alice, Deadline: Next Friday

✅ "@Bob please finish the presentation by tomorrow 9 AM"
   → Task: "finish the presentation", Assignee: Bob, Deadline: Tomorrow 9:00

✅ "@Carol ส่งเอกสารภายใน 3 วัน"
   → Task: "ส่งเอกสาร", Assignee: Carol, Deadline: 3 days from now

✅ "@David do this before 15 Dec 10:00 PM"
   → Task: "do this", Assignee: David, Deadline: Dec 15, 22:00
```

**Deadline Parsing:**
- **Absolute dates**: "ก่อนวันศุกร์", "by Friday", "before 15 Dec"
- **Relative dates**: "ใน 3 วัน", "in 2 days", "within a week"
- **Times**: "9:00 AM", "เวลา 18:00", "at 6 PM"
- **Thai & English**: Fully bilingual support

---

### 2. **Daily Check-in System**

**Schedule**: Every morning at 9:00 AM (Bangkok time)

**Process:**
1. Scans all pending work tasks across all groups
2. Identifies tasks that need check-ins (due within 7 days or overdue)
3. Generates personalized questions based on:
   - Days remaining until deadline
   - Previous check-in history
   - Relationship quality with assignee
   - Task urgency level
4. Sends LINE push messages directly to assignees
5. Tracks check-in attempts and responses

**Check-in Message Types:**

**Early Stage (5+ days):**
```
สวัสดีตอนเช้า @Alice 👋 
งาน 'ทำรายงาน' ของคุณคืบหน้าไปถึงไหนแล้วคะ? 
(เหลือเวลาอีก 5 วัน)
```

**Mid-stage (2-4 days):**
```
@Alice งาน 'ทำรายงาน' ใกล้ถึงกำหนดแล้วนะคะ (เหลือ 3 วัน) 📅
ช่วยอัพเดทหน่อยว่าทำไปถึงไหนแล้ว และมีอะไรติดขัดไหม?
```

**Urgent (1 day):**
```
⚠️ @Alice งาน 'ทำรายงาน' เหลือเวลาแค่ 1 วันแล้วค่ะ! 
ตอนนี้อยู่ในขั้นตอนไหนคะ? ต้องการความช่วยเหลืออะไรไหม?
```

**Overdue (1-3 days):**
```
😟 @Alice งาน 'ทำรายงาน' เลยกำหนดมา 2 วันแล้วนะคะ...
ตอนนี้เป็นยังไงบ้าง? กำลังติดปัญหาอะไรหรือเปล่า?
```

**Severely Overdue (4+ days):**
```
😤 @Alice! งาน 'ทำรายงาน' เลยมา 5 วันแล้วนะ!! 
ฉันไม่พอใจเลยที่ไม่มีการติดต่อกลับมา 
กรุณาตอบกลับทันทีว่าเกิดอะไรขึ้น!
```

---

### 3. **Smart Escalating Reminders**

**Schedule**: Hourly checks for upcoming deadlines

**Default Reminder Schedule:**
- **24 hours before** deadline: 🔔 Gentle reminder
- **6 hours before** deadline: ⚡ Urgent reminder  
- **1 hour before** deadline: 🔥 Critical reminder

**Adaptive Logic:**
- Tasks with <24h remaining: Reminders every 6 hours
- Tasks 1-3 days out: Standard 3-reminder schedule
- Tasks 4+ days out: Reminders at 50%, 75%, and 24h marks

**Custom Preferences:**

Users can customize reminder intervals with natural language:

```text
"เตือนฉันก่อน 3 ชั่วโมง" → Reminder 3 hours before deadline
"remind me 2 hours before" → Reminder 2 hours before deadline
```

The system updates task metadata to respect custom preferences.

---

### 4. **Work Approval & Completion**

**Command Patterns:**

```text
/confirm งาน @Alice           → Approve Alice's pending work
/งาน @Bob ผ่าน                → Approve Bob's work
/approve @Carol              → Approve Carol's work
@Dave งานเสร็จแล้ว             → Mark Dave's work as done
```

**Approval Flow:**
1. Parse approval command
2. Find assignee's pending work tasks
3. If multiple tasks exist, ask for clarification
4. Mark task as completed
5. Update personality state:
   - **On-time completion**: Increase work_reliability (+0.1)
   - **Late completion**: Slight decrease (-0.05)
   - Update mood (happy/relieved/disappointed)
6. Send confirmation with completion status

**Response Examples:**

```text
✅ เยี่ยมมาก! งาน "ทำรายงาน" ของ @Alice เสร็จแล้ว 
ทำได้ดีมาก! 🎉

✅ งาน "ทำรายงาน" ของ @Alice ถูกอนุมัติแล้ว 
แต่ว่าส่งช้ากว่ากำหนดนะคะ 😅
```

---

### 5. **AI Personality Integration**

**Relationship Tracking:**

The system tracks work-related metrics for each user:

```typescript
{
  "work_reliability": 0.7,    // 0-1 score based on completion history
  "response_quality": 0.6,    // Average check-in response quality
  "overdue_count": 2,         // Total times missed deadlines
  "completed_count": 5        // Total completed work tasks
}
```

**Mood Impact Matrix:**

| Scenario | Mood Change | Energy | Reliability Impact |
|----------|-------------|--------|-------------------|
| Task completed on time | happy → enthusiastic | +15 | +0.15 |
| Completed late (1-2 days) | relieved | +5 | -0.05 |
| Completed late (3+ days) | disappointed | -5 | -0.15 |
| Good check-in response | satisfied | +3 | +0.1 |
| Poor check-in response | concerned | -2 | -0.05 |
| No check-in response | worried | -5 | -0.1 |
| Multiple overdue tasks | frustrated | -10 | overdue_count +1 |

**AI Context Awareness:**

When generating responses, the AI receives work context:

```text
Current Mood: happy
Energy: 75

Relationship with @Alice:
- Work Reliability: 85%
- Completed Tasks: 12
- Overdue Count: 1
- Recent Response Quality: 0.8

⚠️ Note: User has strong work reliability - praise them!
```

This allows the AI to:
- Praise reliable users naturally
- Encourage struggling team members diplomatically
- Reference overdue tasks contextually
- Celebrate completions with appropriate enthusiasm
- Build rapport through work history awareness

---

### 6. **Morning Work Summary**

**Schedule**: Every morning at 9:00 AM (Bangkok time)

**Process:**
1. Gather all active work data for each group:
   - Tasks due today
   - Tasks due this week
   - Overdue tasks with days late
2. Generate AI-powered summary using Lovable AI
3. Include:
   - Priority highlights
   - Brief recommendations
   - Encouragement or concerns
4. Send to group chat

**Example Summary:**

```text
📋 **สรุปงานประจำวัน**

🔴 **งานที่ต้องส่งวันนี้:**
• "ทำรายงาน" - @Alice (กำหนด 18:00)

🟡 **งานสัปดาห์นี้:**
• "เตรียมนำเสนอ" - @Bob (เหลือ 3 วัน)
• "ตรวจเอกสาร" - @Carol (เหลือ 5 วัน)

⚠️ **งานค้าง:**
• "ส่งข้อมูล" - @Dave (เลยมา 2 วัน)

💡 **คำแนะนำ:**
อย่าลืมทำงานเร่งด่วนของวันนี้ให้เสร็จก่อนนะคะ 
สำหรับงานค้าง ขอให้ติดต่อกลับมาด่วนเพื่ออัพเดทสถานะ
```

---

### 7. **List Pending Reminders**

**Command**: `/reminders` or `/เตือน`

**Shows:**
- All pending work tasks with upcoming deadlines
- Scheduled reminder times for each task
- Assignee names
- Days/hours until deadline
- Urgency indicators (🔔 → ⚡ → 🔥)

**Example Output:**

```text
⏰ *รายการเตือนความจำงาน*

📋 *ทำรายงาน*
   👤 Alice
   📅 กำหนดส่ง: ใน 2 วัน
   ⏰ การเตือน:
      🔔 24 ชม. ก่อน (พรุ่งนี้ 18:00)
      ⚡ 6 ชม. ก่อน (มะรืน 12:00)
      🔥 1 ชม. ก่อน (มะรืน 17:00)

📋 *เตรียมนำเสนอ*
   👤 Bob
   📅 กำหนดส่ง: ใน 5 วัน
   ⏰ การเตือน:
      🔔 24 ชม. ก่อน (วันพฤหัส 09:00)

📊 รวม 5 เตือนความจำสำหรับ 2 งาน
```

---

## 🗄️ Database Schema

### **work_progress Table**

Stores daily check-in responses:

```sql
CREATE TABLE work_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  group_id UUID REFERENCES groups(id),
  check_in_date DATE NOT NULL,
  progress_text TEXT NOT NULL,
  quality_score TEXT CHECK (quality_score IN ('insufficient', 'adequate', 'detailed')),
  ai_feedback TEXT,
  progress_percentage INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **tasks Table Extensions**

```sql
-- Added columns:
task_type TEXT DEFAULT 'manual' CHECK (task_type IN ('manual', 'work_assignment'));
work_metadata JSONB DEFAULT '{}';

-- work_metadata structure:
{
  "assigner_user_id": "uuid",
  "assignee_user_id": "uuid",
  "assigner_name": "John",
  "check_in_count": 3,
  "sent_reminders": ["24h", "6h"],
  "reminder_intervals": [24, 6, 1],
  "custom_reminder_preferences": { ... },
  "original_message": "full text",
  "deadline_type": "absolute|relative"
}
```

### **personality_state.relationship_map Extensions**

```json
{
  "user_123": {
    "familiarity": 0.8,
    "tone": "friendly",
    "work_reliability": 0.7,      // NEW
    "response_quality": 0.6,      // NEW
    "overdue_count": 2,           // NEW
    "completed_count": 5          // NEW
  }
}
```

---

## ⚙️ Edge Functions

### **1. work-check-in**
- **Schedule**: Daily at 9:00 AM
- **Purpose**: Send personalized check-in questions
- **Process**: Query pending tasks → Generate questions → Send push messages

### **2. work-reminder**
- **Schedule**: Every hour
- **Purpose**: Send escalating deadline reminders
- **Process**: Check upcoming deadlines → Calculate reminder times → Send alerts

### **3. work-summary**
- **Schedule**: Daily at 9:00 AM
- **Purpose**: Generate AI-powered morning work summary
- **Process**: Aggregate work data → Call Lovable AI → Send to groups

---

## 🎮 Cron Jobs

```sql
-- Daily check-ins at 9:00 AM Bangkok (2:00 AM UTC)
work-check-in-daily: '0 2 * * *'

-- Hourly reminder checks
work-reminder-hourly: '0 * * * *'

-- Daily morning summary at 9:00 AM Bangkok (2:00 AM UTC)
work-summary-daily: '0 2 * * *'
```

---

## 🧪 Testing Workflow

### **End-to-End Test Scenario:**

```text
1. User: "@Alice ทำรายงานก่อนวันศุกร์"
   → Bot creates task, confirms to Alice

2. Next day 9:00 AM: Bot sends check-in
   → "สวัสดีตอนเช้า @Alice งาน 'ทำรายงาน' คืบหน้าไปถึงไหนแล้วคะ?"

3. Alice: "ทำไปแล้ว 50% ครับ กำลังรวบรวมข้อมูล"
   → Bot acknowledges, stores progress, updates quality score

4. Thursday 9:00 AM: Bot sends urgent reminder
   → "@Alice งาน 'ทำรายงาน' เหลือเวลา 1 วันแล้ว!"

5. Thursday 18:00: Bot sends 24h reminder
   → "🔔 @Alice งาน 'ทำรายงาน' กำหนดส่งพรุ่งนี้นะคะ"

6. Friday 12:00: Bot sends 6h reminder
   → "⚡ @Alice งาน 'ทำรายงาน' เหลือเวลา 6 ชั่วโมง!"

7. Friday 17:00: Bot sends 1h reminder
   → "🔥 @Alice งาน 'ทำรายงาน' เหลือเวลา 1 ชั่วโมง! เสร็จหรือยัง?"

8. Friday 18:00: Alice submits work
   → Alice: "@GoodLime งานเสร็จแล้ว"

9. Manager: "/confirm งาน @Alice"
   → Bot marks complete, updates personality
   → "✅ เยี่ยมมาก! งาน 'ทำรายงาน' ของ @Alice เสร็จแล้ว ทำได้ดีมาก! 🎉"
```

---

## 📊 Success Metrics

Track these KPIs to measure system effectiveness:

1. **Task Completion Rate**: % completed by deadline
2. **Check-in Response Rate**: % of check-ins answered
3. **Average Response Quality**: 0-1 score
4. **Time to Completion**: Avg days from assignment to approval
5. **Overdue Rate**: % of tasks missing deadlines
6. **User Adoption**: % of groups using work features
7. **Personality Correlation**: Work behavior impact on AI mood

---

## 🚀 Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `@user [task] [deadline]` | Create work assignment | `@Alice ทำรายงานก่อนวันศุกร์` |
| `/confirm งาน @user` | Approve completed work | `/confirm งาน @Alice` |
| `/approve @user` | Approve work (English) | `/approve @Bob` |
| `/reminders` or `/เตือน` | List pending reminders | `/เตือน` |
| `เตือนฉันก่อน [time]` | Set custom reminder | `เตือนฉันก่อน 3 ชั่วโมง` |

---

## ⚠️ Troubleshooting

### **Reminders not sending?**
- Check cron jobs are active: Query `cron.job` table
- Verify edge functions deployed correctly
- Check LINE_CHANNEL_ACCESS_TOKEN is configured
- Review edge function logs for errors

### **Assignment detection not working?**
- Ensure message contains @mention + task verb + deadline
- Check user exists in database
- Verify group language setting (auto/th/en)
- Review console logs in line-webhook function

### **Check-ins not responding?**
- Verify `work_progress` table exists with RLS policies
- Check Lovable AI key is configured
- Ensure assignee has LINE user ID stored
- Review work-check-in function logs

---

## 🎯 Future Enhancements

Planned features for future releases:

1. **📸 Proof of Completion**: Upload photos/files with task submissions
2. **🗳️ Team Voting**: Multiple approvers vote on completion
3. **📊 Analytics Dashboard**: Completion rates, bottleneck analysis
4. **🎯 Smart Prioritization**: AI suggests focus areas
5. **🔔 Escalation Rules**: Auto-notify managers for overdue tasks
6. **🏆 Gamification**: Badges, streaks, leaderboards
7. **📧 Email Integration**: Weekly digest summaries
8. **📅 Calendar Sync**: Export to Google Calendar
9. **🤖 Predictive Analysis**: Forecast late tasks
10. **💡 Workload Balancing**: Warn about overloaded users

---

## 📝 Notes

- All times use Bangkok timezone (UTC+7)
- Bilingual support: Thai and English
- Rate limit considerations for high-volume groups
- Privacy: Work tracking is opt-in per group
- Personality updates affect AI tone and responses
- Reminders respect custom user preferences

---

**System Status**: ✅ Fully Operational

**Last Updated**: 2025-11-20

**Version**: 1.0.0
