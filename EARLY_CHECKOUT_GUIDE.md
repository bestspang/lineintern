# Early Checkout System - Implementation Guide

## ✅ Phase 1: Backend & Database (COMPLETED)

### Database Tables Created
- ✅ `early_leave_requests` - Stores all early checkout requests
- ✅ `approval_logs` - Audit trail for all approvals/rejections

### Edge Functions Created
1. ✅ **early-checkout-request** - Handles employee early checkout requests
   - Validates employee is checked in
   - Calculates work hours vs required hours
   - Creates leave request
   - Notifies admins via LINE with quick reply buttons
   - Posts to announcement group

2. ✅ **early-leave-approval** - Handles admin approval/rejection
   - Processes approval or rejection
   - Performs auto checkout if approved
   - Sends notifications to employee
   - Logs all actions in approval_logs

### Frontend Pages Created
- ✅ **EarlyLeaveRequests** (`/attendance/early-leave`) - Admin management page
  - View pending requests
  - View processed requests history
  - Approve/reject with notes
  - Real-time updates (30s refresh)

## 📋 How It Works

### Employee Flow
1. Employee needs to leave early
2. They request through LINE or webapp
3. System calculates hours worked vs required
4. Request is sent to all admins
5. Employee receives confirmation and waits for approval

### Admin Flow (LINE)
1. Admin receives notification with Quick Reply buttons
2. Can reply with:
   - `"อนุมัติ {request_id}"` to approve
   - `"ไม่อนุมัติ {request_id}"` to reject
3. System processes and notifies employee

### Admin Flow (Webapp)
1. Navigate to `/attendance/early-leave`
2. View pending requests tab
3. Click "อนุมัติ" or "ไม่อนุมัติ"
4. Add notes (required for rejection)
5. Confirm action

## 🔄 Integration Points

### LINE Webhook Integration
To enable LINE command processing, add to `line-webhook/index.ts`:

```typescript
// In message handling section
if (text.startsWith('อนุมัติ ') || text.startsWith('approve ')) {
  const requestId = text.split(' ')[1];
  if (requestId) {
    await supabase.functions.invoke('early-leave-approval', {
      body: {
        request_id: requestId,
        admin_line_user_id: event.source.userId,
        action: 'approve',
        decision_method: 'line'
      }
    });
  }
} else if (text.startsWith('ไม่อนุมัติ ') || text.startsWith('reject ')) {
  const requestId = text.split(' ')[1];
  if (requestId) {
    await supabase.functions.invoke('early-leave-approval', {
      body: {
        request_id: requestId,
        admin_line_user_id: event.source.userId,
        action: 'reject',
        decision_method: 'line',
        notes: 'Rejected via LINE'
      }
    });
  }
}
```

### Attendance.tsx Integration
To enable employees to request early checkout through webapp:

```typescript
// Add state for early leave dialog
const [showEarlyLeaveDialog, setShowEarlyLeaveDialog] = useState(false);
const [leaveReason, setLeaveReason] = useState('');
const [leaveType, setLeaveType] = useState('other');

// Modify submit handler for check-out
const handleSubmit = async () => {
  if (tokenData?.token?.type === 'check_out') {
    // Check if it's early (before expected time)
    const hoursWorked = calculateHoursWorked();
    const requiredHours = tokenData?.employee?.hours_per_day || 8;
    
    if (hoursWorked < requiredHours - 0.5) {
      // Show early leave request dialog
      setShowEarlyLeaveDialog(true);
      return;
    }
  }
  
  // Normal checkout flow
  // ... existing code
};

// Add early leave request handler
const handleEarlyLeaveRequest = async () => {
  const { data, error } = await supabase.functions.invoke('early-checkout-request', {
    body: {
      employee_id: tokenData.employee.id,
      leave_reason: leaveReason,
      leave_type: leaveType
    }
  });
  
  if (!error) {
    setSubmitted(true);
    setSubmitResult({ 
      success: true, 
      message: 'Early leave request submitted' 
    });
  }
};
```

## 🎯 Features

### Input Validation (Security)
- ✅ Employee ID validation
- ✅ Leave reason max length: 500 chars
- ✅ Leave type enum validation
- ✅ Notes max length: 500 chars
- ✅ Request ID format validation

### Leave Types
- 🤒 **sick** - ป่วย
- 📝 **personal** - ลากิจ
- 🏖️ **vacation** - ลาพักร้อน
- 🚨 **emergency** - ฉุกเฉิน
- ❓ **other** - อื่นๆ

### Auto-Checkout on Approval
When admin approves:
- ✅ System automatically checks out the employee
- ✅ Marks attendance log with early_leave_request_id
- ✅ Sets approval_status = 'approved'
- ✅ Records reason in device_info

### Notifications
1. **To Employee**:
   - Request submitted confirmation
   - Approval/rejection notification
   - Auto-checkout confirmation

2. **To Admins**:
   - New request with Quick Reply buttons
   - Request details (hours worked, reason, etc.)

3. **To Group**:
   - Request announcement
   - Approval/rejection result

## 📊 Reports & Analytics

### Available Queries
```sql
-- Pending requests
SELECT * FROM early_leave_requests WHERE status = 'pending';

-- Approved today
SELECT * FROM early_leave_requests 
WHERE status = 'approved' 
AND request_date = CURRENT_DATE;

-- Rejection rate by employee
SELECT employee_id, 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
  ROUND(COUNT(*) FILTER (WHERE status = 'rejected')::numeric / COUNT(*) * 100, 2) as rejection_rate
FROM early_leave_requests
GROUP BY employee_id;

-- Approval logs audit
SELECT * FROM approval_logs
WHERE request_type = 'early_leave'
ORDER BY created_at DESC;
```

## 🔐 Security Features

1. **Authentication Required**: Only authenticated users can approve
2. **Role Validation**: Only admin role can approve via webapp
3. **Input Sanitization**: All inputs validated and length-limited
4. **Audit Trail**: All actions logged in approval_logs
5. **Status Locking**: Once processed, status cannot change

## 🚀 Next Steps

1. **Add Timeout System**: Auto-reject if no response within X minutes
2. **Multiple Admin Approval**: Require N admins to approve
3. **History Export**: Export early leave history to Excel
4. **Statistics Dashboard**: Show early leave trends and patterns
5. **Mobile App Integration**: Native mobile app support

## 📝 Testing Checklist

- [ ] Employee can request early checkout
- [ ] Admin receives LINE notification with buttons
- [ ] Admin can approve via LINE
- [ ] Admin can reject via LINE
- [ ] Admin can approve via webapp
- [ ] Admin can reject via webapp with notes
- [ ] Employee receives approval notification
- [ ] System auto-checks out on approval
- [ ] Group receives announcement
- [ ] Can't submit duplicate requests
- [ ] Can't approve already processed requests
- [ ] Validation prevents invalid inputs
- [ ] Audit logs record all actions
