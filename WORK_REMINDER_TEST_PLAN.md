# Work Reminder System - Complete Test Plan

## 🎯 Testing Objectives

Verify all components of the Work Reminder System work correctly end-to-end:
1. Work assignment detection from natural language
2. Daily check-in system with personalized messages
3. Smart escalating reminders (24h, 6h, 1h)
4. Work approval and completion workflow
5. AI personality integration
6. Morning work summaries
7. Custom reminder preferences

---

## ✅ Test Checklist

### **Phase 1: Work Assignment Detection**

#### Test 1.1: Basic Thai Assignment
```text
Input: "@Alice ทำรายงานก่อนวันศุกร์"
Expected:
✓ Task created in database
✓ task_type = 'work_assignment'
✓ Assignee = Alice
✓ Deadline = Next Friday
✓ Confirmation message sent
✓ work_metadata populated correctly
```

#### Test 1.2: English Assignment with Time
```text
Input: "@Bob finish the presentation by tomorrow 9 AM"
Expected:
✓ Task created with specific time (09:00)
✓ English language confirmation
✓ Reminder schedule calculated
```

#### Test 1.3: Relative Deadline
```text
Input: "@Carol ส่งเอกสารภายใน 3 วัน"
Expected:
✓ Deadline = 3 days from now
✓ Thai confirmation message
```

#### Test 1.4: Multiple Assignees
```text
Input: "@Alice @Bob ทำนี่ร่วมกัน ก่อนวันพุธ"
Expected:
✓ 2 separate tasks created
✓ Same deadline for both
✓ Both assignees notified
```

#### Test 1.5: Edge Cases
```text
Test Cases:
- No deadline specified → Ask for clarification
- Past deadline mentioned → Warning message
- Ambiguous "next week" → Clarification needed
- @mention but no task description → Ignored
- Message with work verbs but no @mention → Ignored
```

**Verification Steps:**
1. Send test messages in LINE group
2. Check `tasks` table for new entries
3. Verify `work_metadata` structure
4. Confirm notification delivery
5. Check console logs for detection accuracy

---

### **Phase 2: Daily Check-in System**

#### Test 2.1: Manual Trigger
```sql
-- Manually trigger work-check-in function
SELECT net.http_post(
  url:='https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/work-check-in',
  headers:='{"Authorization": "Bearer [ANON_KEY]"}'::jsonb
);
```

#### Test 2.2: Verify Check-in Messages
```text
Expected Behavior:
✓ Tasks due in 7 days or less receive check-ins
✓ Overdue tasks receive concerned messages
✓ Message tone matches urgency level
✓ Assignee receives LINE push notification
```

#### Test 2.3: Response Quality Assessment
```text
Test Inputs:
1. Insufficient: "ทำแล้ว"
2. Adequate: "ทำไปแล้ว 50% กำลังรวบรวมข้อมูล"
3. Detailed: "ทำไปแล้ว 70% เสร็จแล้ว 3 ใน 4 ขั้นตอน คาดว่าเสร็จพรุ่งนี้"

Expected:
✓ Quality score stored in work_progress
✓ AI feedback generated
✓ Insufficient responses trigger follow-up
✓ Personality relationship_map updated
```

#### Test 2.4: Check-in History
```text
Verify:
✓ work_progress entries created
✓ check_in_count incremented in work_metadata
✓ last_check_in_date updated
✓ progress_percentage tracked
```

**Verification Steps:**
1. Create test tasks with various due dates
2. Trigger check-in function manually
3. Verify LINE push messages received
4. Respond with different quality levels
5. Check `work_progress` table entries
6. Verify personality updates

---

### **Phase 3: Smart Escalating Reminders**

#### Test 3.1: Manual Trigger
```sql
-- Manually trigger work-reminder function
SELECT net.http_post(
  url:='https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/work-reminder',
  headers:='{"Authorization": "Bearer [ANON_KEY]"}'::jsonb
);
```

#### Test 3.2: Default Reminder Schedule
```text
Setup: Task due in 48 hours

Expected Reminders:
✓ 24h before: 🔔 Gentle reminder
✓ 6h before: ⚡ Urgent reminder  
✓ 1h before: 🔥 Critical reminder

Verify:
✓ Each reminder sent only once
✓ sent_reminders array updated in work_metadata
✓ Escalating urgency in message tone
```

#### Test 3.3: Custom Reminder Preferences
```text
Test Input: "เตือนฉันก่อน 3 ชั่วโมง"

Expected:
✓ Detect preference in message
✓ Update work_metadata.reminder_intervals
✓ Send confirmation message
✓ Future reminders respect custom settings
```

#### Test 3.4: Reminder Delivery
```text
Verify:
✓ LINE push messages delivered
✓ Correct assignee receives reminder
✓ Message includes task details
✓ Urgency emoji matches timing
```

**Verification Steps:**
1. Create task due in 25 hours
2. Wait or manually trigger reminder function
3. Check LINE for reminder messages
4. Verify `sent_reminders` in work_metadata
5. Test custom reminder preference
6. Confirm no duplicate reminders

---

### **Phase 4: Work Approval & Completion**

#### Test 4.1: Approval Commands
```text
Test Commands:
1. "/confirm งาน @Alice"
2. "/งาน @Bob ผ่าน"
3. "/approve @Carol"
4. "@Dave งานเสร็จแล้ว"

Expected:
✓ Pending task marked as completed
✓ status = 'completed'
✓ updated_at timestamp recorded
✓ Confirmation message sent
```

#### Test 4.2: Multiple Pending Tasks
```text
Setup: User has 2+ pending tasks

Test: "/confirm งาน @Alice"

Expected:
✓ Bot lists all pending tasks
✓ Asks for clarification
✓ User selects task number
✓ Selected task marked completed
```

#### Test 4.3: On-time vs Late Completion
```text
Test Scenarios:
1. Task completed before deadline
   Expected: 
   ✓ Happy confirmation "🎉 ทำได้ดีมาก!"
   ✓ work_reliability +0.1
   ✓ Mood → happy, energy +15

2. Task completed 1 day late
   Expected:
   ✓ Relieved message "😅 ส่งช้า แต่ก็เสร็จแล้ว"
   ✓ work_reliability -0.05
   ✓ Mood → relieved, energy +5

3. Task completed 5+ days late
   Expected:
   ✓ Disappointed tone "😟 เลยมาเยอะ"
   ✓ work_reliability -0.15
   ✓ Mood → disappointed, energy -5
```

#### Test 4.4: Invalid Approval Attempts
```text
Test Cases:
- No pending tasks → Error message
- @mention user doesn't exist → Not found error
- Non-assigner tries to approve → Success (anyone can approve)
```

**Verification Steps:**
1. Create pending work tasks
2. Test all approval command patterns
3. Verify task status updates
4. Check confirmation messages
5. Verify personality_state changes
6. Test edge cases

---

### **Phase 5: AI Personality Integration**

#### Test 5.1: Relationship Score Updates
```text
Actions to Test:
1. Complete task on time
   Expected: work_reliability += 0.1

2. Complete task late
   Expected: work_reliability -= 0.05

3. Good check-in response
   Expected: response_quality += 0.1

4. Poor check-in response
   Expected: response_quality -= 0.05

5. No check-in response
   Expected: response_quality -= 0.1

Verify:
✓ relationship_map in personality_state updated
✓ completed_count / overdue_count tracked
✓ Updates persist across sessions
```

#### Test 5.2: Mood Impact
```text
Test: Complete 3 tasks on time in a row

Expected:
✓ Mood progression: satisfied → happy → enthusiastic
✓ Energy increases (+10, +10, +15)
✓ mood_history entries created
✓ AI responses reflect positive mood
```

#### Test 5.3: AI Context Awareness
```text
Test: Ask AI a question after completing work

Expected AI Response:
✓ References completed tasks naturally
✓ Praises good work reliability
✓ Tone matches current mood
✓ Acknowledges work history

Example:
"ว้าว! คุณทำงานได้ดีมากเลยนะ ผมสังเกตว่าคุณส่งงานตรงเวลาเสมอ 
มีอะไรให้ช่วยอีกไหมคะ? 😊"
```

#### Test 5.4: Personality Degradation
```text
Test: Miss 3 deadlines in a row

Expected:
✓ Mood → concerned → worried → frustrated
✓ Energy decreases
✓ overdue_count increments
✓ AI tone becomes firmer
✓ More direct reminders

Example:
"ผมเริ่มกังวลกับงานที่ค้างนะคะ คุณมีปัญหาอะไรหรือเปล่า? 
ต้องการความช่วยเหลือไหม?"
```

**Verification Steps:**
1. Create test scenarios for all mood triggers
2. Verify personality_state updates
3. Check mood_history logging
4. Test AI responses with work context
5. Verify mood recovery after improvements

---

### **Phase 6: Morning Work Summary**

#### Test 6.1: Manual Trigger
```sql
-- Manually trigger work-summary function
SELECT net.http_post(
  url:='https://bjzzqfzgnslefqhnsmla.supabase.co/functions/v1/work-summary',
  headers:='{"Authorization": "Bearer [ANON_KEY]"}'::jsonb
);
```

#### Test 6.2: Summary Content
```text
Setup: Create test tasks:
- 1 due today
- 2 due this week
- 1 overdue

Expected Summary:
✓ Section: งานที่ต้องส่งวันนี้
✓ Section: งานสัปดาห์นี้  
✓ Section: งานค้าง
✓ Brief recommendations
✓ Bilingual support (TH/EN)
✓ Appropriate emojis and formatting
```

#### Test 6.3: AI Generation Quality
```text
Verify:
✓ Summary is concise (<200 words)
✓ Prioritizes urgent items
✓ Tone matches group mood
✓ Actionable recommendations
✓ Natural language flow
```

**Verification Steps:**
1. Create varied test tasks (today, week, overdue)
2. Trigger summary manually
3. Verify LINE group message received
4. Check content accuracy
5. Test in both Thai and English groups
6. Verify Lovable AI call logs

---

### **Phase 7: Pending Reminders List**

#### Test 7.1: Command Execution
```text
Input: "/reminders" or "/เตือน"

Expected Output:
✓ List all pending work tasks
✓ Show assignee names
✓ Display due dates with time distance
✓ List scheduled reminder times
✓ Urgency indicators (🔔 → ⚡ → 🔥)
✓ Total count summary
```

#### Test 7.2: Empty State
```text
Setup: No pending work tasks

Input: "/reminders"

Expected:
✓ Message: "ไม่มีเตือนความจำที่รอดำเนินการ"
✓ No errors thrown
```

#### Test 7.3: Reminder Calculations
```text
Verify:
✓ Pending reminders accurately calculated
✓ Already-sent reminders excluded
✓ Custom intervals respected
✓ Time distances formatted correctly
```

**Verification Steps:**
1. Create tasks with various deadlines
2. Send some reminders
3. Execute /reminders command
4. Verify accuracy of list
5. Test with custom reminder preferences

---

### **Phase 8: Cron Job Verification**

#### Test 8.1: Cron Job Status
```sql
-- Check all work-related cron jobs
SELECT jobid, jobname, schedule, active, database 
FROM cron.job 
WHERE jobname LIKE '%work%' 
ORDER BY jobname;

Expected Jobs:
✓ work-check-in-daily (0 2 * * *)
✓ work-reminder-hourly (0 * * * *)
✓ work-summary-daily (0 2 * * *)
```

#### Test 8.2: Cron History
```sql
-- Check recent executions
SELECT * FROM cron.job_run_details 
WHERE job_pid IN (
  SELECT jobid FROM cron.job WHERE jobname LIKE '%work%'
)
ORDER BY start_time DESC 
LIMIT 10;

Verify:
✓ Jobs executed successfully
✓ No error messages
✓ Execution times correct
✓ Return messages indicate success
```

#### Test 8.3: Manual Execution
```sql
-- Test each function manually
SELECT cron.schedule_job_force(jobid)
FROM cron.job 
WHERE jobname = 'work-check-in-daily';

-- Verify execution completed without errors
```

**Verification Steps:**
1. Query cron.job table
2. Check job schedules are correct (UTC+7 → UTC conversion)
3. Review execution history
4. Manually trigger each job
5. Verify no errors in logs
6. Confirm LINE messages delivered

---

### **Phase 9: Integration Testing**

#### Test 9.1: Complete Workflow
```text
End-to-End Test:

1. Day 1, 10:00 AM: Assign work
   "@Alice ทำรายงานก่อนวันศุกร์ 18:00"
   ✓ Task created
   ✓ Confirmation sent

2. Day 2, 9:00 AM: Check-in (auto)
   ✓ Bot asks for progress
   ✓ Alice responds
   ✓ Progress stored

3. Day 3, 9:00 AM: Check-in (auto)
   ✓ Follow-up question
   ✓ Updated progress

4. Day 5, 9:00 AM: Urgent check-in
   ✓ Urgent tone message

5. Day 5, 18:00: 24h reminder
   ✓ 🔔 Gentle reminder

6. Day 6, 12:00: 6h reminder
   ✓ ⚡ Urgent reminder

7. Day 6, 17:00: 1h reminder
   ✓ 🔥 Critical reminder

8. Day 6, 18:00: Completion
   "/confirm งาน @Alice"
   ✓ Task marked complete
   ✓ Personality updated
   ✓ Celebration message

9. Day 7, 9:00 AM: Morning summary
   ✓ Doesn't include completed task
   ✓ Shows remaining work
```

#### Test 9.2: Stress Test
```text
Setup:
- Create 50 pending work tasks
- Multiple groups (5+)
- Various due dates

Test:
✓ All reminders sent correctly
✓ No duplicate notifications
✓ Database performance acceptable
✓ No memory issues
✓ Cron jobs complete in time
```

**Verification Steps:**
1. Execute complete workflow
2. Document each step
3. Take screenshots
4. Check all database updates
5. Verify LINE message delivery
6. Review edge function logs
7. Check for any errors or delays

---

### **Phase 10: Error Handling**

#### Test 10.1: LINE API Errors
```text
Scenarios:
- Invalid replyToken → Graceful error logging
- Rate limit exceeded → Retry logic / error message
- Network timeout → Retry with backoff
- Invalid user ID → Error logged, continue
```

#### Test 10.2: Database Errors
```text
Scenarios:
- Duplicate task creation → Handled gracefully
- Missing foreign key → Validation error
- RLS policy block → Appropriate error
- Connection timeout → Retry logic
```

#### Test 10.3: AI Errors
```text
Scenarios:
- Lovable AI rate limit → Fallback response
- API key invalid → Error logged
- Timeout → Simple fallback message
- Malformed response → Parse error handling
```

**Verification Steps:**
1. Simulate error conditions
2. Verify error logging
3. Check fallback behaviors
4. Ensure no crashes
5. Verify user-friendly error messages

---

## 📊 Success Criteria

All tests must pass:
- ✅ 100% of work assignments detected correctly
- ✅ Check-ins sent daily at 9:00 AM
- ✅ Reminders sent at correct times
- ✅ Approval workflow functions correctly
- ✅ Personality updates working
- ✅ Morning summaries generated
- ✅ /reminders command accurate
- ✅ No duplicate notifications
- ✅ Error handling robust
- ✅ Performance acceptable (<5s response)

---

## 🐛 Known Issues & Limitations

Document any issues found during testing:

1. **Timezone Handling**
   - Issue: [Description]
   - Workaround: [Solution]

2. **Rate Limits**
   - Issue: [Description]
   - Mitigation: [Solution]

3. **Edge Cases**
   - Issue: [Description]
   - Resolution: [Solution]

---

## 📝 Test Results Log

| Test Phase | Status | Date | Notes |
|------------|--------|------|-------|
| Phase 1: Assignment Detection | ⏳ Pending | - | - |
| Phase 2: Check-in System | ⏳ Pending | - | - |
| Phase 3: Reminders | ⏳ Pending | - | - |
| Phase 4: Approval Workflow | ⏳ Pending | - | - |
| Phase 5: Personality Integration | ⏳ Pending | - | - |
| Phase 6: Morning Summary | ⏳ Pending | - | - |
| Phase 7: Reminders List | ⏳ Pending | - | - |
| Phase 8: Cron Jobs | ⏳ Pending | - | - |
| Phase 9: Integration | ⏳ Pending | - | - |
| Phase 10: Error Handling | ⏳ Pending | - | - |

**Legend:**
- ⏳ Pending
- 🧪 In Progress
- ✅ Passed
- ❌ Failed
- ⚠️ Partial

---

## 🚀 Next Steps

After all tests pass:

1. ✅ Update documentation with test results
2. ✅ Create user guide with examples
3. ✅ Deploy to production
4. ✅ Monitor for 7 days
5. ✅ Collect user feedback
6. ✅ Iterate based on feedback

---

**Last Updated**: 2025-11-20
**Test Version**: 1.0.0
**Status**: Ready for Testing
